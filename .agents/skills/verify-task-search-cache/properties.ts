import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect, Schema } from "effect";
import { TaskCommands, moveTask } from "./packages/domain/src/commands.ts";
import { ProfileId, Version } from "./packages/domain/src/ids.ts";
import {
  filterTaskRecordsEffect,
  runTaskRecordSteps,
} from "./packages/domain/src/task-filters.ts";
import type { TaskRead } from "./packages/domain/src/task-read.ts";
import { TaskSearchCache } from "./packages/domain/src/task-search-cache.ts";
import {
  fieldWords,
  type PreparedField,
  taskSearchExecution,
} from "./packages/domain/src/task-search.ts";
import { openStore } from "./packages/domain/src/store/store.ts";
import {
  actor,
  profile,
  time,
  work,
  created,
  task,
  edited,
} from "./packages/domain/test/store-fixtures.ts";

function prepareValues(
  prepare: (text: string) => Generator<void, PreparedField>,
  values: readonly string[],
) {
  return Effect.suspend(() => {
    const captured: PreparedField[] = [];
    function* steps(): Generator<void, TaskRead[]> {
      for (const value of values) captured.push(yield* prepare(value));
      return [];
    }
    return runTaskRecordSteps(steps(), Effect.void).pipe(
      Effect.map(() => captured),
    );
  });
}
async function prepared(
  cache: TaskSearchCache,
  owner: ProfileId,
  text: string,
) {
  const read = cache.read(owner);
  const [value] = await Effect.runPromise(
    prepareValues((value) => cache.words(read, value), [text]),
  );
  assert.ok(value);
  return value;
}
const personal = Schema.decodeUnknownSync(ProfileId)("personal");
let cache = new TaskSearchCache();
const first = await prepared(cache, profile, "Café");
assert.deepEqual(
  first,
  { words: [{ text: "cafe", start: 0, end: 4 }], preparedUnits: 4 },
  "literal-fold",
);
assert.equal(
  await prepared(cache, profile, "Café"),
  first,
  "hit reuses complete PreparedField",
);
assert.deepEqual(
  await prepared(cache, profile, "Ship"),
  { words: [{ text: "ship", start: 0, end: 4 }], preparedUnits: 4 },
  "text-key edit witness",
);
cache.close();
cache = new TaskSearchCache();
await prepared(cache, profile, "Same");
await prepared(cache, personal, "Same");
assert.equal(cache.usage.entries, 2, "profile-isolation");
cache.close();
cache = new TaskSearchCache();
const retained: PreparedField[] = [];
for (let i = 0; i < 4096; i++)
  retained.push(await prepared(cache, profile, `word${i}`));
assert.equal(cache.usage.entries, 4096, "entry-limit exact fill");
const recent = await prepared(cache, profile, "word0");
await prepared(cache, profile, "word1");
await prepared(cache, profile, "overflow");
assert.equal(cache.usage.entries, 4096, "entry-limit after eviction");
assert.equal(await prepared(cache, profile, "word0"), recent, "LRU recent hit");
assert.notEqual(
  await prepared(cache, profile, "word2"),
  retained[2],
  "LRU oldest",
);
cache.close();
cache = new TaskSearchCache();
let state = 0x5ea2c001;
const next = () => {
  state ^= state << 13;
  state ^= state >>> 17;
  state ^= state << 5;
  return state >>> 0;
};
const atoms = Schema.decodeUnknownSync(Schema.Array(Schema.String))(
  JSON.parse(process.env.CACHE_ATOMS ?? "[]"),
);
assert.ok(atoms.length > 20);
const corpus = [
  "",
  "\ud800",
  "\udfff",
  "\u0000",
  "e\u0301",
  "👩🏽‍💻 𐐀 Straße ﬃ",
  "İı ςΣ ＡＢＣ",
  "a\u0345 ᾈ",
  "ﷺ A!\n",
  "a".repeat(100000),
  "a ".repeat(50000),
];
for (let i = 0; i < 2048; i++)
  corpus.push(
    Array.from(
      { length: 1 + (next() % 8) },
      () => atoms[next() % atoms.length],
    ).join(" / "),
  );
