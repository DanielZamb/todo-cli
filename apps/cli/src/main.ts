import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import { BunServices } from "@effect/platform-bun";
import { BUILD_ID, CONTRACT_ID } from "@todo/api";
import {
  ClientReads,
  filterTaskRecords,
  ProfileDeletionReport,
  ProfileSummary,
  parseQuickAdd,
  QuickAddDraft,
  QuickAddInput,
  SnapshotError,
  TaskFilters,
  TaskId,
  TaskStatus,
  Version,
} from "@todo/domain";
import { attachmentCopyStats } from "@todo/domain/attachment-store";
import {
  authFailure,
  CommandError,
  copyTask,
  createTask,
  ensureProfile,
  exportScope,
  filterTasks,
  type Mutation,
  moveTask,
  mutateTask,
  nowInstant,
  profileId,
  readTasks,
  type TaskFlags,
  taskFlags,
} from "@todo/domain/commands";
import { importTasks } from "@todo/domain/import";
import {
  encodeResponse,
  type Format,
  iso,
  obsidianProjection,
  renderError,
  renderExport,
  renderHistory,
  renderReview,
  renderTask,
  renderTasks,
  taskView,
} from "@todo/domain/presentation";
import { type OperationStore, openStore, StoreError } from "@todo/domain/store";
import { Console, Effect, Option, Redacted, Schema } from "effect";
import { Argument, CliError, Command, Flag, Prompt } from "effect/cli";
import "./diagnostics.schema.ts";
import { AttachmentCommandResponse } from "./attachments.schema.ts";
import {
  attachmentStatus,
  changeAttachment,
  labelAttachment,
  withAttachmentStatus,
} from "./attachments.ts";
import { diagnosticsOutput, diagnosticsRead } from "./diagnostics.ts";
import { manualPage, withGuide } from "./help.ts";
import { makeImportCommand, readImportFile, renderImport } from "./import.ts";
import {
  ConfigResponse,
  commandNames,
  commandSchema,
  IdentityResponse,
  inputNames,
  PathResponse,
  registerCommandSchema,
  SchemaListResponse,
  SchemaResponse,
  SnapshotListResponse,
  SnapshotPruneResponse,
  SnapshotResponse,
  SnapshotRestoreResponse,
  StatusResponse,
  TextResponse,
} from "./schema.ts";
import { runTop } from "./top.ts";
import { TransferResponse, type TransferResult } from "./transfer-schema.ts";

const write = (text: string) =>
  Effect.sync(() => {
    process.stdout.write(text);
  });
const response = <S extends Schema.ConstraintEncoder<unknown>>(
  format: Format,
  schema: S,
  value: S["Type"],
  text: string,
) => write(format === "json" ? encodeResponse(schema, value) : text);
const status = (format: Format, status: string, text: string) =>
  response(
    format,
    StatusResponse,
    { generated_at: iso(nowInstant()), status },
    text,
  );
const io = <A>(run: () => A) =>
  Effect.try({
    try: run,
    catch: (error) =>
      error instanceof CommandError
        ? error
        : new CommandError(1, "runtime_error", String(error)),
  });
const localDir = join(homedir(), ".todo-cli");
const sessionFile = (profile: string) =>
  join(localDir, `session_${encodeURIComponent(profile)}.json`);
const Config = Schema.Struct({ db_path: Schema.optionalKey(Schema.String) });
const loadConfig = () =>
  existsSync(join(localDir, "config.json"))
    ? Schema.decodeUnknownSync(Config)(
        JSON.parse(readFileSync(join(localDir, "config.json"), "utf8")),
      )
    : {};
const loadCredential = (profile: string) => {
  try {
    const token = Schema.decodeUnknownSync(
      Schema.Struct({
        token: Schema.NonEmptyString.check(Schema.isPattern(/^\S+$/)),
      }),
    )(JSON.parse(readFileSync(sessionFile(profile), "utf8"))).token;
    return token;
  } catch {
    throw new CommandError(3, "auth_required", "run todo login");
  }
};
const canonicalPath = (path: string): string => {
  if (lstatSync(path, { throwIfNoEntry: false })) return realpathSync(path);
  return join(canonicalPath(dirname(path)), basename(path));
};
const contained = (vault: string, target: string) => {
  const path = relative(vault, target);
  return path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path);
};
const projectionTarget = (vault: string, file: string) => {
  if (!vault.trim())
    throw new CommandError(2, "invalid_args", "--vault is required");
  const target = resolve(vault, file);
  try {
    const canonicalVault = canonicalPath(resolve(vault));
    const canonicalTarget = canonicalPath(target);
    if (
      isAbsolute(file) ||
      !contained(resolve(vault), target) ||
      !contained(canonicalVault, canonicalTarget)
    )
      throw new Error("outside vault");
    return { target, canonicalTarget };
  } catch {
    throw new CommandError(
      2,
      "invalid_args",
      "--file must stay inside the canonical vault",
    );
  }
};
const stringFlags = new Set<string>();
const stringFlag = (name: string) => {
  stringFlags.add(`--${name}`);
  return Flag.String(name);
};
const string = (name: string, fallback = "") =>
  stringFlag(name).pipe(Flag.withDefault(fallback));
const bool = (name: string) => Flag.Boolean(name).pipe(Flag.withDefault(false));
const root = Command.make("todo").pipe(
  withGuide("todo"),
  Command.withSharedFlags({
    db: string("db"),
    format: Flag.Literals("format", ["md", "json", "table"]).pipe(
      Flag.withDefault("md"),
    ),
    profile: string("profile", "default"),
    noColor: bool("no-color"),
    helpHuman: bool("help-human-flag"),
  }),
);
type Settings = Effect.Success<typeof root>;
const withStore = <A, E, R>(
  cfg: Settings,
  use: (store: OperationStore) => Effect.Effect<A, E, R>,
) =>
  Effect.gen(function* () {
    const path = yield* io(
      () =>
        cfg.db ||
        process.env.TODO_DB ||
        loadConfig().db_path ||
        join(localDir, "todo.db"),
    );
    yield* io(() =>
      mkdirSync(dirname(resolve(path)), { recursive: true, mode: 0o700 }),
    );
    return yield* Effect.acquireUseRelease(openStore({ path }), use, (store) =>
      Effect.orDie(store.close()),
    );
  });
