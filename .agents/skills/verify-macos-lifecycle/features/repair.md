# Preservation, repair and supervision

## Sub-features

Restart an installed server, bootstrap an unloaded installation, reuse its
executable/database/port, recover from server death through launchd KeepAlive.

## How to get to it (user POV)

In Settings choose Refresh status, then Repair / restart. This is an explicit
product action. launchd supervises independently after the app closes.

## Driving it with Foundation and compiled server commands

Run verify.sh. Compare launchd PIDs across service-targeted SIGKILL and repair, require healthy
loopback responses and identical managed configuration. Bootstrap after a real
bootout. Separately install the pre-W02 S03 executable at another database/port, then
repair through Swift and compare literal configuration plus executable hash.
A separate raw TCP fixture on an unloaded installation must reject Repair while
preserving plist, database and executable hashes. The agent stays unloaded and
the unrelated listener remains reachable.

## Gotchas

Loaded means registered with launchd, not proof of HTTP health. The proof checks
health separately. Missing executables and malformed/foreign plists are errors;
repair never silently substitutes a bundled binary or database. Port zero
installations retain their dynamic port; Settings points to the server log.
