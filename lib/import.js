import fs from "fs";
import path from "path";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import readline from "readline";
import { Parse, Store, xsd } from "n3.ts";
import { parseSchemaString, APG, parse } from "apg";
import { createTables } from "./initialize.js";
function invalidParameters() {
    throw new Error("Usage: node lib/import.js -s path-to-schema.nq -i path-to-data.nq -o output-path.sqlite");
}
let schemaPath = "", inputPath = null, outputPath = "";
if (process.argv.length === 8) {
    if (process.argv[2] === "-s" &&
        process.argv[4] === "-i" &&
        process.argv[6] === "-o") {
        schemaPath = process.argv[3];
        inputPath = process.argv[5];
        outputPath = process.argv[7];
    }
    else {
        invalidParameters();
    }
}
else if (process.argv.length === 6) {
    if (process.argv[2] === "-s" && process.argv[4] === "-o") {
        schemaPath = process.argv[3];
        inputPath = null;
        outputPath = process.argv[5];
    }
    else {
        invalidParameters();
    }
}
else {
    invalidParameters();
}
const filename = path.resolve(outputPath);
if (fs.existsSync(filename)) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    const answer = await new Promise((resolve) => {
        console.log(`The file ${outputPath} already exists!`);
        rl.question("Press Enter to delete it and continue; or Ctrl-C to abort:", resolve);
    });
    fs.unlinkSync(filename);
    rl.close();
}
const schemaSchemaPath = path.resolve("node_modules", "apg", "schema.schema.json");
const schemaResult = APG.codec.decode(JSON.parse(fs.readFileSync(schemaSchemaPath, "utf-8")));
if (schemaResult._tag === "Left") {
    console.error(schemaResult.left);
    throw new Error("schema.schema.json did not parse");
}
const schemaSchema = APG.codec.encode(schemaResult.right);
const schemaFile = fs.readFileSync(schemaPath, "utf-8");
const result = parseSchemaString(schemaFile, schemaSchema);
if (result._tag === "Left") {
    console.error(result.left);
    throw new Error("schema did not parse");
}
const schema = result.right;
const db = await open({ filename, driver: sqlite3.Database });
// await db.exec("PRAGMA foreign_keys = ON")
await db.exec(createTables(schema));
if (inputPath === null) {
    process.exit(0);
}
const inputFile = fs.readFileSync(path.resolve(inputPath), "utf-8");
const store = new Store(Parse(inputFile));
const instance = parse(store, schema);
if (instance._tag === "Left") {
    console.error(instance.left);
    console.error(JSON.stringify(instance.left.errors, null, "  "));
    throw new Error("Instance did not parse");
}
function parseLiteral(literal) {
    if (literal.datatype.value === xsd.boolean) {
        return literal.value === "true";
    }
    else if (literal.datatype.value === xsd.integer) {
        return parseInt(literal.value);
    }
    else if (literal.datatype.value === xsd.double) {
        return literal.value === "INF"
            ? Infinity
            : literal.value === "-INF"
                ? -Infinity
                : parseFloat(literal.value);
    }
    else {
        return literal.value;
    }
}
for (const [index, values] of instance.right.entries()) {
    const { key } = schema[index];
    for (const [id, value] of values.entries()) {
        const params = [id];
        if (value.termType === "Record") {
            for (const component of value) {
                if (component.termType === "Variant") {
                    if (component.value.termType === "BlankNode") {
                        params.push(null);
                    }
                    else if (component.value.termType === "Pointer") {
                        params.push(component.index);
                    }
                    else if (component.value.termType === "NamedNode") {
                        params.push(component.value.value);
                    }
                    else if (component.value.termType === "Literal") {
                        params.push(parseLiteral(component.value));
                    }
                }
                else if (component.termType === "Pointer") {
                    params.push(component.index);
                }
                else if (component.termType === "NamedNode") {
                    params.push(component.value);
                }
                else if (component.termType === "Literal") {
                    params.push(parseLiteral(component));
                }
            }
        }
        const variables = new Array(params.length).fill("?").join(", ");
        await db.run(`insert into "${key}" values ( ${variables} )`, ...params);
    }
}
//# sourceMappingURL=import.js.map