const access = (cfg: Settings) =>
  io(() => ({
    credential: loadCredential(cfg.profile),
    profile: profileId(cfg.profile),
  }));
const selectProfile = Effect.fn(function* (
  store: OperationStore,
  cfg: Settings,
) {
  const credential = yield* io(() => loadCredential(cfg.profile));
  const profiles = yield* store.profiles();
  const profile = profiles.find(
    (p) => p.name === cfg.profile || p.id === cfg.profile,
  );
  if (!profile)
    return yield* Effect.fail(
      new CommandError(
        3,
        "not_found",
        "Profile not found; run todo init --profile <name>",
      ),
    );
  return { credential, profile: profile.id };
});
const taskOptions = {
  title: stringFlag("title").pipe(Flag.optional),
  desc: stringFlag("desc").pipe(Flag.optional),
  external_id: stringFlag("external-id").pipe(Flag.optional),
  project: stringFlag("project").pipe(Flag.optional),
  priority: stringFlag("priority").pipe(Flag.optional),
  scheduled: stringFlag("scheduled").pipe(Flag.optional),
  due: stringFlag("due").pipe(Flag.optional),
  recurrence: stringFlag("recurrence").pipe(Flag.optional),
  energy: stringFlag("energy").pipe(Flag.optional),
  estimate: stringFlag("estimate").pipe(Flag.optional),
  source: stringFlag("source").pipe(Flag.optional),
  tag: stringFlag("tag").pipe(Flag.atLeast(0)),
};
type ParsedTaskOptions = {
  [K in keyof typeof taskOptions]: (typeof taskOptions)[K] extends Flag.Flag<
    infer A
  >
    ? A
    : never;
};
function taskInput(options: ParsedTaskOptions): TaskFlags {
  const fields = {
    ...Object.fromEntries(
      Object.entries(options)
        .filter(([key]) => key !== "tag")
        .flatMap(([key, value]) =>
          Option.isOption(value) && Option.isSome(value)
            ? [[key, value.value]]
            : [],
        ),
    ),
    ...(options.tag.length ? { tag: options.tag } : {}),
  };
  return Schema.decodeUnknownSync(taskFlags)(fields);
}
const init = Command.make(
  "init",
  {
    username: string("username"),
    password: string("password"),
    passwordStdin: bool("password-stdin"),
  },
  (input) =>
    Effect.gen(function* () {
      const cfg = yield* root;
      if (input.passwordStdin && input.password)
        return yield* Effect.fail(
          new CommandError(
            2,
            "invalid_args",
            "use either --password or --password-stdin",
          ),
        );
      const password = input.passwordStdin
        ? yield* io(() => readFileSync(0, "utf8").split("\n")[0]?.trim() ?? "")
        : input.password;
      if (input.passwordStdin && !password)
        return yield* Effect.fail(
          new CommandError(2, "invalid_args", "no password provided on stdin"),
        );
      yield* withStore(cfg, (store) =>
        Effect.gen(function* () {
          if (password) yield* store.auth.setupOwner(password);
          yield* ensureProfile(store, cfg.profile);
          yield* status(cfg.format, "initialized", "initialized\n");
        }),
      );
    }),
).pipe(withGuide("init"));
const login = Command.make(
  "login",
  { username: string("username"), passwordStdin: bool("password-stdin") },
  (input) =>
    Effect.gen(function* () {
      const cfg = yield* root;
      const password =
        process.stdin.isTTY && !input.passwordStdin && cfg.format !== "json"
          ? Redacted.value(
              yield* Prompt.Password({ message: "Owner passphrase" }),
            )
          : yield* io(
              () => readFileSync(0, "utf8").split("\n")[0]?.trim() ?? "",
            );
      if (!password)
        return yield* Effect.fail(
          new CommandError(2, "invalid_args", "no password provided on stdin"),
        );
      yield* withStore(cfg, (store) =>
        Effect.gen(function* () {
          const result = yield* store.auth.signIn(password);
          yield* ensureProfile(store, cfg.profile);
          yield* io(() => {
            writeFileSync(
              sessionFile(cfg.profile),
              JSON.stringify({ token: result.credential }),
              { mode: 0o600 },
            );
            chmodSync(sessionFile(cfg.profile), 0o600);
          });
          yield* response(
            cfg.format,
            IdentityResponse,
            {
              generated_at: iso(nowInstant()),
              owner: "owner",
              profile: cfg.profile,
              expires_at: iso(result.expires_at),
            },
            `logged in as owner (expires ${iso(result.expires_at)})\n`,
          );
        }),
      );
    }),
).pipe(withGuide("login"));
const logout = Command.make("logout", {}, () =>
  Effect.gen(function* () {
    const cfg = yield* root;
    if (existsSync(sessionFile(cfg.profile)))
      yield* withStore(cfg, (store) =>
        Effect.gen(function* () {
          const request = yield* access(cfg);
          yield* store.auth.signOut({ credential: request.credential });
          yield* io(() => rmSync(sessionFile(cfg.profile)));
        }),
      );
    yield* status(cfg.format, "logged_out", "logged out\n");
  }),
).pipe(withGuide("logout"));
const whoami = Command.make("whoami", {}, () =>
  Effect.gen(function* () {
    const cfg = yield* root;
    yield* withStore(cfg, (store) =>
      Effect.gen(function* () {
        const request = yield* selectProfile(store, cfg);
        const credential = yield* store.auth.authenticate({
          ...request,
          access: "read",
        });
        yield* response(
          cfg.format,
          IdentityResponse,
          {
            generated_at: iso(nowInstant()),
            owner: "owner",
            profile: request.profile,
            expires_at: iso(credential.expires_at),
          },
          `owner (${request.profile}) expires ${iso(credential.expires_at)}\n`,
        );
      }),
    );
  }),
).pipe(withGuide("whoami"));
const { title: _title, ...addOptions } = taskOptions;
const ParseResponse = Schema.Struct({
  generated_at: Schema.String,
  draft: QuickAddDraft,
});
registerCommandSchema("parse", ParseResponse);
const quickDraft = (text: string) =>
  Effect.try({
    try: () =>
      Schema.decodeUnknownSync(QuickAddInput)({
        text,
        now: nowInstant(),
        time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }),
    catch: () =>
      new CommandError(2, "invalid_args", "Quick-add text must not be empty"),
  }).pipe(
    Effect.flatMap(parseQuickAdd),
    Effect.mapError(
      (error) => new CommandError(2, "invalid_args", error.message),
    ),
  );
