import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { Schema } from "effect";
import { ignoredMutationFlags } from "./mutation-flags-proof.ts";

const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const Text = Schema.Struct({ text: Schema.String });
const Names = Schema.Struct({ commands: Schema.Array(Schema.String) });
const Document = Schema.Record(Schema.String, Schema.Json);
const children = (text: string) =>
  [
    ...(
      text.match(/\nSUBCOMMANDS\n([\s\S]*?)(?=\n[A-Z][A-Z ]+\n|$)/)?.[1] ?? ""
    ).matchAll(/^ {2}([a-z][a-z-]*)\s/gm),
  ]
    .map((match) => match[1])
    .filter((value): value is string => value !== undefined);
const flagLines = (text: string) =>
  ["FLAGS", "GLOBAL FLAGS"].flatMap((section) =>
    (
      text.match(
        new RegExp(`\\n${section}\\n([\\s\\S]*?)(?=\\n[A-Z][A-Z ]+\\n|$)`),
      )?.[1] ?? ""
    )
      .split("\n")
      .filter((line) => /^\s+--/.test(line)),
  );
export function captureFlagInventory(binary: string, home: string) {
  mkdirSync(home, { recursive: true });
  const call = (args: string[]) => {
    const p = Bun.spawnSync([binary, ...args], {
      env: { ...process.env, HOME: home, TODO_DB: join(home, "absent.db") },
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    });
    assert.equal(p.exitCode, 0, p.stderr.toString());
    return JSON.parse(p.stdout.toString());
  };
  const names = Schema.decodeUnknownSync(Names)(
    call(["schema", "--list"]),
  ).commands;
  const commands = ["todo"];
  const records = [];
  for (let index = 0; index < commands.length; index++) {
    const name = commands[index];
    assert.ok(name);
    const text = Schema.decodeUnknownSync(Text)(
      call([
        ...(name === "todo" ? [] : name.split(" ")),
        "--help",
        "--format",
        "json",
      ]),
    ).text;
    for (const child of children(text))
      commands.push(name === "todo" ? child : `${name} ${child}`);
    const flags = [
      ...new Set(
        flagLines(text).flatMap((line) =>
          [...line.matchAll(/--[\w-]+|-[hv]\b/g)].map((m) => m[0]),
        ),
      ),
    ].sort();
    const document = names.includes(name)
      ? Object.fromEntries(
          Object.entries(
            Schema.decodeUnknownSync(Document)(call(["schema", name])),
          ).filter(([key]) => key !== "generated_at"),
        )
      : null;
    records.push({ name, flags, help: text, schema: document });
  }
  assert.deepEqual(
    [...names].sort(),
    [...commands.filter((x) => x !== "todo"), "help", "error"].sort(),
  );
  const supportingSchemas = Object.fromEntries(
    ["help", "error"].map((name) => {
      const doc = Schema.decodeUnknownSync(Document)(call(["schema", name]));
      return [
        name,
        Object.fromEntries(
          Object.entries(doc).filter(([key]) => key !== "generated_at"),
        ),
      ];
    }),
  );
  assert.equal(existsSync(join(home, "absent.db")), false);
  return { records, supportingSchemas };
}
export function flagGolden(
  inventory: ReturnType<typeof captureFlagInventory>,
  removeIgnored = false,
) {
  return {
    commands: Object.fromEntries(
      inventory.records.map((record) => {
        const omitted = new Set(
          removeIgnored
            ? ignoredMutationFlags
                .filter((x) => x.command === record.name)
                .map((x) => `--${x.flag}`)
            : [],
        );
        let section = "";
        const help = record.help
          .split("\n")
          .filter((line) => {
            if (/^[A-Z][A-Z ]+$/.test(line)) section = line;
            return !(
              section === "FLAGS" &&
              omitted.has(line.trim().split(/\s/)[0] ?? "")
            );
          })
          .map((line) => line.trim().replace(/\s+/g, " "))
          .filter(Boolean)
          .join("\n");
        return [
          record.name,
          {
            flags: record.flags.filter((flag) => !omitted.has(flag)),
            help_sha256: hash(help),
            schema_sha256: hash(record.schema),
          },
        ];
      }),
    ),
    supporting_schemas_sha256: hash(inventory.supportingSchemas),
  };
}
const globalConsumers: Record<string, string> = {
  "--db":
    "main.ts withStore: explicit db, TODO_DB, config, default path; global setting used by database commands",
  "--format":
    "main.ts response/renderers/error mapping; schema is explicitly always JSON; graph additionally consumes mermaid",
  "--profile":
    "main.ts selectProfile and init/login; credential-profile.ts default credential selector; global target setting",
  "--credential-profile":
    "credential-profile.ts credentialProfileName/loadCredential and main.ts login/logout/discovery",
  "--no-color":
    "main.ts top -> runTop(read, !cfg.noColor && !process.env.NO_COLOR); other renderers are plain",
  "--help-human-flag": "main.ts program early Human Onboarding response",
  "--help": "Effect CLI Command.runWith help rendering",
  "-h": "Effect CLI help alias",
  "--version": "main.ts early version or Effect CLI Command.runWith version",
  "-v": "version alias",
  "--wizard":
    "Effect CLI wizard; main.ts rejects interactive wizard in JSON mode",
  "--completions": "Effect CLI completion-script generation",
  "--log-level": "Effect CLI logging layer minimum level",
};
export function flagConsumer(command: string, flag: string) {
  const global = globalConsumers[flag];
  if (global) return { kind: "consumed", consumer: global };
  if (
    ignoredMutationFlags.some(
      (row) => row.command === command && `--${row.flag}` === flag,
    )
  )
    return {
      kind: "ignored-mutation-factory",
      consumer:
        "main.ts mutation -> mutateTask: only edit consumes Task flags; only rm consumes deletion options",
    };
  if ((command === "init" || command === "login") && flag === "--username")
    return {
      kind: "documented-compatibility-no-op",
      consumer:
        'help.ts: "--username <name> (default unset, compatibility flag)"; ADR-0005 single owner; retained unchanged by coordinator ruling',
    };
  if (command === "detach" && flag === "--label")
    throw new Error(
      "detach --label has no consumer and must not be registered",
    );
  const local: Record<string, Record<string, string>> = {
    init: {
      "--password": "setupOwner(password)",
      "--password-stdin":
        "stdin first line and mutually exclusive password check",
    },
    login: {
      "--password-stdin":
        "chooses masked TTY prompt or stdin, then auth.signIn",
    },
    "reset-passphrase": {
      "--password-stdin":
        "chooses interactive or two-line input before verifyMacPassword and resetPassphrase; not executed by this audit",
    },
    add: {
      "--depends-on": "DependRequest validation -> createTask dependencies",
      "--attach": "attachmentInput file -> createTask attachments",
      "--link": "attachmentInput URI -> createTask attachments",
      "--label": "labels each supplied file/link",
      "--parse": "quickDraft -> parsed title and fields",
    },
    diagnostics: {
      "--server": "diagnosticsRead URL",
      "--follow": "Effect.forever polling and NDJSON output",
      "--detail":
        "diagnosticsRead ?detail=true; refused with --follow before reading credentials",
    },
    "diagnostics runs": {
      "--server": "diagnostic-recordings.ts recordingCommand loopback URL",
      "--cursor": "recordingCommand runs cursor -> /diagnostics/profiler/runs",
      "--ndjson": "recordingCommand emit compact JSON",
    },
    "diagnostics show": {
      "--server": "diagnostic-recordings.ts recordingCommand loopback URL",
      "--run": "recordingCommand runId -> /diagnostics/profiler/runs/:run",
      "--ndjson": "recordingCommand emit compact JSON",
    },
    "diagnostics export": {
      "--server": "diagnostic-recordings.ts recordingCommand loopback URL",
      "--run":
        "recordingCommand runId -> /diagnostics/profiler/runs/:run/export",
      "--cursor": "recordingCommand export page offset",
      "--ndjson": "recordingCommand export follows every page as NDJSON",
    },
    "diagnostics import": {
      "--server": "diagnostic-recordings.ts recordingCommand loopback URL",
      "--file": "recordingCommand reads and validates the local file",
      "--dry-run": "recordingCommand ingest ?dry_run=true",
      "--ndjson": "recordingCommand emit compact JSON",
    },
    "diagnostics compare": {
      "--server": "diagnostic-recordings.ts recordingCommand loopback URL",
      "--before": "recordingCommand runId -> compare before",
      "--after": "recordingCommand runId -> compare after",
      "--ndjson": "recordingCommand emit compact JSON",
    },
    top: { "--server": "diagnosticsRead -> runTop or non-TTY snapshot" },
    lookup: { "--prefix": "LookupQuery -> Discovery.lookup" },
    "profile list": {
      "--projects": "Discovery.directory versus ClientReads.profiles",
    },
    "profile delete": {
      "--with-tasks": "auth.deleteProfile options.with_tasks",
      "--dry-run": "auth.deleteProfile options.dry_run",
    },
    "snapshot create": { "--reason": "snapshots.create(reason)" },
    "snapshot restore": { "--dry-run": "snapshots.restore options.dryRun" },
    "snapshot prune": { "--dry-run": "snapshots.prune options.dryRun" },
    schema: {
      "--list":
        "commandNames/inputNames response versus requested command schema",
    },
    export: {
      "--scope": "exportScope",
      "--template":
        "renderExport Markdown template; JSON retains the data contract",
      "--output": "writeFileSync output path",
    },
    "sync obsidian": {
      "--vault": "projectionTarget canonical containment",
      "--file": "projectionTarget and writeFileSync managed note",
    },
    "batch-depend": {
      "--file": "read JSON -> BatchEdgeRequest -> batchDepend",
      "--dry-run": "merges flag/body dry_run -> batchDepend",
    },
    "batch-edit": { "--dry-run": "merges flag/body dry_run -> batchEditTasks" },
    "attach-many": {
      "--dry-run": "merges flag/body dry_run -> AttachmentCommands.attachMany",
    },
    import: {
      "--dry-run": "importTasks dry_run",
      "--close-missing": "importTasks close_missing",
    },
  };
  const direct = local[command]?.[flag];
  if (direct)
    return {
      kind: "consumed",
      consumer: `apps/cli/src/main.ts / import.ts: ${direct}`,
    };
  if (
    (command === "edit" || command === "add") &&
    [
      "--title",
      "--desc",
      "--external-id",
      "--project",
      "--priority",
      "--scheduled",
      "--due",
      "--recurrence",
      "--energy",
      "--estimate",
      "--source",
      "--tag",
    ].includes(flag)
  )
    return {
      kind: "consumed",
      consumer:
        "main.ts taskInput -> commands.ts taskFlags/prepareFlags -> createTask or TaskCommands.edit",
    };
  if (
    ["done", "cancel", "reopen", "edit", "rm"].includes(command) &&
    flag === "--expected-version"
  )
    return {
      kind: "consumed",
      consumer:
        "main.ts mutation -> mutateTask expected -> Version/from_version compare-and-swap",
    };
  if (
    command === "rm" &&
    [
      "--force",
      "--with-dependencies",
      "--dry-run",
      "--dependency-fingerprint",
    ].includes(flag)
  )
    return {
      kind: "consumed",
      consumer:
        flag === "--force"
          ? "mutation force -> mutateTask Purge branch"
          : flag === "--with-dependencies"
            ? "DeleteTask.with_dependencies and interactive preview gate"
            : flag === "--dry-run"
              ? "mutateTask Delete/Purge preview fork and preview report"
              : "DeleteTask.dependency_fingerprint validation and Delete confirmation",
    };
  if (
    command === "list" &&
    [
      "--ready",
      "--blocked",
      "--order",
      "--status",
      "--project",
      "--tag",
      "--priority",
      "--today",
      "--overdue",
      "--inbox",
      "--due",
      "--scheduled",
      "--attachment",
      "--text",
      "--prefix",
      "--energy",
      "--estimate",
    ].includes(flag)
  )
    return {
      kind: "consumed",
      consumer:
        "main.ts filterInput -> TaskFilters -> readTasks/ClientReads; today/overdue/inbox additionally filterTasks and renderList",
    };
  if (
    (command === "move" || command === "copy") &&
    [
      "--to",
      "--status",
      "--project",
      "--tag",
      "--priority",
      "--today",
      "--overdue",
      "--inbox",
      "--dry-run",
      "--expected-version",
    ].includes(flag)
  )
    return {
      kind: "consumed",
      consumer:
        flag === "--to"
          ? "resolveProfile destination and transfer request"
          : flag === "--dry-run"
            ? "store.fork and copy attachmentCopyStats"
            : flag === "--expected-version"
              ? "Version validation -> transfer from_version"
              : "filterTasks(data.views,input) -> selected source ids",
    };
  if (
    ["attach", "detach", "label-attachment"].includes(command) &&
    ["--label", "--expected-version", "--dry-run"].includes(flag)
  )
    return {
      kind: "consumed",
      consumer:
        flag === "--label"
          ? "changeAttachment attach or labelAttachment label value"
          : flag === "--dry-run"
            ? "changeAttachment detach preview"
            : "changeAttachment/labelAttachment -> Version/from_version",
    };
  if (
    ["depend", "undepend", "revert"].includes(command) &&
    ["--on", "--from", "--expected-version"].includes(flag)
  )
    return {
      kind: "consumed",
      consumer:
        "main.ts DependRequest/RevertTask validation -> DependencyCommands.change or revertTask; on/from supplies blocker_id, expected-version supplies from_version",
    };
  throw new Error(`No reviewed consumer for ${command} ${flag}`);
}
export function auditFlagInventory(
  inventory: ReturnType<typeof captureFlagInventory>,
) {
  return inventory.records.flatMap((record) =>
    record.flags.map((flag) => ({
      command: record.name,
      flag,
      ...flagConsumer(record.name, flag),
    })),
  );
}
