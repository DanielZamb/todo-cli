# Export and Obsidian files

## Sub-features

The export contains the exact task line. Obsidian retains prefix and suffix and has one current managed block. Traversal and symlinks outside the canonical vault fail with exit 2 and create no outside file. Empty vault arguments exit 2 without creating a projection.

## How to get to it (user POV)

Run todo export --scope id:<task-id> --output <scratch-file>, then todo sync obsidian --vault <scratch-vault> --file Tasks.md.

## Driving it with the compiled CLI harness

Run the parent skill helper. The files integration case exports a CLI-created task, replaces a preexisting managed block twice, and tries a path outside the vault.

The canonical-vault regression tries an output symlink, a parent directory
symlink with missing descendants, and a dangling output symlink. It asserts
that the outside sentinel stays `outside original\n` and no outside file or
directory appears. It also proves that symlinks within the vault and a symlinked
vault root still work. The empty-vault case checks empty and whitespace arguments
and requires the working directory's contents to stay unchanged.

## Gotchas

Use scratch vaults. Sync writes a local one-way projection. It never imports. --output names a real file.