const parseCommand = Command.make(
  "parse",
  { text: Argument.String("text") },
  ({ text }) =>
    Effect.gen(function* () {
      const cfg = yield* root;
      const draft = yield* quickDraft(text);
      yield* write(
        cfg.format === "json"
          ? encodeResponse(ParseResponse, { generated_at: nowInstant(), draft })
          : `${draft.title}\n${JSON.stringify(draft, null, 2)}\n`,
      );
    }),
).pipe(withGuide("parse"));
const add = Command.make(
  "add",
  {
    ...addOptions,
    titleArg: Argument.String("title").pipe(Argument.optional),
    parse: stringFlag("parse").pipe(Flag.optional),
  },
  (input) =>
    Effect.gen(function* () {
      const cfg = yield* root;
      if (Option.isSome(input.titleArg) === Option.isSome(input.parse))
        return yield* Effect.fail(
          new CommandError(
            2,
            "invalid_args",
            "Use a literal title or --parse <text>",
          ),
        );
      const draft = Option.isSome(input.parse)
        ? yield* quickDraft(input.parse.value)
        : undefined;
      const flags = taskInput({ ...input, title: Option.none() });
      yield* withStore(cfg, (store) =>
        Effect.gen(function* () {
          const request = yield* selectProfile(store, cfg);
          const result = yield* createTask(
            store,
            request,
            {
              ...flags,
              title: draft?.title ?? Option.getOrElse(input.titleArg, () => ""),
            },
            draft,
          );
          const data = yield* readTasks(store, request);
          yield* write(
            renderTask(
              taskView(result.task, data.projects, data.tags, data.series),
              cfg.format,
              nowInstant(),
            ),
          );
        }),
      );
    }),
).pipe(withGuide("add"));
const list = Command.make(
  "list",
  {
    status: string("status"),
    project: string("project"),
    tag: string("tag"),
    priority: string("priority"),
    today: bool("today"),
    overdue: bool("overdue"),
    inbox: bool("inbox"),
    due: string("due"),
    scheduled: string("scheduled"),
    attachment: string("attachment"),
    energy: string("energy"),
    estimate: string("estimate"),
  },
  (input) =>
    Effect.gen(function* () {
      const cfg = yield* root;
      const filters = yield* Effect.try({
        try: () =>
          Schema.decodeUnknownSync(TaskFilters)(
            Object.fromEntries(
              Object.entries(input).filter(
                ([key, value]) =>
                  key !== "today" &&
                  key !== "overdue" &&
                  key !== "inbox" &&
                  value !== "",
              ),
            ),
          ),
        catch: (error) =>
          new CommandError(
            2,
            "invalid_args",
            `Invalid Task filters: ${String(error)}`,
          ),
      });
      yield* withStore(cfg, (store) =>
        Effect.gen(function* () {
          const data = yield* readTasks(
            store,
            yield* selectProfile(store, cfg),
          );
          const matching = new Set<string>(
            filterTaskRecords(data.tasks, filters, data).map((task) => task.id),
          );
          yield* write(
            renderTasks(
              filterTasks(
                data.views.filter((task) => matching.has(task.id)),
                {
                  today: input.today,
                  overdue: input.overdue,
                  inbox: input.inbox,
                },
                nowInstant(),
              ),
              cfg.format,
              nowInstant(),
              Object.fromEntries(
                Object.entries(input).flatMap(([key, value]) =>
                  value ? [[key, String(value)]] : [],
                ),
              ),
            ),
          );
        }),
      );
    }),
).pipe(withGuide("list"));
const transfer = (kind: "move" | "copy") =>
  Command.make(
    kind,
    {
      ids: Argument.String("task-id").pipe(Argument.variadic()),
      to: string("to"),
      status: string("status"),
      project: string("project"),
      tag: string("tag"),
      priority: string("priority"),
      today: bool("today"),
      overdue: bool("overdue"),
      inbox: bool("inbox"),
      dryRun: bool("dry-run"),
      expected: Flag.Int("expected-version").pipe(Flag.optional),
    },
    (input) =>
      Effect.gen(function* () {
        const cfg = yield* root;
        const expected = yield* io(() => {
          if (Option.isNone(input.expected)) return null;
          if (!Schema.is(Version)(input.expected.value))
            throw new CommandError(
              2,
              "invalid_args",
              "--expected-version must be a positive Version",
            );
          return input.expected.value;
        });
        if (!input.to)
          return yield* Effect.fail(
            new CommandError(2, "invalid_args", "--to <profile> is required"),
          );
        if (
          !input.ids.length &&
          ![
            input.status,
            input.project,
            input.tag,
            input.priority,
            input.today,
            input.overdue,
            input.inbox,
          ].some(Boolean)
        )
          return yield* Effect.fail(
            new CommandError(
              2,
              "invalid_args",
              "provide Task ids or a filter such as --project, --tag or --status",
            ),
          );
        if (input.status && !Schema.is(TaskStatus)(input.status))
          return yield* Effect.fail(
            new CommandError(
              2,
              "invalid_args",
              "--status must be open, done, cancelled or snoozed",
            ),
          );
        yield* withStore(cfg, (store) =>
          Effect.gen(function* () {
            const request = yield* selectProfile(store, cfg);
            const destination = (yield* store.profiles()).find(
              (p) => p.id === input.to || p.name === input.to,
            );
            if (!destination)
              return yield* Effect.fail(
                new CommandError(
                  3,
                  "not_found",
                  "target Profile not found; run todo init --profile <name>",
                ),
              );
            if (kind === "move" && destination.id === request.profile)
              return yield* Effect.fail(
                new CommandError(
                  2,
                  "invalid_args",
                  "--to must name another Profile",
                ),
              );
            yield* store.auth.authenticate({ ...request, access: "write" });
            yield* store.auth.authenticate({
              ...request,
              profile: destination.id,
              access: "write",
            });
            const data = yield* readTasks(store, request);
            const matching = filterTasks(data.views, input, nowInstant());
            const ids = input.ids.length
              ? [...new Set(input.ids)]
              : matching.map((t) => t.id);
            const results: TransferResult[] = [];
            let conflictLatest: ReturnType<typeof taskView> | undefined;
            for (const id of ids) {
              const task = data.tasks.find(
                (t) => t.id === id && matching.some((v) => v.id === id),
              );
              if (!task) {
                results.push({
                  source_id: id,
                  target_id: null,
                  outcome: "not-found",
                  occurrence_as_plain_task: false,
                  message: "Task not found in the selected Profile and filters",
                });
                continue;
              }
              const occurrence_as_plain_task = task.occurrence !== null;
              const from_version = expected ?? task.row_version;
              const copyStats =
                input.dryRun && kind === "copy"
                  ? yield* io(() =>
                      attachmentCopyStats(store.attachmentRoot, task),
                    )
                  : {};
              const execute = (targetStore: typeof store) =>
                (kind === "move" ? moveTask : copyTask)(
                  targetStore,
                  { ...request, task_id: task.id },
                  { from_version, destination_profile: destination.id },
                );
              const result = yield* input.dryRun
                ? Effect.acquireUseRelease(store.fork(), execute, (preview) =>
                    preview.close(),
                  )
                : execute(store);
              if (
                result.outcome === "rejected" &&
                result.reason === "conflict" &&
                result.latest &&
                conflictLatest === undefined
              ) {
                conflictLatest = taskView(
                  result.latest,
                  data.projects,
                  data.tags,
                  data.series,
                );
              }
              results.push(
                result.outcome === "committed"
                  ? {
                      source_id: id,
                      target_id:
                        input.dryRun && kind === "copy" ? null : result.task.id,
                      outcome: input.dryRun
                        ? "dry-run"
                        : kind === "move"
                          ? "moved"
                          : "copied",
                      occurrence_as_plain_task,
                      ...copyStats,
                    }
                  : {
                      source_id: id,
                      target_id: null,
                      outcome:
                        result.outcome === "rejected"
                          ? result.reason
                          : "not-found",
                      occurrence_as_plain_task,
                      ...(result.outcome === "rejected" && result.message
                        ? { message: result.message }
                        : {}),
                      ...(result.outcome === "rejected" && result.details
                        ? { details: result.details }
                        : {}),
                      ...(result.outcome === "rejected" && result.latest
                        ? { current_version: result.latest.row_version }
                        : {}),
                    },
              );
            }
            const conflict = results.some((r) => r.outcome === "conflict");
            const failed = results.some(
              (r) => !["moved", "copied", "dry-run"].includes(r.outcome),
            );
            const rejectionDetails = results.find(
              (result) => result.details,
            )?.details;
            const report = {
              generated_at: iso(nowInstant()),
              dry_run: input.dryRun,
              results,
              ...(failed
                ? {
                    code: conflict
                      ? "occ_conflict"
                      : results.some((r) => r.outcome === "not-found")
                        ? "not_found"
                        : "invalid_args",
                    message: conflict
                      ? "A Task changed. Retry with its current Version."
                      : (results.find((result) => result.message)?.message ??
                        "Some Tasks could not be transferred. Check their outcomes."),
                    ...(conflictLatest
                      ? {
                          details: {
                            current_version: conflictLatest.row_version,
                            latest: conflictLatest,
                          },
                        }
                      : rejectionDetails
                        ? { details: rejectionDetails }
                        : {}),
                  }
                : {}),
            };
            yield* write(
              cfg.format === "json"
                ? encodeResponse(TransferResponse, report)
                : results
                    .map(
                      (r) =>
                        `${r.source_id}: ${r.outcome}${r.message ? `: ${r.message}` : ""}${r.target_id ? ` -> ${r.target_id}` : ""}${r.occurrence_as_plain_task ? " (Occurrence becomes a plain Task)" : ""}${r.current_version ? ` (current Version ${r.current_version})` : ""}${r.managed_image_count === undefined ? "" : ` (${r.managed_image_count} managed images, ${r.managed_image_bytes} bytes)`}`,
                    )
                    .join("\n") + "\n",
            );
            if (failed)
              process.exitCode = conflict
                ? 4
                : results.some((r) => r.outcome === "not-found")
                  ? 3
                  : 2;
          }),
        );
      }),
  ).pipe(withGuide(kind));
