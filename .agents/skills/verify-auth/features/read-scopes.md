# Transaction read scopes

Run the parent compiled recipe. Its `transaction read lease` action proves a
literal Task inside a checked callback, generic storage refusal after commit,
a successful fresh recheck, refusal after revocation and a literal empty absent
Profile result. All databases belong to the recipe's scratch directory.

Run `pnpm --filter @todo/domain test read-lifetime.test.ts authority-runtime.test.ts`
for the full port matrix. It covers failed nested scopes, rollback, interruption,
failure, restore, Purge, expiry, revocation, Profile deletion, unrelated requests,
runtime counterfeits, image access, the one-shot terminal query, one credential
lookup, Discovery nesting, absence statements and cancellation during search.

An authority validates its private origin, kind, live transaction lease, failed
scope ancestry, expiry and credential-check write serial before SQL or image
access. A later scope must check credentials again and retain the restore
generation. A terminal query consumes its bounded authority once. Never-created
Profile results contain no authority and execute no projection query.
