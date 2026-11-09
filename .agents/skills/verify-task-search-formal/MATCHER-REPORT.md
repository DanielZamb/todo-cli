# Candidate matcher property checks

All five generated-input properties pass against real candidate
`be876581ea9d4c024fab3b0bc2c8358051c6d2b4`. Each also fails on a scratch
production-code break and passes after byte-for-byte restoration. L1 subsequently repeated the checks at reviewed integration 8272b610, documented below. Production client mapping is recorded in CLIENT-MAPPING.md; the final L1 ledger records the exact integration-tip recheck.

The standalone command exits 0:

```sh
bun .agents/skills/verify-task-search-formal/check-matcher.ts
```

The main `check.ts` command also runs this command after the C1 model checks.
An explicit full commit SHA selects a later reviewed source for integration
recheck. The command never selects a mutable branch implicitly.

## Source and evidence

The source comes from `git archive` of the immutable candidate object. The runner
captures `packages/domain/src` and its package manifest under its own ignored
evidence directory. It does not read working changes, merge, or edit another
worktree. `matcher-properties.ts` imports actual captured `task-search.ts` and
`task-filters.ts`. It uses their public functions `normalizeTaskSearch`,
`parseTaskSearch`, `matchTaskSearch`, and `filterTaskRecords`. There is no stand-in
matcher, copied matching algorithm, or generated test API.

The completed evidence is:

```text
/Users/zambamon/.t3/worktrees/todo-cli/t3-9a98d7a3/docs/evidence/task-search-formal/matcher-RHxLBW
```

`provenance.json` records the candidate SHA, runtime, driver hash, and SHA-256 of
every captured source file. Important source hashes are:

| File under `packages/domain/src` | SHA-256 |
| --- | --- |
| `task-search.ts` | `196d91957dc059666cca0414aa0d73204349a0075f054732479358f6061230c5` |
| `task-search-case-fold.ts` | `4f44913d63f3de2d65ecbee037b8810388945f0514d76079e7b24cc6141fe08e` |
| `task-filters.ts` | `96df592e0ce243c63397924c154e437973b8bc8f30e40948a75045498a7739cf` |

The table source declares Unicode 17.0.0 default full folding, excludes Turkic
mappings, and pins its original CaseFolding.txt SHA-256 to
`ff8d8fefbf123574205085d6714c36149eb946d717a0c585c27f0f4ef58c4183`.
These checks use Bun 1.4.4, ICU 78.1, and Unicode 17.0. Runtime versions are
part of the receipt because normalization and segmentation depend on them.

## Corpus and bounds

The xorshift32 seed is `0x5ea2c001`, decimal `1587724289`. The driver stores all
24 atoms and 12 positive terms as literal arrays. The clean receipt repeats
them, including composed accents, combining marks, ligatures, full-width text,
Greek, dotless i, Deseret astral letters, Japanese, and emoji sequences.

The Task corpus has six literal Unicode or syntax fixtures, all 64 ordered pairs
from the first eight atoms, and 64 generated title/description pairs. Generated
fields contain two through five atoms with space, colon, slash, or newline
separators. Some descriptions are null. Total Task count is 134.

| Property | Exact bound | Assertions |
| --- | --- | --- |
| Normalization idempotence | Every one of 1,112,064 Unicode scalar values, all 24 cubed atom concatenations, and 2,048 seeded strings of one through eight atoms | 1,127,936 |
| Adding a positive term cannot add membership | 134 Tasks, 12 base terms, 12 added terms | 19,296 |
| Closed phrase is a subset of unquoted words | 134 Tasks, every ordered pair of the 12 terms | 19,296 |
| Id prefix equals case-insensitive `startsWith` | 64 schema-validated Tasks, every prefix length 1 through 36 in both cases, plus six literal probes, deduplicated | 4,426 |
| Original UTF-16 spans | 134 Tasks and 44 queries. Check rejection spans, field order, deduplication/non-overlap, integer nonempty ranges, and both original grapheme boundaries | 7,500 |

The prefix checks compare complete ordered id arrays, so they also check retained
input order. Span checks require more than 100 total positive spans and more than
100 description spans. A grapheme boundary set comes from the original field,
not normalized text. Scalar enumeration excludes lone UTF-16 surrogates.
These properties do not prove all query syntax, unrestricted Damerau distances,
or complete Unicode correctness. The domain worker's literal and compiled
verification owns those additional contracts.

## Sensitivity and restoration

Each mutation runs in the captured production source. `finally` restores the
exact original bytes. After all variants, the runner compares every captured
source hash, reruns the whole corpus, and typechecks both the captured driver
and all domain sources. The runner itself typechecks separately.

| Production-code break | Observed assertion witness | Exit |
| --- | --- | --- |
| Case-fold entry `A` incorrectly maps to uppercase `B` | `N(A) = B`, then `N(B) = b` | 1 |
| Missing terms are ignored for multi-clause queries | Base `pay` rejects a Unicode Task, while expanded `pay pay` incorrectly accepts it | 1 |
| Phrase word condition uses `some` instead of `every` | Quoted `pay strasse` accepts a Task that unquoted `pay strasse` rejects | 1 |
| Id prefix uses `includes` instead of `startsWith` | Prefix `-` incorrectly returns all 64 ids instead of literal expected `[]` | 1 |
| Word span end is one UTF-16 unit short | Query `e` on original `e` plus combining acute returns `[0,1)`, inside the original `[0,2)` grapheme | 1 |

Every negative receipt has `kind: "behavior-assertion"`, the expected property
name, actual inputs and outputs, and exit 1. A compiler error or source gate
cannot satisfy sensitivity. `clean`, `restored`, `typecheck-properties`, and
`typecheck-runner` all exit 0. No source in the candidate worker's checkout or
this checkout's product directories is changed.

After the candidate is reviewed and integrated, rerun this command with the
approved full integration SHA. Then review and map the revised clients. The client mapping and compiled regression proofs remain separate from these
matcher properties. Neither is a mechanical source refinement.

## Reviewed integration recheck

L1 ran check-matcher.ts against 8272b610f6e0d4723c52a7906a2583d12721d6af after coordinator seat-2 approval and merge of unit 1. Exit 0. Evidence is /Users/zambamon/.t3/worktrees/todo-cli/t3-9a98d7a3/docs/evidence/task-search-formal/matcher-HtP4C8. The same five properties, behavioral sensitivity and byte restoration passed on the corrected source. matcher-candidate.json now defaults to that reviewed immutable integration commit. Production client mapping is recorded in CLIENT-MAPPING.md; the final L1 ledger records the exact integration-tip recheck.
