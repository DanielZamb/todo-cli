import assert from "node:assert/strict";
import { Database } from "bun:sqlite";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { Effect, Schema } from "effect";
import {
  ActorId,
  ClientReads,
  Instant,
  OpLogEntry,
  Profile,
  ProfileId,
  Task,
  profileTaskCounts,
} from "../../../../packages/domain/src/index.ts";
import { openStore } from "../../../../packages/domain/src/store/store.ts";

const mode = process.argv[2];
const root = resolve(process.argv[3] ?? ".scratch/cold-path");
assert.ok(
  root.startsWith(`${resolve(".scratch")}/`),
  "Only checkout-local scratch data is allowed",
);
const at = Schema.decodeUnknownSync(Instant)("2026-11-11T12:00:00Z");
const actor = Schema.decodeUnknownSync(ActorId)("cold-path-fixture");
const run = Effect.runPromise;
export const FixtureSchema = Schema.Struct({
  id: Schema.String,
  path: Schema.String,
  credential: Schema.String,
  tasks: Schema.Number,
  profiles: Schema.Number,
  extra: Schema.Number,
  large: Schema.Boolean,
  ops: Schema.Number,
  history_bytes: Schema.Number,
  task_bytes: Schema.Number,
  rich: Schema.optionalKey(Schema.Boolean),
});
export type Fixture = typeof FixtureSchema.Type;

