---
name: verify-install
description: Verify Todo build and installation through Makefile and scripts/install.sh, then drive both installed binaries in scratch HOMEs. Use after build, install, or golden-location changes.
---

# Verify build and installation

Created with `create-verification-skill`.
Read [the feature map](features/README.md) before choosing coverage.

## Launch

From the checkout root, run:

```sh
.agents/skills/verify-install/scripts/verify.sh "$PWD/docs/evidence/r01/install-new"
```

Choose a new absolute evidence directory. Dependencies must already be installed
with pnpm. The helper builds the real CLI and server, installs both into a scratch
HOME and custom destinations, then runs the existing CLI and HTTP verification
skills on those installed paths. `PASS; evidence survived cleanup` means ready.
No native app, Keychain operation, or LaunchAgent is invoked.

## Doctor

Run `bun --version`, `pnpm --version`, `command -v make`, `command -v python3`,
`command -v curl`, `command -v sqlite3`, and `command -v lsof`.
Bun 1.4.4 or newer, pnpm 10.30.1, and installed dependencies are required.
Inspect the selected `commands.log`, `cli/commands.log`, and `server/commands.log`
if a run fails. All database paths must belong to the helpers' temporary folders.

## Drive

The launch command exercises all mapped features through shell commands, the
compiled CLI, and real loopback HTTP. It checks help and invalid arguments,
`make build`, default installation, `make install INSTALL_DIR=...`, and a relative
`--install-dir` containing spaces from outside the checkout. It compares installed
executables to the built files and checks execute permission. A sentinel database
and its directory must remain byte-identical through installation and both proofs.

`TODO_CLI_BINARY` passes the default installed CLI to verify-cli.
`TODO_SERVER_BINARY` passes the custom installed server to verify-server-api.
Their databases and credentials are provisioned separately in scratch HOMEs.
The helper also compares all five golden files directly to their original Git
blobs at the base recorded in `apps/cli/test/fixtures/golden-baseline.json`.

## Evidence

The chosen directory retains `commands.log` with exit codes, `result.json` with
installed hashes and database-preservation assertions, and `golden-move.json`
with original golden hashes and byte counts. The `cli/` and `server/` subdirectories
retain the full existing verification receipts, HTTP statuses, durable state,
and byte comparisons. No expected golden is rewritten.

## Cleanup

The shell trap deletes only its `todo-r01-verify-*` folder. The existing helpers
stop their own child server and remove their own scratch folders. Evidence stays
outside scratch and is checked after cleanup. Built files under the checkout's
ignored `dist/` directories remain. Never use the owner's real database.

The checkout-local `.claude/skills/verify-install` is a relative symlink to this
directory. Check it with `realpath .claude/skills/verify-install`. Fresh Claude
skill discovery is a separate check from executable verification.

## Helpers

`scripts/verify.sh <absolute-new-evidence-directory>` resolves the checkout and
calls executable `scripts/drive.py <scratch> <evidence>` with Python 3.
Use `/maintain-verification-skill` when the installer or feature map changes.

## User-run desktop signing

`make sign-desktop` is for the user's Terminal only. Agents prove it exclusively
with `make -n sign-desktop`. Copy `signing.example.mk` to ignored
`signing.local.mk` and configure your certificate and team, or export
`TODO_SIGNING_IDENTITY` and `TODO_SIGNING_TEAM`. The target rejects missing
settings before build output or Keychain access. It audits package age and disk space before
building signed Release macOS and Electron apps into `dist/signed.noindex/macos/Todo.app`
and `dist/signed.noindex/electron/Todo.app`. It disables signing timestamps and prints
strict signature verification, the configured team and designated requirement for both apps.
`scripts/signing-receipt.py` retains these in `dist/signed.noindex/signing-receipt.json`
and fails for a wrong team, bundle ID or failed verification.
Desktop packaging generates `THIRD_PARTY_NOTICES.txt` before signing. The
Electron app retains it under `Contents/Resources/app/`; macOS retains it beside
the bundled server under `Contents/Resources/Server/`.

The install drive records the dry-run output without executing a desktop build.
Default Electron and all verification builds are unsigned. Native sessions reuse
user-built signed artifacts and remain subject to current consent and HOLD.
Signing and the real receipt remain unproven until the user runs the target.

The drive requires all signed build outputs to use `dist/signed.noindex`.
The suffix excludes build copies from Spotlight. The signing target unregisters
them from LaunchServices, and `scripts/sign-and-install.sh` registers the two
installed apps in `/Applications`.

After desktop installation, run the separate read-only launcher check:

```sh
python3 .agents/skills/verify-install/scripts/desktop-launcher.py "$PWD/docs/evidence/r01/desktop-launcher-new"
```

It verifies signatures and matching icon assets for installed and staged apps,
then requires LaunchServices and Spotlight to list exactly `/Applications/Todo.app`
and `/Applications/Todo Electron.app`. It never launches an app or accesses Keychain.
It retains `commands.log`, the raw registration lists and `result.json`.
