# Electron Dependency search recovery

Status: working-source correction proved; final matrix and end suites remain
pending. The committed parent is `f8236b515efcb6651707e5eaf6d98a655f5a9024`.
This is the Electron parity check requested after S-C1. Its external reference is
the immutable store packet `reports/dag-s-sc1-handoff-698d5594`, not a live import.
No shared API, domain, generated client, canonical browser or UI-pattern change
is part of this correction.

Electron's graph controller already cleared its search-owned failure after a
current success or an empty query and discarded delayed older errors. The exact
f823 graph controller passed the public HTTP renderer sequence before correction.
The picker had a different ownership defect. It used one failure field for search
and mutation. A narrower success removed the existing cycle refusal; a broad
search could replace Conflict recovery. The old Conflict set still guarded writes,
but its visible Reload recovery could disappear.

The picker now owns `searchFailure` separately from mutation/read `failure`.
Current searches replace only their own notice. The graph keeps the same existing
search-failure separation. Both retain the applied query for the existing search
error-context component. Simultaneous picker notices share a bounded scroll region;
the existing Alert and search recovery components are reused. The additional
`dependency-search-error` identifier distinguishes that notice from the preserved
`dependency-error`. Search never clears a mutation witness, attempted candidate,
Conflict set, explicit Reload gate or independent batch report.

The focused public-surface drive uses the production renderer, actual HttpApi
client and Request/Reply path. Its controlled local HTTP endpoint supplies a valid
public 422 `search_too_broad`; its 200 Task bodies come from real authenticated
reads of the compiled scratch server. It does not reproduce a live work-budget
threshold and implements no alternate matcher. The retained dynamic credential
getter is used for both clients. Delayed older 422 replies are awaited through
actual SDK delivery before asserting that they did not republish their notice.

Ignored evidence lives at `docs/evidence/task-dag/unit-e/`:

- `search-recovery-setup/unit-before.log`: actual exit 1, four failed and four
  passed tests. The two behavioral failures are lost mutation and Conflict
  notices; two additional checks expose the missing search-owned state. The
  graph clear/delayed-error/read-failure controls and independent batch report
  control passed before the fix.
- `search-picker-before-01`: actual exit 1 using the exact f823 picker controller
  preimage. After a real cycle refusal, controlled public 422 and narrower real
  200, the expected cycle notice is absent. Its before-assert captures remain.
- `search-graph-before-01`: actual exit 0 using the exact f823 graph controller
  preimage. Broad, narrow, empty and delayed-error recovery all pass.
- `search-recovery-setup/unit-after.log`: actual exit 0, 46 tests in four files,
  including all eight search-recovery tests. Current results and clear remove
  only search-owned notices; mutation, Conflict/Reload and batch state survive.
- `search-both-after-03`: actual exit 0. Its JSON records 16 actual SDK deliveries:
  six controlled public 422 responses and ten public 200 responses. Both delayed
  older errors arrived and were discarded after newer success. The picker keeps
  its real cycle refusal and its real stale-Version Conflict, actual exit pair
  and Reload gate. The graph restores its known region after clear.

The Compact light/dark recovered mutation, recovered Conflict and cleared graph
captures from `search-both-after-03` were read. The source, original preimages,
argv, hashes, existing manifests and receipts are indexed in
`search-recovery-setup/checkpoint.json`; no future file is referenced.
The current compiled CLI/server cache remains source 868, explicitly recorded in
each result. This is working-source renderer proof, not final-source binary,
native key dispatch, safeStorage, Session restoration or complete-suite proof.
