import fs from "fs"
import path from "path"
import readline from "readline"

import sqlite3 from "sqlite3"
import { open } from "sqlite"

import { Parse, Store } from "n3.ts"
import { parseSchemaString, parse } from "apg"

import { createTables } from "./lib/createTables.js"
import { importInstance } from "./lib/import.js"

function invalidParameters() {
	throw new Error(
		"Usage: node lib/import.js -s path-to-schema.nq -i path-to-data.nq -o output-path.sqlite"
	)
}

let schemaPath = "",
	inputPath = null,
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
} else if (process.argv.length === 6) {
	if (process.argv[2] === "-s" && process.argv[4] === "-o") {
		schemaPath = process.argv[3]
		inputPath = null
		outputPath = process.argv[5]
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
	const answer = await new Promise((resolve) => {
		console.log(`The file ${outputPath} already exists!`)
		rl.question(
			"Press Enter to delete it and continue; or Ctrl-C to abort:",
			resolve
		)
	})
	fs.unlinkSync(filename)
	rl.close()
}

const schemaFile = fs.readFileSync(schemaPath, "utf-8")
const schema = parseSchemaString(schemaFile)
if (schema._tag === "Left") {
	console.error(schema.left)
	throw new Error("schema did not parse")
}

const db = await open({ filename, driver: sqlite3.Database })

// await db.exec("PRAGMA foreign_keys = ON")
await db.exec(createTables(schema.right))

if (inputPath === null) {
	process.exit(0)
}

const inputFile = fs.readFileSync(path.resolve(inputPath), "utf-8")
const store = new Store(Parse(inputFile))

const instance = parse(store, schema.right)

if (instance._tag === "Left") {
	console.error(instance.left)
	console.error(JSON.stringify(instance.left.errors, null, "  "))
	throw new Error("Instance did not parse")
}

importInstance(db, schema.right, instance.right)
