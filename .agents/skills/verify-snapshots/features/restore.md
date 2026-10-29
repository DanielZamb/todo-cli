# Create and restore

## Sub-features

Create, list, show, restore preview, restore apply and prune preview.

## How to get to it (user POV)

Use todo snapshot create, list, show, restore or prune. Both clients expose Settings Snapshots.

## Driving it with the compiled CLI

Run the parent skill's verify.sh. The drive checks two Tasks become one, and that all five command schemas are readable.

## Gotchas

Restore replaces every Profile and Session in the database. Sign in before creating the target Snapshot. All verification uses scratch HOME.
