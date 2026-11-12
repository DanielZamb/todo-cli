import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile, readdir, chmod } from "node:fs/promises";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { mkdirSync } from "node:fs";
import { DiagnosticRecordings } from "../../../../packages/domain/src/store/diagnostic-recordings.ts";
import {
  validateRecordingBatch,
  recordingLimits,
} from "../../../../packages/domain/src/diagnostic-recordings.ts";
import { analyzeRecording } from "../../../../packages/domain/src/diagnostic-run-summary.ts";
import { RecordingRefusal } from "../../../../packages/domain/src/recording-refusal.ts";
import { event } from "../../../../packages/domain/test/fixtures/diagnostic-recording.ts";
const ev = resolve(
    process.argv[2] ??
      "docs/evidence/ui-speed/recordings-manifest/identity-approved",
  ),
  results: object[] = [];
mkdirSync(ev, { recursive: true });
let failures = 0;
const make = (
  run_id: string,
  events: unknown[],
  batch_id = randomUUID(),
  app = "macos",
) =>
  validateRecordingBatch({
    schema_version: 1,
    batch_id,
    run: {
      run_id,
      app,
      build_id: event.build_id,
      contract_id: event.contract_id,
    },
    events,
  });
const start = (
  run_id: string,
  sequence = 1,
  action_id = randomUUID(),
  role = "macos",
) => ({
  ...event,
  run_id,
  sequence,
  action_id,
  process_role: role,
  monotonic_ms: sequence * 10,
});
const result = (
  e: ReturnType<typeof start>,
  sequence = 2,
  duration_ms = 8,
) => ({
  ...e,
  name: "ui.result.committed",
  sequence,
  monotonic_ms: sequence * 10,
  duration_ms,
  correct: true,
  render_stage: "layout_complete",
  outcome: "completed",
});
async function test(name: string, run: () => Promise<unknown>) {
  try {
    const observed = await run();
    results.push({ name, result: "PASS", observed });
  } catch (e) {
    failures++;
    results.push({
      name,
      result: "FAIL",
      error: e instanceof Error ? e.message : String(e),
    });
  }
  await writeFile(
    join(ev, "identity.json"),
    JSON.stringify({ failures, results }, null, 2),
  );
}
async function fixture(
  run: (store: DiagnosticRecordings, dir: string) => Promise<unknown>,
  options: Parameters<typeof DiagnosticRecordings.open>[1] = {},
) {
  const dir = await mkdtemp(join(tmpdir(), "todo-manifest-identity-"));
  const store = await DiagnosticRecordings.open(dir, options);
  try {
    return await run(store, dir);
  } finally {
    await store.close();
    await rm(dir, { recursive: true, force: true });
  }
}

await test("original sequence witness refuses before admission and retains unfinished start", () =>
  fixture(async (store) => {
    const run = randomUUID(),
      a = start(run),
      first = make(run, [a]);
    store.ingest(first);
    await store.flush();
    const conflict = make(run, [{ ...a, action_id: randomUUID() }, result(a)]);
    assert.throws(() => store.ingest(conflict), /Recording sequence conflicts/);
    assert.throws(
      () => store.ingest(conflict, true),
      /Recording sequence conflicts/,
    );
    const show = await store.show(run);
    assert.equal(show.summary[0]?.starts, 1);
    assert.equal(show.summary[0]?.completed_samples, 0);
    assert.equal(show.summary[0]?.fraction_by_20_ms, null);
    assert.equal(show.summary[0]?.fraction_by_300_ms, null);
    return show;
  }));

await test("conflict-first ordering also refuses contradictory later facts", () =>
  fixture(async (store) => {
    const run = randomUUID(),
      a = start(run),
      wrong = { ...a, action_id: randomUUID() },
      bad = make(run, [wrong, result(a)]);
    store.ingest(bad);
    await store.flush();
    assert.throws(
      () => store.ingest(make(run, [a])),
      /Recording sequence conflicts/,
    );
    const show = await store.show(run);
    assert.equal(
      show.summary.reduce((n, x) => n + x.starts, 0),
      2,
    );
    assert.equal(show.summary[0]?.fraction_by_20_ms, null);
    return show;
  }));

