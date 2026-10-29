# Private database files

Opening or creating a database enforces mode `0600` on its database file and
any WAL/SHM siblings.

## Sub-features

- `private-create` creates files private to the owner.
- `private-open` repairs permissive existing files before use.
- `private-siblings` also protects WAL and SHM files while a connection is live.
- `private-symlink` repairs the target file and its siblings when opened through an alias.

## How to get to it (user POV)

All domain consumers open databases with `openStore({ path })`.

## Driving it with the compiled driver

Preconditions: run Doctor and Launch from [verify-auth](../SKILL.md).

- Doctor asserts `[0600, 0600, 0600]` on the created database and siblings.
- The driver changes its own scratch files to `0666`, opens another connection
  with `create: false`, and requires `[0600, 0600, 0600]` again.
- The driver makes the target files permissive again and opens `alias.db`, a
  file symlink to its scratch database, while the original connection stays open.
  All three target modes must be `0600`, and both connections must retain the
  full Task data and History. `06-symlink.json` and `06-symlink.sql` retain proof.
- `actions.json` records before and after modes. `result.json` retains decimal
  permission value `384`, which is octal `0600`.
- The scratch behavior suite additionally closes all connections and reopens
  a `0644` database, checking the newly created WAL/SHM siblings too.

## Gotchas

Permissions are filesystem observations. SQL dumps alone cannot prove them.
The open boundary resolves the real database path before choosing WAL/SHM
siblings or opening SQLite. Run only against scratch paths. `:memory:` has no filesystem permissions.
