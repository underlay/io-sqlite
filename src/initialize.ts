import { xsd } from "n3.ts"
import { APG } from "apg"

import { isRelationalSchema, validateURI } from "./validate.js"

// This yields string CREATE TABLE statements for each label in the schema
export function createTables(schema: APG.Schema): string {
	if (isRelationalSchema(schema)) {
	} else {
		throw new Error("Schema does not satisfy the relational schema constraints")
	}

	const statements: string[] = []
	for (const label of schema) {
		validateURI(label.key)
		if (label.value.type === "unit") {
			statements.push(`CREATE TABLE "${label.key}" (id INTEGER PRIMARY KEY)`)
		} else {
			const columns = ["id INTEGER PRIMARY KEY"]
			for (const component of label.value.components) {
				const name = component.key
				validateURI(name)
				if (component.value.type === "coproduct") {
					const [{}, { value }] = component.value.options
					if (value.type === "iri") {
						columns.push(`"${name}" text`)
					} else if (value.type === "literal") {
						if (value.datatype === xsd.boolean) {
							columns.push(`"${name}" boolean`)
						} else if (value.datatype === xsd.integer) {
							columns.push(`"${name}" integer`)
						} else if (value.datatype === xsd.double) {
							columns.push(`"${name}" double`)
						} else if (value.datatype === xsd.string) {
							columns.push(`"${name}" text`)
						} else {
							columns.push(`"${name}" blob`)
						}
					} else if (value.type === "reference") {
						const { key } = schema[value.value]
						columns.push(`"${name}" integer references "${key}"`)
					}
				} else if (component.value.type === "iri") {
					columns.push(`"${name}" text not null`)
				} else if (component.value.type === "literal") {
					if (component.value.datatype === xsd.boolean) {
						columns.push(`"${name}" boolean not null`)
					} else if (component.value.datatype === xsd.integer) {
						columns.push(`"${name}" integer not null`)
					} else if (component.value.datatype === xsd.double) {
						columns.push(`"${name}" double not null`)
					} else if (component.value.datatype === xsd.string) {
						columns.push(`"${name}" text not null`)
					} else {
						columns.push(`"${name}" blob not null`)
					}
				} else if (component.value.type === "reference") {
					const { key } = schema[component.value.value]
					columns.push(`"${name}" integer not null references "${key}"`)
				}
			}
			statements.push(
				`CREATE TABLE "${label.key}" (\n  ${columns.join(",\n  ")}\n)`
			)
		}
	}

	return statements.join(";\n")
}
