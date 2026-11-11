# Owner scope and local storage

The owner's local client metadata stays private and bounded.

## Sub-features

- CD01 denies non-owner collection and export.
- CD02 rotates the bounded local journal and counts drops.
- CD03 clears memory and owned journal files on sign-out or credential change.

## How to get to it (user POV)

Sign in to Todo with an owner Session. Collection runs during normal use,
including while Diagnostics is closed. Sign out to clear the local scope.

## Driving it with the verification helper

Preconditions: compiled scratch HTTP, synthetic content and an injected scratch
journal directory. Run the parent skill's verify.py command. Require literal
owner/Access Token results, denied exports, journal sizes/permissions and absence
of synthetic private content. Race clearing against pending writes and require
no file to reappear. Preserve the resulting small JSON receipts.

## Gotchas

Do not run cleanup against the real application data directory. Stored metadata
from an earlier owner run is not an authenticated export until the current owner
Session is validated. Never read request URLs or bodies into event fields.
