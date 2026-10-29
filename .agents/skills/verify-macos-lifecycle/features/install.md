# Status and explicit install

## Sub-features

Read-only status, explicit database and loopback port, stable executable copy,
repeated status, refusal to replace an existing installation, input errors,
raw TCP occupancy refusal before copying the helper.

## How to get to it (user POV)

Open Settings, Managed local server. Refresh status. Enter an absolute database
path and port, then choose Install server. Opening Settings only reads status.

## Driving it with Foundation and compiled server commands

Run the skill's verify.sh. The Foundation driver calls the same status/install
methods as Settings. Require initial absence without a database, installed and
loaded=true afterward, exact configuration and healthy loopback. Repeated
status and refused duplicate install leave the plist bytes unchanged. The raw
TCP fixture requires rejection before changing an existing executable sentinel,
creating a database or installing an agent. The listener remains reachable.

## Gotchas

Settings itself remains unproven under the native HOLD. An existing app server
address is preserved, including remote addresses. A managed server at another
address is shown separately; use explicit --server on relaunch to connect.
