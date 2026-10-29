import { Database } from "bun:sqlite";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import {
  AuthError,
  FinishTaskRequest,
  Instant,
  Profile,
  ProfileId,
  Series,
  StartSeriesRequest,
  Task,
} from "@todo/domain";
import { openStore, type StoreError } from "@todo/domain/store";
import { Clock, Effect, Schema } from "effect";
import { RRuleTemporal } from "rrule-temporal";

const directory = process.argv[2];
const evidence = process.argv[3];
if (
  !directory ||
  !evidence ||
  !isAbsolute(directory) ||
  !isAbsolute(evidence) ||
  dirname(directory) !== resolve(tmpdir()) ||
  !basename(directory).startsWith("todo-c04-verify-") ||
  resolve(evidence) === resolve(directory) ||
  resolve(evidence).startsWith(`${resolve(directory)}/`)
)
  throw new Error(
    "Usage: verify-auth <fresh temporary todo-c04-verify directory> <absolute evidence directory outside scratch>",
  );
const path = join(directory, "scratch.db");
if (existsSync(path))
  throw new Error("Verification requires a new scratch database");
mkdirSync(evidence, { recursive: true });
const actions: unknown[] = [];
const mark = (action: string, result: unknown) => {
  actions.push({ action, result });
  writeFileSync(
    join(evidence, "actions.json"),
    `${JSON.stringify(actions, null, 2)}\n`,
  );
};
const dump = (stage: string) => {
  writeFileSync(
    join(evidence, `${stage}.sql`),
    execFileSync("sqlite3", [path, ".dump"]),
  );
  mark(`sqlite3 scratch.db .dump ${stage}`, "saved");
};
const modes = () =>
  [path, `${path}-wal`, `${path}-shm`].map(
    (file) => statSync(file).mode & 0o777,
  );
let time = Date.parse("2026-10-27T14:00:00Z");
const instant = Schema.decodeUnknownSync(Instant);
const profile = Schema.decodeUnknownSync(ProfileId)("work");
const personal = Schema.decodeUnknownSync(ProfileId)("personal");
const task = Schema.decodeUnknownSync(Task)({
  id: "task-1",
  profile_id: profile,
  entity_version: 1,
  row_version: 1,
  title: "Write the auth proof",
  description: null,
  status: "open",
  project_id: null,
  priority: "P2",
  scheduled_at: null,
  due_at: null,
  energy: null,
  estimate_min: null,
  source: "verification",
  tags: [],
  occurrence: null,
  created_at: "2026-10-27T14:00:00Z",
  updated_at: "2026-10-27T14:00:00Z",
  completed_at: null,
  deleted_at: null,
});
const created = {
  kind: "TaskCreated",
  entity_version: 1,
  occurred_at: task.created_at,
  task,
  series: null,
  project: null,
  tags: [],
};
const denied = <A>(
  action: string,
  effect: Effect.Effect<A, AuthError | StoreError>,
  detail: AuthError["detail"],
) =>
  Effect.gen(function* () {
    const error = yield* Effect.flip(effect);
    assert.ok(error instanceof AuthError);
    assert.deepEqual([error.code, error.detail], ["auth", detail]);
    mark(action, { code: error.code, detail: error.detail });
  });

