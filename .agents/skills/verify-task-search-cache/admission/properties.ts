import assert from "node:assert/strict";
import { Cause, Effect, Exit, Schema } from "effect";
import { ProfileId } from "./packages/domain/src/ids.ts";
import { runTaskRecordSteps } from "./packages/domain/src/task-filters.ts";
import type { TaskRead } from "./packages/domain/src/task-read.ts";
import {
  fieldWords,
  type PreparedField,
} from "./packages/domain/src/task-search.ts";
import { TaskSearchCache } from "./packages/domain/src/task-search-cache.ts";
const profile = Schema.decodeUnknownSync(ProfileId)("work");
const personal = Schema.decodeUnknownSync(ProfileId)("personal");
const text = "Café ".repeat(200);
type Read = ReturnType<TaskSearchCache["read"]>;
const noCheckpoint = Effect.sync(() => undefined);
function gate() {
  const arrived = Promise.withResolvers<void>();
  const released = Promise.withResolvers<void>();
  let first = true;
  return {
    arrived: arrived.promise,
    release: () => released.resolve(),
    checkpoint: Effect.suspend(() => {
      if (!first) return noCheckpoint;
      first = false;
      arrived.resolve();
      return Effect.promise(() => released.promise);
    }),
  };
}
function prepareMany(
  cache: TaskSearchCache,
  read: Read,
  values: readonly string[],
  checkpoint: Effect.Effect<void, unknown> = noCheckpoint,
) {
  return Effect.suspend(() => {
    const captured: PreparedField[] = [];
    function* steps(): Generator<void, TaskRead[]> {
      for (const value of values)
        captured.push(yield* cache.words(read, value));
      return [];
    }
    return runTaskRecordSteps(steps(), checkpoint).pipe(
      Effect.map(() => captured),
    );
  });
}
async function prepare(
  cache: TaskSearchCache,
  read: Read,
  value: string,
  checkpoint: Effect.Effect<void, unknown> = noCheckpoint,
) {
  const result = await Effect.runPromise(
    prepareMany(cache, read, [value], checkpoint),
  );
  assert.equal(result.length, 1);
  const prepared = result[0];
  assert.ok(prepared);
  return prepared;
}
function absent(cache: TaskSearchCache, label: string) {
  assert.deepEqual(
    [cache.usage.entries, cache.usage.pending, cache.usage.chargedBytes],
    [0, 0, 0],
    label,
  );
}
{
  const cache = new TaskSearchCache();
  const read = cache.read(profile);
  const a = gate();
  const runningA = prepare(cache, read, text, a.checkpoint);
  await a.arrived;
  let checkpoints = 0;
  const preparedB = await prepare(
    cache,
    read,
    text,
    Effect.sync(() => {
      checkpoints++;
    }),
  );
  assert.equal(
    checkpoints,
    2,
    "HitIsComplete a pending preparation is not a hit",
  );
  assert.equal(preparedB.words.length, 200, "HitIsComplete full Word array");
  assert.equal(
    await prepare(cache, read, text),
    preparedB,
    "completed B is a hit",
  );
  cache.close();
  a.release();
  await runningA;
}
{
  const cache = new TaskSearchCache();
  const read = cache.read(profile);
  const a = gate();
  const running = Effect.runPromise(
    prepareMany(cache, read, [text, "Late field B"], a.checkpoint),
  );
  await a.arrived;
  assert.equal(cache.usage.pendingBytes, 2148, "charged pending key/token");
  cache.revoke(profile);
  cache.evict(profile, text);
  absent(cache, "Purge removes pending slot and charge");
  a.release();
  const values = await running;
  assert.equal(values[0]?.preparedUnits, 1000);
  absent(cache, "NoStaleReadRetention late B after Purge");
  cache.close();
}
{
  const cache = new TaskSearchCache();
  const read = cache.read(profile);
  const a = gate();
  const running = Effect.runPromise(
    prepareMany(cache, read, [text, "Late Profile field"], a.checkpoint),
  );
  await a.arrived;
  cache.evictProfile(profile);
  a.release();
  const values = await running;
  assert.equal(values[0]?.preparedUnits, 1000);
  absent(cache, "NoStaleReadRetention stale Profile read");
  assert.equal(cache.usage.generationProfiles, 1);
  cache.close();
}
{
  const cache = new TaskSearchCache();
  const read = cache.read(profile);
  const a = gate();
  const running = Effect.runPromise(
    prepareMany(cache, read, [text, "Late closed field"], a.checkpoint),
  );
  await a.arrived;
  cache.close();
  a.release();
  await running;
  absent(cache, "close fences old and late field completions");
  assert.equal(cache.usage.generationProfiles, 0);
}
{
  const cache = new TaskSearchCache();
  const read = cache.read(profile);
  const a = gate();
  const b = gate();
  const controller = new AbortController();
  const runningA = Effect.runPromiseExit(
    prepareMany(cache, read, [text], a.checkpoint),
    { signal: controller.signal },
  );
  await a.arrived;
  const runningB = prepare(cache, read, text, b.checkpoint);
  await b.arrived;
  assert.deepEqual([cache.usage.pending, cache.usage.pendingBytes], [1, 2148]);
  controller.abort();
  const interrupted = await runningA;
  assert.equal(
    Exit.isFailure(interrupted) && Cause.hasInterruptsOnly(interrupted.cause),
    true,
  );
  assert.deepEqual(
    [cache.usage.pending, cache.usage.pendingBytes],
    [1, 2148],
    "OwnSlotCleanup interrupted A preserves B",
  );
  a.release();
  b.release();
  const preparedB = await runningB;
  assert.equal(await prepare(cache, read, text), preparedB);
  cache.close();
}
{
  const cache = new TaskSearchCache();
  const read = cache.read(profile);
  const a = gate();
  const b = gate();
  const runningA = prepare(cache, read, text, a.checkpoint);
  await a.arrived;
  cache.evict(profile, text);
  const runningB = prepare(cache, read, text, b.checkpoint);
  await b.arrived;
  b.release();
  const preparedB = await runningB;
  a.release();
  const preparedA = await runningA;
  assert.notEqual(preparedA, preparedB);
  assert.equal(
    await prepare(cache, read, text),
    preparedB,
    "NoInsertAfterEvict A Evict B CompleteB CompleteA keeps B provenance",
  );
  assert.equal(cache.usage.pending, 0);
  cache.close();
}
{
  const cache = new TaskSearchCache();
  const read = cache.read(profile);
  const a = gate();
  const controller = new AbortController();
  const running = Effect.runPromiseExit(
    prepareMany(cache, read, [text], a.checkpoint),
    { signal: controller.signal },
  );
  await a.arrived;
  controller.abort();
  const interrupted = await running;
  assert.equal(
    Exit.isFailure(interrupted) && Cause.hasInterruptsOnly(interrupted.cause),
    true,
  );
  absent(cache, "interrupt cleanup clears own token and charge");
  a.release();
  cache.close();
}
{
  const cache = new TaskSearchCache();
  const read = cache.read(profile);
  const exit = await Effect.runPromiseExit(
    prepareMany(
      cache,
      read,
      [text],
      Effect.fail("controlled checkpoint failure"),
    ),
  );
  assert.equal(Exit.isFailure(exit), true);
  absent(cache, "failure cleanup clears token and charge");
  cache.close();
}
{
  const cache = new TaskSearchCache();
  const read = cache.read(profile);
  const value = await prepare(cache, read, "ﷺ A!\n");
  assert.equal(
    value.preparedUnits,
    22,
    "exact units include punctuation and whitespace",
  );
  const expected: PreparedField[] = [];
  function* oracle(): Generator<void, TaskRead[]> {
    expected.push(yield* fieldWords("ﷺ A!\n"));
    return [];
  }
  await Effect.runPromise(runTaskRecordSteps(oracle(), noCheckpoint));
  assert.deepEqual(value, expected[0]);
  assert.equal(await prepare(cache, read, "ﷺ A!\n"), value);
  assert.deepEqual(
    await prepare(cache, read, "Café"),
    { words: [{ text: "cafe", start: 0, end: 4 }], preparedUnits: 4 },
    "text key Cafe",
  );
  assert.deepEqual(
    await prepare(cache, read, "Ship"),
    { words: [{ text: "ship", start: 0, end: 4 }], preparedUnits: 4 },
    "text key",
  );
  await prepare(cache, cache.read(personal), "Café");
  assert.equal(cache.usage.entries, 4, "Profile isolation");
  cache.close();
}
if (process.argv[2] !== "controls" && process.argv[2] !== "capacity") {
  const cache = new TaskSearchCache();
  const value = await prepare(cache, cache.read(profile), "ﷺ".repeat(100000));
  assert.equal(value.preparedUnits, 1800000);
  assert.equal(value.words.length, 300001);
  const bytes =
    200148 +
    64 +
    value.words.reduce((sum, word) => sum + 96 + 2 * word.text.length, 0);
  assert.equal(bytes, 32000308, "V3 key/container/Word charge");
  absent(cache, "V3 bypasses retention over 4 MiB");
  cache.close();
}