const show = Command.make(
  "show",
  { id: Argument.String("task-id") },
  ({ id }) =>
    Effect.gen(function* () {
      const cfg = yield* root;
      yield* withStore(cfg, (store) =>
        Effect.gen(function* () {
          const data = yield* readTasks(
            store,
            yield* selectProfile(store, cfg),
          );
          const task = data.views.find((t) => t.id === id);
          if (!task)
            return yield* Effect.fail(
              new CommandError(3, "not_found", "task not found"),
            );
          yield* write(
            renderTask(
              withAttachmentStatus(
                task,
                data.tasks.find((value) => value.id === id)?.attachments ?? [],
              ),
              cfg.format,
              nowInstant(),
            ),
          );
        }),
      );
    }),
).pipe(withGuide("show"));
const attachmentCommand = (detach: boolean) =>
  Command.make(
    detach ? "detach" : "attach",
    {
      id: Argument.String("task-id"),
      value: Argument.String(detach ? "attachment-id" : "path-or-url"),
      label: Flag.String("label").pipe(Flag.optional),
      expected: Flag.Int("expected-version").pipe(Flag.withDefault(0)),
      ...(detach ? { dryRun: bool("dry-run") } : {}),
    },
    (input) =>
      Effect.gen(function* () {
        const cfg = yield* root;
        yield* withStore(cfg, (store) =>
          Effect.gen(function* () {
            const request = yield* selectProfile(store, cfg);
            const dryRun = "dryRun" in input && input.dryRun === true;
            const task = yield* changeAttachment(store, request, {
              id: input.id,
              value: input.value,
              expected: input.expected,
              detach,
              dryRun,
              ...(Option.isSome(input.label)
                ? { label: input.label.value }
                : {}),
            });
            if (cfg.format === "json")
              return yield* write(
                encodeResponse(AttachmentCommandResponse, {
                  generated_at: nowInstant(),
                  dry_run: dryRun,
                  task: {
                    id: task.id,
                    row_version: task.row_version,
                    attachments: attachmentStatus(task.attachments ?? []),
                  },
                }),
              );
            const data = yield* readTasks(store, request);
            yield* write(
              `${dryRun ? "Dry run\n\n" : ""}${renderTask(withAttachmentStatus(taskView(task, data.projects, data.tags, data.series), task.attachments ?? []), cfg.format, nowInstant())}`,
            );
          }),
        );
      }),
  ).pipe(withGuide(detach ? "detach" : "attach"));
