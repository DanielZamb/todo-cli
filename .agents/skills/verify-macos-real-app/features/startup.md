# Safe startup

Status: requalification pending. Visible runs and V02 are held; follow the current SKILL.md. Historical driving instructions below do not release either hold.

## Sub-features

Private manifest, scratch HOME, loopback-only server, binary hashes, listener
ownership, server HOME/database and build/contract agreement.

## How to get to it (user POV)

Launch Todo Verification through the skill helper. Direct launches without its
private manifest fail before a window appears.

## Driving it with the V01 helper

Run verify.mjs with --guards-only. Read guard-matrix.json and class-reds.json. Valid input exits 0; every
bad case exits 78 with its exact plain-language reason. A wrong port must not
cause a request to an unrelated listener.
That scope always records completeRecipe=false. Cached descriptor constraints,
hard links, component symlinks and swaps have separate controls.

## Gotchas

Use a fresh scratch root. Never point a negative control at the owner's actual
server. Exercise the same rejection with an unrelated scratch listener.
