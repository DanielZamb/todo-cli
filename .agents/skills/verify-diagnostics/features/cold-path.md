# Cold read path measurement

Measurement only. The production server, HTTP contract and data model stay
unchanged. Use the compiled server already built by scratch-diagnostics.ts.
The generated fixture manifest contains scratch Sessions and stays mode 0600
under this checkout's ignored .scratch directory. Never use a real database.

```sh
sh scripts/disk-guard.sh
bun apps/server/scripts/scratch-diagnostics.ts build
pnpm exec tsc -p .agents/skills/verify-diagnostics/tsconfig.cold-path.json
bun .agents/skills/verify-diagnostics/scripts/cold-path-fixture.ts seed "$PWD/.scratch/cold-path/base"
bun .agents/skills/verify-diagnostics/scripts/cold-path.ts ambient "$PWD/.scratch/cold-path/base" "$PWD/docs/evidence/ui-speed/cold-new/main"
```

The 36 base fixtures vary current Tasks per Profile (15/178), Profile count
(1/3/8), extra immutable edits (32/256/2048), and three deleted Tasks with or
without 100,000-character descriptions. All appends must commit. The 178-Task
shape has 50 open, 126 done and two cancelled Tasks, with synthetic descriptions
of 1,260 characters and one 5,244-character description. Base fixtures have no
Projects or Tags. COLD_RICH=1 adds 38 Tags and 108 link Attachments to the
178-Task shape and 200-character descriptions to the 15-Task shape; it uses one
Profile. No owner content is copied.

Each factor cell restarts a server five times from a copied checkpoint, without
a health or sign-in request before the first read. It asks the eight refresh
routes three times, either with /profiles first or tags first and /profiles last.
Cold means process/route first use, not a flushed OS file cache. Every body must
have the expected Task/Profile/Tag counts and view membership, with a 200 status
and matching request id. Server-Timing gives handler/auth/queue/domain/DB/encode
when instrumented; absent stages remain null. These spans overlap and must not
be added as disjoint wall time. Raw headers, bytes, load boundaries, server
CPU/RSS, driver CPU and available bounded detail spans are retained.

Use the following modes with the same fixture root and a new evidence path:

- quiet: preserves the existing one-minute load ceiling of 4; held cells exit 2.
- pressure: counterbalances A/B and B/A over five pairs, with six owned CPU
  workers. COLD_PAIRS=10 requests ten pairs where the cell budget permits it.
  Before each pressure start, AppKit must report neither installed Todo app
  frontmost, and CoreGraphics combined-session key-down and mouse-button-down
  ages must all be at least 60 seconds. This includes synthetic session input
  and is conservative about identifying the owner. A periodic check cancels
  on renewed input/frontmost changes. Every worker signals ready before the
  server starts. Both sides use the same host observer in the final harness.
  Each factor/order cell has at most 90 seconds; a pressure run is capped at
  85 seconds or the remaining cell budget. All owned workers and servers stop
  in finally. A safety or deadline hold returns 2, not PASS.
- serial: five trials of eight concurrently dispatched warm reads on four
  large-history corner fixtures. Keep complete entry intervals when the detail
  budget admits them; partial samples cannot prove complete serialization.
- lock: holds BEGIN IMMEDIATE in a separate scratch process for 300 ms, then
  checks request timing and the retained writer_lock_wait span in detail.
- new-profile: warms the seven Profile routes on p0 before first reading p1.
- profile: separate, untimed source-server CPU profile, not a compiled timing
  comparison. Select one fixture with COLD_ONLY, COLD_FIRST=profile and
  COLD_PAIRS=1. It adds 40 validated /profiles reads and saves Bun's CPU profile.

COLD_ONLY is a comma-separated fixture id filter. COLD_FIRST chooses profiles
or profile. COLD_PILOT=1 creates a short 15-Task seed and one pilot trial.

The fixture helper's empty-profiles mode derives three/eight-Profile copies of
one-Profile, 2,048-edit fixtures, keeping all Tasks and operations constant.
Its micro mode measures the existing decoder/read functions and readSnapshot
counterfactuals directly. Discard its first two of twelve repetitions. A shared
read is only a lower bound: it does not implement a new HTTP response or all
view/graph/encoding work. audit checks zero rejected appends, operation totals,
live Tasks, Tags and Attachments on generated checkpoints using SELECT only.

cold-path-report.ts accepts a raw run JSON path and output path. Its optional
fourth argument is tables, chart or micro. The normal summary retains every
paired difference/ratio and labels a median difference inside pair-to-pair
variation inconclusive. A chart displays medians/ranges, not a speedup claim.
The two/three-value statistics controls run on every invocation.

Quiet confirmation and larger pressure cells remain owed if their gates hold.
Do not relabel ambient load as quiet, raise the ceiling, or synthesize input to
obtain permission. Keep interrupted and invalid-fixture development receipts.