const labelAttachmentCommand = Command.make(
  "label-attachment",
  {
    id: Argument.String("task-id"),
    attachment: Argument.String("attachment-id"),
    label: Flag.String("label").pipe(Flag.optional),
    expected: Flag.Int("expected-version").pipe(Flag.withDefault(0)),
  },
  (input) =>
    Effect.gen(function* () {
      const cfg = yield* root;
      yield* withStore(cfg, (store) =>
        Effect.gen(function* () {
          const request = yield* selectProfile(store, cfg);
          const task = yield* labelAttachment(
            store,
            request,
            input.id,
            input.attachment,
            Option.getOrNull(input.label),
            input.expected,
          );
          if (cfg.format === "json")
            return yield* write(
              encodeResponse(AttachmentCommandResponse, {
                generated_at: nowInstant(),
                dry_run: false,
                task: {
                  id: task.id,
                  row_version: task.row_version,
                  attachments: attachmentStatus(task.attachments ?? []),
                },
              }),
            );
          yield* write("Attachment label updated");
        }),
      );
    }),
).pipe(withGuide("label-attachment"));
const history = Command.make(
  "history",
  { id: Argument.String("task-id") },
  ({ id }) =>
    Effect.gen(function* () {
      const cfg = yield* root;
      yield* withStore(cfg, (store) =>
        Effect.gen(function* () {
          const request = yield* selectProfile(store, cfg);
          const task_id = yield* io(() => Schema.decodeUnknownSync(TaskId)(id));
          const entries = yield* new ClientReads(store).history({
            ...request,
            task_id,
          });
          yield* write(renderHistory(entries, cfg.format, nowInstant()));
        }),
      );
    }),
).pipe(withGuide("history"));
const mutation = (name: Mutation) =>
  Command.make(
    name,
    {
      ...taskOptions,
      id: Argument.String("task-id"),
      expected: Flag.Int("expected-version").pipe(Flag.withDefault(0)),
      force: bool("force"),
    },
    (input) =>
      Effect.gen(function* () {
        const cfg = yield* root;
        yield* withStore(cfg, (store) =>
          Effect.gen(function* () {
            const request = yield* selectProfile(store, cfg);
            yield* mutateTask(
              store,
              request,
              name,
              input.id,
              input.expected,
              taskInput(input),
              input.force,
            );
            if (name === "rm")
              return yield* status(cfg.format, "deleted", "deleted\n");
            const data = yield* readTasks(store, request);
            const task = data.views.find((t) => t.id === input.id);
            if (task) yield* write(renderTask(task, cfg.format, nowInstant()));
          }),
        );
      }),
  ).pipe(withGuide(name));
const reviewCommand = (period: "daily" | "weekly") =>
  Command.make(period, {}, () =>
    Effect.gen(function* () {
      const cfg = yield* root;
      yield* withStore(cfg, (store) =>
        Effect.gen(function* () {
          const data = yield* readTasks(
            store,
            yield* selectProfile(store, cfg),
          );
          yield* write(
            renderReview(data.views, period, cfg.format, nowInstant()),
          );
        }),
      );
    }),
  ).pipe(withGuide(`review ${period}`));