async function seed(tasks: number, profiles: number, large: boolean) {
  const rich = process.env.COLD_RICH === "1";
  const id = `n${tasks}-p${profiles}-large${Number(large)}${rich ? "-rich" : ""}`;
  const path = join(root, `${id}.db`);
  const store = await run(
    openStore({ path, attachmentRoot: join(root, "attachments") }),
  );
  try {
    await run(store.auth.setupOwner("cold path scratch only"));
    const session = await run(store.auth.signIn("cold path scratch only"));
    const append = async (profile: typeof ProfileId.Type, event: unknown) => {
      const entry = await run(store.append({ actor, profile, event }));
      assert.equal(
        entry.outcome,
        "committed",
        JSON.stringify({ reason: entry.reason, event: entry.event.kind }),
      );
      return entry;
    };
    let editable: typeof Task.Type | undefined;
    for (let p = 0; p < profiles; p++) {
      const profile = Schema.decodeUnknownSync(ProfileId)(`p${p}`);
      await run(
        store.putProfile(
          Schema.decodeUnknownSync(Profile)({
            id: profile,
            name: `Profile ${p}`,
            created_at: at,
            updated_at: at,
          }),
        ),
      );
      for (let i = 0; i < tasks + (p === 0 ? 3 : 0); i++) {
        const deleted = i >= tasks;
        const status =
          tasks === 178 && !deleted
            ? i < 50
              ? "open"
              : i < 176
                ? "done"
                : "cancelled"
            : "open";
        const task = Schema.decodeUnknownSync(Task)({
          id: `${profile}-t${String(i).padStart(4, "0")}`,
          profile_id: profile,
          entity_version: 1,
          row_version: 1,
          title: `Scratch Task ${i}`,
          description: deleted
            ? large
              ? "L".repeat(100000)
              : null
            : tasks === 178
              ? "d".repeat(i === 177 ? 5244 : 1260)
              : rich
                ? "d".repeat(200)
                : null,
          status,
          project_id: null,
          priority: "P2",
          scheduled_at: null,
          due_at: null,
          energy: null,
          estimate_min: null,
          source: "agent",
          tags:
            rich && tasks === 178 && !deleted
              ? [`${profile}-tag${i % 38}`]
              : [],
          ...(rich && tasks === 178 && i < 108
            ? {
                attachments: [
                  {
                    id: `${profile}-a${i}`,
                    kind: "link",
                    url: `https://example.invalid/scratch/${i}`,
                    added_at: at,
                  },
                ],
              }
            : {}),
          occurrence: null,
          created_at: at,
          updated_at: at,
          completed_at: status === "done" ? at : null,
          deleted_at: null,
        });
        await append(profile, {
          kind: "TaskCreated",
          entity_version: 1,
          occurred_at: at,
          task,
          series: null,
          project: null,
          tags:
            rich && tasks === 178 && !deleted
              ? [
                  {
                    id: `${profile}-tag${i % 38}`,
                    profile_id: profile,
                    name: `Tag ${i % 38}`,
                  },
                ]
              : [],
        });
        if (p === 0 && i === 0) editable = task;
        if (deleted)
          await append(profile, {
            kind: "TaskDeleted",
            entity_version: 1,
            occurred_at: at,
            before: task,
            after: { ...task, row_version: 2, deleted_at: at },
          });
      }
    }
    assert.ok(editable);
    const manifest: Fixture[] = [];
    let previous = editable;
    for (
      let extra = 1;
      extra <= (process.env.COLD_PILOT === "1" ? 256 : 2048);
      extra++
    ) {
      const after = Schema.decodeUnknownSync(Task)({
        ...previous,
        row_version: previous.row_version + 1,
        title: `Scratch edit ${extra}`,
      });
      await append(previous.profile_id, {
        kind: "TaskEdited",
        entity_version: 1,
        occurred_at: at,
        before: previous,
        after,
        series_before: null,
        series_after: null,
        project_before: null,
        project_after: null,
        tags_before:
          rich && tasks === 178
            ? [
                {
                  id: `p0-tag0`,
                  profile_id: previous.profile_id,
                  name: "Tag 0",
                },
              ]
            : [],
        tags_after:
          rich && tasks === 178
            ? [
                {
                  id: `p0-tag0`,
                  profile_id: previous.profile_id,
                  name: "Tag 0",
                },
              ]
            : [],
      });
      previous = after;
      if (![32, 256, 2048].includes(extra)) continue;
      const db = new Database(path, { readonly: true });
      const stats = db
        .query<{ ops: number; history_bytes: number; task_bytes: number }, []>(
          "SELECT (SELECT count(*) FROM op_log) AS ops,(SELECT sum(length(event)) FROM op_log) AS history_bytes,(SELECT sum(length(payload)) FROM tasks) AS task_bytes",
        )
        .get();
      db.close();
      assert.ok(stats);
      const checkpoint = join(root, `${id}-h${extra}.db`);
      const backup = new Database(path);
      backup.exec("PRAGMA wal_checkpoint(TRUNCATE)");
      backup.close();
      copyFileSync(path, checkpoint);
      manifest.push({
        id: `${id}-h${extra}`,
        path: checkpoint,
        credential: session.credential,
        tasks,
        profiles,
        extra,
        large,
        ...stats,
        rich,
      });
    }
    return manifest;
  } finally {
    await run(store.close());
  }
}

