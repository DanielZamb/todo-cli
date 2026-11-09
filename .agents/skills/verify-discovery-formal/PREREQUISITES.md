# Verification prerequisites

Run from a Git checkout with the reviewed candidate object and installed pnpm
dependencies. The helpers resolve the repo root with `git rev-parse --show-toplevel`.
Java 11+, Bun, curl and the existing Swift toolchain are required. Do not upgrade
dependencies or install Bun. Source copies are independent files; only installed
node_modules may be shared. No native app, hosted XCTest, signing, Keychain or
real Todo data is used.

## Prepare current inputs

After committing and reviewing the source, run:

```sh
candidate=$(git rev-parse HEAD)
bun .agents/skills/verify-discovery-formal/prepare-inputs.ts "$candidate"
bun .agents/skills/verify-discovery-formal/check-inputs.ts "$candidate"
```

The preparation command runs current domain and scope-removal checks, builds or
locates CLI/server/seed binaries by the complete backend source hash, and runs
compiled discovery, authorization-boundary and enrichment-history drives. It
retains their actual exits and logs. The immutable candidate, source inventory,
relative binary paths and hashes are frozen in
`docs/evidence/discovery-formal/current-inputs.json`. A different manifest may
be selected with the repo-relative TODO_DISCOVERY_INPUTS variable. Paths must
stay inside this checkout, including after symlink resolution. The checker
rejects missing inputs, failed stages, source drift and altered artifacts.

No command reads HISTORICAL-INPUTS.json. Its former absolute paths are provenance
text only. Earlier C/D visuals, native interaction, session persistence and
clipboard are not re-proven by the current formal command. Current compiled
client workflows remain separate requirements in the integration report.

## Swift dependencies and cache reuse

The default installed seed is `apps/macos/API/.build`. Populate it first with:

```sh
scripts/swift-slot.sh make generate-api
```

API generation and every SwiftPM invocation disable automatic resolution.
TODO_DISCOVERY_SWIFT_SEED may name another repo-relative installed seed with
checkouts, repositories and workspace-state.json. If absent, the error names
the variable and the missing default. No dependency download or pin change is
hidden in this step. All three Package.resolved files must remain unchanged.

The formal command normally makes a fresh Swift build. Optional
TODO_DISCOVERY_SWIFT_REUSE names a repo-relative restored attempt under
`docs/evidence/discovery-formal/swift-*`; check-swift.ts accepts the same path
as its third argument after the candidate. Reuse validates all copied source
against a new immutable archive and uses a fresh database for every test.

Both workflows run controls rejecting absolute, outside-repo and escaping-symlink
inputs, then rerun valid inputs. Discovery additionally mutates a required
receipt path inside its manifest. Invalid paths must produce exit 1 with the
named path error, not a model or compiler failure.

## Resource limits

Every Swift command uses the checkout's scripts/swift-slot.sh and the formal
Swift wrapper. The default soft floor is 30 GiB and the hard disk guard remains.
An owned SOFT-DISK-HOLD latch prevents work until explicit release. Before and
after receipts retain each command, actual exit and all pin comparisons. Do not
apply an old worktree-specific floor exception to a new candidate.