const review = Command.make("review").pipe(
  Command.withSubcommands([reviewCommand("daily"), reviewCommand("weekly")]),
  withGuide("review"),
);
const exportCommand = Command.make(
  "export",
  {
    scope: string("scope", "all"),
    template: Flag.Literals("template", ["default", "jira-context"]).pipe(
      Flag.withDefault("default"),
    ),
    output: string("output"),
  },
  (input) =>
    Effect.gen(function* () {
      const cfg = yield* root;
      yield* withStore(cfg, (store) =>
        Effect.gen(function* () {
          const data = yield* readTasks(
            store,
            yield* selectProfile(store, cfg),
          );
          const tasks = yield* Effect.try({
            try: () => exportScope(data.views, input.scope, nowInstant()),
            catch: (error) => error,
          });
          const text = renderExport(
            tasks,
            cfg.format,
            nowInstant(),
            input.scope,
            input.template,
          );
          if (input.output) {
            yield* io(() => writeFileSync(input.output, text));
            yield* write(cfg.format === "json" ? text : `${input.output}\n`);
          } else yield* write(text);
        }),
      );
    }),
).pipe(withGuide("export"));
const sync = Command.make("sync").pipe(
  Command.withSubcommands([
    Command.make(
      "obsidian",
      {
        vault: stringFlag("vault"),
        file: string("file", "Todo/CLI Tasks.md"),
      },
      (input) =>
        Effect.gen(function* () {
          const cfg = yield* root;
          const { target, canonicalTarget } = yield* io(() =>
            projectionTarget(input.vault, input.file),
          );
          yield* withStore(cfg, (store) =>
            Effect.gen(function* () {
              const data = yield* readTasks(
                store,
                yield* selectProfile(store, cfg),
              );
              yield* io(() => {
                mkdirSync(dirname(canonicalTarget), { recursive: true });
                writeFileSync(
                  canonicalTarget,
                  obsidianProjection(
                    existsSync(canonicalTarget)
                      ? readFileSync(canonicalTarget, "utf8")
                      : "",
                    data.views,
                    nowInstant(),
                  ),
                );
              });
              yield* response(
                cfg.format,
                PathResponse,
                { generated_at: iso(nowInstant()), path: target },
                `${target}\n`,
              );
            }),
          );
        }),
    ).pipe(withGuide("sync obsidian")),
  ]),
  withGuide("sync"),
);
const man = Command.make(
  "man",
  { command: Argument.String("command").pipe(Argument.withDefault("index")) },
  ({ command }) =>
    Effect.gen(function* () {
      const cfg = yield* root;
      const page = manualPage(command);
      return yield* page === undefined
        ? Effect.fail(new CommandError(3, "not_found", "manual page not found"))
        : response(
            cfg.format,
            TextResponse,
            { generated_at: iso(nowInstant()), text: page },
            page,
          );
    }),
).pipe(withGuide("man"));
const configRead = (key?: string) =>
  Effect.gen(function* () {
    const cfg = yield* root;
    if (key !== undefined && key !== "db.path")
      return yield* Effect.fail(
        new CommandError(2, "invalid_args", "unknown config key"),
      );
    const config = yield* io(loadConfig);
    yield* response(
      cfg.format,
      ConfigResponse,
      {
        generated_at: iso(nowInstant()),
        config: { db_path: config.db_path ?? null },
      },
      key
        ? `${config.db_path ?? ""}\n`
        : `db.path=${config.db_path || "(unset)"}\n`,
    );
  });