async function micro(f: Fixture) {
  const store = await run(
    openStore({ path: f.path, attachmentRoot: join(root, "attachments") }),
  );
  const db = new Database(f.path, { readonly: true });
  const reads = new ClientReads(store);
  const credential = f.credential;
  const profile = Schema.decodeUnknownSync(ProfileId)("p0");
  try {
    const rows = db
      .query<
        {
          seq: number;
          actor: string;
          profile: string;
          event: string;
          from_version: number | null;
          to_version: number | null;
          outcome: string;
          reason: string | null;
        },
        []
      >("SELECT * FROM op_log WHERE seq>0 ORDER BY seq")
      .all();
    const tasks = db
      .query<{ payload: string }, []>("SELECT payload FROM tasks ORDER BY id")
      .all();
    const output: Record<string, number[]> = {};
    const timed = async (
      name: string,
      work: () => unknown | Promise<unknown>,
    ) => {
      const s = performance.now();
      const value = await work();
      assert.notEqual(value, undefined);
      (output[name] ??= []).push(performance.now() - s);
      return value;
    };
    for (
      let repeat = 0;
      repeat < Number(process.env.COLD_MICRO_REPEATS ?? 12);
      repeat++
    ) {
      await timed("history_sql", () =>
        db.query("SELECT * FROM op_log WHERE seq>0 ORDER BY seq").all(),
      );
      await timed("history_json", () => rows.map((r) => JSON.parse(r.event)));
      await timed("history_decode", () =>
        rows.map((r) =>
          Schema.decodeUnknownSync(OpLogEntry)({
            ...r,
            event: JSON.parse(r.event),
          }),
        ),
      );
      await timed("tasks_decode", () =>
        tasks.map((r) => Schema.decodeUnknownSync(Task)(JSON.parse(r.payload))),
      );
      await timed("profiles", () => run(reads.profiles(credential)));
      await timed("read", () => run(store.auth.read({ credential, profile })));
      await timed("serial_eight_domain", () =>
        run(
          Effect.all([
            reads.profiles(credential),
            reads.tags({ credential, profile }),
            store.auth.read({ credential, profile }),
            reads.view({ credential, profile }, "overdue", at),
            reads.projects({ credential, profile }),
            reads.view({ credential, profile }, "inbox", at),
            reads.view({ credential, profile }, "today", at),
            reads.view({ credential, profile }, "scheduled", at),
          ]),
        ),
      );
      await timed("one_transaction_same_N_plus_7_reads", () =>
        run(
          store.auth.readSnapshot((r) =>
            Effect.gen(function* () {
              const profiles = yield* r.profiles({ credential });
              const counted = yield* Effect.forEach(profiles, (p) =>
                r
                  .read({ credential, profile: p.id })
                  .pipe(Effect.map((data) => profileTaskCounts(data.tasks))),
              );
              const data = yield* Effect.all(
                Array.from({ length: 7 }, () =>
                  r.read({ credential, profile }),
                ),
              );
              return { counted, data };
            }),
          ),
        ),
      );
      await timed("shared_N_reads_lower_bound", () =>
        run(
          store.auth.readSnapshot((r) =>
            Effect.gen(function* () {
              const profiles = yield* r.profiles({ credential });
              const data = yield* Effect.forEach(profiles, (p) =>
                r.read({ credential, profile: p.id }),
              );
              return {
                counts: data.map((d) => profileTaskCounts(d.tasks)),
                target: data.find((d) => d.profiles[0]?.id === profile),
              };
            }),
          ),
        ),
      );
    }
    return { fixture: f.id, ops: rows.length, output };
  } finally {
    db.close();
    await run(store.close());
  }
}
if (import.meta.main && mode === "seed") {
  mkdirSync(root, { recursive: true });
  const fixtures: Fixture[] = [];
  const sizes = process.env.COLD_SIZE
    ? [Number(process.env.COLD_SIZE)]
    : process.env.COLD_PILOT === "1"
      ? [15]
      : [15, 178];
  for (const n of sizes)
    for (const p of process.env.COLD_PILOT === "1" ||
    process.env.COLD_RICH === "1"
      ? [1]
      : [1, 3, 8])
      for (const large of [false, true]) {
        fixtures.push(...(await seed(n, p, large)));
        console.error(`seeded ${n}/${p}/${large}`);
      }
  writeFileSync(
    join(root, "fixtures.json"),
    JSON.stringify(fixtures, null, 2),
    { mode: 0o600 },
  );
} else if (import.meta.main && mode === "micro") {
  const fixtures = Schema.decodeUnknownSync(
    Schema.fromJsonString(Schema.Array(FixtureSchema)),
  )(readFileSync(join(root, "fixtures.json"), "utf8"));
  const selected = fixtures.filter((f) =>
    process.env.COLD_MICRO_MATCH
      ? f.id === process.env.COLD_MICRO_MATCH
      : process.env.COLD_MICRO_ALL === "1" ||
        f.profiles === 1 ||
        (f.extra === 2048 && f.large),
  );
  const results = [];
  for (const f of selected) results.push(await micro(f));
  writeFileSync(
    process.argv[4] ?? join(root, "micro.json"),
    JSON.stringify(results, null, 2),
  );
} else if (import.meta.main && mode === "empty-profiles") {
  mkdirSync(root, { recursive: true });
  const source = resolve(process.env.COLD_FROM ?? ".scratch/cold-path/pilot");
  assert.ok(source.startsWith(`${resolve(".scratch")}/`));
  const fixtures = Schema.decodeUnknownSync(
    Schema.fromJsonString(Schema.Array(FixtureSchema)),
  )(readFileSync(join(source, "fixtures.json"), "utf8"));
  const derived: Fixture[] = [];
  for (const f of fixtures.filter((f) => f.profiles === 1 && f.extra === 2048))
    for (const profiles of [3, 8]) {
      const id = f.id.replace("-p1-", `-p${profiles}-empty-`);
      const path = join(root, `${id}.db`);
      copyFileSync(f.path, path);
      const store = await run(
        openStore({ path, attachmentRoot: join(root, "attachments") }),
      );
      try {
        for (let i = 1; i < profiles; i++)
          await run(
            store.putProfile(
              Schema.decodeUnknownSync(Profile)({
                id: `p${i}`,
                name: `Empty ${i}`,
                created_at: at,
                updated_at: at,
              }),
            ),
          );
      } finally {
        await run(store.close());
      }
      const db = new Database(path, { readonly: true });
      assert.equal(
        db.query<{ n: number }, []>("SELECT count(*) AS n FROM op_log").get()
          ?.n,
        f.ops,
      );
      db.close();
      derived.push({ ...f, id, path, profiles });
    }
  writeFileSync(join(root, "fixtures.json"), JSON.stringify(derived, null, 2), {
    mode: 0o600,
  });
} else if (import.meta.main && mode === "audit") {
  const fixtures = Schema.decodeUnknownSync(
    Schema.fromJsonString(Schema.Array(FixtureSchema)),
  )(readFileSync(join(root, "fixtures.json"), "utf8"));
  const rows = [];
  for (const f of fixtures) {
    const db = new Database(f.path, { readwrite: true, create: false });
    try {
      const ops = db
        .query<{ n: number }, []>("SELECT count(*) AS n FROM op_log")
        .get()?.n;
      const rejected = db
        .query<{ n: number }, []>(
          "SELECT count(*) AS n FROM op_log WHERE outcome!='committed'",
        )
        .get()?.n;
      const live = db
        .query<{ n: number }, []>(
          "SELECT count(*) AS n FROM tasks WHERE json_extract(payload,'$.deleted_at') IS NULL",
        )
        .get()?.n;
      const tags = db
        .query<{ n: number }, []>("SELECT count(*) AS n FROM tags")
        .get()?.n;
      const attachments = db
        .query<{ n: number }, []>(
          "SELECT coalesce(sum(json_array_length(payload,'$.attachments')),0) AS n FROM tasks",
        )
        .get()?.n;
      assert.equal(ops, f.ops);
      assert.equal(rejected, 0);
      assert.equal(live, f.tasks * (f.id.includes("-empty-") ? 1 : f.profiles));
      assert.equal(tags, f.rich && f.tasks === 178 ? 38 : 0);
      assert.equal(
        attachments,
        f.rich && f.tasks === 178 ? 108 * f.profiles : 0,
      );
      rows.push({ fixture: f.id, ops, rejected, live, tags, attachments });
    } finally {
      db.close();
    }
  }
  writeFileSync(
    process.argv[4] ?? join(root, "audit.json"),
    JSON.stringify(rows, null, 2),
  );
} else if (import.meta.main)
  throw new Error("Expected seed, micro, empty-profiles or audit");
