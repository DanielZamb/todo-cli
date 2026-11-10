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
import { homedir, userInfo } from "node:os";
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
  type AccessRequest,
  AttachManyItem,
  AttachManyReport,
  AttachManyRequest,
  type AuthAction,
  BatchEdgeReport,
  BatchEdgeRequest,
  BatchEditReport,
  BatchEditRequest,
  batchDepend,
  batchEditTasks,
  ClientReads,
  CreateTask,
  DeleteTask,
  DependencyCommands,
  DependRequest,
  Discovery,
  EdgeReport,
  edgeFailure,
  exitStatus,
  GraphReport,
  inputLimits,
  LookupQuery,
  LookupResponse,
  ProfileDeletionReport,
  ProfileListResponse,
  parseQuickAdd,
  QuickAddDraft,
  QuickAddInput,
  RevertTask,
  readGraph,
  SearchTooBroad,
  SnapshotError,
  TaskFilters,
  TaskId,
  TaskStatus,
  taskLookupError,
  Version,
} from "@todo/domain";
import { attachmentInput } from "@todo/domain/attachment-input";
import { attachmentCopyStats } from "@todo/domain/attachment-store";
import { AttachmentCommands } from "@todo/domain/attachments";
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
  revertTarget,
  revertTask,
  type TaskFlags,
  taskFlags,
} from "@todo/domain/commands";
import { importTasks } from "@todo/domain/import";
import {
  encodeResponse,
  type Format,
  iso,
  obsidianProjection,
  projectionDependencies,
  renderError,
  renderExport,
  renderHistory,
  renderList,
  renderReview,
  renderTask,
  TaskResponse,
  taskView,
} from "@todo/domain/presentation";
import { type OperationStore, openStore, StoreError } from "@todo/domain/store";
import { Console, Effect, Option, Redacted, Schema, Struct } from "effect";
import { Argument, CliError, Command, Flag, Prompt } from "effect/cli";
import "./diagnostics.schema.ts";
import { AttachmentCommandResponse } from "./attachments.schema.ts";
import {
  attachmentStatus,
  changeAttachment,
  labelAttachment,
  withAttachmentStatus,
} from "./attachments.ts";
import {
  credentialProfileName,
  loadCredential,
  credentialFile as sessionFile,
  validateProfileSelectors,
} from "./credential-profile.ts";
import { diagnosticsOutput, diagnosticsRead } from "./diagnostics.ts";
import { directoryOutput, lookupOutput } from "./discovery.ts";
import { manualPage, withGuide } from "./help.ts";
import { makeImportCommand, readImportFile, renderImport } from "./import.ts";
import { decodeInput } from "./input.ts";
import { verifyMacPassword } from "./macos-password.ts";
import { resolveProfile } from "./profile-selection.ts";
import {
  ConfigResponse,
  commandNames,
  commandSchema,
  IdentityResponse,
  inputNames,
  PassphraseResetResponse,
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
import { isTerminalUnsafe, runTop } from "./top.ts";
import { TransferResponse, type TransferResult } from "./transfer-schema.ts";

// Task content can come from imports and agents. Output writes terminal control
// characters (escape sequences, BEL, carriage return) and bidi or invisible
// formatting characters as visible \uXXXX escapes, keeping tab and newline.
// Inside JSON strings that escape decodes to the original character, so JSON
// output stays lossless.
const terminalSafe = (text: string) => {
  let safe = "";
  for (const character of text) {
    const code = character.codePointAt(0) ?? 0;
    safe +=
      code !== 9 && code !== 10 && isTerminalUnsafe(code)
        ? `\\u${code.toString(16).padStart(4, "0")}`
        : character;
  }
  return safe;
};
const write = (text: string) =>
  Effect.sync(() => {
    process.stdout.write(terminalSafe(text));
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
        : error instanceof SearchTooBroad
          ? new CommandError(2, error.code, error.message)
          : new CommandError(1, "runtime_error", String(error)),
  });
const localDir = join(homedir(), ".todo-cli");
const Config = Schema.Struct({ db_path: Schema.optionalKey(Schema.String) });
const loadConfig = () =>
  existsSync(join(localDir, "config.json"))
    ? Schema.decodeUnknownSync(Config)(
        JSON.parse(readFileSync(join(localDir, "config.json"), "utf8")),
      )
    : {};
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
    credentialProfile: stringFlag("credential-profile").pipe(Flag.optional),
    noColor: bool("no-color"),
    helpHuman: bool("help-human-flag"),
  }),
);
type Settings = Effect.Success<typeof root>;
const withStore = <A, E, R>(
  cfg: Settings,
  action: AuthAction,
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
    return yield* Effect.acquireUseRelease(
      openStore({ path }),
      (store) =>
        use(store).pipe(
          Effect.catch((error) =>
            Effect.gen(function* () {
              if (
                !(error instanceof CommandError) ||
                error.code !== "not_found" ||
                error.task_id === undefined
              )
                return yield* Effect.fail(error);
              const request = yield* selectProfile(store, cfg, action);
              const context = yield* cliLookupError(
                store,
                cfg,
                request,
                error.task_id,
                action,
              );
              return yield* Effect.fail(
                new CommandError(
                  error.exit,
                  error.code,
                  context.message,
                  error.latest,
                  context.details,
                ),
              );
            }),
          ),
        ),
      (store) => Effect.orDie(store.close()),
    );
  });
const access = (cfg: Settings) =>
  io(() => ({
    credential: loadCredential(cfg),
    profile: profileId(cfg.profile),
  }));
