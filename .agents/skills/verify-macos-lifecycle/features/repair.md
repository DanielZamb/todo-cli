# Preservation, repair and supervision

## Sub-features

Restart an installed server, bootstrap an unloaded installation, preserve its
executable path, database and port, recover from server death through launchd KeepAlive.

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
repair refreshes a differing server executable from the bundle and never substitutes a database. Port zero
installations retain their dynamic port; Settings points to the server log.

## Version guardrails

Status reads the installed and bundled server identities through --version. Settings offers Update server when either build or contract differs. Update and Repair / restart atomically copy the bundle over a differing executable before the saved configuration restarts the agent. The headless drive installs a separately compiled verify-stale build twice. It exercises Update and Repair, asserts different executable hashes and process IDs, unchanged executable/database/port configuration, matching installed and bundled identities, and matching live health contract. upgrades.json records both cases. Repair also replaces the pinned legacy helper while preserving its older JSON compatibility. Symbolic executable paths are refused before version execution.
