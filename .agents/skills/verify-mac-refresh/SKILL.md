---
name: verify-mac-refresh
description: Verify Mac catalog refresh scheduling, operation replay, own-write echoes and quiet reconnects through the production model, generated transport and an unordered RootView on scratch data. Use after Mac refresh or publication changes.
---

# Verify Mac refresh work

Created with create-verification-skill. Read the [feature map](features/README.md).
This is a headless model and layout check. It cannot qualify native input,
physical presentation, VoiceOver or the owner's per-interaction latency target.

## Launch

From the checkout root run a paired five-run comparison:

```sh
.agents/skills/verify-mac-refresh/scripts/verify.sh docs/evidence/mac-perf/c4/new b520693e
```

The helper archives the baseline and snapshots current application/API sources
into separate scratch targets. It builds Release through swift-slot.sh, uses
the compiled scratch server/CLI cache and imports the owner-shaped fixture.
Work has 178 Tasks, personal has 92, and initial History has 925 operations.
The generated client signs into scratch. The model receives that credential
through replaceCredential. SessionVault methods trap if called. No Todo.app,
Keychain, signing, installation or owner database is involved.

## Doctor

Read commands.json, revisions.json, harness.json, source/artifact hashes and
each variant.json. Baseline and working tree must have distinct paths even
when they share a Git parent. Require matching package pins, successful child
exits, the expected service/contract and owned scratch cleanup. The private
proxy must report an accept backlog of 1024; the default five-slot listener
can distort a fresh eight-connection refresh.

The proxy has one worker per downstream connection and creates a fresh upstream
connection per request. Its network timings include proxy overhead. Qualify
session reuse and socket bounds separately against direct scratch HTTP. Load in
the summary covers actual client request activity; the complete cell envelope,
including setup and lock waiting, is retained separately.

## Drive

The fixed session runs the initial read, stream ready, one real CLI edit,
Profile switches with 0, 50 and 300 replayed operations, Complete with its echo,
a burst of 20 real CLI edits and an injected quiet EOF. Actions call the
production model and transport. Their resulting catalog and All-tasks rows
must equal a separately read authoritative server response.

Read climb-summary.json. Require zero errors, five cells per side and 372
consumed operations per complete session. Compare requests and actual full
catalog reads, not queued refresh intents. Inspect model-action time separately
from the fixed counting settle interval. Current-row time and replay-drain time
are separate observations. Compare fresh layout medians and ranges on the same
fixture and host conditions. A programmatic model call is not native input.

## Evidence

Keep the small summary, literal count vectors, work/errors, ranges, load samples,
source hashes, child exits and cleanup receipts. Raw output stays ignored.
The original Phase 0 count table totals 379 full refreshes and 3,043 requests;
the earlier written total of 378 omitted one row in the arithmetic. C3's quiet
resume already removes one full read before this optimization loop. Do not
credit that inherited change to a later attempt.

Run the appropriate state/contract, search formal and real SSE gates with each
kept mechanism. Preserve behavior under errors, supersession, credential changes,
restore, retained failed searches and environmental catalog invalidation.

## Cleanup

The runner stops only its recorded children and removes its private HOME and
database. Evidence survives. Inspect every cleanup.json and any command-unsafe
marker after failure. Never kill by process name or clear owner diagnostics.

## Helpers

scripts/verify.sh takes a fresh evidence path and a baseline commit. The underlying
run.py supports single-run qualification and easy backlog controls before the
measurement is frozen. These controls are not optimization attempts. Fresh Claude
discovery and native UI acceptance remain coordinator-owned under the single-worker
rule.

The five-pair baseline command was proven end to end at b520693e: zero errors,
ten identical 372-operation, 378-catalog-read, 3,035-request vectors, canonical
rows and owned scratch cleanup. The compact receipt is
docs/evidence/mac-perf/mac-refresh-baseline-summary.json. This proves this
headless recipe, not fresh Claude discovery or native interaction acceptance.
