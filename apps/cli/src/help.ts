import { Command } from "effect/cli";

const exitCodes =
  "0 success\n1 runtime failure\n2 validation/usage error\n3 not found/auth missing\n4 OCC conflict";
const agentContract = `With --format json, each command writes exactly one JSON object to stdout with generated_at. Diagnostics go to stderr. Errors use {"generated_at","code","message","details"?} on stdout. Usage and parse errors exit 2 without help text. Conflict and missing-Version errors include details.current_version and name the --expected-version value to pass. details.latest contains the current Task.

The --format flag can be supplied only once. Duplicate format flags exit 2 in the shared error shape.

Run todo schema --list to discover command names. Run todo schema <command> for the Draft 2020-12 JSON Schema of its success response, or todo schema error for errors. Quote names with spaces, for example todo schema 'review daily'. Responses use the same Effect Schemas as their encoders. Every --help --format json response uses {generated_at, text}, published by todo schema help. This help envelope is separate from each command's data response schema. Existing fields retain their names and meaning. History is the sanctioned exception: its former array is now {generated_at, entries}, with entries unchanged.

Bulk and destructive commands use --dry-run to return their normal report shape without writing. Live commands use --follow to emit NDJSON, one object per line. These flags apply only to commands that advertise them. Normal JSON responses remain one object. A terminal error during --follow goes to stderr in the shared error shape and exits with its code, so stdout contains only command records.

String flag values beginning with a single dash work in split or equals form, including --desc "- item" and --desc="- item". Values that look like long flags must use equals form, for example --desc=--help. Login reads stdin without prompting in JSON mode. --wizard is rejected in JSON mode.`;
const globals = [
  "--format md|json|table (default md)",
  "--db <path> (default TODO_DB, config db.path, then ~/.todo-cli/todo.db)",
  "--profile <name> (default default)",
  "--no-color (default false)",
  "--help-human-flag (default false)",
];
const taskFlags = [
  "--desc <markdown> (default unset)",
  "--external-id <id> (unique within the selected Profile, empty clears on edit)",
  "--project <name> (default unset)",
  "--tag <name> (repeatable, default none)",
  "--priority P1|P2|P3|P4 (default P3 on add)",
  "--scheduled <date-or-instant> (default unset)",
  "--due <date-or-instant> (default unset)",
  "--recurrence <Recurrence-JSON> (default unset)",
  "--energy <1..5> (default unset)",
  "--estimate <minutes> (default unset)",
  "--source manual|agent|import (default manual on add)",
];
const versionFlag = "--expected-version <N> (required, N > 0)";
const concurrency =
  "Writes use optimistic concurrency. --expected-version supplies expected_row_version. A stale Version returns the latest Task and exit code 4. Read the latest row_version before retrying.";
const taskOutput =
  "md renders Task metadata. json includes entity_version and row_version. table exposes Version in the V column. --format defaults to md.";
