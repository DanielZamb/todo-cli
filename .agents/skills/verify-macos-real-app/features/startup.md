# Safe startup

## Sub-features

Private manifest, scratch HOME, loopback-only server, binary hashes, listener
ownership, server HOME/database and build/contract agreement.

## How to get to it (user POV)

Launch Todo Verification through the skill helper. Direct launches without its
private manifest fail before a window appears.

## Driving it with the V01 helper

Run verify.mjs with --guards-only. Read guards.json. Valid input exits 0; every
bad case exits 78 with its exact plain-language reason. A wrong port must not
cause a request to an unrelated listener.

## Gotchas

Use a fresh scratch root. Never point a negative control at the owner's actual
server. Exercise the same rejection with an unrelated scratch listener.
