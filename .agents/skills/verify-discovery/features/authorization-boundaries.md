# Profile selection and command boundaries

## Sub-features

Authorized name/id selection, operation-attributed rejected History, early empty
selector refusal, and executable Show commands for dash-leading ids and values.

## How to get to it (user POV)

Use --profile for the target and --credential-profile for the stored key. Scope
still comes from Authentication. Use lookup --prefix=-a for a stored id such as
-ab, then execute the printed Markdown/table command exactly as shown.

## Driving it with the compiled harness

The parent verify.sh runs scripts/run-review-boundaries.ts. It compiles a driver
by source/script hash and compares 60 fresh cloned seed cases through the real
compiled CLI and production HttpApi. Read boundaries/result.json and comparisons.
F1 compares show/list/whoami/lookup for scoped and owner keys across the spaced,
capitalized Foreign Secret name, absent No Such and a deleted Profile. Caller
bodies match after only generated_at normalization. Owner-authorized foreign
reads succeed. Owner-only History may retain the resolved target.
F2 supplies both empty --profile and empty --credential-profile to login with
correct and wrong passwords, plus logout/init/schema/help. Exit 2/invalid_args
must precede any Profile, Session or auth-History change.
F3 asserts literal commands for -ab, ab, a colon/apostrophe Profile and prefix -a.
It executes the printed string unchanged with PATH resolving todo to an owned
scratch symlink; default Markdown must contain the known title and full id.
A separate JSON control places its format flag before the delimiter.
Eight revoked/expired owner/scoped show/edit cases use independently cloned seed
databases for CLI and HTTP. The HTTP Clock takes the CLI attempt's timestamp;
all persisted rejection fields, including one row, Profile and read/mutate action,
must equal. The complete Clock parks the scheduler after its initial valid-time
cycle, preserving expired credentials for comparison. It mocks no routes/auth.

## Gotchas

No public profiles()/read() call is nested for target resolution. The single
Authentication.resolveProfile method returns only id/name and reuses its internal
authorized-set predicate. Direct HTTP/id History remains ID-only. Name-based
resolver attribution uses a private context, with active names preferred over a
colliding deleted id. Every comparison has its own seeded snapshot, so it makes
no assumption that duplicate rejections may bypass per-minute merging.
