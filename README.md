# io-sqlite

This repo has scripts that you can use to import and export Underlay assertions to and from sqlite databases.

## Compile

Both the import and export scripts take as their first argument a path to a compiled schema in canonicalized n-quads format. You can generate one of these from a TOML schema with the `lib/compile.js` script.

```bash
% node lib/compile.js -i path-to-schema.toml -o output-path.nq
```

## Import

Use the `lib/import.js` script to import an assertion, or to initialize and empty database given a schema.

```bash
% node lib/import.js -s path-to-schema.nq -i path-to-assertion.nq -o output-path.sqlite
```

You can omit the `-i` flag to just initialize an empty database with the appropriate tables and foreign key constraints.

```bash
% node lib/import.js -s path-to-schema.nq -o output-path.sqlite
```

## Export

Use the `lib/export.js` script to export a database to a serialized assertion.

```bash
% node lib/export.js -s path-to-schema.nq -i path-to-database.sqlite -o output-path.nq
```

IF (and only if) the database was created using `lib/import.js` using the _exact_ same schema AND the database schema was not changed AND every insert/update/delete respected the foreign key constraints and all of the column datatypes, then the export will succeed. You should absolutely make sure to turn on foreign key constraint enforcement when updating an initialized database. Unfortunately (for our purposes) SQLite does not enforce datatype constraints (it only does some light coersion based on declared type affinities) so you have to make sure you're putting the right kinds of values into the right columns. If you mess this up, export will throw an error.

## Usage notes

Foreign key constraint checks are turned **OFF** by default in SQLite; when inserting into a database after it has been initialize you need to explicitly turn them ON with

```
PRAGMA foreign_keys = ON;
```

Read more about foreign keys in SQLite [here](https://sqlite.org/foreignkeys.html).

Also notice that the scripts will prompt for confirmation if a file at the given output path already exists - if you're trying to use these programmatically then you have to make sure the path is clear yourself, before calling the script.

**You need node.js version 14.8 or higher** since the scripts use ES6 modules and top-level await. If you are on an earlier version you might be able to get things to work by throwing in a `--harmony-top-level-await` flag somewhere, but no promises.

## Example

There is an example schema `example.toml` and an example assertion `example.json` in the root directory.

The first thing you'd want to do is compile the schema:

```bash
% node lib/compile.js -i example.toml -o example.schema.nq
```

You should have a compiled schema that looks something like this:

```bash
% head example.schema.nq
_:c14n0 <http://underlay.org/ns/literal> _:c14n6 .
_:c14n1 <http://underlay.org/ns/unit> _:c14n13 .
_:c14n10 <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://underlay.org/ns/iri> .
_:c14n11 <http://underlay.org/ns/key> <http://example.com/Person/name> .
_:c14n11 <http://underlay.org/ns/value> _:c14n26 .
_:c14n11 <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://underlay.org/ns/label> .
_:c14n12 <http://underlay.org/ns/key> <http://underlay.org/ns/some> .
_:c14n12 <http://underlay.org/ns/source> _:c14n5 .
_:c14n12 <http://underlay.org/ns/value> _:c14n7 .
_:c14n12 <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://underlay.org/ns/option> .
```

If we wanted to initialize an empty database based on this schema, we'd run this command:

```bash
% node lib/import.js -s example.schema.nq -o database.sqlite
```

If you open this in DataGrip or similar you should see that there are three tables created:

- `http://example.com/Person`
- `http://example.com/Person/knows`
- `http://example.com/Person/name`

All three should have an integer primary key called `id`.

From here you could start inserting/updating/deleting data.

Or, backing up a bit, if we wanted to instantiate the example assertion, we'd first have to compile the assertion:

```bash
% cat example.json | jsonld normalize > example.nq
```

and then run

```bash
% node lib/import.js -s example.schema.nq -i example.nq -o database.sqlite
The file database.sqlite already exists!
Press Enter to delete it and continue; or Ctrl-C to abort:
%
```

Note that it's **not** possible to import an assertion into an existing database - you can only create a new one from scratch.
