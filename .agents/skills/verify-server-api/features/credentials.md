# Credentials

## Sub-features

Session sign-in/out; Token issue, list and revocation; Profile and write scopes.

## How to get to it (user POV)

An owner signs in at `POST /auth/sessions` with a passphrase. Authenticated requests send `Authorization: Bearer ses_...` or `tok_...`. Sessions manage Tokens at `/auth/tokens`.

## Driving it with curl

The helper signs in, issues a work reader and writer, denies reader writes and personal reads, revokes the writer, and signs out. Subsequent requests must return 401. Access Tokens cannot manage credentials.

## Gotchas

The scratch owner is provisioned by the compiled domain driver before HTTP launch. Secrets are returned only at issue and redacted from evidence. Credential expiry is fixed by the domain.

F10's owner-only `DELETE /profiles/:profile` accepts with_tasks and dry_run.
It preserves owner-wide Sessions and unscoped Access Tokens and revokes scoped
Tokens. Profile discovery hides tombstones, all scoped routes return the shared
404 shape, and an existing owner SSE subscriber receives ProfileDeleted before
closure. The compiled verify-profiles helper proves this on scratch SQLite.
