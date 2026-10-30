# Contribute to Todo

Use Bun 1.4.4 or newer, Node.js 22.12 or newer, and pnpm 10.30.1. Install the
locked dependencies with `pnpm install --frozen-lockfile`, then run `pnpm check`.
macOS client development also requires macOS 26 and Xcode 26. Swift dependencies
are pinned in `apps/macos/API/Package.resolved`.

Read [CONTEXT.md](CONTEXT.md) for domain terms,
[docs/architecture.md](docs/architecture.md) for how the packages fit, and
[docs/adr](docs/adr/README.md) for binding decisions. Share Task behavior
through `packages/domain` and expose human-client operations through the
authenticated HTTP contract. Regenerate the Swift API after contract changes
with `apps/macos/scripts/generate-api.sh`.

## Verify a change

Use the matching recipe in [.agents/skills](.agents/skills/). Each `verify-*`
directory contains a feature map and an executable scratch-data recipe. For
example, run the combined filter proof from the checkout root:

```sh
.agents/skills/verify-filters/scripts/verify.sh "$PWD/docs/evidence/filters/new-run"
```

Choose a fresh evidence directory. Verification must use scratch databases,
credentials, Attachment files, and HTTP servers. Keep generated evidence local.
Use synthetic records in committed fixtures. Never commit an owner's database,
Session, Access Token, signing key, or local configuration.

Native app and Keychain tests require explicit current consent as described in
the Electron and macOS verification skills. Static, compiled scratch-host, and
offscreen recipes have separate instructions.

## Build desktop apps

The default Electron build is unsigned:

```sh
pnpm --filter @todo/electron build
```

For a compile-only macOS build, run the disk guard and disable signing:

```sh
scripts/disk-guard.sh
scripts/swift-slot.sh xcodebuild -project apps/macos/Todo.xcodeproj -scheme Todo -configuration Debug -destination platform=macOS -derivedDataPath "$PWD/apps/macos/DerivedData/Contributor" CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO EXPANDED_CODE_SIGN_IDENTITY= build
```

For signed builds, copy `signing.example.mk` to `signing.local.mk`, replace the
example values with your certificate identity and team, then run
`make sign-desktop`. The file stays local. Signed bundles and their signature
receipt appear under `dist/signed.noindex/`.
Xcode uses automatic Apple Development signing for the configured team.
Electron uses the configured certificate identity.

The Electron components and vendored stylesheet derive from shadcn and retain
its MIT notice. The stylesheet records its source version. Update the checked-in
components deliberately and verify the compiled client after a style change.

## Prepare a change for review

Run the relevant verification recipes and `git diff --check`. Describe the
observable behavior, verification performed, and any remaining limitations.
Include reusable fixtures and verification improvements with the change.
The root MIT license applies to contributions unless a file states otherwise.
