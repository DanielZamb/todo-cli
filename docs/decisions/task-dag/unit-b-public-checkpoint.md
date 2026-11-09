# Unit B public command checkpoint

Branch feat/task-dag-b-commands. Parent algorithm checkpoint is
f140c7b09bcb1db48ce4ccaee797ecfe60019ce4. This is an intermediate verified
checkpoint. TTY confirmation, import/export/Obsidian and the remaining final
corpus are still pending. No whole-feature completion or client parity claim.

The domain now owns authenticated depend/undepend and ordered per-item batch
changes. Input and visible same-Profile endpoint checks precede no-op detection.
No-ops preserve History and Versions despite stale valid expected Versions;
real changes use A's authoritative append validation. Redundant paths and exact
counted warnings remain separate from stored edges. Ordinary and Series creation
carry parsed initial Dependencies atomically, and successors inherit none.
Task command refusals retain full captured DependencyError through CLI/HTTP,
including public edge Revert, blocked completion and reopening under done Tasks.

Delete previews execute against an authenticated in-memory fork. Locked apply
checks confirmation and optional fingerprint against current incident edges.
The CLI retains status and adds the report. Force retains Purge semantics; its
new dry-run path also forks and reports would_purge without deleting the source.
Move reports the authoritative departure event's edge removals and Versions;
Copy has no edges. TaskRead/TaskView response metadata is separate from stored
Task payloads. Default HTTP reads with no edges omit optional graph metadata to
retain existing response bytes; explicit graph filters/order still compute it.

CLI schemas/help/man now publish depend, undepend, graph, batch-depend and revert.
Graph alone accepts Mermaid and refuses table; other commands retain their
format contract. HTTP exposes equivalent operations and structured 422 evidence.
OpenAPI and Swift were regenerated, never hand-merged. Naming TaskWrite and
DependencyError reduces duplicate inline schemas below the existing formatter
limit. It preserves the field shapes and A's version/forbidden-key guards.

## Proof receipts

Absolute root for this checkpoint's local evidence:
/Users/zambamon/.t3/worktrees/todo-cli/feat-task-dag-b-commands/docs/evidence/task-dag/unit-b/public.

| Proof | Actual exit | Evidence relative to that root |
| --- | --- | --- |
| pnpm check, including 319 domain, 46 CLI, 30 server and 35 Electron passes | 0; one existing Electron skip | check-5.log |
| Compiled DAG library, including new authenticated command corpus | 0 | library-checkpoint/exit-code.txt and result.json |
| Compiled public CLI/HTTP, partial L2 | 0 | checkpoint-drive-2/exit-code.txt, actions.json, result.json, cleanup.json |
| OpenAPI and Swift generation via shared Swift slot | 0 | swift-generate-2.log |
| GeneratedContractTests, early headless check | 0; 19 tests, one live case skipped | swift-tests-3.log |
| Existing compiled scratch HTTP/SSE + live GeneratedContractTests + Electron production decoder | 0; live tests no skip | history-unions/generated-tests-result.json, cleanup.json; history-unions.log |
| AtomicCAS real-code sensitivity and restored clean command | 0 overall; mutants 1, 1; restored 0 | atomic-sensitivity.log |

AtomicCAS evidence:
/Users/zambamon/.t3/worktrees/todo-cli/feat-task-dag-b-commands/docs/evidence/fv01/sensitivity-4C9W6N.
DAG-A-MAPPING.md reviews captured-witness forwarding without changing the bounded
single-Task/no-edge claim. This is not graph-model conformance or unbounded proof.

build-checkpoint-2 records the source hash, integration HEAD, dirty source state,
binary hashes and cached paths for the compiled command proof. The live protocol
drive uses the preceding build-checkpoint binaries, before the CLI-only Purge
preview correction. Final B proof must rebuild at the final source SHA and rerun
that live case. Every owned drive stopped its server; cleanup records real exits.

## Contract alignment and remaining work

Added domain files: dependency-contract.ts, dependency-commands.ts and
Node-only dependency-delete.ts. The latter is excluded from the browser index.
New proof inputs are scripts/dependency-command-proof.ts,
scripts/verify-dag-public.ts and test/dependency-commands.test.ts. The DAG skill
adds cached binary and public-drive helpers. No invariant is copied into adapters.

L1/coordinator authorized the minimal existing Electron draft correction.
task-filter-draft.ts exports taskFilterDraft and applyTaskFilterDraft; string
fields remain separate from readiness parsed as true-or-absent. The dialog uses
those exact initialization/Apply/Clear functions, with Cancel unchanged. No
controls, focus or selectors changed. task-filter-draft.test.ts runs the actual
boundary with prefix/text, other exact fields, omission and false refusal.
Command: pnpm --filter @todo/electron test task-filter-draft.test.ts.
L1 will reapply this boundary onto the final search dialog and regenerate/reprove
at its own rebased tip. This worker never rebases or switches checkouts.

GeneratedContractTests changes only three response-type references to the named
Components.Schemas.TaskWrite. Existing typed v1/v2 and malformed/contradictory
assertions remain intact. Every Swift command uses swift-slot. No app, signing,
Keychain, installed binary or real Todo directory was used. No owner Task edits,
children, push, PR, merge or rebase. Local comments/structure audit found no added
handwritten source comments or suppressions; no comment deletions/restorations.
New schema, query, command and fingerprint concerns have separate owners.
Independent reviews remain L1/coordinator work after final proof.
