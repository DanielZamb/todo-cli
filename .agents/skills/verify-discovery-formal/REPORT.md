# Discovery model-ready checkpoint

The bounded approved-contract model passes both exhaustive safety runs and all
ten behavioral sensitivity checks. Production conformance remains unproven
pending reviewed, integrated C/D immutable SHAs.
No product or domain file is changed. Existing Task search mappings are intact.

The one command is:

```sh
bun .agents/skills/verify-discovery-formal/check.ts
```

TLA+ checks event ordering because a late authorized reply can become unsafe
after its credential or dialog changes. B separately owns the real domain
no-leak properties and single SQLite read snapshot. The model assumes each
reply contains only rows authorized for its captured credential.

The exact scope, equality abstraction, assumptions, events and maintenance
obligations are in SKILL.md. SOURCE-MAPPING.md records the contract SHA and
production mapping gate. No unbounded, liveness, native UI, Task matching or
mechanical source refinement guarantee is claimed.

## Tool and graph

TLA+ tools v1.7.4, TLC 2.19, jar SHA-256
936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88.
Java uses MemFPSet1, one worker, 2 GiB, fingerprint polynomial 17 and seed 1.
The command checks the jar hash on every run.

Generation colors are model values. GenerationSymmetry permutes only those
four colors. All operations on colors are equality, membership and set
operations, and every invariant is unchanged under a color permutation.
No credential, dialog, prefix or Profile is permuted. No state constraint,
depth cutoff or lifetime request bound removes a reachable event order.
Counts are symmetry-reduced states. Generated successors include duplicates
and stutters, not distinct edges. A successful queue must be exactly zero.

## Development attempts

The initial unsymmetrized run check-qHAOyn was stopped through its recorded
Java PID 39433 after the graph grew. Java exited 143. It is incomplete proof.
check-Y3jPf3 exited 255 because TLC symmetry requires model values instead of
integer colors. That configuration error is not a sensitivity pass. Both
attempts remain under ignored docs/evidence/discovery-formal.
check-y61JEm was stopped through recorded PID 41560, Java exit 143, to count
the pending Show exact-id read toward the two-outstanding-reply limit.
It is incomplete proof. No invariant was weakened.

check-dpQt4p was stopped through recorded PID 43909, Java exit 143, before
splitting the latest-generation mutant from the identity guard.
check-6Ig24j was stopped through recorded PID 49121, Java exit 143, to use the
four colors sufficient for every reserved-reference equality pattern.
Neither attempt is a pass. The ignored attempt-census.json retains all results.

## Repository check

The initial pnpm check exited 1. Its existing CLI schema sweep timed out at
60 seconds while the proof was running. Domain, server and Electron tests passed.
The unchanged check will be repeated after model checking completes; no timeout
or product code is changed. The initial receipts are pnpm-check.json and
pnpm-check.log under docs/evidence/discovery-formal.

## Production gate

The user confirmed that C/D immutable source SHAs will arrive only after review
and integration. This checkpoint must not renew production mappings. The new
skill is proven as a model-only workflow. The formal skill creator's required
real-code break, restoration and clean rerun remain pending C/D. A model mutant
cannot stand in for that evidence. The unit adds no files under packages/domain.

## Completion and abstraction review

The model-ready interface is one command with pinned tooling, literal guard
controls, complete queue receipts and restored checking. Its concepts follow
requested identity, request generation and applied snapshot. The accepted Show
handoff retains one source while clearing discovery, then rechecks credential
provenance after the exact-id await. Mapping an actual client split across an
await remains a review obligation. Extending coverage to C/D should reuse these
steps and add source hashes, not create a second publication policy.

Completion is partial for the whole E unit until production mapping and
real-code sensitivity exist. Usability, form and the core abstraction receive
a code-level yes for this model-only checkpoint, subject to the actual command
receipts below. No extra child or independent review is claimed. The local
no-comments audit covers the new runner/model only; independent audit remains
with the permitted seat-1 reviewer. Existing Task search invariants and hashes
are unchanged.

