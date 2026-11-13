# CLI routing slice 1

Delivered for correctness review on `feat/cli-through-server`, 2026-11-12.
Implementation commit `06beca883223d376f7b598631c12c2bb418d8d6d`, verification
correction `eaefd80380f86ef3fadd91ca8b35e49198cefb62`, and transport-status correction
`f6761a4664ef` precede this report. No production CLI command is routed.

The owner decisions are recorded under Decided in the
[design](cli-through-server-design.md) and
[proposed ADR-0023](../../adr/0023-cli-writes-through-the-running-server.md).
The original proposal remains as an alternative. Accepted ADR-0001/0002 are unchanged.

## Built behavior

- The server publishes a private per-database endpoint record after binding its
  actual port and removes only its own incarnation on orderly shutdown. A separate
  UID-private SQLite guard, keyed by device, inode and birth time, excludes a
  second participating server, including another path for the same inode. CLI
  writers never acquire this guard.
- Discovery retains `--db`, `TODO_DB`, configured path, then scratch HOME/default
  precedence in one function. The CLI checks record permissions, physical identity,
  storage context and contract identity before a fresh HMAC nonce proof. Numeric
  loopback is the only destination. Credential headers and command bytes are added
  only after the socket matches the proved connection. No automatic reconnect,
  redirect, environment URL, default-port fallback, or command retry is used.
- Automatic/direct mode falls back directly on any unproved server. The local
  write-mode setting is active now, with flags overriding config and config
  overriding automatic. Server mode refuses writing commands even with a proved
  server because none is production-routable yet. Reads, init and reset-passphrase
  remain direct. Unknown configured modes and conflicting flags fail with usage
  exit 2 before prompts or writes. Help and schemas state the transitional behavior.
- Direct commands observe History sequence and restore generation. A changed
  database, a committed prefix before failure, or successful Snapshot file work
  causes one data-free nudge after command execution. Automatic/direct discovery
  is bounded by a nominal 50 ms; the nudge has a separate 50 ms bound. Nudge failure
  never replaces the command's output or exit. Require-server discovery allows
  1,000 ms. Host scheduling can delay timer delivery; these are not real-time bounds.
- TodoApi has one typed prepared-command operation with add as its first member.
  CLI add and that handler share executeAdd; existing input and presentation remain
  in the CLI. The compiled companion exercises the typed operation, including
  project/tag definitions and file/link references. No argv or rendered strings
  cross the API, and no provisioning capability was added.
- Unknown command outcomes preserve `write_outcome_unknown` and shared exit 1
  through CommandError. A real committed response dropped by the owned proxy
  produces one Task, an unknown outcome and zero retry.

The two new domain modules are `backend-command.ts` and `database-route.ts`.
No function or file covered by verify-occ-atomicity changed. All ten coverage-file
SHA-256 values match their pins. Authentication.record is unchanged. No dependency,
lockfile, Package.resolved, native application, Keychain, signing or installation
change was made. Fresh Claude skill-discovery registration was not claimed.

## Receipts

Evidence is local and ignored under `docs/evidence/cli-routing/`.

| Check | Exit and evidence |
| --- | --- |
| Required source ancestry | 0, before implementation |
| Final verify-cli-routing skill | 0, `final-routing-status/commands.log`, result.json, actions.json and differential.json; compiled from f6761a46 |
| Byte differential | Six success/refusal cases across JSON, md and table; stdout, stderr, actual exits and every logical SQLite table identical on same-path clones. Twenty-four negative comparison controls. Literal title, Version, Project, Tag, Attachment existence and error-channel assertions pass. |
| Foreign database | Zero new local discovery/command requests, zero credentials, unchanged complete dump. Its Diagnostics route counters independently check the request delta. Copied directory/record, stale record, ignored environment URL and singleton refusal pass. |
| Connection replacement | Server killed after proof; an owned replacement listener on its old port receives zero HTTP requests and zero credentials. The command is not_sent. |
| Lost committed reply | One real Task committed, write_outcome_unknown with exit 1, no automatic retry. |
| Nudge | Twenty production direct-command nudges observed in final timing drive. Valid and invalid nudge calls add no History. Two streams receive the outside commit with timer fallback disabled. |
| Nudge negative control | Removing the real notify call fails the focused test, exit 1 in nudge-control-red.log; exact restoration passes, exit 0 in nudge-control-green.log. |
| verify-cli | 0, `committed-cli/commands.log`; 69 tests, all five existing golden hashes equal. Published schemas validate all existing responses. Only config.write_mode is an intentional additive success field; schema comments document the flags. |
| Server suite | 0, `committed-server-tests.log`; 33 tests |
| verify-server-api | 0, `committed-server-api/commands.log` and result.json |
| verify-sse | 0, `committed-sse/commands.log` and result.json. External-writer calls explicitly use --direct and retain their original delivery checks. |
| Typechecking | 0, final-typecheck.log, companion-printing-typecheck.log and transport-status-typecheck.log |
| Pin and document checks | All ten pins match in pin-check.json; doc-links.json has no broken links; whitespace checks pass. |
| Full root check under standing order 27 | **Exit 1 remains unresolved on final source.** root-check-final.log at f6761a46, and the earlier root-check-02.log, root-check-03.log and root-check-04.log, hit the unchanged 5,000 ms Electron guarded-run fake-delegate test. No timeout or assertion was changed. The isolated unchanged five-test suite passes in electron-helper-repeat.log. |

