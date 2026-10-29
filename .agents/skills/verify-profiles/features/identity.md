# Identity and isolation

## Sub-features

Hide tombstoned Profiles from discovery and scoped routes. Reserve their IDs
forever. Reuse a name with a new ID. Preserve every other Profile's bytes.

## How to get to it (user POV)

Delete a Profile, then run `todo init --profile <same-name>` and list Profiles.
The new Profile has an empty Task collection and a different ID.

## Driving it with the compiled driver

The parent Launch recipe compares foreign-before.json and foreign-after.json
byte for byte, checks HTTP 404 bodies, and verifies the new ID.
The domain behavior suite proves full and Snapshot replay retain tombstones.

## Gotchas

Names identify CLI choices. History and HTTP routes identify immutable IDs.
Never use the old name as the new HTTP ID after name reuse.