The earlier check-c6YVkm exhausted the clean graph and eight controls, then was
stopped through recorded PID 58801, exit 143, during broken-show-source.
Its Show observation accidentally constrained the broken action instead of
recording the lost source. Parenthesizing the Boolean observation fixes that
model error without changing the invariants. The isolated preflight then fails
ShowIsAuthorized with exit 12 after Open, Submit, ResponseOK and Show. Its trace
is under docs/evidence/discovery-formal/preflight-show-source. The complete
corrected command is rerun from the beginning below.

## Completed model proof

The command exits 0. Evidence is

```text
/Users/zambamon/.t3/worktrees/todo-cli/feat-agent-discovery-e/docs/evidence/discovery-formal/check-4Y5igU
```

Both clean runs exhaust the full stated bounds together: two credential scopes,
two dialog kinds, two prefixes, two source Profiles, at most two outstanding
replies total, four generation colors, one retained callback and one Show read.
There is no lifetime request cutoff or fairness assumption. The complete
safety graph has depth 29.

| Stage | Exit | Generated successors | Distinct states | Final queue |
| --- | --- | --- | --- | --- |
| safety | 0 | 4001603 | 381738 | 0 |
| broken-credential | 12 | 130 | 55 | 33 |
| broken-dialog | 12 | 112 | 49 | 29 |
| broken-latest | 12 | 650 | 285 | 196 |
| broken-error | 12 | 115 | 48 | 28 |
| broken-close-clear | 12 | 89 | 45 | 29 |
| broken-signout-clear | 12 | 90 | 45 | 29 |
| broken-edit-clear | 12 | 169 | 68 | 40 |
| broken-show-guard | 12 | 517 | 202 | 133 |
| broken-show-source | 12 | 174 | 73 | 45 |
| broken-show-credential | 12 | 1706 | 609 | 394 |
| restored | 0 | 4001603 | 381738 | 0 |

The negative runs stop at their intended behavioral violation, so their nonzero
queues are expected counterexample receipts. They are not exhaustive passes.
The restored run repeats the original model with every guard enabled.

| Broken guard | Violated property | Behavioral counterexample |
| --- | --- | --- |
| credential | CurrentCredentialProvenance | Open, Submit, same-scope CredentialChanged, then the old ResponseOK publishes. |
| dialog | CurrentDialogProvenance | Open, Submit, Close, then the old ResponseOK publishes. |
| latest | AppliedIsCurrent | Submit prefix a, edit to b and back to a, then the invalidated ResponseOK publishes. |
| error | LatestPublication | Submit, Close, then the old ResponseError changes phase to Error. |
| close-clear | ClosedIsEmpty | Publish rows, then Close leaves rows visible. |
| signout-clear | SignedOutIsEmpty | Publish rows, then SignOut leaves rows visible. |
| edit-clear | AppliedIsCurrent | Publish rows, then EditPrefix leaves the earlier result visible. |
| show-guard | ShowIsAuthorized | Publish, edit the prefix, then an obsolete callback accepts Show. |
| show-source | ShowIsAuthorized | Publish, then Show closes discovery but loses the captured source. |
| show-credential | ShowIsAuthorized | Publish, Show, SignOut, then ShowResponseOK opens the old source. |

The runner typecheck exits 0. The tracked model remains byte-identical through
the controls. Its SHA-256 is
76ae9ac6c338dd206deea6bb71194b11916b5f3e794949b6db665f4f33246e24.
The approved contract is hash-checked at immutable commit
7c9d3b7d3f9fd5d06cf8cc533ee42f1811230efa. This is model sensitivity; real client
source mutation remains pending C/D. There is no covered production client SHA.

The relative skill link and frontmatter checks pass. The local no-comments
audit exits 0 with no comments, suppressions, deletions or refactor flags.
Fresh Claude discovery and independent seat-1 audit remain unproven here.
No files are added under packages/domain. No visual output is produced.

The final repository check runs after this checkpoint commit, using binaries
cached by product source hash in this worktree. Its actual command, immutable
HEAD, exit and log are retained under docs/evidence/discovery-formal as
pnpm-check-final.json, pnpm-check-final.log and binaries.json. The delivery
message reports that result. All tracked additions are proof or skill files.