for (const text of corpus) {
  const [oracleField] = await Effect.runPromise(
    prepareValues(fieldWords, [text]),
  );
  assert.deepEqual(
    await prepared(cache, profile, text),
    oracleField,
    "same-source complete field and units",
  );
  for (const query of [
    "cafe",
    "-draft",
    '"pay rent"',
    "strasse",
    "pasaprote",
    "",
  ]) {
    const record = { ...task, title: text.slice(0, 1000), description: text };
    const read = cache.read(profile);
    const oracle = await Effect.runPromise(
      filterTaskRecordsEffect(
        [record],
        { text: query },
        { projects: [], tags: [] },
      ),
    );
    const cached = await Effect.runPromise(
      filterTaskRecordsEffect(
        [record],
        { text: query },
        { projects: [], tags: [] },
        {
          ...taskSearchExecution(),
          prepare: (value) => cache.words(read, value),
        },
      ),
    );
    assert.equal(
      JSON.stringify(cached),
      JSON.stringify(oracle),
      "full ordered strings/spans",
    );
  }
}
cache.close();
const directory = mkdtempSync(join(tmpdir(), "todo-cache-properties-"));
await Effect.runPromise(
  Effect.gen(function* () {
    const store = yield* openStore({ path: join(directory, "scratch.db") });
    try {
      yield* store.putProfile(work);
      yield* store.putProfile({ ...work, id: personal, name: "Personal" });
      yield* store.auth.setupOwner("cache proof passphrase");
      const session = yield* store.auth.signIn("cache proof passphrase");
      const request = { credential: session.credential, profile };
      const commands = new TaskCommands(store);
      yield* store.append({ actor, profile, event: created });
      const check = (label: string, titles: readonly string[]) =>
        Effect.gen(function* () {
          const data = yield* store.auth.read(request);
          const visible = data.tasks.filter((t) => t.deleted_at === null);
          assert.deepEqual(
            visible.map((t) => t.title),
            titles,
            `${label} literal titles`,
          );
          for (const text of ["write", "ship", "-draft", '"write the"', ""]) {
            const cached = yield* commands.list(request, { text });
            const oracle = yield* filterTaskRecordsEffect(
              visible,
              { text },
              data,
            );
            assert.equal(JSON.stringify(cached), JSON.stringify(oracle), label);
          }
        });
      yield* check("create", ["Write the store"]);
      assert.equal(
        store.searchWords.usage.entries,
        2,
        "TaskCommands.list uses store memo",
      );
      const saved = yield* store.snapshots.create("manual");
      const entry = yield* store.append({ actor, profile, event: edited });
      assert.equal(entry.outcome, "committed");
      yield* check("edit", ["Ship the store"]);
      const reverted = yield* store.revert({
        actor,
        profile,
        seq: entry.seq,
        occurred_at: time,
      });
      assert.equal(reverted.outcome, "committed");
      yield* check("Revert returns old text", ["Write the store"]);
      yield* store.snapshots.restore(saved.id);
      assert.equal(store.searchWords.usage.entries, 0, "restore-hygiene");
      yield* check("restore reuses Version 1", ["Write the store"]);
      yield* store.append({
        actor,
        profile,
        event: {
          ...edited,
          after: { ...edited.after, title: "Different Version 2" },
        },
      });
      yield* check("different text reuses Version 2", ["Different Version 2"]);
      const rejected = yield* store.append({ actor, profile, event: edited });
      assert.equal(rejected.outcome, "rejected");
      yield* check("rolled-back edit", ["Different Version 2"]);
      yield* store.takeSnapshot();
      yield* store.rebuild({ useSnapshot: true });
      yield* check("checkpoint rebuild", ["Different Version 2"]);
      yield* store.rebuild();
      yield* check("full rebuild", ["Different Version 2"]);
      const before = (yield* store.tasks())[0];
      assert.ok(before);
      const deleted = {
        ...before,
        deleted_at: time,
        updated_at: time,
        row_version: before.row_version + 1,
      };
      yield* store.append({
        actor,
        profile,
        event: {
          kind: "TaskDeleted",
          entity_version: 1,
          occurred_at: time,
          before,
          after: deleted,
        },
      });
      yield* check("Delete", []);
      store.searchWords.evictProfile(profile);
      store.searchWords.evictProfile(personal);
      const read = store.searchWords.read(profile);
      yield* prepareValues(
        (text) => store.searchWords.words(read, text),
        [task.title, before.title],
      );
      const other = store.searchWords.read(personal);
      yield* prepareValues(
        (text) => store.searchWords.words(other, text),
        [task.title],
      );
      const epoch = store.searchWords.read(profile).epoch;
      yield* store.append({
        actor,
        profile,
        event: {
          kind: "TaskPurged",
          entity_version: 1,
          occurred_at: time,
          task_id: task.id,
          before: deleted,
        },
      });
      assert.equal(
        store.searchWords.usage.entries,
        0,
        "purge-hygiene clears all Profiles",
      );
      assert.equal(
        store.searchWords.read(profile).epoch,
        epoch + 1,
        "Purge advances cache epoch",
      );
      yield* check("Purge", []);
      const fresh = store.searchWords.read(profile);
      yield* prepareValues(
        (text) =>
          store.searchWords.words(store.searchWords.read(personal), text),
        ["Personal survives local Profile delete"],
      );
      yield* prepareValues(
        (text) => store.searchWords.words(fresh, text),
        ["Other text"],
      );
      const removed = yield* store.auth.deleteProfile({
        credential: session.credential,
        profile,
        options: { dry_run: false, with_tasks: true },
      });
      assert.equal(removed.outcome, "deleted");
      assert.equal(
        store.searchWords.usage.entries,
        1,
        "profile-delete-hygiene",
      );
      assert.equal(
        store.searchWords.read(profile).generation,
        fresh.generation + 1,
        "Profile delete advances admission generation",
      );
    } finally {
      yield* store.close();
      assert.deepEqual(
        [
          store.searchWords.usage.entries,
          store.searchWords.usage.pending,
          store.searchWords.usage.chargedBytes,
          store.searchWords.usage.generationProfiles,
          store.searchWords.usage.closed,
        ],
        [0, 0, 0, 0, true],
        "close-hygiene",
      );
    }
  }),
).finally(() => rmSync(directory, { recursive: true, force: true }));
for (const suspended of [false, true]) {
  const scratch = mkdtempSync(join(tmpdir(), "todo-cache-move-"));
  try {
    await Effect.runPromise(
      Effect.gen(function* () {
        const store = yield* openStore({
          path: join(scratch, "scratch.db"),
          attachmentRoot: join(scratch, "attachments"),
        });
        let running: Promise<TaskRead[]> | undefined;
        try {
          yield* store.putProfile(work);
          yield* store.putProfile({ ...work, id: personal, name: "Personal" });
          yield* store.auth.setupOwner("moved cache proof passphrase");
          const { credential } = yield* store.auth.signIn(
            "moved cache proof passphrase",
          );
          const commands = new TaskCommands(store);
          const request = { credential, profile };
          const title = "Classified rent " + "x".repeat(suspended ? 600 : 0);
          const added = yield* commands.create(request, {
            title,
            description: "Late private description",
          });
          assert.equal(added.outcome, "committed");
          if (added.outcome !== "committed" || !added.task)
            throw new Error("Missing Task");
          if (suspended) {
            running = Effect.runPromise(
              commands.list(request, { text: "rent" }),
            );
            assert.equal(
              store.searchWords.usage.pending,
              1,
              "moved old read is suspended",
            );
          } else yield* commands.list(request, { text: "rent" });
          yield* moveTask(
            store,
            { ...request, task_id: added.task.id },
            {
              from_version: Schema.decodeUnknownSync(Version)(1),
              destination_profile: personal,
            },
          );
          if (!suspended)
            yield* commands.list(
              { credential, profile: personal },
              { text: "rent" },
            );
          const target = {
            credential,
            profile: personal,
            task_id: added.task.id,
          };
          yield* commands.delete(target, {
            from_version: Schema.decodeUnknownSync(Version)(2),
          });
          yield* commands.purge(target, {
            from_version: Schema.decodeUnknownSync(Version)(3),
          });
          assert.deepEqual(
            [
              store.searchWords.usage.entries,
              store.searchWords.usage.pending,
              store.searchWords.usage.chargedBytes,
            ],
            [0, 0, 0],
            "Move then Purge clears all historical Profiles and pending",
          );
          if (running) {
            const pendingRead = running;
            yield* Effect.promise(() => pendingRead);
            running = undefined;
          }
          assert.deepEqual(
            [
              store.searchWords.usage.entries,
              store.searchWords.usage.pending,
              store.searchWords.usage.chargedBytes,
            ],
            [0, 0, 0],
            "moved old read cannot admit late description",
          );
        } finally {
          if (running) {
            const pendingRead = running;
            yield* Effect.promise(() => pendingRead);
          }
          yield* store.close();
        }
      }),
    );
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}
writeFileSync(
  process.env.CACHE_WITNESS ?? join(tmpdir(), "cache-witness.json"),
  JSON.stringify({
    status: "PASS",
    seed: "0x5ea2c001",
    corpus: corpus.length,
    queriesPerInput: 6,
    bounds: { entries: 4096, bytes: 16777216, generated: 2048 },
    scope: "same-source yielding oracle and store lifecycle",
  }),
);
