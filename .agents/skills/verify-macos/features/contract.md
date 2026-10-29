# Headless generated contract

## Sub-features

Decode redacted accepted and rejected History and committed SSE operations
through the checked-in generated Swift API. Preserve original operation kinds,
Versions and null fields through encoding.

## How to get to it (user POV)

Purge a Task with the CLI while the Swift client consumes History or SSE.
The client must accept `TaskHistoryRedacted` and advance past that operation.

## Driving it with the headless Swift proof

The checked-in fixture contains redacted History from a scratch HTTP proof.
Run the generated client against that fixture:

```sh
apps/macos/scripts/verify-purge-contract.sh "$PWD/docs/evidence/p01/swift-contract-new" "$PWD/apps/macos/API/Fixtures/purge-history.json"
```

The package executable compiles only the TodoAPI library and Foundation proof.
It decodes all four HTTP History entries with the generated History type and
three committed entries with the generated SSE type, requiring identical JSON
facts after encoding. `result.json`, `history.json` and `commands.log` survive.
There is no running service or scratch database to clean up. SwiftPM keeps its
ordinary ignored build cache in `apps/macos/API/.build`.

## Gotchas

This is a noninteractive contract check during HOLD. It does not compile or
launch Todo, XCTest, notifications or Keychain, and does not prove native UI or
cursor recovery. The native verification HOLD remains in force.

## Disjoint History unions

`normalize-openapi.py` converts only unions whose object variants require
unique constant `kind` or `outcome` values to discriminated `oneOf`. It leaves
the published API document untouched. Run its pure transformation fixtures
with `python3 apps/macos/scripts/test_normalize_openapi.py`.

After regenerating the Swift API, set `TODO_CLI_BINARY` and
`TODO_SERVER_BINARY` from the source-hash cache, then run this command through
the standing order 22 Swift slot wrapper:

```sh
apps/macos/scripts/verify-history-unions.sh "$PWD/docs/evidence/f11/history-unions-new"
```

It creates a fresh scratch server and drives real Task History including a
rejected attempt, Revert and redacted Purge. `UnionContractProof` requires
identical generated decoding and encoding for those HTTP entries and for
AuthChanged from SSE and DatabaseRestored from the scratch operation store.
The latter checks the restore operation independently of global SSE fanout.
`GeneratedContractTests` also round-trips the checked-in fixture of every
effect-port event kind. Native applications and Keychain remain held.
