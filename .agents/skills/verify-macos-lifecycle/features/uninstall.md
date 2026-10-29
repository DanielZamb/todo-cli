# Uninstall and cleanup

## Sub-features

Stop and remove the managed LaunchAgent, repeat uninstall safely, retain data.

## How to get to it (user POV)

In Settings choose Uninstall and confirm. The database, copied server and logs
remain for recovery; the job and its plist are removed.

## Driving it with Foundation and compiled server commands

Run verify.sh. Repeated Swift uninstall returns installed=false/loaded=false,
the plist disappears, database files remain and the port closes. The finalizer
repeats direct S03 uninstall and retains a cleanup receipt before removing scratch.

## Gotchas

Only the unique verify label is authorized for the proof. A failed teardown
retains its own scratch directory rather than deleting a loaded executable.
Never access the owner's database, agent, credentials or Keychain.