const program = Effect.acquireUseRelease(
  openStore({ path }),
  (store) =>
    Effect.gen(function* () {
      assert.deepEqual(yield* store.settings(), {
        journal_mode: "wal",
        busy_timeout: 5000,
        user_version: 6,
      });
      assert.deepEqual(modes(), [0o600, 0o600, 0o600]);
      mark("openStore scratch.db doctor", {
        settings: yield* store.settings(),
        modes: modes(),
      });
      yield* store.auth.setupOwner("compiled scratch passphrase");
      yield* denied(
        "signIn wrong passphrase before any Profile exists",
        store.auth.signIn("wrong scratch secret"),
        "invalid_passphrase",
      );
      const session = yield* store.auth.signIn("compiled scratch passphrase");
      const spareSession = yield* store.auth.signIn(
        "compiled scratch passphrase",
      );
      assert.match(session.credential, /^ses_[a-f0-9]{64}$/);
      assert.equal(session.expires_at, "2026-11-03T14:00:00.000Z");
      mark("setupOwner and signIn", {
        prefix: session.credential.slice(0, 4),
        expires_at: session.expires_at,
      });
      for (const [id, name] of [
        [profile, "Work"],
        [personal, "Personal"],
      ]) {
        yield* store.putProfile(
          Schema.decodeUnknownSync(Profile)({
            id,
            name,
            created_at: task.created_at,
            updated_at: task.created_at,
          }),
        );
      }
      const reader = yield* store.auth.issueToken({
        ...session,
        token: { name: "work reader", profile, scope: "read-only" },
      });
      const writer = yield* store.auth.issueToken({
        ...session,
        token: { name: "work writer", profile, scope: "read-write" },
      });
      const global = yield* store.auth.issueToken({
        ...session,
        token: { name: "all profiles", profile: null, scope: "read-write" },
      });
      const short = yield* store.auth.issueToken({
        ...session,
        token: {
          name: "one day",
          profile,
          scope: "read-only",
          expires_at: instant("2026-10-28T14:00:00Z"),
        },
      });
      assert.match(reader.credential, /^tok_[a-f0-9]{64}$/);
      assert.equal(reader.expires_at, "2027-01-25T14:00:00.000Z");
      const listed = yield* store.auth.listTokens(session);
      assert.deepEqual(
        listed.map((value) => [
          value.name,
          value.profile,
          value.scope,
          "credential" in value,
          "secret_hash" in value,
        ]),
        [
          ["all profiles", null, "read-write", false, false],
          ["one day", "work", "read-only", false, false],
          ["work reader", "work", "read-only", false, false],
          ["work writer", "work", "read-write", false, false],
        ],
      );
      mark("issueToken and listTokens", listed);
      dump("01-issued");
      assert.deepEqual(
        (yield* store.auth.read({ ...reader, profile })).tasks,
        [],
      );
      assert.deepEqual(
        (yield* store.auth.read({ ...global, profile: personal })).profiles.map(
          (value) => value.name,
        ),
        ["Personal"],
      );
      yield* denied(
        "read outside Profile scope",
        store.auth.read({ ...reader, profile: personal }),
        "profile_scope",
      );
      yield* denied(
        "append with read-only Token",
        store.auth.append({ ...reader, profile, event: created }),
        "write_scope",
      );
      yield* denied(
        "listTokens with Access Token",
        store.auth.listTokens(global),
        "owner_required",
      );
      assert.equal(
        (yield* store.auth.append({ ...writer, profile, event: created }))
          .outcome,
        "committed",
      );
      const edited = {
        kind: "TaskEdited",
        entity_version: 1,
        occurred_at: task.updated_at,
        before: task,
        after: { ...task, title: "Ship the auth proof", row_version: 2 },
        series_before: null,
        series_after: null,
        project_before: null,
        project_after: null,
        tags_before: [],
        tags_after: [],
      };
      assert.equal(
        (yield* store.auth.mutate({ ...writer, profile }, (identity) =>
          store.append({ ...identity, event: edited }),
        )).outcome,
        "committed",
      );
      assert.deepEqual(
        (yield* store.auth.read({ ...reader, profile })).tasks.map((value) => [
          value.title,
          value.row_version,
        ]),
        [["Ship the auth proof", 2]],
      );
      mark("authenticated append and shared synchronous mutation", {
        tasks: [["Ship the auth proof", 2]],
        actor: writer.id,
      });
      dump("02-scopes");
      const series = Schema.decodeUnknownSync(Series)({
        id: "auth-series",
        profile_id: profile,
        entity_version: 1,
        row_version: 1,
        recurrence: {
          dtstart: { kind: "date", date: "2026-10-27" },
          rrule: "FREQ=DAILY;COUNT=3",
          exdate: [],
        },
        task: { ...task, title: "Daily auth review" },
        created_at: task.created_at,
        updated_at: task.updated_at,
        deleted_at: null,
      });
      const startRequest = Schema.decodeUnknownSync(StartSeriesRequest)({
        credential: writer.credential,
        profile,
        series,
        task_id: "auth-first",
        occurrence_id: "occ-auth-first",
      });
      const finishRequest = (
        id: string,
        next: string,
        action: "complete" | "cancel" = "complete",
      ) =>
        Schema.decodeUnknownSync(FinishTaskRequest)({
          credential: writer.credential,
          profile,
          task_id: id,
          from_version: 1,
          action,
          next_task_id: next,
          next_occurrence_id: `occ-${next}`,
        });
      const foreignSeries = Schema.decodeUnknownSync(Series)({
        ...series,
        id: "foreign-series",
        profile_id: personal,
      });
      yield* denied(
        "startSeries with read-only Token",
        store.auth.startSeries({
          ...startRequest,
          credential: reader.credential,
        }),
        "write_scope",
      );
      yield* denied(
        "startSeries outside Profile scope",
        store.auth.startSeries({
          ...startRequest,
          profile: personal,
          series: foreignSeries,
        }),
        "profile_scope",
      );
      yield* denied(
        "startSeries with disguised foreign Series",
        store.auth.startSeries({ ...startRequest, series: foreignSeries }),
        "profile_scope",
      );
      assert.deepEqual(
        (yield* store.tasks()).map((value) => value.id),
        ["task-1"],
      );
      assert.deepEqual(yield* store.series(), []);
      const supplied = {
        ...startRequest,
        actor: "client-spoof",
        occurred_at: "1900-01-01T00:00:00Z",
      };
      const started = yield* store.auth.startSeries(supplied);
      assert.deepEqual(
        [
          started.outcome,
          started.actor === writer.id,
          started.event.occurred_at,
        ],
        ["committed", true, "2026-10-27T14:00:00.000Z"],
      );
      mark("auth.startSeries with derived actor and time", started);
      const first = finishRequest("auth-first", "auth-second");
      yield* denied(
        "finishTask with read-only Token",
        store.auth.finishTask({ ...first, credential: reader.credential }),
        "write_scope",
      );
      yield* denied(
        "finishTask outside Profile scope",
        store.auth.finishTask({ ...first, profile: personal }),
        "profile_scope",
      );
      assert.deepEqual(
        (yield* store.tasks()).map((value) => [
          value.id,
          value.status,
          value.row_version,
        ]),
        [
          ["auth-first", "open", 1],
          ["task-1", "open", 2],
        ],
      );
      for (const request of [
        first,
        finishRequest("auth-second", "auth-third", "cancel"),
      ]) {
        if (request.action === "cancel") {
          yield* store.takeSnapshot();
          yield* denied(
            "cancel with read-only Token",
            store.auth.finishTask({
              ...request,
              credential: reader.credential,
            }),
            "write_scope",
          );
        }
        const before = yield* store.tasks();
        const historyBefore = yield* store.history();
        const sql = new Database(path);
        try {
          sql.exec(
            `CREATE TRIGGER fail_auth_successor BEFORE INSERT ON tasks WHEN NEW.id='${request.next_task_id}' BEGIN SELECT RAISE(ABORT, 'forced successor failure'); END`,
          );
          const error = yield* Effect.flip(store.auth.finishTask(request));
          assert.equal(error._tag, "StoreError");
          assert.deepEqual(yield* store.tasks(), before);
          assert.deepEqual(yield* store.history(), historyBefore);
          mark(`auth.finishTask ${request.action} forced successor failure`, {
            error: error._tag,
            tasks_unchanged: true,
            history_unchanged: true,
            tasks: before,
          });
        } finally {
          sql.exec("DROP TRIGGER fail_auth_successor");
          sql.close();
        }
        const result = yield* store.auth.finishTask(request);
        assert.equal(result.outcome, "committed");
        assert.equal(result.actor, writer.id);
        assert.deepEqual(
          result.event.kind === "TaskCompleted" ||
            result.event.kind === "TaskCancelled"
            ? result.event.next_occurrences.map((value) => value.id)
            : [],
          [request.next_task_id],
        );
        mark(`auth.finishTask ${request.action} retry`, result);
      }
      const combinedTasks = yield* store.tasks();
      assert.deepEqual(
        combinedTasks.map((value) => [
          value.id,
          value.status,
          value.row_version,
          value.scheduled_at,
        ]),
        [
          ["auth-first", "done", 2, { kind: "date", date: "2026-10-27" }],
          ["auth-second", "cancelled", 2, { kind: "date", date: "2026-10-28" }],
          ["auth-third", "open", 1, { kind: "date", date: "2026-10-29" }],
          ["task-1", "open", 2, null],
        ],
      );
      const beforeReplay = yield* store.history();
      const expand = RRuleTemporal.prototype.next;
      RRuleTemporal.prototype.next = () => {
        throw new Error("Replay must not expand recurrence");
      };
      try {
        assert.deepEqual(yield* store.rebuild(), combinedTasks);
        assert.deepEqual(
          yield* store.rebuild({ useSnapshot: true }),
          combinedTasks,
        );
      } finally {
        RRuleTemporal.prototype.next = expand;
      }
      assert.deepEqual(yield* store.history(), beforeReplay);
      mark("combined full and snapshot replay with expansion disabled", {
        expansion_disabled: true,
        tasks: combinedTasks,
        history_unchanged: true,
      });
      writeFileSync(
        join(evidence, "02-recurrence.json"),
        `${JSON.stringify({ tasks: combinedTasks, history: beforeReplay, expansion_disabled: true }, null, 2)}\n`,
      );
      dump("02-recurrence");
      yield* store.auth.revokeToken({ ...session, name: "work writer" });
      yield* denied(
        "append with revoked Token",
        store.auth.append({ ...writer, profile, event: created }),
        "revoked",
      );
      yield* store.auth.signOut(session);
      yield* denied(
        "read after signOut",
        store.auth.read({ ...session, profile }),
        "revoked",
      );
      dump("03-revoked");
      time = Date.parse("2026-10-28T14:00:00Z");
      yield* denied(
        "read at custom Token expiry",
        store.auth.read({ ...short, profile }),
        "expired",
      );
      time = Date.parse("2026-11-03T13:59:59.999Z");
      assert.equal(
        (yield* store.auth.authenticate({
          ...spareSession,
          profile,
          access: "write",
        })).expires_at,
        "2026-11-03T14:00:00.000Z",
      );
      time = Date.parse("2026-11-03T14:00:00Z");
      yield* denied(
        "read at fixed Session expiry",
        store.auth.read({ ...spareSession, profile }),
        "expired",
      );
      time = Date.parse("2027-01-25T13:59:59.999Z");
      assert.equal(
        (yield* store.auth.authenticate({ ...reader, profile, access: "read" }))
          .expires_at,
        "2027-01-25T14:00:00.000Z",
      );
      time = Date.parse("2027-01-25T14:00:00Z");
      yield* denied(
        "read at default 90-day Token expiry",
        store.auth.read({ ...reader, profile }),
        "expired",
      );
      dump("04-expiry");
      const history = yield* store.history();
      const rejected = history.filter((entry) => entry.outcome === "rejected");
      assert.deepEqual(
        rejected.map((entry) => [
          entry.reason,
          entry.event.kind === "AuthAttemptRejected"
            ? entry.event.detail
            : null,
        ]),
        [
          ["auth", "invalid_passphrase"],
          ["auth", "profile_scope"],
          ["auth", "write_scope"],
          ["auth", "owner_required"],
          ["auth", "write_scope"],
          ["auth", "profile_scope"],
          ["auth", "profile_scope"],
          ["auth", "write_scope"],
          ["auth", "profile_scope"],
          ["auth", "write_scope"],
          ["auth", "revoked"],
          ["auth", "revoked"],
          ["auth", "expired"],
          ["auth", "expired"],
          ["auth", "expired"],
        ],
      );
      assert.equal(rejected[0]?.profile, null);
      assert.deepEqual(yield* store.rebuild(), combinedTasks);
      const sql = new Database(path);
      try {
        const ownerHash = sql
          .query<{ passphrase_hash: string }, []>(
            "SELECT passphrase_hash FROM owner",
          )
          .get()?.passphrase_hash;
        assert.match(ownerHash ?? "", /^\$argon2id\$v=19\$m=65536,t=3,p=1\$/);
        const credentials = sql
          .query<{ secret_hash: string }, []>(
            "SELECT secret_hash FROM credentials",
          )
          .all();
        assert.equal(credentials.length, 6);
        assert.equal(
          credentials.every((value) =>
            /^[a-f0-9]{64}$/.test(value.secret_hash),
          ),
          true,
        );
        const stored = JSON.stringify(credentials) + JSON.stringify(history);
        for (const credential of [
          session,
          spareSession,
          reader,
          writer,
          global,
          short,
        ])
          assert.equal(stored.includes(credential.credential), false);
        assert.equal(stored.includes("compiled scratch passphrase"), false);
        assert.deepEqual(sql.query("PRAGMA foreign_key_check").all(), []);
        mark("inspect stored hashes and secret-free history", {
          algorithm: "argon2id",
          credential_hashes: "sha256",
          secret_found: false,
        });
      } finally {
        sql.close();
      }
      for (const file of [path, `${path}-wal`, `${path}-shm`])
        chmodSync(file, 0o666);
      assert.deepEqual(modes(), [0o666, 0o666, 0o666]);
      const reopened = yield* openStore({ path, create: false });
      try {
        assert.deepEqual(modes(), [0o600, 0o600, 0o600]);
        assert.deepEqual(yield* reopened.tasks(), combinedTasks);
        assert.deepEqual(yield* reopened.history(), history);
        mark("reopen permissive database and WAL siblings", {
          before: [0o666, 0o666, 0o666],
          after: modes(),
        });
      } finally {
        yield* reopened.close();
      }
      const alias = join(directory, "alias.db");
      symlinkSync(path, alias);
      for (const file of [path, `${path}-wal`, `${path}-shm`])
        chmodSync(file, 0o666);
      assert.deepEqual(modes(), [0o666, 0o666, 0o666]);
      const throughAlias = yield* openStore({ path: alias, create: false });
      try {
        assert.deepEqual(modes(), [0o600, 0o600, 0o600]);
        assert.deepEqual(yield* throughAlias.tasks(), combinedTasks);
        assert.deepEqual(yield* store.tasks(), combinedTasks);
        assert.deepEqual(yield* throughAlias.history(), history);
        const result = {
          original_connection_open: true,
          alias: "alias.db",
          target: "scratch.db",
          before_modes: [0o666, 0o666, 0o666],
          target_modes: modes(),
          tasks: yield* throughAlias.tasks(),
          task_data_preserved: true,
          history_preserved: true,
        };
        mark(
          "reopen symlink repairs target DB/WAL/SHM and preserves Tasks with original connection open",
          result,
        );
        writeFileSync(
          join(evidence, "06-symlink.json"),
          `${JSON.stringify(result, null, 2)}\n`,
        );
      } finally {
        yield* throughAlias.close();
      }
      dump("06-symlink");
      dump("05-reopened");
      writeFileSync(
        join(evidence, "result.json"),
        `${JSON.stringify({ status: "passed", settings: yield* store.settings(), modes: modes(), tasks: yield* store.tasks(), rejected, history }, null, 2)}\n`,
      );
      process.stdout.write(
        "PASS owner Argon2id, hashed credentials, fixed Session expiry, Token expiry, revocation, scopes, rejected history, 0600 files including symlink target siblings, authenticated Series start/complete/cancel, atomic successor rollback, replay and reopen\n",
      );
    }),
  (store) => Effect.orDie(store.close()),
);
await Effect.runPromise(
  Clock.clockWith((clock) =>
    Effect.provideService(program, Clock.Clock, {
      ...clock,
      currentTimeMillisUnsafe: () => time,
      currentTimeMillis: Effect.sync(() => time),
      currentTimeNanosUnsafe: () => BigInt(time) * 1000000n,
      currentTimeNanos: Effect.sync(() => BigInt(time) * 1000000n),
    }),
  ),
);
