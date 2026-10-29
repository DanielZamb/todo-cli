# Agent JSON contract

Run the parent verify-cli helper with a new absolute evidence directory.
`apps/cli/test/contract.test.ts` drives the compiled binary in scratch HOMEs.
It discovers every command from compiled help and compares that set with
`todo schema --list`. Each command gets a successful JSON invocation whose
stdout must parse as exactly one object with `generated_at`. The test reads
`todo schema <command>`, rebuilds a validator from that published Draft 2020-12
JSON Schema, and validates the actual stdout. New commands must register their
Effect response schema and add a successful invocation to this drive.

The drive covers empty and populated lists, auth, Task lifecycle, History,
Review, export to stdout and a file, Obsidian, config, manual and schema discovery.
Every command also gets an explicit JSON help invocation. Help always uses
`{generated_at, text}`, validated against `todo schema help`, while each command's
data response schema stays separate. Parent commands use that help invocation. Diagnostics stay on stderr, including the first-run notice.
Errors, including unknown long and short flags, missing arguments, invalid
integers and invalid Task metadata, return one JSON error on stdout with exit 2.
The drive passes an unknown flag to every registered command and validates one
error object, with no help text on stdout. In --follow mode, terminal errors use
the shared JSON shape on stderr and leave stdout empty. The shared runner owns
this routing and help suppression, including for commands added later. Shared
error and help schemas are not executable command paths in the discovery matrix.
Duplicate --format flags fail with exit 2. Action flag names after -- remain
literal Task titles.

Split and equals descriptions both preserve `- leading dash`. Values resembling
long flags use equals form. Short built-in flag names such as -h remain literal
when supplied as string values. All five mutation
commands reject missing and stale Versions, include `details.current_version`
and name the `--expected-version` value. Accepted Versions remain unchanged.
History JSON is `{generated_at, entries}`. This is the approved replacement for
the former bare array; entry fields remain unchanged.

Evidence includes `contract-actions.json`, with command exit codes and both
streams, and `contract.json`, with the commands and published schemas checked.
The existing five golden receipts still prove byte-identical output. The domain
fixture `packages/domain/test/presentation.test.ts` separately asserts the exact
JSON for a Task with every optional field populated.

To register a command, import `registerCommandSchema` from `apps/cli/src/schema.ts`
and call it at module initialization with the command path and Effect Schema.
Use that same schema with `encodeResponse` from `@todo/domain/presentation`.
Write the encoded response string directly to process.stdout.
Derive response types from `typeof ResponseSchema.Type`. Add fields to the schema
when adding fields to the response, since Struct encoders retain modeled fields.
