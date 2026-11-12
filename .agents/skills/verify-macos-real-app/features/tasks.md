# Task readback

Status: requalification pending. Visible runs and V02 are held; follow the current SKILL.md. Historical driving instructions below do not release either hold.

## Sub-features

Restore the memory Session, load the synthetic Profile and display the two
compiled-CLI-created Tasks in the production RootView.

## How to get to it (user POV)

The helper opens Todo Verification in All tasks after the owner has been idle
for a minute. The title names the test app.

## Driving it with the V01 helper

Run the full helper. accessibility.json must contain V01 seeded Task alpha and
V01 seeded Task beta. A blank window, model-only receipt or offscreen capture
does not pass this feature.

## Gotchas

Owner input stops the run. Read-only AX permission must already be available.
V01 does not click controls or claim input-to-render latency.
