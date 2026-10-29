# Headless proof isolation

## Sub-features

Reject outside database/executable paths and symlinks, stop command descendants
on timeout or cancellation, preserve unrelated processes, retain uncertain state.

## How to get to it (user POV)

Run the headless verification recipe. These are proof controls and do not
restrict the owner's explicit production database choice in Settings.

## Driving it with Foundation and Python

Run verify.sh. Three disposable-Python tests run before the lifecycle drive;
all must pass. The drive then requires invalid outside, dangling, ancestor-link
and HOME paths to fail without opening outside data. Altering the scratch plist
to name an outside database or symlinked executable must fail repair while
preserving the running PID and never invoking that executable.

## Gotchas

The test outside directory is a run-owned sibling, never an owner path.
POSIX realpath resolves existing prefixes for databases that do not exist yet;
Foundation's private/var alias normalization is unsuitable for this comparison.
A command-unsafe marker prevents a successful uninstall receipt or scratch
removal when descendants are not proven stopped. Native HOLD still applies.
