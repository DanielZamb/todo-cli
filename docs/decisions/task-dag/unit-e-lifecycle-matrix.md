# Electron lifecycle and matrix preparation

This work extends `20098c159aee8fcf56404db21c235b522cefc2c3`. Final-source
compilation, the combined final matrix, both complete offscreen suites and review
remain pending. Canonical e7902582 and generic handoff files are unchanged. No
domain, API, Swift or package change is included.

All folders below resolve under `docs/evidence/task-dag/unit-e/`. Setup folders
retain source snapshots, raw logs and actual outer exits. These working proofs
still use the recorded 868db38c compiled cache, not final-source binaries.

## Lifecycle and initial creation

`lifecycle-03` exits 0 with 32 captures. Public GraphReports prove Copy creates no
edges and preserves both source directions. Move reports both dropped edges,
advances the moved Task and affected dependent to Version 2, and leaves the blocker
at its existing Version. Public source History decodes TaskMovedOut v2 with those
two removed edges. No client undepend loop is used. Existing History also renders
an actual TaskCreated v2 initial edge.

Reverting completion of a blocker of a done Task is refused with the approved
human message and actual exit 2. Both originals stay done. Create follow-up
preselects the specified DONE dependent. Public reload and History prove one
TaskCreated v2 at Version 1 with that edge.

`initial-recovery-02` exits 0 with four captures. Removing a selected blocker
before creation produces the server's typed dependency_profile_mismatch with exit
2. The title and selected chip remain with the approved projection. Removing the
chip and explicitly submitting again creates one Version 1 Task with no edge.
No missing-Task status or exit pair is invented from that refusal.

Earlier verifier failures remain: lifecycle-01 matched two legitimate incident
History reports; lifecycle-02 assumed an empty optional TaskRead.depends_on was an
array; initial-recovery-01 expected NotFound/exit 3 instead of the actual typed
Dependency refusal/exit 2. Each exits 1. The corrected empty-set proof uses the
authoritative public graph. No product change was needed for these failures.

## Search, Profile and auth

`search-close-02` exits 0 with 30 captures. Loading retains checked links and the
mutation refusal. Close invalidates a pending candidate read; actual SDK delivery
precedes the no-publication assertion. Broad search, narrower success, clear,
older-error discard and Conflict/Reload preservation remain covered. The first
run exits 1 because the verifier filled an already-empty query after reopening
and incorrectly awaited a new request. The corrected sequence changes the query
before clearing it; no sleep or retry is added.

`picker-fence-02` exits 0 with eight captures, all read by E. A previous Profile's
authorized candidate response is held until the new Profile is active and cannot
publish there. The existing user-entered query remains, as before. An actual SDK
Unauthorized is held until a replacement scratch Session signs in. Its raw tag
and exit 3 are recorded separately from the human Reply. Delivering that old error
cannot reopen the picker or sign out the replacement; a protected read through
the same retained HttpApi client succeeds afterward. Native sign-out notices,
safeStorage and native Session restoration remain unproven.

The first picker-fence run exits 1 because the verifier expected an auth code on
the projected Reply. The existing projector carries approved human recovery and
the actual pair without that optional code. The corrected control also asserts
the raw SDK Unauthorized tag. No product auth change was needed.

## SSE refresh frame regression

Combined feature-matrix-09 exits 1 after 440 captures: focus recovers to the root,
but the automatic camera changes. Deterministic graph-matrix-10 also exits 1.
Holding the real graph read after a public Delete and SSE proves the in-flow
loading message shrinks the frame from 351 by 199 to 351 by 155. That triggers an
automatic refit, changing scale from 0.678862 to 0.5. Both failures are retained.

The host now keeps refresh loading accessible without taking layout space when an
authorized report already exists. Initial loading remains visible.
`graph-matrix-11` exits 0 with 76 captures. Frame size stays 351 by 199 and the
viewport transform is identical before, during and after the held read. The
vanished neighbour's focus falls back to the surviving root. Shape, Energy,
whole-group, resize, manual-camera and Reset assertions also pass. No canonical
adapter or fit-protocol change is included.

## Matrix admission

`dag-capture-inventory.ts` requires exactly 636 state/layout/appearance identities
and rejects duplicates or omissions. The registry names states, not future
receipt files. Manifest writing still validates every actual file reference,
including on a partial failure.

DAG_MATRIX_PASS requires all assertions and the inventory to pass on clean
committed source with a matching embedded binary head. Otherwise a zero-exit
intermediate stays DAG_INTERMEDIATE_PARTIAL. Neither marker claims a complete
client suite or UI approval. Controlled self-cycle reports are labelled projector
fixtures rather than public self-edge writes. Pele Retry and cancelled batch
review have explicit capture states.

The next freeze must build new binaries, run the full matrix and both complete
suites, preserve the known main Import failures, read every final image and retain
the actual nonzero exits. No focused pass substitutes for that end proof.