if (process.argv[2] !== "controls") {
  const cache = new TaskSearchCache();
  const read = cache.read(profile);
  const values: PreparedField[] = [];
  for (let i = 0; i < 4096; i++)
    values.push(await prepare(cache, read, `word${i}`));
  assert.deepEqual(
    [cache.usage.entries, cache.usage.pending, cache.usage.chargedBytes],
    [4096, 0, 1388200],
    "literal retained capacity/accounting",
  );
  const recent = values[0];
  assert.ok(recent);
  assert.equal(await prepare(cache, read, "word0"), recent);
  await prepare(cache, read, "word4096");
  assert.equal(cache.usage.entries, 4096, "EntryBound after eviction");
  assert.equal(
    await prepare(cache, read, "word0"),
    recent,
    "LRU recent hit survives",
  );
  assert.notEqual(
    await prepare(cache, read, "word1"),
    values[1],
    "LRU oldest field evicted",
  );
  cache.close();
}
if (process.argv[2] !== "controls" && process.argv[2] !== "capacity") {
  const cache = new TaskSearchCache();
  const read = cache.read(profile);
  for (let i = 0; i < 30; i++) {
    await prepare(cache, read, `${i} ${"word ".repeat(10000)}`);
    assert.ok(cache.usage.chargedBytes <= 16777216, "cocharged byte bound");
  }
  assert.deepEqual(
    [cache.usage.entries, cache.usage.pending, cache.usage.chargedBytes],
    [14, 0, 15964452],
    "literal dense-word byte capacity",
  );
  cache.close();
}
if (process.argv[2] !== "controls" && process.argv[2] !== "capacity") {
  const cache = new TaskSearchCache();
  const read = cache.read(profile);
  const parked: {
    control: AbortController;
    barrier: ReturnType<typeof gate>;
    result: ReturnType<typeof Effect.runPromiseExit<PreparedField[], unknown>>;
  }[] = [];
  for (let i = 0; i < 4096; i++) {
    const barrier = gate();
    const control = new AbortController();
    const result = Effect.runPromiseExit(
      prepareMany(cache, read, ["x".repeat(512) + i], barrier.checkpoint),
      { signal: control.signal },
    );
    parked.push({ control, barrier, result });
    await barrier.arrived;
  }
  assert.deepEqual(
    [cache.usage.pending, cache.usage.chargedBytes],
    [4096, 4831060],
    "literal pending-slot limit and charge",
  );
  const overflow = gate();
  const overflowResult = prepare(
    cache,
    read,
    "x".repeat(512) + "4096",
    overflow.checkpoint,
  );
  await overflow.arrived;
  assert.deepEqual(
    [cache.usage.pending, cache.usage.chargedBytes],
    [4096, 4831060],
    "slot-full bypass has no admission state",
  );
  for (const item of parked) item.control.abort();
  for (const item of parked) {
    const exit = await item.result;
    assert.equal(
      Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause),
      true,
    );
    item.barrier.release();
  }
  absent(cache, "all canceled pending slots release charges");
  overflow.release();
  const prepared = await overflowResult;
  assert.equal(prepared.preparedUnits, 516);
  absent(
    cache,
    "failed slot registration never admits after capacity becomes free",
  );
  cache.close();
}
if (process.argv[2] !== "controls" && process.argv[2] !== "capacity") {
  const cache = new TaskSearchCache();
  const read = cache.read(profile);
  const parked: {
    control: AbortController;
    barrier: ReturnType<typeof gate>;
    result: ReturnType<typeof Effect.runPromiseExit<PreparedField[], unknown>>;
  }[] = [];
  for (let i = 0; i < 100; i++) {
    const barrier = gate();
    const control = new AbortController();
    const result = Effect.runPromiseExit(
      prepareMany(cache, read, ["x".repeat(99990) + i], barrier.checkpoint),
      { signal: control.signal },
    );
    parked.push({ control, barrier, result });
    await barrier.arrived;
    assert.ok(
      cache.usage.chargedBytes <= 16777216,
      "pending byte bound after every registration",
    );
  }
  assert.deepEqual(
    [cache.usage.pending, cache.usage.chargedBytes],
    [83, 16610936],
    "literal cocharged pending byte capacity",
  );
  for (let i = 0; i < parked.length; i++)
    if (i !== 83) parked[i]?.control.abort();
  for (let i = 0; i < parked.length; i++) {
    if (i === 83) continue;
    const item = parked[i];
    assert.ok(item);
    const exit = await item.result;
    assert.equal(
      Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause),
      true,
    );
    item.barrier.release();
  }
  absent(cache, "pending byte capacity reclaimed after interrupt");
  const bypassed = parked[83];
  assert.ok(bypassed);
  bypassed.barrier.release();
  const exit = await bypassed.result;
  assert.equal(Exit.isSuccess(exit), true);
  absent(cache, "byte-full bypass never admits after space becomes free");
  cache.close();
}

