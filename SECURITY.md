# Report a vulnerability

Report vulnerabilities privately through the repository's Security tab when
private reporting is available. Otherwise contact the maintainer privately
through [the project owner's GitHub profile](https://github.com/DanielZamb)
before sharing exploit details. Do not put credentials, private Task data,
database copies, or signing keys in a public issue.

Include the affected commit, platform, reproduction steps using synthetic data,
and the expected security boundary. Security fixes target the current `main`
branch.

## Local security boundaries

The CLI opens SQLite directly. Desktop clients use the authenticated local HTTP
server. The server binds to loopback by default; loopback access still requires
a Session or Access Token for protected routes. Keep the database and credentials
private to the owner. Exposing the server through a proxy requires a separate
deployment review.

Electron keeps the Session in its main process and encrypts persisted credentials
with safeStorage. The SwiftUI client uses Keychain. Do not disable these controls
to work around a verification or signing prompt.

## Dependency and release checks

Run `pnpm audit` and `pnpm licenses list --json` when changing dependencies.
Preserve the lockfile and the minimum package-age policy in
`pnpm-workspace.yaml`. Review build tools as well as runtime dependencies.

Keep signing settings in ignored `signing.local.mk` or environment variables.
Never commit a signing key or certificate export. A valid local Apple Development
signature is separate from notarization and public release approval.
