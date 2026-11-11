---
name: verify-client-diagnostics
description: Verify the Mac client UI action timings, request phases, owner-only metadata journal, rotation and export in an isolated headless process. Use after client instrumentation, diagnostic storage, action coverage or panel changes.
---

# Verify local client Diagnostics

Created with create-verification-skill. Read [the feature map](features/README.md).
It does not replace the coordinator's real-app acceptance pass.

## Launch

From the checkout root run the helper with a new evidence directory:

```sh
.agents/skills/verify-client-diagnostics/scripts/verify.py docs/evidence/client-diagnostics/new
```

The helper compiles the production Swift module and unhosted state tests through
scripts/swift-slot.sh. It uses a compiled scratch server and CLI with a private
HOME, loopback port and synthetic Tasks. Readiness requires the owned listener,
the expected service/contract and a successful owner Session. It never launches
Todo.app, signs, calls Keychain or reads the owner's database or diagnostic files.
The full native verification HOLD remains in force.

## Doctor

Read commands.json and result.json. Require real child exits, the source and
binary hashes, expected service/contract, owner/Access Token scope checks and
work counts. A missing phase is unknown, not zero. An inactive window or absent
input receipt cannot qualify a click test. Run node scripts/check-doc-links.mjs
HEAD after committing skill or report changes.

## Drive

The helper drives production recorder boundaries, generated HTTP transport,
model authentication/refresh and metadata export against synthetic data. It
proves denied collection/export for a non-owner, local owner collection,
per-request opaque correlation using the three approved UUID headers, action phase ordering,
incomplete ages, runtime descriptor limits, bounded rotation and clear races.
Offscreen UI checks cover the This client section and export control. They do
not press a system save dialog or prove pointer delivery.

Read the action inventory in docs/decisions/mac-responsiveness-report.md. Only
categories with observed start, publication and matching layout boundaries count
as instrumented. Report pending coverage explicitly. Every category reports
p50, p90, p99, maximum, count and incomplete count. Never silently omit failed,
superseded or pending actions. Request phases and handler wall time overlap;
do not subtract them to invent exclusive CPU time.

## Evidence

Keep result.json, commands.json, the small action/phase/privacy/rotation receipts
and source/binary hashes. Synthetic transport bodies remain in scratch. Export
metadata must contain no Task/Profile ids or names, titles, descriptions,
search text, attachment locations, credentials, raw URLs or request headers.
Journal I/O runs off the main actor. Record dropped events and journal failures.
Preserve failure evidence after cleanup. Bulk captures and compiler logs may be
retained in the run store rather than the compact evidence directory.

## Cleanup

The helper stops only its owned processes and removes its scratch HOME and
journal directory. It never clears the real application journal. Evidence stays
outside scratch. Production clear is proven through the authentication boundary;
Keychain-backed sign-out and actual UI input/rendering remain coordinator gates.

## Helpers

`scripts/verify.py <new-evidence-directory>` runs the complete recipe. The
checkout-local Claude skill link points here; fresh Claude discovery is not
claimed without a separate authorized worker. Use maintain-verification-skill
when coverage, journal formats or UI entry points change.

`--connections-only` and `--sockets-only` select the direct-HTTP model probes
documented in verify-mac-refresh/features/connections.md. They preserve the same
scratch ownership and cleanup rules. A failing red probe still retains literal
receipts and a failure result; never report it as a successful complete recipe.

`--retirement-only`, `--retirement-stress` and `--restart-only` select the
credential-lifetime and restarted-server controls in that feature map. The
first shared-session implementation is blocked by a request-creation crash;
the resource result cannot qualify it. Require the corrected lifetime and
publication controls, full gates and independent review before installation.
