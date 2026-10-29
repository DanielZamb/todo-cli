# Authorization

## Sub-features

Bearer authentication, Profile isolation, read-only subscriptions, cursor
validation and credential revocation while connected.

## How to get to it (user POV)

Send a Session or Access Token in `Authorization: Bearer ...`. Select a
Profile through `/profiles/:profile/events`.

## Driving it with curl

Run the helper in [verify-sse](../SKILL.md). Missing and invalid credentials
must return 401, a work Token subscribing to personal must return 403, and
malformed cursors must return 400. A personal Task must never appear in the
work stream. Revoking the connected Token must close its stream with a typed
failure and deny reconnect. A signed-out Session must also fail reconnect.

## Gotchas

Credential validity is checked before the response and on each 250ms poll.
Failures after headers use `effect/http-api/stream/failure`, then close the
connection. Clients retain the last operation ID across those failures.