const selectProfile = Effect.fn(function* (
  store: OperationStore,
  cfg: Settings,
  action: AuthAction,
) {
  const credential = yield* io(() => loadCredential(cfg));
  const profile = yield* resolveProfile(store, {
    credential,
    profile: cfg.profile,
    action,
  });
  return { credential, profile: profile.id };
});
const cliLookupError = (
  store: OperationStore,
  cfg: Settings,
  request: AccessRequest,
  task_id: string,
  action: AuthAction,
) =>
  taskLookupError(store, request, task_id, "cli", {
    credentialProfile: credentialProfileName(cfg),
    action,
  });
const cliLookupRowError = Effect.fn(function* <
  E extends {
    readonly code: string;
    readonly message: string;
    readonly details?: object;
  },
>(
  store: OperationStore,
  cfg: Settings,
  request: AccessRequest,
  task_id: string | null,
  error: E,
) {
  if (error.code !== "not_found" || task_id === null) return error;
  const context = yield* cliLookupError(
    store,
    cfg,
    request,
    task_id,
    "authenticate",
  );
  return {
    ...error,
    ...context,
    details: { ...error.details, ...context.details },
  };
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
      if (input.password)
        yield* Effect.sync(() =>
          process.stderr.write(
            "warning: --password is visible in shell history and process lists; prefer --password-stdin\n",
          ),
        );
      const password = input.passwordStdin
        ? yield* io(() => readFileSync(0, "utf8").split("\n")[0]?.trim() ?? "")
        : input.password;
      if (input.passwordStdin && !password)
        return yield* Effect.fail(
          new CommandError(2, "invalid_args", "no password provided on stdin"),
        );
      yield* withStore(cfg, "setupOwner", (store) =>
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
      yield* withStore(cfg, "signIn", (store) =>
        Effect.gen(function* () {
          const result = yield* store.auth.signIn(password);
          yield* ensureProfile(store, cfg.profile);
          yield* io(() => {
            writeFileSync(
              sessionFile(credentialProfileName(cfg)),
              JSON.stringify({ token: result.credential }),
              { mode: 0o600 },
            );
            chmodSync(sessionFile(credentialProfileName(cfg)), 0o600);
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
const resetPassphrase = Command.make(
  "reset-passphrase",
  { passwordStdin: bool("password-stdin") },
  (input) =>
    Effect.gen(function* () {
      const cfg = yield* root;
      const interactive =
        process.stdin.isTTY && !input.passwordStdin && cfg.format !== "json";
      if (!interactive && !input.passwordStdin)
        return yield* Effect.fail(
          new CommandError(
            2,
            "invalid_args",
            "pass --password-stdin with the macOS account password on the first line and the new owner passphrase on the second",
          ),
        );
      const secrets = interactive
        ? yield* Effect.gen(function* () {
            const account = Redacted.value(
              yield* Prompt.Password({
                message: `macOS login password for ${userInfo().username}`,
              }),
            );
            const next = Redacted.value(
              yield* Prompt.Password({ message: "New owner passphrase" }),
            );
            const again = Redacted.value(
              yield* Prompt.Password({ message: "Repeat the new passphrase" }),
            );
            if (next !== again)
              return yield* Effect.fail(
                new CommandError(
                  2,
                  "invalid_args",
                  "the two new passphrases differ",
                ),
              );
            return { account, next };
          })
        : yield* io(() => {
            const [account = "", next = ""] = readFileSync(0, "utf8")
              .split("\n")
              .map((line) => line.replace(/\r$/, ""));
            return { account, next };
          });
      if (!secrets.account || !secrets.next)
        return yield* Effect.fail(
          new CommandError(
            2,
            "invalid_args",
            "both the macOS account password and the new owner passphrase are required",
          ),
        );
      const verified = yield* Effect.promise(() =>
        verifyMacPassword(secrets.account),
      );
      if (!verified)
        return yield* Effect.fail(
          new CommandError(
            3,
            "auth_required",
            "macOS did not accept that login password for this account",
          ),
        );
      yield* withStore(cfg, "resetPassphrase", (store) =>
        Effect.gen(function* () {
          const result = yield* store.auth.resetPassphrase(secrets.next);
          yield* response(
            cfg.format,
            PassphraseResetResponse,
            {
              generated_at: iso(nowInstant()),
              status: "passphrase_reset",
              sessions_revoked: result.sessions_revoked,
            },
            `owner passphrase reset; ${result.sessions_revoked} Session${result.sessions_revoked === 1 ? "" : "s"} revoked. Run todo login.\n`,
          );
        }),
      );
    }),
).pipe(withGuide("reset-passphrase"));
const logout = Command.make("logout", {}, () =>
  Effect.gen(function* () {
    const cfg = yield* root;
    if (Option.isSome(cfg.credentialProfile))
      yield* io(() => loadCredential(cfg));
    if (existsSync(sessionFile(credentialProfileName(cfg))))
      yield* withStore(cfg, "signOut", (store) =>
        Effect.gen(function* () {
          const request = yield* access(cfg);
          yield* store.auth.signOut({ credential: request.credential });
          yield* io(() => rmSync(sessionFile(credentialProfileName(cfg))));
        }),
      );
    yield* status(cfg.format, "logged_out", "logged out\n");
  }),
).pipe(withGuide("logout"));
const whoami = Command.make("whoami", {}, () =>
  Effect.gen(function* () {
    const cfg = yield* root;
    yield* withStore(cfg, "authenticate", (store) =>
      Effect.gen(function* () {
        const request = yield* selectProfile(store, cfg, "authenticate");
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
  // Unquoted words join with single spaces, so `todo parse buy milk` works.
  { words: Argument.String("text").pipe(Argument.variadic({ min: 1 })) },
  ({ words }) =>
    Effect.gen(function* () {
      const cfg = yield* root;
      const draft = yield* quickDraft(words.join(" "));
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
    dependsOn: stringFlag("depends-on").pipe(Flag.atLeast(0)),
    attach: stringFlag("attach").pipe(Flag.atLeast(0)),
    link: stringFlag("link").pipe(Flag.atLeast(0)),
    label: stringFlag("label").pipe(Flag.optional),
    // Unquoted words join with single spaces, so `todo add buy milk` works.
    titleWords: Argument.String("title").pipe(Argument.variadic()),
    parse: stringFlag("parse").pipe(Flag.optional),
  },
  (input) =>
    Effect.gen(function* () {
      const cfg = yield* root;
      const titleArg =
        input.titleWords.length > 0
          ? Option.some(input.titleWords.join(" "))
          : Option.none<string>();
      if (Option.isSome(titleArg) === Option.isSome(input.parse))
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
      const dependencies = yield* decodeInput(
        () =>
          Schema.decodeUnknownSync(
            Schema.Struct({ depends_on: CreateTask.fields.depends_on }),
          )({ depends_on: input.dependsOn }),
        `--depends-on requires distinct nonempty Task ids, at most 13 and at most ${inputLimits.id} characters each. Choose visible Tasks in this Profile and retry.`,
      );
      yield* withStore(cfg, "mutate", (store) =>
        Effect.gen(function* () {
          const request = yield* selectProfile(store, cfg, "mutate");
          const result = yield* createTask(
            store,
            request,
            {
              ...flags,
              title: draft?.title ?? Option.getOrElse(titleArg, () => ""),
            },
            draft,
            yield* Effect.try({
              try: () => [
                ...input.attach.map((path) =>
                  attachmentInput(
                    path,
                    "file",
                    Option.getOrUndefined(input.label),
                  ),
                ),
                ...input.link.map((uri) =>
                  attachmentInput(
                    uri,
                    "link",
                    Option.getOrUndefined(input.label),
                  ),
                ),
              ],
              catch: (error) =>
                new CommandError(2, "invalid_args", String(error)),
            }),
            dependencies.depends_on,
          );
          const data = yield* readTasks(store, request);
          yield* write(
            renderTask(
              withAttachmentStatus(
                taskView(result.task, data.projects, data.tags, data.series),
                result.task.attachments ?? [],
              ),
              cfg.format,
              nowInstant(),
              result.dependency_warnings,
            ),
          );
        }),
      );
    }),
).pipe(withGuide("add"));
const list = Command.make(
  "list",
  {
    ready: bool("ready"),
    blocked: bool("blocked"),
    order: string("order"),
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
    text: stringFlag("text").pipe(Flag.optional),
    prefix: stringFlag("prefix").pipe(Flag.optional),
    energy: string("energy"),
    estimate: string("estimate"),
  },
  (input) =>
    Effect.gen(function* () {
      const cfg = yield* root;
      const { text, prefix, ...otherInput } = input;
      const filterInput = {
        ...Object.fromEntries(
          Object.entries(otherInput).filter(
            ([key, value]) =>
              key !== "today" &&
              key !== "overdue" &&
              key !== "inbox" &&
              value !== "" &&
              value !== false,
          ),
        ),
        ...Option.match(text, {
          onNone: () => ({}),
          onSome: (text) => ({ text }),
        }),
        ...Option.match(prefix, {
          onNone: () => ({}),
          onSome: (prefix) => ({ prefix }),
        }),
      };
      for (const name of ["text", "prefix"] as const) {
        if (
          filterInput[name] !== undefined &&
          !Schema.is(TaskFilters)({ [name]: filterInput[name] })
        )
          return yield* Effect.fail(
            new CommandError(
              2,
              "invalid_args",
              name === "text"
                ? `--text must be at most ${inputLimits.searchText} UTF-16 code units`
                : "--prefix must contain 1 to 36 hex digits or hyphens",
            ),
          );
      }
      const filters = yield* Effect.try({
        try: () => Schema.decodeUnknownSync(TaskFilters)(filterInput),
        catch: (error) =>
          new CommandError(
            2,
            "invalid_args",
            `Invalid Task filters: ${String(error)}`,
          ),
      });
      yield* withStore(cfg, "read", (store) =>
        Effect.gen(function* () {
          const request = yield* selectProfile(store, cfg, "read");
          const data = yield* readTasks(store, request, filters).pipe(
            Effect.mapError((error) =>
              error instanceof SearchTooBroad
                ? new CommandError(2, error.code, error.message)
                : error,
            ),
            Effect.catchDefect((error) =>
              Effect.fail(new CommandError(1, "runtime_error", String(error))),
            ),
          );
          yield* write(
            renderList(
              filterTasks(
                data.views,
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
                Object.entries({
                  ...filterInput,
                  today: input.today,
                  overdue: input.overdue,
                  inbox: input.inbox,
                }).flatMap(([key, value]) =>
                  typeof value === "string" || value === true
                    ? [[key, String(value)]]
                    : [],
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
        yield* withStore(cfg, "authenticate", (store) =>
          Effect.gen(function* () {
            const request = yield* selectProfile(store, cfg, "authenticate");
            const destination = yield* resolveProfile(
              store,
              {
                credential: request.credential,
                profile: input.to,
                action: "authenticate",
              },
              "target Profile not found; run todo init --profile <name>",
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
                  ...(yield* cliLookupError(
                    store,
                    cfg,
                    request,
                    id,
                    "authenticate",
                  )),
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
                      ...(result.removed_dependencies
                        ? { removed_dependencies: result.removed_dependencies }
                        : {}),
                      ...(result.affected_versions
                        ? { affected_versions: result.affected_versions }
                        : {}),
                    }
                  : {
                      ...(result.outcome === "not-found"
                        ? yield* cliLookupError(
                            store,
                            cfg,
                            request,
                            id,
                            "authenticate",
                          )
                        : {}),
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
                      ...(result.outcome === "rejected" &&
                      (result.dependency_error || result.details)
                        ? {
                            details:
                              result.dependency_error?.details ??
                              result.details,
                          }
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
            const exit = conflict
              ? 4
              : results.some((r) => r.outcome === "not-found")
                ? 3
                : 2;
            const report = {
              generated_at: iso(nowInstant()),
              dry_run: input.dryRun,
              results,
              ...(failed
                ? {
                    ...exitStatus(exit),
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
                        `${r.source_id}: ${r.outcome}${r.message ? `: ${r.message}` : ""}${r.target_id ? ` -> ${r.target_id}` : ""}${r.occurrence_as_plain_task ? " (Occurrence becomes a plain Task)" : ""}${r.current_version ? ` (current Version ${r.current_version})` : ""}${r.managed_image_count === undefined ? "" : ` (${r.managed_image_count} managed images, ${r.managed_image_bytes} bytes)`}${r.removed_dependencies?.map((edge) => `\n${edge.dependent_id} depended on ${edge.blocker_id}`).join("") ?? ""}`,
                    )
                    .join("\n") +
                    "\n" +
                    (failed
                      ? `error ${exit} - ${exitStatus(exit).exit_meaning}\n`
                      : ""),
            );
            if (failed) process.exitCode = exit;
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
      yield* withStore(cfg, "read", (store) =>
        Effect.gen(function* () {
          const data = yield* readTasks(
            store,
            yield* selectProfile(store, cfg, "read"),
          );
          const task = data.views.find((t) => t.id === id);
          if (!task)
            return yield* Effect.fail(
              new CommandError(
                3,
                "not_found",
                "task not found",
                undefined,
                undefined,
                id,
              ),
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
registerCommandSchema("batch-edit", BatchEditReport);
registerCommandSchema("batch-edit-input", BatchEditRequest, "input");
const batchEditCommand = Command.make(
  "batch-edit",
  { file: Argument.String("file"), dryRun: bool("dry-run") },
  (input) =>
    Effect.gen(function* () {
      const cfg = yield* root;
      yield* withStore(cfg, "authenticate", (store) =>
        Effect.gen(function* () {
          const request = yield* selectProfile(store, cfg, "authenticate");
          const body = yield* Effect.try({
            try: () =>
              Schema.decodeUnknownSync(BatchEditRequest, {
                onExcessProperty: "error",
              })(
                JSON.parse(
                  readFileSync(input.file === "-" ? 0 : input.file, "utf8"),
                ),
              ),
            catch: (error) =>
              new CommandError(
                2,
                "invalid_args",
                `Cannot read batch edit. Supply Task ids, from_version and one shared changes field. Check todo schema batch-edit-input. ${String(error)}`,
              ),
          });
          const result = yield* batchEditTasks(store, request, {
            ...body,
            dry_run: input.dryRun || body.dry_run || false,
          });
          const report = {
            ...result,
            items: yield* Effect.forEach(result.items, (row) =>
              Effect.gen(function* () {
                return row.error
                  ? {
                      ...row,
                      error: yield* cliLookupRowError(
                        store,
                        cfg,
                        request,
                        row.task_id,
                        row.error,
                      ),
                    }
                  : row;
              }),
            ),
          };
          yield* write(
            cfg.format === "json"
              ? encodeResponse(BatchEditReport, report)
              : `${report.dry_run ? "Dry run\n" : ""}${report.items.map((row) => `${row.task_id}\t${row.outcome}\t${row.error ? `${row.error.message}\nerror ${row.error.exit_code} - ${row.error.exit_meaning}` : `Version ${row.current_version}`}`).join("\n")}\n`,
          );
          if (report.totals.rejected)
            process.exitCode = report.items.some(
              (row) => row.error?.code === "occ_conflict",
            )
              ? 4
              : report.items.some((row) => row.error?.code === "not_found")
                ? 3
                : 2;
        }),
      );
    }),
).pipe(withGuide("batch-edit"));
registerCommandSchema("attach-many", AttachManyReport);
registerCommandSchema(
  "attach-many-input",
  Schema.Struct({
    items: Schema.Array(AttachManyItem),
    dry_run: Schema.optionalKey(Schema.Boolean),
  }),
  "input",
);
const attachManyCommand = Command.make(
  "attach-many",
  { file: Argument.String("file"), dryRun: bool("dry-run") },
  (input) =>
    Effect.gen(function* () {
      const cfg = yield* root;
      yield* withStore(cfg, "authenticate", (store) =>
        Effect.gen(function* () {
          const request = yield* selectProfile(store, cfg, "authenticate");
          const requestBody = yield* Effect.try({
            try: () =>
              Schema.decodeUnknownSync(AttachManyRequest, {
                onExcessProperty: "error",
              })(
                JSON.parse(
                  readFileSync(input.file === "-" ? 0 : input.file, "utf8"),
                ),
              ),
            catch: (error) =>
              new CommandError(
                2,
                "invalid_args",
                `Cannot read Attachment batch: ${String(error)}`,
              ),
          });

          const result = yield* new AttachmentCommands(store).attachMany(
            request,
            {
              ...requestBody,
              dry_run: input.dryRun || (requestBody.dry_run ?? false),
            },
          );
          const report = {
            ...result,
            items: yield* Effect.forEach(result.items, (row) =>
              Effect.gen(function* () {
                return row.error
                  ? {
                      ...row,
                      error: yield* cliLookupRowError(
                        store,
                        cfg,
                        request,
                        row.task_id,
                        row.error,
                      ),
                    }
                  : row;
              }),
            ),
          };
          yield* write(
            cfg.format === "json"
              ? encodeResponse(AttachManyReport, report)
              : `${report.dry_run ? "Dry run\n" : ""}${report.items.map((row) => `${row.task_id ?? "?"}\t${row.outcome}\t${row.error ? `${row.error.message}\nerror ${row.error.exit_code} - ${row.error.exit_meaning}` : row.attached}`).join("\n")}\n`,
          );
          if (report.totals.rejected)
            process.exitCode = report.items.some(
              (row) => row.error?.code === "occ_conflict",
            )
              ? 4
              : 2;
        }),
      );
    }),
).pipe(withGuide("attach-many"));
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
        const dryRun = "dryRun" in input && input.dryRun === true;
        yield* withStore(cfg, dryRun ? "authenticate" : "mutate", (store) =>
          Effect.gen(function* () {
            const request = yield* selectProfile(
              store,
              cfg,
              dryRun ? "authenticate" : "mutate",
            );
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
      yield* withStore(cfg, "mutate", (store) =>
        Effect.gen(function* () {
          const request = yield* selectProfile(store, cfg, "mutate");
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
      yield* withStore(cfg, "read", (store) =>
        Effect.gen(function* () {
          const request = yield* selectProfile(store, cfg, "read");
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
      withDependencies: bool("with-dependencies"),
      dryRun: bool("dry-run"),
      fingerprint: stringFlag("dependency-fingerprint").pipe(Flag.optional),
    },
    (input) =>
      Effect.gen(function* () {
        const cfg = yield* root;
        const suppliedFingerprint = Option.getOrUndefined(input.fingerprint);
        if (name === "rm")
          yield* decodeInput(
            () =>
              Schema.decodeUnknownSync(
                Schema.Struct({
                  task_id: TaskId,
                  ...Struct.omit(DeleteTask.fields, ["from_version"]),
                }),
              )({
                task_id: input.id,
                with_dependencies: input.withDependencies,
                dry_run: input.dryRun,
                ...(suppliedFingerprint !== undefined
                  ? { dependency_fingerprint: suppliedFingerprint }
                  : {}),
              }),
            "rm requires a nonempty task-id, --expected-version <positive integer> and, when supplied, --dependency-fingerprint <64 lowercase hex characters>. Preview with --dry-run, then retry with the current Version and confirmation.",
          );
        yield* withStore(cfg, "mutate", (store) =>
          Effect.gen(function* () {
            const request = yield* selectProfile(store, cfg, "mutate");
            let fingerprint = suppliedFingerprint ?? "";
            let withDependencies = input.withDependencies;
            if (
              name === "rm" &&
              !input.force &&
              !input.dryRun &&
              !withDependencies &&
              cfg.format === "md" &&
              process.stdin.isTTY &&
              process.stdout.isTTY
            ) {
              const preview = yield* mutateTask(
                store,
                request,
                name,
                input.id,
                input.expected,
                taskInput(input),
                false,
                { dry_run: true },
              );
              if (preview.removed_dependencies?.length) {
                const data = yield* readTasks(store, request);
                const title = (id: string) =>
                  data.tasks.find((task) => task.id === id)?.title ?? id;
                yield* write(
                  `${preview.removed_dependencies.map((edge) => `${title(edge.dependent_id)} depends on ${title(edge.blocker_id)} (${edge.dependent_id} <- ${edge.blocker_id})`).join("\n")}\n`,
                );
                const confirmed = yield* Prompt.run(
                  Prompt.Confirm({
                    message: "Delete Task and remove these Dependencies?",
                    initial: false,
                    placeholder: { defaultDeny: "[y/N]" },
                  }),
                ).pipe(Effect.catch(() => Effect.succeed(false)));
                if (!confirmed)
                  return yield* status(cfg.format, "cancelled", "Cancelled\n");
                withDependencies = true;
              }
              fingerprint = preview.dependency_fingerprint ?? "";
            }
            const result = yield* mutateTask(
              store,
              request,
              name,
              input.id,
              input.expected,
              taskInput(input),
              input.force,
              {
                with_dependencies: withDependencies,
                dry_run: input.dryRun,
                ...(fingerprint ? { dependency_fingerprint: fingerprint } : {}),
              },
            );
            if (name === "rm") {
              if (input.force) {
                if (input.dryRun)
                  return yield* response(
                    cfg.format,
                    StatusResponse,
                    {
                      generated_at: iso(nowInstant()),
                      status: "would_purge",
                      dry_run: true,
                    },
                    "Dry run: would Purge Task\n",
                  );
                return yield* status(cfg.format, "deleted", "deleted\n");
              }
              const report = {
                generated_at: nowInstant(),
                task: result.task,
                removed_dependencies: result.removed_dependencies ?? [],
                affected_versions: result.affected_versions ?? [],
                dependency_fingerprint: result.dependency_fingerprint ?? "",
                dry_run: result.dry_run ?? false,
              };
              return yield* write(
                cfg.format === "json"
                  ? JSON.stringify({ ...report, status: "deleted" }) + "\n"
                  : `${input.dryRun ? "Dry run\n" : "deleted\n"}${report.removed_dependencies.map((edge) => `${edge.dependent_id} depended on ${edge.blocker_id}\n`).join("")}`,
              );
            }
            const data = yield* readTasks(store, request);
            const task = data.views.find((t) => t.id === input.id);
            if (task) yield* write(renderTask(task, cfg.format, nowInstant()));
          }),
        );
      }),
  ).pipe(withGuide(name));
let graphMermaidOutput = false;
registerCommandSchema("depend", EdgeReport);
registerCommandSchema("undepend", EdgeReport);
registerCommandSchema("depend-input", DependRequest, "input");
registerCommandSchema("list-input", TaskFilters, "input");
registerCommandSchema("add-input", CreateTask, "input");
registerCommandSchema("rm-input", DeleteTask, "input");
registerCommandSchema("undepend-input", DependRequest, "input");
registerCommandSchema("graph", GraphReport);
registerCommandSchema("batch-depend", BatchEdgeReport);
registerCommandSchema("batch-depend-input", BatchEdgeRequest, "input");
registerCommandSchema("revert", TaskResponse);
const dependencyCommand = (action: "depend" | "undepend") =>
  Command.make(
    action,
    {
      id: Argument.String("task-id"),
      blocker: stringFlag(action === "depend" ? "on" : "from"),
      expected: Flag.Int("expected-version").pipe(Flag.withDefault(0)),
    },
    (input) =>
      Effect.gen(function* () {
        const cfg = yield* root;
        const { task_id, ...parsed } = yield* decodeInput(
          () =>
            Schema.decodeUnknownSync(
              Schema.Struct({ task_id: TaskId, ...DependRequest.fields }),
            )({
              task_id: input.id,
              blocker_id: input.blocker,
              from_version: input.expected,
            }),
          `${action} requires a nonempty task-id, --${action === "depend" ? "on" : "from"} <nonempty blocker-id, at most ${inputLimits.id} characters> and --expected-version <positive integer>. Choose visible Tasks in the same Profile and retry.`,
        );
        yield* withStore(cfg, "mutate", (store) =>
          Effect.gen(function* () {
            const request = yield* selectProfile(store, cfg, "mutate");
            const result = yield* new DependencyCommands(store).change(
              {
                ...request,
                task_id,
              },
              parsed,
              action,
            );
            if (result.outcome === "rejected") {
              const data = yield* readTasks(store, request);
              const failure = edgeFailure(result, nowInstant());
              return yield* Effect.fail(
                new CommandError(
                  failure.exit_code,
                  result.reason === "conflict"
                    ? "occ_conflict"
                    : failure.error.code,
                  failure.error.message,
                  result.latest
                    ? taskView(
                        result.latest,
                        data.projects,
                        data.tags,
                        data.series,
                      )
                    : undefined,
                  undefined,
                  undefined,
                  result.dependency_error,
                ),
              );
            }
            yield* write(
              cfg.format === "json"
                ? encodeResponse(EdgeReport, result.report)
                : `${result.report.outcome}: ${result.report.dependent_id} depends on ${result.report.blocker_id}\n${result.report.warnings.map((w) => `${w.message}\n`).join("")}`,
            );
          }),
        );
      }),
  ).pipe(withGuide(action));
const graphCommand = Command.make(
  "graph",
  { id: Argument.String("task-id") },
  (input) =>
    Effect.gen(function* () {
      const cfg = yield* root;
      const task_id = yield* decodeInput(
        () => Schema.decodeUnknownSync(TaskId)(input.id),
        "graph requires a nonempty task-id. Read todo list and retry with a full Task id.",
      );
      if (cfg.format === "table")
        return yield* Effect.fail(
          new CommandError(
            2,
            "invalid_args",
            "graph accepts json, md or mermaid. Choose --format json, md or mermaid.",
          ),
        );
      yield* withStore(cfg, "read", (store) =>
        Effect.gen(function* () {
          const request = yield* selectProfile(store, cfg, "read");
          const graph = yield* readGraph(
            store,
            { ...request, task_id },
            nowInstant(),
          );
          if (!graph)
            return yield* Effect.fail(
              new CommandError(
                3,
                "not_found",
                "Task not found. Read todo list and select again.",
                undefined,
                undefined,
                task_id,
              ),
            );
          yield* write(
            graphMermaidOutput
              ? graph.mermaid
              : cfg.format === "json"
                ? encodeResponse(GraphReport, graph)
                : `# Task graph\n\n${graph.shape}${graph.shape === "tree" ? ` (${graph.orientation})` : ""}\n\nRequested Task: ${graph.task_id}\nAncestors: ${graph.ancestors.join(", ") || "none"}\nDescendants: ${graph.descendants.join(", ") || "none"}\nReady next: ${graph.lightest_next.join(", ") || "none"}\n\n\`\`\`mermaid\n${graph.mermaid}\`\`\`\n\n${graph.nodes.map((n) => `- ${n.task.title} (${n.task.id}), ${n.ready ? "Ready" : n.blocked ? "Blocked" : n.task.status}, remaining energy ${n.remaining_energy.energy}, unweighted ${n.remaining_energy.unweighted}\n`).join("")}`,
          );
        }),
      );
    }),
).pipe(withGuide("graph"));
const batchDependCommand = Command.make(
  "batch-depend",
  { file: stringFlag("file"), dryRun: bool("dry-run") },
  (input) =>
    Effect.gen(function* () {
      const cfg = yield* root;
      const text = yield* io(() =>
        readFileSync(input.file === "-" ? 0 : input.file, "utf8"),
      );
      const body = yield* decodeInput(
        () =>
          Schema.decodeUnknownSync(BatchEdgeRequest, {
            onExcessProperty: "error",
          })(JSON.parse(text)),
        "Invalid --file input. Supply a JSON object with items containing action depend|undepend, nonempty dependent_id/blocker_id and a positive integer from_version. Check todo schema batch-depend-input, fix the file and retry.",
      );
      yield* withStore(cfg, "authenticate", (store) =>
        Effect.gen(function* () {
          const report = yield* batchDepend(
            store,
            yield* selectProfile(store, cfg, "authenticate"),
            { ...body, dry_run: input.dryRun || body.dry_run || false },
          );
          yield* write(
            cfg.format === "json"
              ? encodeResponse(BatchEdgeReport, report)
              : `${report.dry_run ? "Dry run\n" : ""}${report.results.map((row) => `${row.index}: ${"result" in row ? row.result.outcome : row.error.message}`).join("\n")}\n`,
          );
          process.exitCode = Math.max(
            0,
            ...report.results.map((row) =>
              "error" in row ? row.exit_code : 0,
            ),
          );
        }),
      );
    }),
).pipe(withGuide("batch-depend"));
const revertCommand = Command.make(
  "revert",
  {
    seq: Argument.Int("seq"),
    expected: Flag.Int("expected-version").pipe(Flag.withDefault(0)),
  },
  (input) =>
    Effect.gen(function* () {
      const cfg = yield* root;
      const payload = yield* decodeInput(
        () =>
          Schema.decodeUnknownSync(RevertTask)({
            seq: input.seq,
            from_version: input.expected,
          }),
        "revert requires seq and --expected-version to be positive integers. Read todo history <task-id>, then retry with its operation seq and the Task's current Version.",
      );
      yield* withStore(cfg, "mutate", (store) =>
        Effect.gen(function* () {
          const request = yield* selectProfile(store, cfg, "mutate");
          const data = yield* readTasks(store, request);
          const { seq } = payload;
          const entry = data.history.find((entry) => entry.seq === seq);
          const task_id = entry ? revertTarget(entry) : null;
          if (!task_id)
            return yield* Effect.fail(
              new CommandError(
                3,
                "not_found",
                "Operation not found for a Task in this Profile. Read todo history <task-id>.",
              ),
            );
          const result = yield* revertTask(
            store,
            { ...request, task_id },
            payload,
          );
          if (result.outcome === "not-found")
            return yield* Effect.fail(
              new CommandError(
                3,
                "not_found",
                "Task not found. Read todo list.",
              ),
            );
          if (result.outcome === "rejected")
            return yield* Effect.fail(
              new CommandError(
                result.reason === "conflict" ? 4 : 2,
                result.dependency_error?.code ??
                  (result.reason === "conflict"
                    ? "occ_conflict"
                    : result.reason),
                result.dependency_error?.message ??
                  result.message ??
                  "Revert refused. Read the current Task and its History before retrying.",
                result.latest
                  ? taskView(
                      result.latest,
                      data.projects,
                      data.tags,
                      data.series,
                    )
                  : undefined,
                undefined,
                undefined,
                result.dependency_error,
              ),
            );
          const latest = yield* readTasks(store, request);
          yield* write(
            renderTask(
              taskView(
                result.task,
                latest.projects,
                latest.tags,
                latest.series,
              ),
              cfg.format,
              nowInstant(),
            ),
          );
        }),
      );
    }),
).pipe(withGuide("revert"));

const reviewCommand = (period: "daily" | "weekly") =>
  Command.make(period, {}, () =>
    Effect.gen(function* () {
      const cfg = yield* root;
      yield* withStore(cfg, "read", (store) =>
        Effect.gen(function* () {
          const data = yield* readTasks(
            store,
            yield* selectProfile(store, cfg, "read"),
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
      yield* withStore(cfg, "read", (store) =>
        Effect.gen(function* () {
          const data = yield* readTasks(
            store,
            yield* selectProfile(store, cfg, "read"),
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
          yield* withStore(cfg, "read", (store) =>
            Effect.gen(function* () {
              const data = yield* readTasks(
                store,
                yield* selectProfile(store, cfg, "read"),
              );
              const { target, canonicalTarget } = yield* io(() =>
                projectionTarget(input.vault, input.file),
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
                {
                  generated_at: iso(nowInstant()),
                  path: target,
                  ...(projectionDependencies(data.views).outside.length
                    ? {
                        outside_projection: projectionDependencies(data.views)
                          .outside,
                      }
                    : {}),
                },
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
    yield* withStore(cfg, "authenticate", (store) =>
      Effect.gen(function* () {
        const request = yield* selectProfile(store, cfg, "authenticate");
        const items = yield* readImportFile(input.file);
        const result = yield* importTasks(store, request, {
          items,
          file_name: input.file === "-" ? "stdin" : basename(input.file),
          dry_run: input.dryRun,
          close_missing: input.closeMissing,
        });
        const report = {
          ...result,
          items: yield* Effect.forEach(result.items, (row) =>
            Effect.gen(function* () {
              return row.error
                ? {
                    ...row,
                    error: yield* cliLookupRowError(
                      store,
                      cfg,
                      request,
                      row.task_id ?? row.error.details?.task_id ?? null,
                      row.error,
                    ),
                  }
                : row;
            }),
          ),
        };
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
      const credential = yield* io(() => loadCredential(cfg));
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
      const credential = yield* io(() => loadCredential(cfg));
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
registerCommandSchema("lookup", LookupResponse);
const lookup = Command.make(
  "lookup",
  { prefix: stringFlag("prefix") },
  (input) =>
    Effect.gen(function* () {
      const cfg = yield* root;
      if (!Schema.is(LookupQuery)(input))
        return yield* Effect.fail(
          new CommandError(
            2,
            "invalid_args",
            "--prefix must contain 1 to 36 hex digits or hyphens",
          ),
        );
      yield* withStore(cfg, "read", (store) =>
        Effect.gen(function* () {
          const credential = yield* io(() => loadCredential(cfg));
          const matches = yield* new Discovery(store).lookup(credential, input);
          yield* write(
            cfg.format === "json"
              ? encodeResponse(LookupResponse, {
                  generated_at: nowInstant(),
                  prefix: input.prefix,
                  matches,
                })
              : lookupOutput(matches, cfg.format, credentialProfileName(cfg)),
          );
        }),
      );
    }),
).pipe(withGuide("lookup"));
registerCommandSchema("profile", TextResponse);
registerCommandSchema("profile list", ProfileListResponse);
registerCommandSchema("profile delete", ProfileDeletionReport);
const profiles = Command.make("profile").pipe(
  Command.withSubcommands([
    Command.make("list", { projects: bool("projects") }, (input) =>
      Effect.gen(function* () {
        const cfg = yield* root;
        yield* withStore(cfg, "read", (store) =>
          Effect.gen(function* () {
            const credential = yield* io(() => loadCredential(cfg));
            const profiles = yield* input.projects
              ? new Discovery(store).directory(credential)
              : new ClientReads(store).profiles(credential);
            yield* write(
              cfg.format === "json"
                ? encodeResponse(ProfileListResponse, {
                    generated_at: nowInstant(),
                    profiles,
                  })
                : input.projects
                  ? directoryOutput(profiles)
                  : profiles
                      .map(
                        (p) =>
                          `- ${p.name} (${p.visible_task_count ?? 0} Tasks)`,
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
          yield* withStore(cfg, "deleteProfile", (store) =>
            Effect.gen(function* () {
              const credential = yield* io(() => loadCredential(cfg));
              const target = yield* resolveProfile(store, {
                credential,
                profile: input.name,
                action: "deleteProfile",
              });
              const result = yield* store.auth.deleteProfile({
                credential,
                profile: target.id,
                options: { with_tasks: input.withTasks, dry_run: input.dryRun },
              });
              if (result.outcome === "refused") {
                yield* write(
                  renderError(
                    result.error.code === "not_found" ? 3 : 2,
                    result.error.code,
                    result.error.message,
                    cfg.format,
                    result.error.generated_at,
                    undefined,
                    result.error.details,
                  ),
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
    yield* withStore(cfg, "authenticate", (store) =>
      Effect.gen(function* () {
        yield* store.auth.requireOwner({
          credential: yield* io(() => loadCredential(cfg)),
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
    resetPassphrase,
    whoami,
    importCommand,
    profiles,
    lookup,
    add,
    parseCommand,
    list,
    show,
    batchEditCommand,
    attachManyCommand,
    attachmentCommand(false),
    attachmentCommand(true),
    labelAttachmentCommand,

    transfer("move"),
    transfer("copy"),
    history,
    dependencyCommand("depend"),
    dependencyCommand("undepend"),
    graphCommand,
    batchDependCommand,
    revertCommand,
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
  // --parse takes the quick-add text, so unquoted words after it belong to it:
  // `todo add --parse buy milk tomorrow` parses "buy milk tomorrow".
  if (arg === "--parse" || arg.startsWith("--parse=")) {
    const inline = arg.startsWith("--parse=");
    const value = inline ? arg.slice("--parse=".length) : rawArgs[index + 1];
    if (value === undefined || (!inline && value.startsWith("--"))) {
      args.push(arg);
      continue;
    }
    const words = [value];
    let end = inline ? index : index + 1;
    for (
      let word = rawArgs[end + 1];
      word !== undefined && !word.startsWith("-");
      word = rawArgs[end + 1]
    ) {
      words.push(word);
      end++;
    }
    args.push(`--parse=${words.join(" ")}`);
    index = end;
    continue;
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
  yield* io(() => validateProfileSelectors(flagArgs, stringFlags));
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
  const firstCommand = flagArgs.find(
    (arg, index) =>
      !arg.startsWith("-") &&
      !stringFlags.has(flagArgs[index - 1] ?? "") &&
      flagArgs[index - 1] !== "--format",
  );
  if (formatValue === "mermaid" && firstCommand === "graph") {
    graphMermaidOutput = true;
    for (let index = 0; index < args.length; index++) {
      if (args[index] === "--format=mermaid") args[index] = "--format=md";
      else if (args[index] === "--format" && args[index + 1] === "mermaid")
        args[index + 1] = "md";
    }
  }
  for (const name of ["ready", "blocked"])
    if (
      flagArgs.includes(`--${name}=false`) ||
      flagArgs.some(
        (arg, index) => arg === `--${name}` && flagArgs[index + 1] === "false",
      )
    )
      return yield* Effect.fail(
        new CommandError(
          2,
          "invalid_args",
          `--${name} accepts true only. Use --blocked or --status for another set of Tasks.`,
        ),
      );
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
        cause instanceof SearchTooBroad
          ? new CommandError(2, cause.code, cause.message)
          : cause instanceof SnapshotError
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
        terminalSafe(
          renderError(
            failure.exit,
            failure.code,
            failure.message,
            follow ? "json" : format,
            nowInstant(),
            failure.dependency_error ? undefined : failure.latest,
            failure.dependency_error?.details ?? failure.details,
          ),
        ),
      );
      process.exitCode = failure.exit;
    }),
  ),
);
await Effect.runPromise(program);
