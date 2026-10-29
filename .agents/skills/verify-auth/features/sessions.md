# Owner and Sessions

The owner sets one passphrase and signs in to receive a Session with a fixed
7-day expiry. Signing out revokes that Session.

## Sub-features

- `owner-setup` stores an Argon2id passphrase hash and refuses replacement.
- `session-sign-in` returns a `ses_` credential for the correct passphrase.
- `session-fixed-expiry` rejects access at the exact 7-day boundary.
- `session-sign-out` revokes the current Session.

## How to get to it (user POV)

A domain consumer calls `store.auth.setupOwner`, `signIn`, and `signOut`.
The CLI and HTTP sign-in adapters are outside C04.

## Driving it with the compiled driver

Preconditions: run Doctor from [verify-auth](../SKILL.md), then its Launch command.

- The driver sets the scratch passphrase and attempts a wrong sign-in before
  any Profile exists. `actions.json` records `auth` and `invalid_passphrase`.
- Correct sign-in returns `ses_` and expiry `2026-11-03T14:00:00.000Z`.
- Access just before expiry keeps that same expiry; access at expiry fails.
- Access after sign-out returns `auth` and `revoked` in `03-revoked.sql`.
- Run the scratch behavior suite from Drive to prove duplicate setup rejection.

## Gotchas

Effect's Clock controls time in verification. Stored expiry never changes.
All credentials belong to the scratch run. No real passphrase is needed.
