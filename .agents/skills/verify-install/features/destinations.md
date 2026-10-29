# Build and install destinations

## Sub-features

- Build both binaries with `make build`.
- Install to `~/.local/bin` by default.
- Select a destination with `--install-dir` or `make install INSTALL_DIR=...`.
- Reject missing, empty, or unknown options before building or installing.

## How to get to it (user POV)

Run `scripts/install.sh` from a checkout with pnpm dependencies installed.

## Driving it with the shell

Run the parent skill's helper. It invokes Makefile and the installer from outside
the checkout, including a relative directory containing spaces. Both installed
files must be executable and equal their compiled artifacts by SHA-256.

## Gotchas

The helper replaces only binaries in its own scratch destinations. It does not
download dependencies or run native builds. Install builds both binaries each time.
