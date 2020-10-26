import fs from "fs"
import path from "path"
import readline from "readline"

import sqlite3 from "sqlite3"
import { open } from "sqlite"

import canonize from "rdf-canonize"

import { parseSchemaString, serialize } from "apg"

import { exportInstance } from "./lib/export.js"

function invalidParameters() {
	throw new Error(
		"Usage: node lib/export.js -s path-to-schema.nq -i input-path.sqlite -o output-path.nq"
	)
}

let schemaPath = "",
	inputPath = "",
	outputPath = ""

if (process.argv.length === 8) {
	if (
		process.argv[2] === "-s" &&
		process.argv[4] === "-i" &&
		process.argv[6] === "-o"
	) {
		schemaPath = process.argv[3]
		inputPath = process.argv[5]
		outputPath = process.argv[7]
	} else {
		invalidParameters()
	}
} else {
	invalidParameters()
}

const filename = path.resolve(outputPath)
if (fs.existsSync(filename)) {
	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
	})
	await new Promise((resolve) => {
		console.log(`The file ${outputPath} already exists!`)
		rl.question(
			"Press Enter to delete it and continue; or Ctrl-C to abort:",
			resolve
		)
	})
	rl.close()
	fs.unlinkSync(filename)
}

const schemaFile = fs.readFileSync(schemaPath, "utf-8")

const result = parseSchemaString(schemaFile)
if (result._tag === "Left") {
	console.error(result.left)
	throw new Error("schema did not parse")
}

const db = await open({
	filename: path.resolve(inputPath),
	driver: sqlite3.Database,
	mode: sqlite3.OPEN_READONLY,
})

const instance = await exportInstance(db, result.right)

const quads = []
for (const quad of serialize(instance, result.right)) {
	quads.push(quad.toJSON())
}

const dataset = canonize.canonizeSync(quads, { algorithm: "URDNA2015" })
fs.writeFileSync(filename, dataset)
