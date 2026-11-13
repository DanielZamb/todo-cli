# Compiled flag contract

This inventory is generated from the compiled CLI help tree and checked against
`schema --list`. No command or accepted flag list is transcribed from source.
The 53 entries include the root and command groups; 52 command response schemas
plus the help/error schemas are captured. Schema documents describe responses,
not CLI flag registrations. Their normalized hashes remain unchanged.

Every command inherits these shared and framework flags:

`--completions`, `--credential-profile`, `--db`, `--format`, `--help`, `--help-human-flag`, `--log-level`, `--no-color`, `--profile`, `--version`, `--wizard`, `-h`, `-v`.

Their consumers are database selection, output/error rendering, Profile and
credential selection, top color control, human onboarding, and Effect CLI
help/version/wizard/completion/logging handlers. Database and authentication
settings apply when a command uses them; pure help/schema commands stay auth-free.

| Compiled command | Additional accepted flags |
| --- | --- |
| `todo` | None |
| `diagnostics` | `--follow`, `--server` |
| `top` | `--server` |
| `schema` | `--list` |
| `snapshot` | None |
| `init` | `--password`, `--password-stdin`, `--username` |
| `login` | `--password-stdin`, `--username` |
| `logout` | None |
| `reset-passphrase` | `--password-stdin` |
| `whoami` | None |
| `import` | `--close-missing`, `--dry-run` |
| `profile` | None |
| `lookup` | `--prefix` |
| `add` | `--attach`, `--depends-on`, `--desc`, `--due`, `--energy`, `--estimate`, `--external-id`, `--label`, `--link`, `--parse`, `--priority`, `--project`, `--recurrence`, `--scheduled`, `--source`, `--tag` |
| `parse` | None |
| `list` | `--attachment`, `--blocked`, `--due`, `--energy`, `--estimate`, `--inbox`, `--order`, `--overdue`, `--prefix`, `--priority`, `--project`, `--ready`, `--scheduled`, `--status`, `--tag`, `--text`, `--today` |
| `show` | None |
| `batch-edit` | `--dry-run` |
| `attach-many` | `--dry-run` |
| `attach` | `--expected-version`, `--label` |
| `detach` | `--dry-run`, `--expected-version`, `--label` |
| `label-attachment` | `--expected-version`, `--label` |
| `move` | `--dry-run`, `--expected-version`, `--inbox`, `--overdue`, `--priority`, `--project`, `--status`, `--tag`, `--to`, `--today` |
| `copy` | `--dry-run`, `--expected-version`, `--inbox`, `--overdue`, `--priority`, `--project`, `--status`, `--tag`, `--to`, `--today` |
| `history` | None |
| `depend` | `--expected-version`, `--on` |
| `undepend` | `--expected-version`, `--from` |
| `graph` | None |
| `batch-depend` | `--dry-run`, `--file` |
| `revert` | `--expected-version` |
| `edit` | `--desc`, `--due`, `--energy`, `--estimate`, `--expected-version`, `--external-id`, `--priority`, `--project`, `--recurrence`, `--scheduled`, `--source`, `--tag`, `--title` |
| `done` | `--expected-version` |
| `cancel` | `--expected-version` |
| `reopen` | `--expected-version` |
| `rm` | `--dependency-fingerprint`, `--dry-run`, `--expected-version`, `--force`, `--with-dependencies` |
| `review` | None |
| `export` | `--output`, `--scope`, `--template` |
| `sync` | None |
| `man` | None |
| `config` | None |
| `snapshot create` | `--reason` |
| `snapshot list` | None |
| `snapshot show` | None |
| `snapshot restore` | `--dry-run` |
| `snapshot prune` | `--dry-run` |
| `profile list` | `--projects` |
| `profile delete` | `--dry-run`, `--with-tasks` |
| `review daily` | None |
| `review weekly` | None |
| `sync obsidian` | `--file`, `--vault` |
| `config show` | None |
| `config get` | None |
| `config set` | None |

The exact 803 command/flag pairs have source consumer references in
`flag-consumers.json`, produced by the verification recipe.
`apps/cli/scripts/flag-inventory.ts` checks every collected flag against that
reviewed mapping and refuses a flag without a consumer entry.
The regression compares full normalized help hashes, accepted flag sets and
response-schema hashes against `test/fixtures/cli-flag-contract.json`.
The fixture was derived from the unchanged reviewed CLI by removing exactly
the 64 unsupported mutation registrations. Remaining flag order and all other
help/schema content stay unchanged. The five original Go output goldens do not change.

## Reported exceptions

| Command | Flag | Actual behavior and disposition |
| --- | --- | --- |
| init, login | --username | Explicitly documented compatibility no-op under the single-owner model. Retained; changing that documented behavior needs a ruling. |
| detach | --label | Attachment factory accepts it; detach ignores the value and commits normal detach. Reported separately and left unchanged pending a ruling for that other factory. |

The 800 other pairs have consumers, including the four Delete/Purge flags only
on rm and Task editing fields only on add/edit. Some modifiers apply only to
their documented branch, such as a label on a supplied Attachment or Markdown
export templates. This is a compiled registration inventory plus source trace,
not a claim that every flag combination was executed.

## Executable checks

The normal verify-cli recipe runs `test/mutation-flags.test.ts`. It checks 64
unsupported mutation pairs against a fresh Version-1 seed for each command,
requiring exit 2 and exact table bytes and database checksum preservation.
Thirty-two cold-process cases cover each Delete-only flag on edit/done/cancel/
reopen in md and JSON, requiring the ordinary usage error and no database
creation. Standard md errors print help on stdout; JSON errors remain one
object on stdout. Parser suggestions remain part of the existing error message.

For red controls, select explicit compiled 1a0a4c13 or 6b167266 binaries using
TODO_CLI_BINARY. The same new tests must fail on actual Version-2 writes and
extra advertised flags. Never use the installed CLI or a real HOME.

The DAG public drive separately checks rm preview, with-dependencies, matching
and stale fingerprints, Purge and real PTY confirmation/cancellation. It now
requires done --force to fail as usage, then plain blocked done to fail as blocked.
