import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect, Schema } from "effect";
import { ProfileId } from "./packages/domain/src/ids.ts";
import { TaskSearchCache } from "./packages/domain/src/task-search-cache.ts";
import {
  fieldWords,
  matchTaskSearch,
  parseTaskSearch,
} from "./packages/domain/src/task-search.ts";
import { filterTaskRecords } from "./packages/domain/src/task-filters.ts";
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

const personal = Schema.decodeUnknownSync(ProfileId)("personal");
const cache = new TaskSearchCache();
const first = cache.words(profile, "Café");
assert.deepEqual(first, [{ text: "cafe", start: 0, end: 4 }], "literal-fold");
assert.equal(
  cache.words(profile, "Café"),
  first,
  "hit reuses the actual Word array",
);
assert.deepEqual(
  cache.words(profile, "Ship"),
  [{ text: "ship", start: 0, end: 4 }],
  "text-key edit witness",
);
cache.clear();
cache.words(profile, "Same");
cache.words(personal, "Same");
assert.equal(cache.usage.entries, 2, "profile-isolation");
cache.clear();
let oldest = cache.words(profile, "word2");
cache.clear();
for (let i = 0; i < 4096; i++) {
  const value = cache.words(profile, `word${i}`);
  if (i === 2) oldest = value;
}
assert.equal(cache.usage.entries, 4096, "entry-limit exact fill");
const recent = cache.words(profile, "word0");
cache.words(profile, "word1");
cache.words(profile, "overflow");
assert.equal(cache.usage.entries, 4096, "entry-limit after eviction");
assert.equal(
  cache.words(profile, "word0"),
  recent,
  "LRU refresh retains recently read entry",
);
assert.notEqual(cache.words(profile, "word2"), oldest, "LRU");
cache.clear();
const dense = "a ".repeat(50000);
assert.deepEqual(
  cache.words(profile, dense),
  fieldWords(dense),
  "oversize equality",
);
assert.deepEqual(
  cache.usage,
  { entries: 0, chargedBytes: 0 },
  "oversize bypass",
);
for (let i = 0; i < 30; i++) {
  cache.words(profile, `${i} ${"word ".repeat(10000)}`);
  assert.ok(cache.usage.chargedBytes <= 16 * 1024 * 1024, "byte-limit");
}
assert.equal(cache.usage.entries, 14, "charged byte capacity");
cache.clear();
let state = 0x5ea2c001;
const next = () => {
  state ^= state << 13;
  state ^= state >>> 17;
  state ^= state << 5;
  return state >>> 0;
};
const atoms = JSON.parse(process.env.CACHE_ATOMS ?? "[]");
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
  "a".repeat(100000),
  dense,
];
for (let i = 0; i < 2048; i++)
  corpus.push(
    Array.from(
      { length: 1 + (next() % 8) },
      () => atoms[next() % atoms.length],
    ).join(" / "),
  );
for (const text of corpus) {
  assert.deepEqual(
    cache.words(profile, text),
    fieldWords(text),
    `word-equality ${JSON.stringify(text.slice(0, 80))}`,
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
    const oracle = matchTaskSearch(record, parseTaskSearch(query));
    assert.deepEqual(
      matchTaskSearch(record, parseTaskSearch(query), (value) =>
        cache.words(profile, value),
      ),
      oracle,
      "full strings/spans",
    );
  }
}
const dir = mkdtempSync(join(tmpdir(), "todo-cache-properties-"));
await Effect.runPromise(
  Effect.gen(function* () {
    const store = yield* openStore({ path: join(dir, "scratch.db") });
    try {
      yield* store.putProfile(work);
      yield* store.putProfile({ ...work, id: personal, name: "Personal" });
      yield* store.auth.setupOwner("cache proof passphrase");
      const session = yield* store.auth.signIn("cache proof passphrase");
      const request = { credential: session.credential, profile };
      yield* store.append({ actor, profile, event: created });
      const check = (label: string) =>
        Effect.gen(function* () {
          const data = yield* store.auth.read(request);
          const visible = data.tasks.filter((t) => t.deleted_at === null);
          for (const text of ["write", "ship", "-draft", '"write the"', ""]) {
            const cached = filterTaskRecords(
              visible,
              { text },
              data,
              store.searchWords.words,
            );
            const oracle = filterTaskRecords(visible, { text }, data);
            assert.equal(JSON.stringify(cached), JSON.stringify(oracle), label);
          }
        });
      yield* check("create");
      const saved = yield* store.snapshots.create("manual");
      const entry = yield* store.append({ actor, profile, event: edited });
      assert.equal(entry.outcome, "committed");
      yield* check("edit");
      const reverted = yield* store.revert({
        actor,
        profile,
        seq: entry.seq,
        occurred_at: time,
      });
      assert.equal(reverted.outcome, "committed");
      yield* check("Revert returns old text");
      yield* store.snapshots.restore(saved.id);
      yield* check("restore reuses Version 1");
      yield* store.append({
        actor,
        profile,
        event: {
          ...edited,
          after: { ...edited.after, title: "Different Version 2" },
        },
      });
      yield* check("different text reuses Version 2");
      const rejected = yield* store.append({ actor, profile, event: edited });
      assert.equal(rejected.outcome, "rejected");
      yield* check("rolled-back edit");
      yield* store.takeSnapshot();
      yield* store.rebuild({ useSnapshot: true });
      yield* check("checkpoint rebuild");
      yield* store.rebuild();
      yield* check("full rebuild");
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
      yield* check("Delete");
      store.searchWords.clear();
      store.searchWords.words(profile, task.title);
      store.searchWords.words(profile, before.title);
      store.searchWords.words(personal, task.title);
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
        1,
        "purge-hygiene evicts all prior text only in its Profile",
      );
      yield* check("Purge");
      store.searchWords.words(profile, "Other text");
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
    } finally {
      yield* store.close();
      assert.deepEqual(
        store.searchWords.usage,
        { entries: 0, chargedBytes: 0 },
        "close-hygiene",
      );
    }
  }),
).finally(() => rmSync(dir, { recursive: true, force: true }));
writeFileSync(
  process.env.CACHE_WITNESS ?? join(tmpdir(), "cache-witness.json"),
  JSON.stringify({
    status: "PASS",
    seed: "0x5ea2c001",
    corpus: corpus.length,
    bounds: { entries: 4096, bytes: 16777216, generated: 2048 },
    usage: cache.usage,
  }),
);