const config = Command.make("config").pipe(
  Command.withSubcommands([
    Command.make("show", {}, () => configRead()).pipe(withGuide("config show")),
    Command.make("get", { key: Argument.String("key") }, ({ key }) =>
      configRead(key),
    ).pipe(withGuide("config get")),
    Command.make(
      "set",
      { key: Argument.String("key"), value: Argument.String("value") },
      ({ key, value }) =>
        Effect.gen(function* () {
          const cfg = yield* root;
          if (key !== "db.path")
            return yield* Effect.fail(
              new CommandError(2, "invalid_args", "unknown config key"),
            );
          yield* io(() =>
            writeFileSync(
              join(localDir, "config.json"),
              JSON.stringify({ db_path: value }),
              { mode: 0o600 },
            ),
          );
          yield* status(cfg.format, "ok", "ok\n");
        }),
    ).pipe(withGuide("config set")),
  ]),
  withGuide("config"),
);
const importCommand = makeImportCommand((input) =>
  Effect.gen(function* () {
    const cfg = yield* root;
    const items = yield* readImportFile(input.file);
    yield* withStore(cfg, (store) =>
      Effect.gen(function* () {
        const request = yield* selectProfile(store, cfg);
        const report = yield* importTasks(store, request, {
          items,
          file_name: input.file === "-" ? "stdin" : basename(input.file),
          dry_run: input.dryRun,
          close_missing: input.closeMissing,
        });
        yield* write(renderImport(report, cfg.format));
        if (report.totals.rejected)
          process.exitCode = report.items.some(
            (row) => row.error?.code === "occ_conflict",
          )
            ? 4
            : 2;
      }),
    );
  }),
);
const schema = Command.make(
  "schema",
  {
    command: Argument.String("command").pipe(Argument.withDefault("")),
    list: bool("list"),
  },
  ({ command, list }) => {
    if (list)
      return write(
        encodeResponse(SchemaListResponse, {
          generated_at: iso(nowInstant()),
          commands: commandNames(),
          inputs: inputNames(),
        }),
      );
    const value = commandSchema(command);
    return value
      ? write(
          encodeResponse(
            SchemaResponse,
            Schema.decodeUnknownSync(SchemaResponse)(value),
          ),
        )
      : Effect.fail(
          new CommandError(
            2,
            "invalid_args",
            "use todo schema <command> or todo schema --list",
          ),
        );
  },
).pipe(withGuide("schema"));
const diagnostics = Command.make(
  "diagnostics",
  {
    server: string(
      "server",
      process.env.TODO_SERVER_URL || "http://127.0.0.1:4310",
    ),
    follow: bool("follow"),
  },
  (input) =>
    Effect.gen(function* () {
      const cfg = yield* root;
      const credential = yield* io(() => loadCredential(cfg.profile));
      const snapshot = diagnosticsRead(input.server, credential).pipe(
        Effect.flatMap((snapshot) =>
          write(diagnosticsOutput(snapshot, cfg.format, input.follow)),
        ),
      );
      if (input.follow)
        return yield* Effect.forever(
          snapshot.pipe(Effect.andThen(Effect.sleep("1 second"))),
        );
      yield* snapshot;
    }),
).pipe(withGuide("diagnostics"));
const top = Command.make(
  "top",
  {
    server: string(
      "server",
      process.env.TODO_SERVER_URL || "http://127.0.0.1:4310",
    ),
  },
  (input) =>
    Effect.gen(function* () {
      const cfg = yield* root;
      const credential = yield* io(() => loadCredential(cfg.profile));
      const read = diagnosticsRead(input.server, credential);
      if (
        !process.stdout.isTTY ||
        !process.stdin.isTTY ||
        cfg.format === "json"
      ) {
        const snapshot = yield* read;
        return yield* write(diagnosticsOutput(snapshot, cfg.format));
      }
      yield* runTop(read, !cfg.noColor && !process.env.NO_COLOR);
    }),
).pipe(withGuide("top"));
const ProfileListResponse = Schema.Struct({
  generated_at: Schema.String,
  profiles: Schema.Array(ProfileSummary),
});
registerCommandSchema("profile", TextResponse);
registerCommandSchema("profile list", ProfileListResponse);
registerCommandSchema("profile delete", ProfileDeletionReport);
const profiles = Command.make("profile").pipe(
  Command.withSubcommands([
    Command.make("list", {}, () =>
      Effect.gen(function* () {
        const cfg = yield* root;
        yield* withStore(cfg, (store) =>
          Effect.gen(function* () {
            const credential = yield* io(() => loadCredential(cfg.profile));
            const profiles = yield* new ClientReads(store).profiles(credential);
            yield* write(
              cfg.format === "json"
                ? encodeResponse(ProfileListResponse, {
                    generated_at: nowInstant(),
                    profiles,
                  })
                : profiles
                    .map(
                      (p) => `- ${p.name} (${p.visible_task_count ?? 0} Tasks)`,
                    )
                    .join("\n") + "\n",
            );
          }),
        );
      }),
    ).pipe(withGuide("profile list")),
    Command.make(
      "delete",
      {
        name: Argument.String("name"),
        withTasks: bool("with-tasks"),
        dryRun: bool("dry-run"),
      },
      (input) =>
        Effect.gen(function* () {
          const cfg = yield* root;
          yield* withStore(cfg, (store) =>
            Effect.gen(function* () {
              const credential = yield* io(() => loadCredential(cfg.profile));
              const profiles = yield* store.auth.profiles({ credential });
              const target = profiles.find(
                (p) => p.name === input.name || p.id === input.name,
              );
              const result = yield* store.auth.deleteProfile({
                credential,
                profile: target?.id ?? profileId(input.name),
                options: { with_tasks: input.withTasks, dry_run: input.dryRun },
              });
              if (result.outcome === "refused") {
                yield* write(
                  cfg.format === "json"
                    ? renderError(
                        result.error.code,
                        result.error.message,
                        cfg.format,
                        result.error.generated_at,
                        undefined,
                        result.error.details,
                      )
                    : result.error.message + "\n",
                );
                yield* Effect.sync(() => {
                  process.exitCode = result.error.code === "not_found" ? 3 : 2;
                });
                return;
              }
              yield* write(
                cfg.format === "json"
                  ? encodeResponse(ProfileDeletionReport, result.report)
                  : `${input.dryRun ? "Would delete" : "Deleted"} Profile "${result.report.profile.name}"; ${result.report.tasks_affected} Tasks; ${result.report.access_tokens_revoked} Access Tokens revoked\n`,
              );
            }),
          );
        }),
    ).pipe(withGuide("profile delete")),
  ]),
  withGuide("profile"),
);
const snapshotCommand = Command.make("snapshot").pipe(
  Command.withSubcommands([
    Command.make(
      "create",
      { reason: string("reason", "manual") },
      ({ reason }) =>
        snapshotUse(SnapshotResponse, (store, generated_at) =>
          store.snapshots
            .create(reason)
            .pipe(Effect.map((snapshot) => ({ generated_at, snapshot }))),
        ),
    ).pipe(withGuide("snapshot create")),
    Command.make("list", {}, () =>
      snapshotUse(SnapshotListResponse, (store, generated_at) =>
        store.snapshots
          .list()
          .pipe(Effect.map((result) => ({ generated_at, ...result }))),
      ),
    ).pipe(withGuide("snapshot list")),
    Command.make("show", { id: Argument.String("snapshot-id") }, ({ id }) =>
      snapshotUse(SnapshotResponse, (store, generated_at) =>
        store.snapshots
          .show(id)
          .pipe(Effect.map((snapshot) => ({ generated_at, snapshot }))),
      ),
    ).pipe(withGuide("snapshot show")),
    Command.make(
      "restore",
      { id: Argument.String("snapshot-id"), dryRun: bool("dry-run") },
      ({ id, dryRun }) =>
        snapshotUse(SnapshotRestoreResponse, (store, generated_at) =>
          store.snapshots
            .restore(id, { dryRun })
            .pipe(Effect.map((restore) => ({ generated_at, restore }))),
        ),
    ).pipe(withGuide("snapshot restore")),
    Command.make("prune", { dryRun: bool("dry-run") }, ({ dryRun }) =>
      snapshotUse(SnapshotPruneResponse, (store, generated_at) =>
        store.snapshots
          .prune({ dryRun })
          .pipe(Effect.map((prune) => ({ generated_at, prune }))),
      ),
    ).pipe(withGuide("snapshot prune")),
  ]),
  withGuide("snapshot"),
);
function snapshotUse<S extends Schema.ConstraintEncoder<unknown>>(
  schema: S,
  use: (
    store: OperationStore,
    generatedAt: string,
  ) => Effect.Effect<S["Type"], StoreError>,
) {
  return Effect.gen(function* () {
    const cfg = yield* root;
    yield* withStore(cfg, (store) =>
      Effect.gen(function* () {
        yield* store.auth.requireOwner({
          credential: yield* io(() => loadCredential(cfg.profile)),
        });
        const result = yield* use(store, iso(nowInstant()));
        yield* response(
          cfg.format,
          schema,
          result,
          `# Snapshots\n\n${JSON.stringify(result, null, 2)}\n`,
        );
      }),
    );
  });
}
const app = root.pipe(
  Command.withSubcommands([
    diagnostics,
    top,
    schema,
    snapshotCommand,
    init,
    login,
    logout,
    whoami,
    importCommand,
    profiles,
    add,
    parseCommand,
    list,
    show,
    attachmentCommand(false),
    attachmentCommand(true),
    labelAttachmentCommand,

    transfer("move"),
    transfer("copy"),
    history,
    mutation("edit"),
    mutation("done"),
    mutation("cancel"),
    mutation("reopen"),
    mutation("rm"),
    review,
    exportCommand,
    sync,
    man,
    config,
  ]),
);
const inputArgs = process.argv.slice(2);
const args: string[] = [];
const rawArgs =
  inputArgs[0] === "help" ? [...inputArgs.slice(1), "--help"] : inputArgs;
