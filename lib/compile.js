import fs from "fs";
import path from "path";
import readline from "readline";
import toml from "toml";
import t from "io-ts";
import { APG } from "apg";
import { xsd } from "n3.ts";
import { none, some, source, target, isRelationalSchema, } from "./validate.js";
import jsonld from "jsonld";
function invalidParameters() {
    throw new Error("Usage: node lib/compiled.js -i path-to-schema.toml -o output-path.nq");
}
let inputPath = "", outputPath = "";
if (process.argv.length === 6) {
    if (process.argv[2] === "-i" && process.argv[4] === "-o") {
        inputPath = process.argv[3];
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
    await new Promise((resolve) => {
        console.log(`The file ${outputPath} already exists!`);
        rl.question("Press Enter to delete it and continue; or Ctrl-C to abort:", resolve);
    });
    rl.close();
    fs.unlinkSync(filename);
}
const input = fs.readFileSync(path.resolve(inputPath), "utf-8");
const schema = toml.parse(input);
const datatype = t.union([
    t.literal("string"),
    t.literal("integer"),
    t.literal("double"),
    t.literal("boolean"),
    t.literal("date"),
    t.literal("dateTime"),
]);
const type = t.union([
    t.type({ kind: t.literal("reference"), label: t.string }),
    t.type({
        kind: t.literal("literal"),
        datatype: datatype,
    }),
    t.type({ kind: t.literal("uri") }),
]);
const codec = t.type({
    namespace: t.string,
    shapes: t.record(t.string, t.record(t.string, t.union([
        datatype,
        t.intersection([
            type,
            t.partial({
                cardinality: t.union([
                    t.literal("required"),
                    t.literal("optional"),
                    t.literal("any"),
                ]),
            }),
        ]),
    ]))),
});
const namespacePattern = /^[a-z0-9]+:(?:\/[A-Za-z0-9-._:]*)+\/$/;
const propertyPattern = /^[a-z0-9]+:(?:\/[A-Za-z0-9-._:]*)*[A-Za-z0-9-._:]+(?:\/|#)[A-Za-z0-9-._]+$/;
const TomlSchema = new t.Type("TomlSchema", codec.is, (input, context) => {
    const result = codec.validate(input, context);
    if (result._tag === "Left") {
        return result;
    }
    else if (namespacePattern.test(result.right.namespace) === false) {
        return t.failure(input, context, "Invalid namespace string");
    }
    const labels = Object.keys(result.right.shapes);
    for (const label of labels) {
        const key = label.includes(":") ? label : result.right.namespace + label;
        if (propertyPattern.test(key) === false) {
            return t.failure(label, context, "Invalid label URI");
        }
        const shape = result.right.shapes[label];
        const properties = Object.keys(shape);
        for (const property of properties) {
            const key = property.includes(":")
                ? property
                : result.right.namespace + property;
            if (propertyPattern.test(key) === false) {
                return t.failure(property, context, "Invalid property URI");
            }
            const value = shape[property];
            if (typeof value !== "string") {
                if (value.kind === "reference") {
                    if (labels.includes(value.label)) {
                        continue;
                    }
                    else {
                        return t.failure(value, context, "Invalid reference label");
                    }
                }
            }
        }
    }
    return result;
}, (input) => {
    const labelKeys = [];
    for (const label of Object.keys(input.shapes)) {
        const key = label.includes(":") ? label : input.namespace + label;
        labelKeys.push(key);
        const shape = input.shapes[label];
        for (const property of Object.keys(shape)) {
            const value = shape[property];
            if (typeof value !== "string" && value.cardinality === "any") {
                labelKeys.push(property.includes(":") ? property : `${key}/${property}`);
            }
        }
    }
    labelKeys.sort();
    const schema = new Array(labelKeys.length);
    for (const label of Object.keys(input.shapes)) {
        const labelKey = label.includes(":") ? label : input.namespace + label;
        const shape = input.shapes[label];
        const propertyLabels = new Map(Object.keys(shape)
            .map((property) => [
            property,
            property.includes(":") ? property : `${labelKey}/${property}`,
        ])
            .sort(([{}, a], [{}, b]) => (a < b ? -1 : b < a ? 1 : 0)));
        if (propertyLabels.size === 0) {
            const value = Object.freeze({ type: "unit" });
            schema.push(Object.freeze({ type: "label", key: label, value }));
        }
        else {
            const components = [];
            for (const [propertyLabel, propertyKey] of propertyLabels) {
                const property = shape[propertyLabel];
                if (typeof property === "string") {
                    const literal = Object.freeze({
                        type: "literal",
                        datatype: xsd[property],
                    });
                    components.push(Object.freeze({
                        type: "component",
                        key: propertyKey,
                        value: literal,
                    }));
                }
                else {
                    const value = parseValue(property, input.namespace, labelKeys);
                    if (property.cardinality === undefined ||
                        property.cardinality === "required") {
                        components.push(Object.freeze({ type: "component", key: propertyKey, value }));
                    }
                    else if (property.cardinality === "optional") {
                        const unit = Object.freeze({ type: "unit" });
                        const options = [
                            Object.freeze({ type: "option", key: none, value: unit }),
                            Object.freeze({ type: "option", key: some, value }),
                        ];
                        Object.freeze(options);
                        const coproduct = { type: "coproduct", options };
                        Object.freeze(coproduct);
                        components.push(Object.freeze({
                            type: "component",
                            key: propertyKey,
                            value: coproduct,
                        }));
                    }
                    else if (property.cardinality === "any") {
                        const propertyIndex = labelKeys.indexOf(propertyKey);
                        if (propertyIndex === -1) {
                            throw new Error("Property label index not found");
                        }
                        const sourceIndex = labelKeys.indexOf(labelKey);
                        if (sourceIndex === -1) {
                            throw new Error("Source label index not found");
                        }
                        const reference = Object.freeze({
                            type: "reference",
                            value: sourceIndex,
                        });
                        const propertyComponents = [
                            Object.freeze({
                                type: "component",
                                key: source,
                                value: reference,
                            }),
                            Object.freeze({
                                type: "component",
                                key: target,
                                value: value,
                            }),
                        ];
                        Object.freeze(propertyComponents);
                        const product = Object.freeze({
                            type: "product",
                            components: propertyComponents,
                        });
                        schema[propertyIndex] = Object.freeze({
                            type: "label",
                            key: propertyKey,
                            value: product,
                        });
                    }
                }
            }
            const index = labelKeys.indexOf(labelKey);
            if (components.length === 0) {
                const unit = Object.freeze({ type: "unit" });
                schema[index] = Object.freeze({
                    type: "label",
                    key: labelKey,
                    value: unit,
                });
            }
            else {
                Object.freeze(components);
                const product = { type: "product", components };
                Object.freeze(product);
                schema[index] = Object.freeze({
                    type: "label",
                    key: labelKey,
                    value: product,
                });
            }
        }
    }
    Object.freeze(schema);
    if (isRelationalSchema(schema)) {
        return schema;
    }
    else {
        throw new Error("Internal schema construction failure");
    }
});
function parseValue(value, namespace, labelKeys) {
    if (value.kind === "literal") {
        return Object.freeze({
            type: "literal",
            datatype: xsd[value.datatype],
        });
    }
    else if (value.kind === "reference") {
        const labelKey = value.label.includes(":")
            ? value.label
            : namespace + value.label;
        const labelIndex = labelKeys.indexOf(labelKey);
        if (labelIndex === -1) {
            throw new Error("Reference label index not found");
        }
        return Object.freeze({ type: "reference", value: labelIndex });
    }
    else if (value.kind === "uri") {
        return Object.freeze({ type: "iri" });
    }
    else {
        throw new Error("Invalid type");
    }
}
const result = TomlSchema.decode(schema);
if (result._tag === "Left") {
    for (const error of result.left) {
        console.error(error);
    }
    throw new Error("Invalid TOML schema");
}
const document = APG.toJSON(TomlSchema.encode(result.right));
const context = JSON.parse(fs.readFileSync(path.resolve("node_modules/apg/context.jsonld"), "utf-8"));
const output = await jsonld.normalize(document, {
    expandContext: context,
    algorithm: "URDNA2015",
    format: "application/n-quads",
});
fs.writeFileSync(filename, output);
//# sourceMappingURL=compile.js.map