const reference = (input: {
  readonly purpose: string;
  readonly synopsis: string;
  readonly flags: readonly string[];
  readonly examples: readonly string[];
  readonly auth?: string;
  readonly output?: string;
  readonly concurrency?: string;
}) => ({
  auth: "Requires an authenticated Session in the selected Profile.",
  output: taskOutput,
  concurrency: "Reads do not change Task Versions.",
  ...input,
});
const guides = {
  attach: reference({
    purpose: "Attach a local file path or HTTP/HTTPS link to a Task.",
    synopsis: "todo attach <task-id> <path|url> [--label jira]",
    flags: ["--label <text>", "--expected-version <N> (optional)"],
    examples: ["todo attach TASK /tmp/jira-draft.md --label jira"],
    concurrency:
      "Reads the current Version before attaching. An optional expected Version rejects stale input.",
  }),
  "label-attachment": reference({
    purpose:
      "Set or clear an Attachment label without replacing its reference.",
    synopsis: "todo label-attachment <task-id> <attachment-id> [--label jira]",
    flags: [
      "--label <text> (omit to clear)",
      "--expected-version <N> (optional)",
    ],
    examples: [
      "todo label-attachment TASK ATTACHMENT --label jira",
      "todo label-attachment TASK ATTACHMENT",
    ],
    concurrency:
      "Labels are Task edits with optimistic Versions, History and Revert.",
  }),
  detach: reference({
    purpose:
      "Detach an Attachment. Copied images remain available for Revert until Purge.",
    synopsis: "todo detach <task-id> <attachment-id> [--dry-run]",
    flags: ["--dry-run", "--expected-version <N> (optional)"],
    examples: ["todo detach TASK ATTACHMENT --dry-run --format json"],
    concurrency:
      "Reads the current Version before detaching. An optional expected Version rejects stale input.",
  }),
  todo: reference({
    purpose:
      "Todo CLI: local-first task tracking with OCC, auth, and markdown-first output.",
    synopsis: "todo [global flags] <command> [flags]",
    flags: [],
    examples: [
      "printf 'secret\\n' | todo init --password-stdin",
      "todo login --password-stdin",
      "todo add 'Pay rent' --priority P1",
      "todo list --format json",
    ],
    auth: "Help and local configuration require no Session. Task commands require an authenticated Session.",
  }),
  diagnostics: reference({
    purpose:
      "Read server diagnostics using an owner Session. Polling is read only and includes metadata across all Profiles.",
    synopsis: "todo diagnostics [--server <url>] [--follow] [--format json]",
    flags: [
      "--server <url> (default TODO_SERVER_URL or http://127.0.0.1:4310)",
      "--follow (NDJSON, one snapshot per second)",
    ],
    examples: [
      "todo diagnostics --format json",
      "todo diagnostics --follow --server http://127.0.0.1:4310",
      "todo schema diagnostics",
    ],
    output:
      "JSON snapshots and each NDJSON line use the published diagnostics schema. Contains no Task content or credential secrets.",
    auth: "Requires an active owner Session saved by todo login in the selected Profile. Access Tokens are denied.",
  }),
  top: reference({
    purpose: "Monitor live server diagnostics in terminal panes.",
    synopsis: "todo top [--server <url>]",
    flags: [
      "--server <url> (default TODO_SERVER_URL or http://127.0.0.1:4310)",
    ],
    examples: ["todo top", "todo top --format json"],
    output:
      "TTY panes support q to quit, Tab for panes, arrow keys to scroll and p for Profile. Resize redraws. Non-TTY output falls back to diagnostics.",
    auth: "Requires an active owner Session. No database is opened by monitoring commands.",
  }),
  import: reference({
    purpose:
      "Import Tasks by stable external id from a JSON array or NDJSON file.",
    synopsis:
      "todo import <file|-> [--dry-run] [--close-missing] [--format json]",
    flags: [
      "--dry-run (preview without writing)",
      "--close-missing (cancel absent open Tasks with external ids)",
    ],
    examples: [
      "todo schema import-item",
      "todo import tasks.json --dry-run --format json",
      "todo import tasks.json --format json",
    ],
    output:
      "One import report with generated_at, dry_run, items and totals. Outcomes are created, updated, unchanged or rejected. Fields omitted by an item stay untouched. Explicit null clears nullable fields.",
    concurrency:
      "Preview captures from_version. Apply rejects stale Versions per Task. JSON exits 4 for any Conflict, 2 for other rejected Tasks and 0 when all Tasks are accepted. Apply creates an owner Snapshot first.",
  }),
  init: reference({
    purpose:
      "Initialize the database and selected Profile. Optionally configure the single owner's passphrase.",
    synopsis:
      "todo init [--username <name>] [--password <passphrase> | --password-stdin]",
    flags: [
      "--username <name> (default unset, compatibility flag)",
      "--password <passphrase> (default unset, bootstrap owner)",
      "--password-stdin (default false, reads the first line of stdin)",
    ],
    examples: [
      "printf 'secret\\n' | todo init --password-stdin",
      "todo init --profile personal",
    ],
    auth: "No Session required. The owner can be configured only once.",
    output:
      "md and table print initialized. json returns generated_at and status.",
    concurrency: "Initialization does not mutate Task Versions.",
  }),
  login: reference({
    purpose:
      "Authenticate the owner and save a private Session for the selected Profile. Reads the passphrase from a masked terminal prompt or stdin.",
    synopsis: "todo login [--username <name>] [--password-stdin]",
    flags: [
      "--username <name> (default unset, compatibility flag)",
      "--password-stdin (default false)",
    ],
    examples: [
      "todo login",
      "printf 'secret\\n' | todo login --password-stdin",
    ],
    auth: "Requires the owner's passphrase, not an existing Session. Sessions expire after a fixed seven days.",
    output:
      "json returns generated_at, owner, profile, and expires_at. md and table print the owner identity and Session expiry.",
    concurrency: "Sign-in does not mutate Task Versions.",
  }),
  logout: reference({
    purpose:
      "Revoke the selected Profile's saved Session and delete its local credential file.",
    synopsis: "todo logout",
    flags: [],
    examples: ["todo logout", "todo --profile personal logout"],
    auth: "A missing Session is safe. A saved Session must be valid to revoke it.",
    output:
      "json returns generated_at and status. md and table print logged out.",
    concurrency: "Sign-out does not mutate Task Versions.",
  }),
  move: reference({
    purpose:
      "Move Tasks to another Profile. Move keeps the external id and rejects an id already present in the destination. Project and Tags resolve by name. Occurrences become plain Tasks.",
    synopsis: "todo move <id>... --to <profile> [--dry-run]",
    flags: [
      "--to <profile> (required)",
      "--project <name>",
      "--tag <name>",
      "--status open|done|cancelled|snoozed",
      "--priority P1|P2|P3|P4",
      "--today",
      "--overdue",
      "--inbox",
      "--dry-run",
      "--expected-version <N> (optional, otherwise uses selected Versions)",
    ],
    examples: [
      "todo move --project ARG --to work --dry-run --format json",
      "todo move task-id --to work --format json",
    ],
    output:
      "One JSON object contains generated_at, dry_run and per-Task results with source_id, target_id and outcome. A copied Occurrence is reported explicitly. Markdown is the default.",
    concurrency:
      "Each Task is atomic. Conflicts report current_version and exit 4. Other Tasks in the batch may succeed. Dry-run checks the same rules without changing Tasks or History.",
  }),
  copy: reference({
    purpose:
      "Copy Tasks to another Profile. Copy clears the external id and records source provenance; the destination must be a different Profile. Project and Tags resolve by name. Occurrences become plain Tasks.",
    synopsis: "todo copy <id>... --to <profile> [--dry-run]",
    flags: [
      "--to <profile> (required)",
      "--project <name>",
      "--tag <name>",
      "--status open|done|cancelled|snoozed",
      "--priority P1|P2|P3|P4",
      "--today",
      "--overdue",
      "--inbox",
      "--dry-run",
      "--expected-version <N> (optional, otherwise uses selected Versions)",
    ],
    examples: [
      "todo copy --project ARG --to work --dry-run --format json",
      "todo copy task-id --to work --format json",
    ],
    output:
      "One JSON object contains generated_at, dry_run and per-Task results with source_id, target_id and outcome. A copied Occurrence is reported explicitly. Markdown is the default.",
    concurrency:
      "Each Task is atomic. Conflicts report current_version and exit 4. Other Tasks in the batch may succeed. Dry-run checks the same rules without changing Tasks or History.",
  }),
  whoami: reference({
    purpose:
      "Show the authenticated owner, selected Profile, and fixed Session expiry.",
    synopsis: "todo whoami",
    flags: [],
    examples: ["todo whoami", "todo --profile personal whoami"],
    output:
      "json returns generated_at, owner, profile, and expires_at. md and table print owner, Profile ID, and expiry. Invalid or missing Sessions return auth_required and exit 3.",
  }),
  add: reference({
    purpose:
      'Create a Task in the selected Profile. A structured recurrence also creates a Series and its first Occurrence atomically. Dash-leading descriptions work as --desc "- item" or --desc="- item". Use equals form when the value looks like a long flag, for example --desc=--help.',
    synopsis: "todo add <title> [flags] | todo add --parse <text> [flags]",
    flags: [
      "--parse <text> (opt in to quick-add tokens; literal titles stay unchanged)",
      ...taskFlags,
    ],
    examples: [
      "todo add 'Pay rent' --priority P1 --due 2030-01-01",
      "todo add 'Ship CLI' --project work --tag cli --format json",
      `todo add --parse 'Ship #"deep focus" @"Client Project" p1' --format json`,
    ],
    concurrency:
      "A new Task starts at row_version 1. Creation does not require --expected-version.",
  }),
  parse: reference({
    purpose: "Parse quick-add text without creating a Task.",
    synopsis: "todo parse <text> [--format md|json|table]",
    flags: [],
    examples: [
      `todo parse 'Ship #"deep focus" @"Client Project" p1' --format json`,
    ],
    auth: "No Session required. Uses the current time and local time zone.",
    output:
      "JSON returns generated_at and draft, with title, due_at, scheduled_at, priority, tags and project. Parsing writes no Task.",
  }),
  list: reference({
    purpose:
      "List visible Tasks in the selected Profile. Combine filters to match all of them, including Project and Tag within Inbox. Deleted Tasks are hidden.",
    synopsis: "todo list [filters]",
    flags: [
      "--status open|closed|done|cancelled|snoozed (default all)",
      "--project <name> (default all)",
      "--tag <name> (default all)",
      "--priority P1|P2|P3|P4 (default all)",
      "--today (default false)",
      "--overdue (default false)",
      "--inbox (default false)",
      "--due YYYY-MM-DD|none (default all)",
      "--scheduled YYYY-MM-DD|none (default all)",
      "--attachment <text> (default all)",
      "--energy 1|2|3|4|5|none (default all)",
      "--estimate <minutes>|none (default all)",
    ],
    examples: [
      "todo list --project work",
      "todo list --project 'Client Launch' --tag revenue",
      "todo list --inbox --project 'Client Launch' --tag revenue --format json",
      "todo list --status open --priority P1 --due 2030-11-01 --attachment contract",
      "todo list --energy 3 --estimate 45 --scheduled none --format json",
      "todo list --status open --format json",
    ],
    output:
      "All filters combine. Project names match exactly. Tags ignore case and surrounding spaces. closed includes done and cancelled. Dates match the calendar date in each Task's stored time zone; none matches a missing value. Energy and estimated minutes match exactly. Attachment text ignores case and searches names, labels, paths and URLs. --inbox matches open Tasks with no due or scheduled date. JSON includes active filters and matching Tasks; an empty result omits tasks.",
  }),
  show: reference({
    purpose: "Show one visible Task with its metadata and description.",
    synopsis: "todo show <task-id>",
    flags: [],
    examples: ["todo show TASK", "todo show TASK --format json"],
  }),
  edit: reference({
    purpose:
      "Edit only supplied Task fields. Unspecified fields retain their values. Empty optional values clear those fields.",
    synopsis: "todo edit <task-id> --expected-version <N> [flags]",
    flags: [versionFlag, "--title <title> (default unchanged)", ...taskFlags],
    examples: [
      "todo edit TASK --title Updated --expected-version 1",
      "todo edit TASK --due '' --expected-version 2",
    ],
    concurrency,
  }),
  done: reference({
    purpose:
      "Complete a Task and create its next Occurrence atomically when its Series continues.",
    synopsis: "todo done <task-id> --expected-version <N>",
    flags: [versionFlag],
    examples: ["todo done TASK --expected-version 1"],
    concurrency,
  }),
  cancel: reference({
    purpose:
      "Cancel a Task and create its next Occurrence atomically when its Series continues.",
    synopsis: "todo cancel <task-id> --expected-version <N>",
    flags: [versionFlag],
    examples: ["todo cancel TASK --expected-version 1"],
    concurrency,
  }),
  reopen: reference({
    purpose: "Reopen a completed or cancelled Task and increase its Version.",
    synopsis: "todo reopen <task-id> --expected-version <N>",
    flags: [versionFlag],
    examples: ["todo reopen TASK --expected-version 2"],
    concurrency,
  }),
  history: reference({
    purpose:
      "Read accepted and rejected Task History, including redacted entries after Purge.",
    synopsis: "todo history <task-id>",
    flags: [],
    examples: ["todo history TASK", "todo history TASK --format json"],
    output:
      "json returns {generated_at, entries}. This replaces the former bare array; each entry keeps its fields and meaning. md and table show sequence, operation, outcome, Versions, timestamp and reason. Purged content is redacted.",
  }),
  rm: reference({
    purpose:
      "Delete a Task recoverably. Use --force to Purge an already deleted Task. History keeps operation metadata and erases content on Purge.",
    synopsis: "todo rm <task-id> --expected-version <N> [--force]",
    flags: [versionFlag, "--force (default false, Purge a deleted Task)"],
    examples: [
      "todo rm TASK --expected-version 1",
      "todo rm TASK --expected-version 2 --force",
    ],
    concurrency,
    output: "json returns generated_at and status. md and table print deleted.",
  }),
  review: reference({
    purpose: "Review Tasks for daily or weekly planning.",
    synopsis: "todo review daily|weekly",
    flags: [],
    examples: ["todo review daily", "todo review weekly --format json"],
  }),
  "review daily": reference({
    purpose:
      "Review open Tasks for the current day. Markdown groups Overdue, Scheduled, and Inbox Tasks.",
    synopsis: "todo review daily",
    flags: [],
    examples: ["todo review daily", "todo review daily --format json"],
  }),
  "review weekly": reference({
    purpose:
      "Review open Tasks for the next seven days, stale Inbox Tasks, and missing metadata.",
    synopsis: "todo review weekly",
    flags: [],
    examples: ["todo review weekly", "todo review weekly --format table"],
  }),
  export: reference({
    purpose:
      "Export selected Tasks to stdout or a file. The jira-context template prepares Markdown for an agent to transform into Jira content.",
    synopsis:
      "todo export [--scope <scope>] [--template <template>] [--output <file>]",
    flags: [
      "--scope today|weekly|project:<name>|id:<task-id>|all (default all)",
      "--template default|jira-context (default default)",
      "--output <file> (default stdout)",
    ],
    examples: [
      "todo export --scope project:work --template jira-context",
      "todo export --scope id:TASK --output task.md",
      "todo export --format json",
    ],
    output:
      "md renders the selected Markdown template. json includes generated_at, filters, and Tasks. table retains the Markdown export contract. --output writes that content; json also returns the same response on stdout, while md and table print the file path.",
  }),
  sync: reference({
    purpose:
      "Write a one-way Task projection to an Obsidian vault. No content is imported.",
    synopsis: "todo sync obsidian --vault <path> [--file <relative-path>]",
    flags: [
      "--vault <path> (required and nonempty)",
      "--file <relative-path> (default Todo/CLI Tasks.md)",
    ],
    examples: [
      "todo sync obsidian --vault ./vault",
      "todo sync obsidian --vault ./vault --file Tasks.md",
    ],
    output:
      "json returns generated_at and path. md and table print the projection path. Replaces only the managed block and preserves surrounding content.",
  }),
  "sync obsidian": reference({
    purpose:
      "Write the selected Profile's Tasks to an Obsidian managed block. The canonical output path must stay inside the canonical vault, including through symlinks.",
    synopsis: "todo sync obsidian --vault <path> [--file <relative-path>]",
    flags: [
      "--vault <path> (required and nonempty)",
      "--file <relative-path> (default Todo/CLI Tasks.md)",
    ],
    examples: [
      "todo sync obsidian --vault ./vault",
      "todo sync obsidian --vault ./vault --file Tasks.md",
    ],
    output:
      "Writes a Markdown projection. json returns generated_at and path; md and table print the path. No import occurs. Empty vault paths and paths outside the vault exit 2 without writing a projection.",
  }),
  config: reference({
    purpose:
      "Manage local CLI configuration. Database selection uses --db, TODO_DB, config db.path, then ~/.todo-cli/todo.db.",
    synopsis: "todo config show|get|set",
    flags: [],
    examples: ["todo config show", "todo config set db.path /tmp/todo.db"],
    auth: "No Session required.",
    output:
      "json returns generated_at and config for reads, or status for writes. md and table print values or a confirmation.",
    concurrency: "Configuration does not mutate Task Versions.",
  }),
  "config show": reference({
    purpose:
      "Show the configured database path, or (unset) when none is saved.",
    synopsis: "todo config show",
    flags: [],
    examples: ["todo config show"],
    auth: "No Session required.",
    output:
      "json returns generated_at and config.db_path, with null when unset. md and table print db.path=<path>.",
  }),
  "config get": reference({
    purpose: "Read the configured value for db.path.",
    synopsis: "todo config get db.path",
    flags: [],
    examples: ["todo config get db.path"],
    auth: "No Session required.",
    output:
      "json returns generated_at and config.db_path, with null when unset. md and table print the value. Unknown keys exit 2.",
  }),
  "config set": reference({
    purpose: "Save the configured value for db.path.",
    synopsis: "todo config set db.path <path>",
    flags: [],
    examples: ["todo config set db.path /tmp/todo.db"],
    auth: "No Session required.",
    output:
      "json returns generated_at and status. md and table print ok. Unknown keys exit 2.",
    concurrency: "Configuration does not mutate Task Versions.",
  }),
  man: reference({
    purpose: "Show the manual index or a command's detailed reference.",
    synopsis: "todo man [command]",
    flags: [],
    examples: ["todo man", "todo man export"],
    auth: "No Session required.",
    output:
      "json returns generated_at and text. md and table print Markdown reference text. Unknown manual pages exit 3.",
  }),
  snapshot: reference({
    purpose:
      "Create, list, show, restore and prune Snapshots, which are point-in-time copies of the whole Todo database.",
    synopsis: "todo snapshot <create|list|show|restore|prune>",
    flags: [],
    examples: ["todo snapshot list", "todo snapshot create --reason manual"],
    auth: "Requires the owner Session.",
    output:
      "json returns generated_at with the subcommand's report. md prints the same report.",
    concurrency: "Snapshots do not change Task Versions.",
  }),
  "snapshot create": reference({
    purpose: "Create a Snapshot of the whole Todo database now.",
    synopsis: "todo snapshot create [--reason <text>]",
    flags: ["--reason <text> (default manual)"],
    examples: ["todo snapshot create --reason before-cleanup"],
    auth: "Requires the owner Session.",
    output: "json returns generated_at and snapshot with its manifest.",
    concurrency:
      "Copies a consistent database state without changing Task Versions.",
  }),
  "snapshot list": reference({
    purpose: "List stored Snapshots, newest first.",
    synopsis: "todo snapshot list",
    flags: [],
    examples: ["todo snapshot list --format json"],
    auth: "Requires the owner Session.",
    output: "json returns generated_at and the stored Snapshot manifests.",
  }),
  "snapshot show": reference({
    purpose: "Show one Snapshot's manifest.",
    synopsis: "todo snapshot show <snapshot-id>",
    flags: [],
    examples: ["todo snapshot show <snapshot-id>"],
    auth: "Requires the owner Session.",
    output: "json returns generated_at and snapshot. Unknown ids exit 3.",
  }),
  "snapshot restore": reference({
    purpose:
      "Restore the whole database from a Snapshot after taking a Snapshot of the current state.",
    synopsis: "todo snapshot restore <snapshot-id> [--dry-run]",
    flags: [
      "--dry-run (default false, report Task counts per Profile without writing)",
    ],
    examples: [
      "todo snapshot restore <snapshot-id> --dry-run",
      "todo snapshot restore <snapshot-id>",
    ],
    auth: "Requires the owner Session.",
    output: "json returns generated_at and restore with the change report.",
    concurrency:
      "Pauses all writers while the content is replaced in one transaction.",
  }),
  "snapshot prune": reference({
    purpose: "Delete Snapshots outside the retention policy.",
    synopsis: "todo snapshot prune [--dry-run]",
    flags: ["--dry-run (default false, list what would be deleted)"],
    examples: ["todo snapshot prune --dry-run"],
    auth: "Requires the owner Session.",
    output: "json returns generated_at and prune with kept and removed ids.",
    concurrency: "Never deletes the newest Snapshot.",
  }),
  profile: reference({
    purpose: "Discover or delete Profiles.",
    synopsis: "todo profile list | todo profile delete <name>",
    flags: [],
    examples: ["todo profile list", "todo profile delete personal --dry-run"],
    output: "Choose list or delete. JSON help returns generated_at and text.",
  }),
  "profile list": reference({
    purpose: "List active Profiles and their Task counts.",
    synopsis: "todo profile list",
    flags: [],
    examples: ["todo profile list --format json"],
    auth: "Requires a Session or Access Token. Scoped Tokens see their Profile only.",
    output:
      "json returns generated_at and profiles, including visible_task_count. Deleted Profiles stay hidden.",
  }),
  "profile delete": reference({
    purpose:
      "Delete an empty Profile, or explicitly delete its visible Tasks first. The last remaining Profile cannot be deleted.",
    synopsis: "todo profile delete <name> [--with-tasks] [--dry-run]",
    flags: [
      "--with-tasks (default false, delete visible Tasks recoverably first)",
      "--dry-run (default false, report without writes or a Snapshot)",
    ],
    examples: [
      "todo profile delete personal --dry-run",
      "todo profile delete personal --with-tasks --format json",
    ],
    auth: "Requires the owner Session. Profile-scoped Access Tokens are revoked; owner-wide Sessions and unscoped Tokens survive.",
    output:
      "json reports generated_at, profile, dry_run, tasks_affected, sessions_revoked and access_tokens_revoked. A non-empty refusal exits 2 with the visible Task count and --with-tasks recovery.",
    concurrency:
      "Takes a recovery Snapshot, then rechecks emptiness and the last Profile rule in the deletion transaction. Task History stays. The Profile cannot be restored in place; restore the Snapshot from Settings > Snapshots to recover it. Its name can be reused with a new ID.",
  }),
  schema: reference({
    purpose:
      "Publish the JSON Schema for a command's JSON success response or the shared error response.",
    synopsis: "todo schema <command> | todo schema --list",
    flags: ["--list (default false, list registered command names)"],
    examples: [
      "todo schema add",
      "todo schema 'review daily'",
      "todo schema error",
      "todo schema --list",
    ],
    auth: "No Session required.",
    output:
      "Always prints one JSON object. A schema document includes generated_at, $schema and its generated JSON Schema keywords. --list returns generated_at and commands.",
  }),
};
export const withGuide =
  (path: keyof typeof guides) =>
  <Name extends string, Input, ContextInput, E, R>(
    command: Command.Command<Name, Input, ContextInput, E, R>,
  ) => {
    const guide = guides[path];
    return command.pipe(
      Command.withDescription(
        `Purpose:\n${guide.purpose}\n\nDefaults and flags:\n${[...globals, ...guide.flags].join("\n")}\n\nExit codes:\n${exitCodes}\n\nExamples:\n${guide.examples.join("\n")}`,
      ),
      Command.withShortDescription(guide.purpose),
    );
  };
export function manualPage(command: string): string | undefined {
  const pages = Object.entries(guides);
  if (command === "index")
    return `# Todo CLI Manual\n\nAvailable manual pages:\n${pages
      .filter(([name]) => name !== "todo")
      .map(([name]) => `- todo man ${name.includes(" ") ? `'${name}'` : name}`)
      .join(
        "\n",
      )}\n\nUse: todo man <command>\n\n## Agent contract\n\n${agentContract}\n\n## Exit codes\n\n${exitCodes}\n`;
  const guide = pages.find(([name]) => name === command)?.[1];
  if (!guide) return undefined;
  return `# todo man ${command}\n\n## Synopsis\n\n${guide.synopsis}\n\n## Detailed behavior\n\n${guide.purpose}\n\n## Flags\n\n${[...globals, ...guide.flags].map((flag) => `- ${flag}`).join("\n")}\n\n## Output contracts\n\n${guide.output}\n\n## Agent contract\n\n${agentContract}\n\n## Concurrency\n\n${guide.concurrency}\n\n## Auth\n\n${guide.auth}\n\n## Practical examples\n\n${guide.examples.map((example) => `- ${example}`).join("\n")}\n\n## Exit codes\n\n${exitCodes}\n`;
}
