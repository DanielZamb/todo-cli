# Credential cleanup

## Sub-features

Expired Session and Access Token deletion, preserved History and fixed expiry.

## How to get to it (user POV)

Issue a Token with an expiry through POST /auth/tokens. Expired credentials
stop authenticating and the server removes their stored hashes.

## Driving it with compiled server and HTTP

The helper issues a two-second Token, observes its row before expiry and its
absence afterward, requires one cleanup History entry, and proves the Session
can still list Tokens. Domain tests cover the exact expiry and Session boundaries.

## Gotchas

Revocation and expiry checks remain in auth for every request. The cleanup
schedule does not extend credential lifetimes or erase append-only History.
