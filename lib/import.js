import { Buffer } from "buffer";
import "sqlite";
import { xsd } from "n3.ts";
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
    else if (literal.datatype.value === xsd.hexBinary) {
        return Buffer.from(literal.value, "hex");
    }
    else if (literal.datatype.value === xsd.base64Binary) {
        return Buffer.from(literal.value, "base64");
    }
    else {
        return literal.value;
    }
}
export async function importInstance(db, schema, instance) {
    for (const [index, values] of instance.entries()) {
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
}
//# sourceMappingURL=import.js.map