import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, chmod, rm, writeFile, readdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { mkdirSync } from "node:fs";
const evidence = resolve(
  process.argv[2] ??
    "docs/evidence/ui-speed/recordings-manifest/expiry-approved",
);
mkdirSync(evidence, { recursive: true });
import { DiagnosticRecordings } from "../../../../packages/domain/src/store/diagnostic-recordings.ts";
import { validateRecordingBatch } from "../../../../packages/domain/src/diagnostic-recordings.ts";
import { event } from "../../../../packages/domain/test/fixtures/diagnostic-recording.ts";
const directory = await mkdtemp(join(tmpdir(), "todo-expired-dirty-"));
let now = 1000;
const store = await DiagnosticRecordings.open(directory, { now: () => now });
const batch = () => {
  const id = randomUUID();
  return validateRecordingBatch({
    schema_version: 1,
    batch_id: randomUUID(),
    run: {
      run_id: id,
      app: "macos",
      build_id: event.build_id,
      contract_id: event.contract_id,
    },
    events: [{ ...event, run_id: id }],
  });
};
try {
  store.ingest(batch());
  await store.flush();
  await chmod(directory, 0o500);
  const failed = batch();
  store.ingest(failed);
  await store.flush();
  assert.equal(store.admissionDurable(failed.run.run_id), false);
  await chmod(directory, 0o700);
  now += 6 * 86400000;
  const fresh = batch();
  store.ingest(fresh);
  await store.flush();
  now = 1000 + 8 * 86400000;
  const results = [];
  for (let n = 0; n < 3; n++) {
    try {
      results.push({ ok: true, response: await store.runs() });
    } catch (e) {
      results.push({
        ok: false,
        code: e instanceof Error && "code" in e ? e.code : null,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }
  let freshShow: unknown;
  try {
    freshShow = { ok: true, value: await store.show(fresh.run.run_id) };
  } catch (e) {
    freshShow = {
      ok: false,
      code: e instanceof Error && "code" in e ? e.code : null,
    };
  }
  const files = await readdir(directory);
  await writeFile(
    join(evidence, "result.json"),
    JSON.stringify(
      {
        results,
        fresh_run_created_on_day: 6,
        query_day: 8,
        freshShow,
        remaining_files: files,
        status: store.status(),
        dirty_runs: [...Reflect.get(store, "refusals").keys()],
      },
      null,
      2,
    ),
  );
  assert.ok(
    results.every((x) => x.ok),
    "Expired unpersisted admission state must not poison every recordings query after storage recovers",
  );
} finally {
  await chmod(directory, 0o700);
  await store.close();
  await rm(directory, { recursive: true, force: true });
}