await test("lost acknowledgement retries and canonical key reorder are stored no-ops across restart", () =>
  fixture(async (store, dir) => {
    const run = randomUUID(),
      a = start(run),
      batch = make(run, [a, result(a)]);
    store.ingest(batch);
    await store.flush();
    const retried = store.ingest(batch);
    assert.equal(retried.durability, "queued");
    await store.flush();
    assert.equal(
      store.settledReceipt(retried, batch.batch_id).durability,
      "stored",
    );
    const repeat = make(run, [a, result(a)]);
    assert.equal(store.ingest(repeat).duplicate, true);
    assert.equal(store.status().segments, 1);
    await store.close();
    const next = await DiagnosticRecordings.open(dir);
    try {
      const retried = next.ingest(batch);
      assert.equal(retried.durability, "queued");
      await next.flush();
      assert.equal(
        next.settledReceipt(retried, batch.batch_id).durability,
        "stored",
      );
      assert.equal(next.ingest(repeat).duplicate, true);
      assert.equal(next.status().segments, 1);
      assert.equal((await next.show(run)).summary[0]?.starts, 1);
      return next.status();
    } finally {
      await next.close();
    }
  }));

await test("pending duplicate never acknowledges unstored data and failed references release", () =>
  fixture(async (store, dir) => {
    const run = randomUUID(),
      a = start(run),
      one = make(run, [a]),
      two = make(run, [a]);
    store.ingest(one);
    assert.equal(store.ingest(two).durability, "queued");
    await store.flush();
    assert.equal((await store.show(run)).summary[0]?.starts, 1);
    await chmod(dir, 0o500);
    const otherRun = randomUUID(),
      other = make(otherRun, [start(otherRun)]),
      receipt = store.ingest(other);
    await store.flush();
    assert.equal(store.settledReceipt(receipt, other.batch_id).accepted, false);
    await chmod(dir, 0o700);
    assert.equal(store.ingest(other).accepted, true);
    await store.flush();
    assert.equal((await store.show(otherRun)).summary[0]?.starts, 1);
    return store.status();
  }));

await test("two producers with same sequence and action remain separate", () =>
  fixture(async (store) => {
    const run = randomUUID(),
      action = randomUUID(),
      main = start(run, 1, action, "electron.main"),
      renderer = start(run, 1, action, "electron.renderer");
    store.ingest(
      make(
        run,
        [main, renderer, result(main), result(renderer)],
        randomUUID(),
        "electron",
      ),
    );
    await store.flush();
    const show = await store.show(run);
    assert.equal(show.summary.length, 2);
    assert.ok(
      show.summary.every((x) => x.starts === 1 && x.completed_samples === 1),
    );
    return show.summary;
  }));

await test("same producer sequence and action in two runs remains separate in store", () =>
  fixture(async (store) => {
    const action = randomUUID(),
      one = randomUUID(),
      two = randomUUID();
    for (const run of [one, two]) {
      const a = start(run, 1, action);
      store.ingest(make(run, [a, result(a)]));
      await store.flush();
    }
    assert.equal((await store.show(one)).summary[0]?.starts, 1);
    assert.equal((await store.show(two)).summary[0]?.starts, 1);
    return (await store.runs()).runs;
  }));

await test("legitimate input, handler, end and render phase joins are accepted", () =>
  fixture(async (store) => {
    const run = randomUUID(),
      a = start(run),
      events = [
        { ...a, name: "ui.input.observed" },
        { ...a, sequence: 2, monotonic_ms: 20 },
        {
          ...a,
          name: "ui.action.ended",
          sequence: 3,
          monotonic_ms: 30,
          duration_ms: 15,
          outcome: "completed",
        },
        result(a, 4, 25),
      ];
    store.ingest(make(run, events));
    await store.flush();
    const show = await store.show(run);
    assert.equal(show.summary[0]?.starts, 1);
    assert.equal(show.summary[0]?.completed_samples, 1);
    assert.equal(show.summary[0]?.p50_ms, 25);
    return show;
  }));

await test("eviction and expiry release index; a retry after complete eviction can restore retained data", () =>
  fixture(
    async (store) => {
      const one = randomUUID(),
        two = randomUUID(),
        batch = make(one, [start(one)]);
      store.ingest(batch);
      await store.flush();
      store.ingest(make(two, [start(two)]));
      await store.flush();
      assert.equal((await store.runs()).runs.length, 1);
      assert.equal(store.ingest(batch).accepted, true);
      await store.flush();
      assert.equal((await store.show(one)).summary[0]?.starts, 1);
      const index = Reflect.get(store, "eventIndex");
      const events = Reflect.get(index, "events");
      assert.ok(events instanceof Map);
      assert.equal(events.size, 1);
      return { status: store.status(), event_keys: events.size };
    },
    { appBytes: 12288 },
  ));

