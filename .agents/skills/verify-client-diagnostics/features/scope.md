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
After clear and reauthorization, finish an old refresh, request and action and
deliver an old-scope background callback. Each must leave the new journal at
zero records and increment its dropped counter once. A stale finish cannot
create a record just because its opaque id is well formed.

Replay unchanged resources and explicit periodic requests with a controlled
clock. Require one resource record per minute unless a material value changes,
and one poll aggregate per minute per route. Failed and slow polls retain all
individual phases; an interaction's requests are never treated as routine.
Check exact aggregate counts/quantiles and zero unplanned drops. Fill a small
configured file with routine records and require unchanged literal interaction,
refresh, stream, availability and stall counts. Routine records must not rotate
the file. Record intentional thinning separately from loss.

The production bound is two files of 64 MiB. The small rotation control injects
a smaller bound so it exercises real rotation without writing the production
limit. The replay rate proof includes 93 health and 52 Diagnostics polls per
minute and twelve subsequent idle hours. Report it as synthetic encoding and
retention evidence, not an observed owner day.

## Gotchas

Direct recorder calls do not prove request classification. The generated-client
drive must traverse the production correlation middleware, transport and
URLSession metrics callback. Require two background health and Diagnostics
polls to aggregate, while an interaction's request keeps its phases. The
opaque Action header must not create a semantic interaction context.

Fill both small journal files, then send 100 healthy background requests
without a periodic flag through that client. Require the literal count of
each seeded interaction, refresh, stream, availability and stall class to
remain two. A failed request must keep all three phases above the routine
write threshold. Periodic classification is not a retention safety boundary.

Measure the open-Diagnostics byte rate through real generated requests and
model refreshes. State the synthetic clock and interaction workload, the
actual request counts and writer bytes. A direct-recorder replay alone cannot
qualify the production retention estimate.

Do not run cleanup against the real application data directory. Stored metadata
from an earlier owner run is not an authenticated export until the current owner
Session is validated. Never read request URLs or bodies into event fields.
