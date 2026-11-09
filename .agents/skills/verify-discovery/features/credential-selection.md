# Explicit credential file selection

## Sub-features

Global --credential-profile overrides the credential file chosen by --profile,
without changing the target Profile. Discovery carries the used file name into
its printed Show command when it differs from the result Profile. No fallback.

## How to get to it (user POV)

Run `todo lookup --prefix AB --profile source`, then execute the printed
`todo show <id> --profile dest --credential-profile source` command. A stored
credential for dest is not needed. Use --credential-profile explicitly for any
authenticated command, including mutations. Login stores and logout removes the
chosen file; target creation and selection still use --profile.

## Driving it with the compiled harness

The parent verify.sh calls scripts/credential-selection.ts through drive.ts.
It signs in separately under source and dest, logs dest out, then executes the
actual printed md/table Show command through the shell. Explicit owner reads,
writes and History must succeed. Scoped foreign reads and writes must exit 3
without content leakage. A missing selected file must exit 3/auth_required and
name only that credential Profile, even when a default credential exists.
The harness also tests selector precedence on directory and lookup, unchanged
same-Profile owner output, explicit login/logout storage, flag=value for both
leading -- names, empty-selector rejection, and auth-free schema/help.

## Gotchas

There is no implicit credential fallback. A stored Token's authorization stays
in Authentication. The selector is a CLI storage choice, not another Profile
scope rule; HTTP bearer and desktop owner Sessions keep their existing contract.
A's shared Task lookup hint wiring is completed by L1 at integration, using
credentialProfileName from apps/cli/src/credential-profile.ts.
