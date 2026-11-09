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

## Dependency event compatibility

Unit A adds compact DependencyAdded/Removed and lifecycle v2 events. Run
GeneratedContractTests through the shared Swift slot. The reusable
API/Fixtures/dag-operations.json fixture exercises both the generated
CommittedOperation decoder and the production CommittedOperation decoder with
AuthChanged, DependencyAdded and all four lifecycle v2 shapes.

The OpenAPI normalizer groups equal kinds only when required entity_version
constants prove their variants disjoint. Its tests reject overlapping versions.
Never edit generated Swift by hand.

Set TODO_DAG_CONTRACT_TESTS=1 when running verify-history-unions.sh through the
Swift slot. The scratch HTTP driver observes both new edge events over SSE,
decodes every observed operation with Electron's production ChangeEvent schema,
and runs all GeneratedContractTests with its live scratch server. This removes
the optional HTTP test's skip. generated-tests-result.json and cleanup.json
retain real exits and owned child termination. Both client handlers already
refresh for ordinary committed operations after decoding. This proof adds no
Dependency controls or renderer and does not launch Todo or touch Keychain.

## Typed lifecycle versions

Roundtrip equality alone does not prove that a generated oneOf selects the
correct typed branch. testLifecycleVersionsSelectTypedCasesAndRejectContradictions
asserts each v1/v2 branch and literal typed edge/Version fields, then rejects
unknown, missing and malformed versions and contradictory dependency shapes.
Legacy nullable fields and unrelated additional fields survive encoding.

The pinned Swift generator represents numeric enums as unchecked Double fields.
The existing preserve-null generation step now reads component schema constants
and emits numeric-version checks in generated Decodable initializers. A v1
payload therefore cannot consume a v2 value. Optional false-schema properties
become explicit x-todo-forbidden-properties metadata during normalization;
generated checks reject those keys without banning unrelated additional fields.
The checks run in the generated CommittedOperation and History decoders used by
production. No handwritten client wrapper or branch reordering is involved.
Operation-local non-component schemas retain their prior generation behavior;
all lifecycle cases live in the component schemas covered by these checks.

G11 extends the existing live GeneratedContractTests case with a branching
graph created through generated API methods. Typed graph decoding and encoding
must retain the requested root's ancestors, descendants and lightest_next in
topological order, and every node must have exactly eight fields. The fixture's
energy order differs. Run the history-unions scratch drive through swift-slot
with TODO_DAG_CONTRACT_TESTS=1 so this live case cannot be skipped.
