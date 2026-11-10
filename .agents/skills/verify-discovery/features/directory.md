# Profiles and Projects directory

## Sub-features

Authorized Profile ids/names/counts, sorted Project ids/names, empty Profiles,
Projects with no visible Tasks, optional output preserving ordinary discovery.

## How to get to it (user POV)

Run `todo profile list --projects --format json`, or request
`GET /profiles?include_projects=true` with a bearer credential.
Global `--profile` selects the stored credential; its scope defines membership.

## Driving it with the compiled harness

Run the parent skill's verify.sh. CLI and HTTP arrays must agree. Scoped Tokens
return work only, owner/unscoped Tokens return empty, foreign-secret and work.
Read-only and read-write Tokens have identical discovery power. Ordinary output
and include_projects=false omit projects. Invalid credentials return no rows.

## Gotchas

All authorized Profiles share one synchronous read transaction. WAL writers may
commit during it, but no response mixes database snapshots. Deleted Profiles
are absent. Successful discovery leaves persistent rows and History unchanged.