await test("expiry releases event and run references", async () => {
  let now = 1000;
  return fixture(
    async (store) => {
      const run = randomUUID();
      store.ingest(make(run, [start(run)]));
      await store.flush();
      now += recordingLimits.retentionMs + 1;
      await store.runs();
      const events = Reflect.get(Reflect.get(store, "eventIndex"), "events"),
        manifests = Reflect.get(store, "manifests");
      assert.ok(events instanceof Map && manifests instanceof Map);
      assert.equal(events.size, 0);
      assert.equal(manifests.size, 0);
      return store.status();
    },
    { now: () => now },
  );
});

await test("legacy contradictory files and pure reducer refuse rather than choose a payload", () =>
  fixture(async (store, dir) => {
    const run = randomUUID(),
      a = start(run),
      first = make(run, [a]);
    store.ingest(first);
    await store.flush();
    await store.close();
    const other = make(run, [{ ...a, action_id: randomUUID() }]);
    const received = Date.now() + 1;
    await writeFile(
      join(dir, received + "-" + other.batch_id + ".json"),
      JSON.stringify({ received, batch: other }),
    );
    assert.throws(
      () => analyzeRecording([...first.events, ...other.events]),
      /Recording sequence conflicts/,
    );
    const next = await DiagnosticRecordings.open(dir);
    try {
      assert.equal((await next.show(run)).summary[0]?.starts, 1);
      assert.equal(
        (await readdir(dir)).filter((n) => /^\d{13}-.*\.json$/u.test(n)).length,
        1,
      );
      return next.status();
    } finally {
      await next.close();
    }
  }));

await test("repeated contradictory action result is refused in pure and stored summaries", () =>
  fixture(async (store) => {
    const run = randomUUID(),
      a = start(run),
      fast = result(a),
      slow = { ...result(a, 3, 10000), outcome: "failed", correct: false };
    const batch = make(run, [a, fast, slow]);
    assert.throws(
      () => analyzeRecording(batch.events),
      /Recording action phases conflict/,
    );
    store.ingest(batch);
    await store.flush();
    await assert.rejects(store.show(run), /Recording action phases conflict/);
    return { ingest_stored: true, summary_refused: true };
  }));

await test("refused batch containing new starts leaves its existing run visibly incomplete", () =>
  fixture(async (store) => {
    const run = randomUUID(),
      a = start(run),
      complete = make(run, [
        a,
        result(a),
        {
          ...a,
          sequence: 3,
          name: "process.terminated",
          reason: "clean",
          monotonic_ms: 30,
        },
      ]);
    store.ingest(complete);
    await store.flush();
    const b = start(run, 4),
      conflicting = make(run, [
        { ...a, action_id: randomUUID() },
        b,
        result(b, 5, 1),
      ]);
    assert.throws(
      () => store.ingest(conflicting),
      /Recording sequence conflicts/,
    );
    const show = await store.show(run);
    await writeFile(
      join(ev, "refusal-loss-witness.json"),
      JSON.stringify(
        { refused_batch_events: conflicting.events.length, summary: show },
        null,
        2,
      ),
    );
    assert.ok(
      show.summary[0]?.evidence === "incomplete" ||
        show.summary[0]?.fraction_by_20_ms === null,
      "Refused batch removed new starts, but run still claims " +
        JSON.stringify({
          fraction: show.summary[0]?.fraction_by_20_ms,
          evidence: show.summary[0]?.evidence,
          loss: show.status.loss,
        }),
    );
    return show;
  }));

await test("public reducer scopes same producer/action across different runs or explicitly refuses mixed runs", async () => {
  const aRun = randomUUID(),
    bRun = randomUUID(),
    action = randomUUID(),
    a = start(aRun, 1, action),
    b = start(bRun, 1, action);
  let show;
  try {
    show = analyzeRecording(
      make(aRun, [a, result(a)]).events.concat(
        make(bRun, [b, result(b, 2, 400)]).events,
      ),
    );
  } catch (e) {
    assert.ok(e instanceof RecordingRefusal);
    return { mixed_run_refusal: true };
  }
  await writeFile(
    join(ev, "mixed-run-witness.json"),
    JSON.stringify(show, null, 2),
  );
  assert.equal(
    show.summary.length,
    2,
    "Valid identities from two runs silently collapse in public reducer",
  );
  return show;
});
await writeFile(
  join(ev, "identity.json"),
  JSON.stringify(
    { result: failures ? "FAIL" : "PASS", failures, results },
    null,
    2,
  ),
);
process.exitCode = failures ? 1 : 0;