for (let index = 0; index < rawArgs.length; index++) {
  const arg = rawArgs[index];
  if (arg === undefined) continue;
  if (arg === "--") {
    args.push(...rawArgs.slice(index));
    break;
  }
  const next = rawArgs[index + 1];
  if (stringFlags.has(arg) && next?.startsWith("-") && !next.startsWith("--")) {
    args.push(`${arg}=${next}`);
    index++;
  } else args.push(arg);
}
const delimiterIndex = args.indexOf("--");
const flagArgs = delimiterIndex === -1 ? args : args.slice(0, delimiterIndex);
const formatValues = flagArgs.flatMap((arg, index) =>
  arg.startsWith("--format=")
    ? [arg.slice(9)]
    : arg === "--format"
      ? [flagArgs[index + 1] ?? ""]
      : [],
);
const formatValue = formatValues[0] ?? "md";
const format: Format =
  formatValues.length > 1 && formatValues.includes("json")
    ? "json"
    : formatValue === "json" || formatValue === "table"
      ? formatValue
      : "md";
const follow = args.some(
  (arg, index) =>
    (delimiterIndex === -1 || index < delimiterIndex) &&
    (arg === "--follow" || arg === "--follow=true") &&
    !stringFlags.has(args[index - 1] ?? ""),
);
const jsonOutput = format === "json" || (follow && !process.stdout.isTTY);
const program = Effect.gen(function* () {
  if (args.length === 1 && (args[0] === "--version" || args[0] === "-v")) {
    process.stdout.write(
      `todo 0.1.0 build=${BUILD_ID} contract=${CONTRACT_ID}\n`,
    );
    return;
  }
  if (formatValues.length > 1)
    return yield* Effect.fail(
      new CommandError(2, "invalid_args", "--format can be supplied only once"),
    );
  yield* io(() => {
    mkdirSync(localDir, { recursive: true, mode: 0o700 });
    const marker = join(localDir, ".first_run_disclaimer_seen");
    if (!existsSync(marker)) {
      process.stderr.write(
        "Notice: This CLI is optimized for agents and strict consistency. Human? run `todo --help-human-flag` for guided onboarding.\n",
      );
      writeFileSync(marker, `${nowInstant()}\n`, { mode: 0o600 });
    }
  });

  if (
    jsonOutput &&
    flagArgs.some((arg) => arg === "--wizard" || arg.startsWith("--wizard="))
  )
    return yield* Effect.fail(
      new CommandError(
        2,
        "invalid_args",
        "--wizard is interactive; omit it with --format json",
      ),
    );
  const delimiter = args.indexOf("--");
  const ambiguousStringFlag = args.find(
    (arg, index) =>
      (delimiter === -1 || index < delimiter) &&
      stringFlags.has(arg) &&
      args[index + 1]?.startsWith("--"),
  );
  if (ambiguousStringFlag)
    return yield* Effect.fail(
      new CommandError(
        2,
        "invalid_args",
        `${ambiguousStringFlag} requires a value; use ${ambiguousStringFlag}=<value> for a value starting with --`,
      ),
    );
  const unknownShortFlag = args.find(
    (arg, index) =>
      (delimiter === -1 || index < delimiter) &&
      /^-[^-]/.test(arg) &&
      !/^-\d+(?:\.\d+)?$/.test(arg) &&
      arg !== "-h" &&
      arg !== "-v",
  );
  if (jsonOutput && unknownShortFlag)
    return yield* Effect.fail(
      new CommandError(
        2,
        "invalid_args",
        `unknown flag ${unknownShortFlag}; run todo --help`,
      ),
    );
  if (flagArgs.includes("--help-human-flag")) {
    const text =
      "# Human Onboarding\n\nPipe the passphrase to todo init --password-stdin, then to todo login --password-stdin. Add tasks and read their Version before editing.\n\nTip for humans: retry occ_conflict using the latest Version.\n";
    return yield* response(
      format,
      TextResponse,
      { generated_at: iso(nowInstant()), text },
      text,
    );
  }
  const command = Command.runWith(app, {
    version: `0.1.0 build=${BUILD_ID} contract=${CONTRACT_ID}`,
    renderErrors: false,
  })(args.length ? args : ["--help"]);
  if (jsonOutput) {
    const console = yield* Console.Console;
    const messages: string[] = [];
    yield* command.pipe(
      Effect.provideService(Console.Console, {
        ...console,
        log: (...values: readonly unknown[]) => {
          messages.push(values.map(String).join(" "));
        },
      }),
    );
    if (messages.length)
      yield* response(
        "json",
        TextResponse,
        { generated_at: iso(nowInstant()), text: messages.join("\n") },
        "",
      );
  } else yield* command;
}).pipe(
  Effect.provide(BunServices.layer),
  Effect.catch((error) =>
    Effect.sync(() => {
      const cause = error instanceof StoreError ? error.cause : error;
      const mapped =
        cause instanceof SnapshotError
          ? new CommandError(
              cause.code === "not_found" ? 3 : 2,
              cause.code,
              cause.message,
            )
          : authFailure(error);
      const failure =
        mapped instanceof CommandError
          ? mapped
          : new CommandError(
              CliError.isCliError(error) ? 2 : 1,
              CliError.isCliError(error) ? "invalid_args" : "runtime_error",
              CliError.isCliError(error) && error._tag === "ShowHelp"
                ? error.errors.map((error) => error.message).join("; ") ||
                    "a subcommand is required; run todo --help"
                : String(error),
            );
      (format === "json" && !follow ? process.stdout : process.stderr).write(
        renderError(
          failure.code,
          failure.message,
          follow ? "json" : format,
          nowInstant(),
          failure.latest,
        ),
      );
      process.exitCode = failure.exit;
    }),
  ),
);
await Effect.runPromise(program);
