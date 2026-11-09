---
name: verify-task-search
description: Verify Todo Task search normalization, clauses, typo prefixes, UTF-16 highlights and id-prefix filtering through the domain, compiled CLI and authenticated HTTP on scratch data.
---

# Verify Task search

Created with `create-verification-skill`. Read [the feature map](features/README.md).

## Launch

From the checkout root, run:

```sh
.agents/skills/verify-task-search/scripts/verify.sh "$PWD/docs/evidence/task-search/new"
```

Pass a fresh absolute evidence directory. The helper runs literal domain cases,
then the compiled CLI and HTTP filter drive. It caches production binaries in
this checkout's `.scratch/bin` using the existing cache helper. Each drive gets
a fresh scratch HOME, SQLite database and Attachment root. No installed binary,
owner database, native app or Keychain is used. The server requests port 0 and
must print its loopback listen URL within 60 seconds.

## Doctor

Require Bun 1.4.4 or newer, installed pnpm dependencies and `pnpm typecheck`.
The helper records `.scratch/bin/build.json` as `binary-provenance.json` and
runs the actual cached CLI `--version`. The HTTP drive checks health against the
generated `CONTRACT_ID`. Inspect `domain.log`, `drive.log` and
`compiled/actions.json` on failure.

## Drive

`packages/domain/test/task-search.test.ts` asserts the literal matcher and
boundary cases. `apps/cli/scripts/verify-task-search.ts`, called from the
filter driver, creates Tasks through the compiled CLI and queries each through
both CLI list and authenticated HTTP. It compares original strings and exact
spans from the same response, checks omitted metadata without text, invalid
flags and HTTP queries, empty success, stable order and exact-id commands.
The parent filter matrix also combines text with every existing filter.

The reusable `task-search-cases.ts` corpus includes the SEC-L1-1 input:
`"\ufdfa".repeat(200)` against description `"\ufdfa".repeat(1000)`. Both
compiled surfaces must return exactly `[{field:"description",start:0,end:1000}]`.
The parser regression requires the five distinct normalized execution clauses
in first-occurrence order. Repeated words, phrases, exclusions, mixed signs and
fold expansions retain literal acceptance and span checks. Phrase word order
and repetition inside a phrase remain significant. These are behavior checks
without wall-clock thresholds; HTTP health responsiveness is measured separately.

`task-search-equivalence.test.ts` compares acceptance and exact ordered spans
with the archived c11f7ec9 evaluator in `task-search-reference.ts`. It covers
the literal corpus, 3,000 seeded Unicode/syntax cases and 12,000 seeded typo
pairs, including repeated words and clauses that exercise request-local memoization.
`task-search-yield.test.ts` requires an event-loop callback to run before a large
search publishes its complete result. The shared core yields after 512 word
occurrences; the server also yields between Tasks. The synchronous CLI drains
the same core. `task-search-preparation.test.ts` compares preparation with the
original evaluator at chunk sizes 1, 7 and 512, including expansion seams and
whole grapheme origins. Preparation now yields too. The interruption regression
requires an interrupted drain to publish nothing and prepare no further Task.
Response serialization remains synchronous.

`task-search-budget.test.ts` checks the shared deterministic meter, exact cell
counts, refusal without partial publication, non-text narrowing, and identical
cold, warm and uncached totals. Warm preparation returns a stored PreparedField.
`task-search-finalizer.test.ts` requires exactly one generator return on suspended
interruption or runner failure, and no extra return after completion or a thrown
next call. The compiled drive creates three maximum-size U+FDFA descriptions,
requires CLI exit 2 and HTTP 422 with `search_too_broad`, narrows successfully,
then shrinks a description and requires the search to succeed again.

The frozen PERF measurement JSON and seed are preserved unchanged as
`fixtures/perf-measurement-fixture.json` and `seed-perf-fixtures.ts`. The seed
requires its fixture argument and an explicit scratch TODO_DB. It writes
through `openStore` and `store.append`. Measurement receipts record process CPU,
wall time, host load, work, outcome and concurrent health responses separately.
The budget and weight live in `taskSearchWorkLimits`. Raw input boundaries and
all accepted response spans remain unchanged. The span-cap owner question is
outside this verification change.

Use `todo man list` and `todo schema list` to inspect syntax and response shape.
HTTP remains `GET /profiles/work/tasks?text=...&prefix=...`. Closed quotes are
whole-word phrases. An unclosed phrase permits its last word to prefix-match.
Exclusions use zero-typo prefixes. Hyphens inside a term separate positive words.

## Evidence

The requested directory keeps `domain.log`, `drive.log`, `doctor.log`,
`binary-provenance.json` and `compiled/`. `compiled/task-search.json` contains
literal cases and CLI/HTTP responses. `compiled/actions.json` records actual
process exits and HTTP statuses, and `compiled/result.json` reports PASS only
after the complete matrix and cleanup. No credentials are retained.

## Cleanup

The filter driver's finalizer stops only its child server, waits for exit and
removes only its scratch directory. Cached binaries and evidence survive.
The script checks that the PASS result and search receipt still exist.

## Helpers

Executable `scripts/verify.sh <fresh-absolute-evidence-directory>` resolves its
checkout and runs domain tests plus the compiled filter drive. It reuses
`TODO_CLI_BINARY` and `TODO_SERVER_BINARY` from the cache manifest.
`.claude/skills/verify-task-search` is a relative link to this directory.
Fresh Claude discovery remains a separate coordinator check; a resolved link
alone does not prove discovery. Use `/maintain-verification-skill` when syntax
or the response contract changes.
