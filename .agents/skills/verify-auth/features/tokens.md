# Access Tokens

The owner issues a named Access Token, lists its metadata and revokes it by name.
Tokens expire after 90 days unless the owner supplies a future expiry.

## Sub-features

- `token-issue` returns a `tok_` secret once and stores only its hash.
- `token-list` lists metadata without hashes or bearer secrets.
- `token-expiry` rejects default and explicit expiry at the exact boundary.
- `token-revoke` rejects a Token revoked by name.
- `token-management` requires a Session to manage Tokens.

## How to get to it (user POV)

Call `store.auth.issueToken`, `listTokens`, or `revokeToken` with an owner Session.

## Driving it with the compiled driver

Preconditions: run Doctor and Launch from [verify-auth](../SKILL.md).

- The driver issues `work reader`, `work writer`, `all profiles`, and `one day`.
  `01-issued.sql` contains hashes; `actions.json` contains only metadata.
- Listing with an Access Token fails with `owner_required`.
- Revoking `work writer` prevents its next mutation in `03-revoked.sql`.
- The `one day` Token expires on October 28. The default Tokens expire on
  January 25. `04-expiry.sql` shows all exact-boundary rejections.

## Gotchas

Revoked names remain reserved. Repeating revocation succeeds without another
committed change. Listing includes expired and revoked metadata. Neither lists
nor History reveal the original secret.

Profile deletion revokes unrevoked Tokens scoped to that Profile. Sessions and
unscoped Tokens survive. The verify-profiles compiled helper and profiles.test.ts
check this together with the deletion transaction and untouched foreign rows.
