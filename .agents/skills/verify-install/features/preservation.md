# Database preservation

## Sub-features

- Leave an existing database byte-identical.
- Create no database siblings, Sessions, or configuration during installation.

## How to get to it (user POV)

Install over an existing HOME with `.todo-cli/todo.db` already present.

## Driving it with the shell

The parent helper writes a literal sentinel file at the scratch HOME's default
database path before installation. It asserts the original bytes and directory
contents after all installs and again after installed-binary proofs.

## Gotchas

The sentinel is deliberately not SQLite. Any attempt to open or migrate it fails
the proof. CLI behavior and HTTP drives each provision their own separate database.
