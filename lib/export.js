import fs from "fs";
import path from "path";
import readline from "readline";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import canonize from "rdf-canonize";
import { BlankNode, Literal, NamedNode, xsd } from "n3.ts";
import { parseSchemaString, APG, serialize } from "apg";
import { isRelationalSchema, validateURI, some, none } from "./validate.js";
function invalidParameters() {
    throw new Error("Usage: node lib/export.js -s path-to-schema.nq -i input-path.sqlite -o output-path.nq");
}
let schemaPath = "", inputPath = "", outputPath = "";
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
else {
    invalidParameters();
}
const filename = path.resolve(outputPath);
if (fs.existsSync(filename)) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    await new Promise((resolve) => {
        console.log(`The file ${outputPath} already exists!`);
        rl.question("Press Enter to delete it and continue; or Ctrl-C to abort:", resolve);
    });
    rl.close();
    fs.unlinkSync(filename);
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
const db = await open({
    filename: path.resolve(inputPath),
    driver: sqlite3.Database,
    mode: sqlite3.OPEN_READONLY,
});
if (!isRelationalSchema(schema)) {
    throw new Error("Schema does not satisfy the relational schema constraints");
}
let id = 0;
const instance = new Array(schema.length).fill(null).map(() => []);
const optionKeys = [none, some];
Object.freeze(optionKeys);
const datatypes = new Map();
const componentKeys = new Map();
const ids = [];
for (const label of schema) {
    validateURI(label.key);
    const map = new Map();
    let i = 0;
    await db.each(`SELECT id FROM "${label.key}"`, (err, { id }) => map.set(id, i++));
    ids.push(map);
    if (label.value.type === "product") {
        const keys = label.value.components.map(({ key }) => key);
        Object.freeze(keys);
        componentKeys.set(label.value, keys);
        for (const component of label.value.components) {
            const value = component.value.type === "coproduct"
                ? component.value.options[1].value
                : component.value;
            if (value.type === "literal") {
                if (datatypes.has(value.datatype)) {
                    continue;
                }
                else {
                    datatypes.set(value.datatype, new NamedNode(value.datatype));
                }
            }
        }
    }
}
function parseValue(value, type
// map: Map<number, number>
) {
    if (type.type === "reference") {
        const map = ids[type.value];
        if (map === undefined) {
            throw new Error("Invalid reference type");
        }
        else if (typeof value === "number") {
            const index = map.get(value);
            if (index === undefined) {
                throw new Error("Invalid foreign key");
            }
            else {
                return new APG.Pointer(index);
            }
        }
        else {
            throw new Error(`Unexpected value for reference type`);
        }
    }
    else if (type.type === "iri") {
        if (typeof value === "string") {
            validateURI(value);
            return new NamedNode(value);
        }
        else {
            throw new Error(`Unexpected value for iri type`);
        }
    }
    else if (type.type === "literal") {
        const datatype = datatypes.get(type.datatype);
        if (datatype === undefined) {
            throw new Error(`Unexpected datatype ${type.datatype}`);
        }
        else if (type.datatype === xsd.boolean) {
            if (typeof value === "boolean") {
                return new Literal(value ? "true" : "false", "", datatype);
            }
            else {
                throw new Error("Unexpected value for boolean datatype");
            }
        }
        else if (type.datatype === xsd.integer) {
            // This also rules out NaN
            if (typeof value === "number" && Math.round(value) === value) {
                return new Literal(parseInt(value.toString()).toString(), "", datatype);
            }
            else {
                throw new Error("Unexpected value for integer datatype");
            }
        }
        else if (type.datatype === xsd.double) {
            if (typeof value === "number") {
                return new Literal(value === Infinity
                    ? "INF"
                    : value === -Infinity
                        ? "-INF"
                        : value.toString(), "", datatype);
            }
            else {
                throw new Error("Unexpected value for double datatype");
            }
        }
        else if (type.datatype === xsd.string) {
            if (typeof value === "string") {
                return new Literal(value, "", datatype);
            }
            else {
                throw new Error("Unexpected value for string datatype");
            }
        }
        else {
            if (typeof value === "string") {
                return new Literal(value, "", datatype);
            }
            else {
                throw new Error("Unexpected value for literal type");
            }
        }
    }
    else {
        throw new Error("Invalid type");
    }
}
for (const [i, label] of schema.entries()) {
    validateURI(label.key);
    const total = await db.each(`SELECT * FROM "${label.key}"`, (err, row) => {
        if (err !== null) {
            throw err;
        }
        else if (label.value.type === "product") {
            const values = [];
            const keys = componentKeys.get(label.value);
            if (keys === undefined) {
                throw new Error("Could not get component keys for product type");
            }
            for (const component of label.value.components) {
                const value = row[component.key];
                if (value === undefined) {
                    throw new Error(`Missing value for row ${row.id} property ${component.key}`);
                }
                else if (component.value.type === "coproduct") {
                    const node = new BlankNode(`b${id++}`);
                    if (value === null) {
                        values.push(new APG.Variant(node, optionKeys, 0, new BlankNode(`b${id++}`)));
                    }
                    else {
                        const [{}, { value: type }] = component.value.options;
                        values.push(new APG.Variant(node, optionKeys, 1, parseValue(value, type)));
                    }
                }
                else if (value === null) {
                    throw new Error("Unexpected null value");
                }
                else {
                    values.push(parseValue(value, component.value));
                }
            }
            const record = new APG.Record(new BlankNode(`b${id++}`), keys, values);
            instance[i].push(record);
        }
        else if (label.value.type === "unit") {
            instance[i].push(new BlankNode(`b${id++}`));
        }
        else {
            throw new Error("Invalid type");
        }
    });
}
const quads = [];
for (const quad of serialize(instance, schema)) {
    quads.push(quad.toJSON());
}
const dataset = canonize.canonizeSync(quads, { algorithm: "URDNA2015" });
fs.writeFileSync(filename, dataset);
//# sourceMappingURL=export.js.map