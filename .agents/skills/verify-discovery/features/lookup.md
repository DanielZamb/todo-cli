# Explicit prefix lookup

## Sub-features

Every visible match across authorized Profiles, exact four-key rows, Project
name or null, explicit next command, empty success and strict input validation.

## How to get to it (user POV)

Run `todo lookup --prefix AB --format json`, or request
`GET /tasks/lookup?prefix=AB`. Read `todo man lookup` and `todo schema lookup`.

## Driving it with the compiled harness

Run the parent skill's verify.sh. Compare CLI matches with HTTP, then exercise
both Token scopes and owner/unscoped credentials. Assert uppercase echo, literal
startsWith, Deleted Task exclusion and exact full-id show commands in md/table.
Foreign HTTP and SSE requests must disclose no foreign content. The properties
stage removes the real scope predicate in an isolated source copy and must fail its assertion,
then restore the copied bytes and pass clean reruns. The live tracked source
remains unchanged throughout.

## Gotchas

No trim, fuzzy matching, selected-Profile switch or mutation resolution. Prefix
comes directly from TaskFilters. Invalid values exit 2 or HTTP 400. Auth failure
returns no partial result. A Profile deleted after a WAL snapshot remains in that
snapshot; the next request observes deletion/revocation. Expiry observed inside
an aggregate read fails the whole read and logs rejection after rollback.
