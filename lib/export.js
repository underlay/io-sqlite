import { Buffer } from "buffer";
import { BlankNode, Literal, NamedNode, xsd } from "n3.ts";
import { APG, ns } from "apg";
import { isRelationalSchema } from "apg/lib/models/relational.js";
import { validateURI } from "./validateURI.js";
export async function exportInstance(db, schema) {
    if (!isRelationalSchema(schema)) {
        throw new Error("Schema does not satisfy the relational schema constraints");
    }
    let id = 0;
    const instance = new Array(schema.length)
        .fill(null)
        .map(() => []);
    const optionKeys = [ns.none, ns.some];
    Object.freeze(optionKeys);
    const datatypes = new Map();
    const componentKeys = new Map();
    const ids = [];
    for (const label of schema) {
        validateURI(label.key);
        const map = new Map();
        let i = 0;
        await db.each(`SELECT id FROM "${label.key}"`, (err, { id }) => {
            if (err !== null) {
                throw err;
            }
            else {
                map.set(id, i++);
            }
        });
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
                            values.push(new APG.Variant(node, optionKeys, 1, parseValue(value, type, ids, datatypes)));
                        }
                    }
                    else if (value === null) {
                        throw new Error("Unexpected null value");
                    }
                    else {
                        values.push(parseValue(value, component.value, ids, datatypes));
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
        Object.freeze(instance[i]);
    }
    return instance;
}
function parseValue(value, type, ids, datatypes) {
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
        else if (type.datatype === xsd.hexBinary) {
            if (Buffer.isBuffer(value)) {
                return new Literal(value.toString("hex"), "", datatype);
            }
            else {
                throw new Error("Unexpected value for binary datatype");
            }
        }
        else if (type.datatype === xsd.base64Binary) {
            if (Buffer.isBuffer(value)) {
                return new Literal(value.toString("base64"), "", datatype);
            }
            else {
                throw new Error("Unexpected value for binary datatype");
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
//# sourceMappingURL=export.js.map