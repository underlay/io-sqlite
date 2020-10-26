import fs from "fs"
import path from "path"
import readline from "readline"
import toml from "toml"

import { serializeSchemaString } from "apg"

import { TomlSchema } from "./lib/schema.js"

function invalidParameters() {
	throw new Error(
		"Usage: node lib/compiled.js -i path-to-schema.toml -o output-path.nq"
	)
}

let inputPath = "",
	outputPath = ""

if (process.argv.length === 6) {
	if (process.argv[2] === "-i" && process.argv[4] === "-o") {
		inputPath = process.argv[3]
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

const input = fs.readFileSync(path.resolve(inputPath), "utf-8")
const schema = toml.parse(input)

const result = TomlSchema.decode(schema)
if (result._tag === "Left") {
	for (const error of result.left) {
		console.error(error)
	}
	throw new Error("Invalid TOML schema")
}

fs.writeFileSync(
	filename,
	serializeSchemaString(TomlSchema.encode(result.right))
)
