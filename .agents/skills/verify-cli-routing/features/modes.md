# Write modes and nudges

## Sub-features

automatic/direct/server local configuration, command flag precedence, usage errors,
direct provisioning/read exceptions and bounded post-command nudges.

## How to get to it (user POV)

Use todo config set write-mode direct, automatic or server. Override with --direct
or --require-server. In slice 1 server mode refuses writing commands because
none is production-routable. Reads, init and reset-passphrase remain direct.

## Driving it with the compiled driver

Run Launch. Check persisted settings and both flag overrides, rejected unknown
values before authentication, unchanged database after refused commands, and
successful direct writes with a proven, stale or unresponsive endpoint.

## Gotchas

A nudge carries no Task data or credential. It is best effort and cannot turn a
writing command into failure. Its wait is bounded separately from direct work.

Every writing command that reaches the store nudges once, including refusal, dry
run, init Profile creation and partial batch failure. Reads and early refusals
never nudge. The only extra cost for a no-op writing command is an empty pass.
