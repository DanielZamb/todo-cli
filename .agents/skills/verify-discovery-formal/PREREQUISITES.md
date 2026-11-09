# Verification prerequisites

This skill verifies the current Todo workspace and its reviewed local evidence.
It is not a standalone source-only proof bundle. Run from the bound worktree
root. `coverage.json` names the immutable candidate; the corresponding Git
objects must exist locally. The default command makes fresh independent source
copies and fresh scratch databases. It does not require a previous E test run.

## Required inputs

- Java 11+, existing Bun/pnpm/TypeScript dependencies, curl for an absent pinned
  TLC jar, and the selected Swift toolchain/SDK that can build this repository's
  macOS target. Never install Bun or upgrade dependencies for this check. If
  pnpm dependencies are absent, use the authorized disk guard followed only by
  frozen-lockfile/offline installation.
- Installed node_modules at this worktree root and at packages/domain,
  packages/api and apps/electron. The copy helpers may link only those installed
  dependencies. Captured application/domain source must be independent regular
  files, never live-source symlinks or hardlinks.
- EVERY absolute text/JSON path in `carried-inputs.json:receipts`, including the
  run-store C/D text archives and root full-check/sec-base metadata. These are
  ignored local evidence prerequisites. The checker hashes the files; it does
  not fetch or reconstruct them. Historical path strings inside their JSON do
  not require the old binaries or screenshots to exist.
- The THREE current binaries in `carried-inputs.json:backend.binaries`: root
  `.scratch/bin/b9ec2d8ebf6e-36f9c56e2000/{todo,todo-server,seed}`, with the exact
  recorded hashes and builtHead 36f9. They are external ignored cache inputs,
  not binaries built by this skill. The previousCheckpoint object is historical
  metadata; its retired 7f846/fad binary paths are not read.
- For a default fresh Swift build, the installed dependency seed at the exact
  root integration location
  `/Users/zambamon/.t3/worktrees/todo-cli/feat-agent-discovery/apps/macos/API/.build/`.
  Its checkouts, repositories and workspace-state.json are copied into E-owned
  scratch build storage. This is distinct from the retired root apps/macos/.build
  and DerivedData. The default helper currently needs this seed even when Bun
  dependencies are installed. It does not resolve/install/upgrade Swift pins.

Inventory the carried metadata and fixed binaries before the expensive stages:

```sh
bun .agents/skills/verify-discovery-formal/check-inputs.ts
```

A missing path/hash or immutable source mismatch is a failed prerequisite, not
sensitivity and not a model counterexample. Retain its result/command receipts
and report the exact missing prerequisite. Restore reviewed text/artifacts or
review a replacement provenance mapping; do not read a newer mutable build
manifest, silently advance hashes or rebuild an unchanged producer to hide it.

The one-command default is:

```sh
bun .agents/skills/verify-discovery-formal/check.ts
```

TaskSearch has its separate command and candidate in its own skill. The final
handoff binds both commands to the same immutable source candidate.

## Optional E-owned Swift cache reuse

Reuse is an optimization, not a hidden default prerequisite. A caller without
a previous E build uses the default fresh-build path above. For this final run,
the retained current f85 attempt is `docs/evidence/discovery-formal/swift-Zvw6WF`
under E's bound worktree. That ignored directory must actually contain its
restored source and swift-build if it is selected. Old c488 caches were retired.

For the combined command, set TODO_DISCOVERY_SWIFT_REUSE to the absolute attempt
directory. For a Swift-only command, pass that directory as check-swift.ts's
third argument after the full candidate SHA. Reuse accepts only this E
worktree's source/build directories, checks every reused source against a new
immutable archive, and still makes a fresh database per test. It needs no
removed C/D worktree, old root producer cache or retired root Swift cache.
Do not run concurrent actors against the same reused source/build directory.

## Resource gate and scope

Every Swift command uses the shared slot and disabled automatic resolution and
retains actual argv/stdout/exit plus before/after pin comparisons. The normal
soft floor is 30 GiB; the hard disk guard is unchanged. The explicit E-final-only
exception in SKILL.md permits 25 GiB only for the remaining authorized f85/frozen
proof steps. The exact candidate flag is opt-in and worktree-bound. It is not
a default for another caller, thread or future run. SOFT-DISK-HOLD stops the
wrapper regardless of current space until the authorized resume/preflight.
Native Todo, hosted XCTest, signing, Keychain, installed binaries and real Todo
data remain outside this workflow.

The relative Claude skill links and frontmatter establish only filesystem
registration prerequisites. Fresh-session skill discovery/caller usability is
a separate read-only parent review and is not inferred from those links.