if (process.argv[2] !== "controls" && process.argv[2] !== "capacity") {
  const atoms = Schema.decodeUnknownSync(Schema.Array(Schema.String))(
    JSON.parse(process.env.CACHE_ATOMS ?? "[]"),
  );
  assert.ok(atoms.length > 20, "reuse matcher Unicode generator atoms");
  let state = 0x5ea2c001;
  const next = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return state >>> 0;
  };
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
    "!!! café --",
    "a".repeat(100000),
  ];
  for (let i = 0; i < 2048; i++)
    corpus.push(
      Array.from(
        { length: 1 + (next() % 8) },
        () => atoms[next() % atoms.length],
      ).join(" / "),
    );
  const cache = new TaskSearchCache();
  const read = cache.read(profile);
  for (const value of corpus) {
    const cached = await prepare(cache, read, value);
    const oracle: PreparedField[] = [];
    function* steps(): Generator<void, TaskRead[]> {
      oracle.push(yield* fieldWords(value));
      return [];
    }
    await Effect.runPromise(runTaskRecordSteps(steps(), noCheckpoint));
    assert.deepEqual(
      cached,
      oracle[0],
      "complete Word arrays/offsets and exact preparedUnits",
    );
    if (value.length < 1000)
      assert.equal(
        await prepare(cache, read, value),
        cached,
        "warm field reuses complete payload",
      );
    assert.ok(cache.usage.chargedBytes <= 16777216);
  }
  cache.close();
}
{
  const cache = new TaskSearchCache();
  const oldRead = cache.read(profile);
  cache.revoke(profile);
  cache.evict(profile, "Café");
  const currentRead = cache.read(profile);
  const current = await prepare(cache, currentRead, "Café");
  let checkpoints = 0;
  assert.equal(
    await prepare(
      cache,
      oldRead,
      "Café",
      Effect.sync(() => {
        checkpoints++;
      }),
    ),
    current,
    "old read may reuse legitimately newer complete payload",
  );
  assert.deepEqual(
    [checkpoints, cache.usage.entries, cache.usage.pending],
    [0, 1, 0],
  );
  cache.close();
}

console.log(
  JSON.stringify({
    status: "PASS",
    driver: "SEC runTaskRecordSteps, no manual iteration",
    pendingCharge: 2148,
    v3EntryCharge: 32000308,
    scope:
      "immutable integrated cache/SEC runner; meter and SQLite lifecycle are checked separately",
  }),
);