The first CLI skill run recorded two expired-auth HTTP failures, with
invalid_credential after scheduler cleanup instead of expired. The unchanged
12-case auth-history suite passes both against immutable baseline server sources
in baseline-auth-history.log and against this server in current-auth-repeat.log.
The later complete 69-test skill passes. These earlier failures remain retained.
The first root run also caught a test-finalizer typing error, which was corrected.
Root verification is not described as green or waived.

## Wall-time observations

The final f6761a46 artifact ran 20 alternating AB/BA pairs, 40 successful direct
adds, with the same live server and database in both conditions. Hiding its private
record makes the unproven condition. This includes subprocess startup, database
work, discovery and nudge, not merely HTTP execution. The Task count grows equally
across pairs. All outputs name the expected Task and durable count increases by 40.

| Final-source condition | Median | Empirical p99 |
| --- | ---: | ---: |
| No proven server | 136.2 ms | 189.2 ms |
| Proven server | 147.8 ms | 191.5 ms |

Raw values are in final-routing-status/benchmark.json. With 20 observations per
condition the empirical p99 is the maximum, not a precise population-tail estimate.
There are ten cores; the initial one-minute load was 7.7. No resource limiter was
profiled, so no causal speedup or regression claim is made.

An earlier 1,000-pair run is retained in attempt-02/benchmark.json: 2,000 successful
adds, no command failures, unproven median/p99 334.0/870.4 ms and proven
358.9/1,003.4 ms. Load started at 11.0 and ended at 15.9, with higher intermediate
readings. It predates the final wait-registration guard and is not labeled a
final-source benchmark. The helper finished its proof but its shell wrapper then
failed because the helper file was edited while running; final immutable-helper
runs pass. Neither timings nor that failed wrapper are discarded.

## Contract and integration

The contract id changes from
`78a2be44ef613c16a8807eda28367fe07401cf6872b4124c360c67344dc68289` to
`4012f963d6dd6bc55180ee1be6525090de872c13894c0f9ec2cee72c380c1cf3`.
`pnpm --filter @todo/api openapi` generates packages/api/openapi.json and both
contract identity constants. It was run and its check passes. The Swift constant
is generated output; no Swift command ran here. A Swift worker must run
apps/macos/scripts/generate-api.sh through the shared Swift slot, preserving pins
and --disable-automatic-resolution, then review generated types and run the
headless generated-contract compatibility tests. No native launch is implied.

The one outside-commit integration point is local-routes.ts's nudge handler calling
OutsideCommit.notify. The current server passes OutsideCommit.waiter to changesLayer;
each stream has a generation-aware wait and a 250 ms fallback. serverLayer's
outsideCommit option lets the integration supply that hook. Connect it to the
stream-wake branch's in-process signal at integration, without keeping two
independent wake systems. The cache hygiene observer remains unchanged. No code
was read or copied from either parallel performance branch.

Before routing add, land and review the integrated durable-denial fix. The first
enablement must advertise/require a capability or protocol bump tied to that fix;
a matching schema contract alone cannot prove an older same-schema server has the
behavior correction. The current production gate remains closed. No routing of
other families belongs to this slice. The root-check timeout and the required
independent correctness seat remain gates before installation.

## Verification incident

In attempt-03 the first default-port test adapter did not replace Bun's built-in
node:http import. That control may have sent a nonce-only proof request to port
4310, contrary to the brief. No bearer or Task command could be sent in that
discovery call. This was reported during the run. The corrected test rewrites the
transport import at compilation, checks exactly one replacement and requires a
runtime loaded marker before testing a 4310 record. The passing control diverts
that address to an owned listener and records the diversion. No further test
contacts or binds the managed port. No real Todo database file was opened by the
worker. The incident is retained rather than folded into a success claim.
