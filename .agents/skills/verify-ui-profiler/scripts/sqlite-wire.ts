import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
const evidence =
  process.argv[2] ?? "docs/evidence/ui-speed/recordings-manifest/wire-approved";
mkdirSync(evidence, { recursive: true });
import { resolve } from "node:path";
import { diagnosticFixture } from "../../../../apps/server/scripts/diagnostic-fixture.ts";
import {
  validateRecordingBatch,
  recordingLimits,
} from "../../../../packages/domain/src/diagnostic-recordings.ts";
import { event } from "../../../../packages/domain/test/fixtures/diagnostic-recording.ts";
const id = randomUUID(),
  joinId = randomUUID();
let batch: ReturnType<typeof validateRecordingBatch> | undefined,
  inputBytes = 0;
for (let n = 1; n <= 128 && !batch; n++)
  for (let length = 8; length <= 64 && !batch; length++) {
    const build = "a".repeat(length),
      events = Array.from({ length: n }, (_, i) => ({
        ...event,
        run_id: id,
        build_id: build,
        sequence: i + 1,
        monotonic_ms: i + 1,
        mode: "compact",
        input_kind: "accessibility",
        workload: "diagnostics_closed",
        profile_ordinal: 65535,
        input_timing: {
          basis: "release",
          hold_ms: 1000000000000,
          derived_from_native_selection: false,
        },
        selection_context: {
          list_rows: Number.MAX_SAFE_INTEGER,
          refresh_in_flight: false,
          process_uptime_ms: 1000000000000,
          journal_bytes: Number.MAX_SAFE_INTEGER,
        },
        request_id: joinId,
        refresh_id: joinId,
        parent_span_id: joinId,
        wall_anchor_ms: 1000000000000,
        metadata: {
          first_use: false,
          lock_holder: "external_or_unknown",
          operation: "attachments",
          statement: "store.projection",
          rows: Number.MAX_SAFE_INTEGER,
          bytes: Number.MAX_SAFE_INTEGER,
          work_units: 1000000000000,
          cache: "unknown",
          error: "not_found",
        },
        name: "span.finished",
        stage: "task_materialization",
        duration_ms: 1,
        outcome: "completed",
      }));
    const value = {
        schema_version: 1,
        batch_id: randomUUID(),
        run: {
          run_id: id,
          app: "macos",
          build_id: build,
          contract_id: event.contract_id,
        },
        events,
      },
      bytes = Buffer.byteLength(JSON.stringify(value));
    if (
      bytes <= recordingLimits.batchBytes &&
      bytes > recordingLimits.batchBytes - 116
    ) {
      batch = validateRecordingBatch(value);
      inputBytes = Buffer.byteLength(JSON.stringify(batch));
    }
  }
assert.ok(
  batch,
  "Find a legal metadata-only input within 116 bytes of the wire limit",
);
const selected = batch;
const f = await diagnosticFixture(true, 1),
  headers = {
    Authorization: "Bearer " + f.credential,
    "Content-Type": "application/json",
  };
let second: ReturnType<typeof spawn> | undefined;
const post = (value: unknown) =>
  fetch(f.url + "/diagnostics/profiler/ingest", {
    method: "POST",
    headers,
    body: JSON.stringify(value),
  });
try {
  const marked = {
    ...selected,
    batch_id: randomUUID(),
    run: {
      ...selected.run,
      admission: {
        schema_version: 1,
        policy: "whole_batch",
        refused_batches: 1,
        unadmitted_events: 3,
        incomplete: true,
      },
    },
    events: [],
  };
  assert.equal((await post(marked)).status, 200);
  const response = await post(selected),
    receipt = await response.json();
  assert.equal(response.status, 200);
  assert.equal(receipt.accepted, true);
  assert.equal(receipt.durability, "stored");
  const show = await fetch(f.url + "/diagnostics/profiler/runs/" + id, {
      headers,
    }),
    showBody = await show.json(),
    exported = await fetch(
      f.url + "/diagnostics/profiler/runs/" + id + "/export",
      { headers },
    ),
    exportBody = await exported.json();

  const collect = async (base: string) => {
    let cursor: string | undefined,
      pages = 0;
    const events: unknown[] = [];
    do {
      const response = await fetch(
        base +
          "/diagnostics/profiler/runs/" +
          id +
          "/export" +
          (cursor ? "?cursor=" + cursor : ""),
        { headers },
      );
      assert.equal(response.status, 200);
      const text = await response.text();
      assert.ok(Buffer.byteLength(text) <= 131072);
      const page = JSON.parse(text);
      assert.equal(page.batches[0].run.admission.incomplete, true);
      assert.equal(page.batches[0].run.admission.refused_batches, 1);
      events.push(...page.batches[0].events);
      cursor = page.next_cursor ?? undefined;
      pages++;
    } while (cursor);
    assert.deepEqual(events, selected.events);
    assert.ok(pages > 1);
    return pages;
  };
  const pagesBefore = await collect(f.url);
  const ended = new Promise<void>((r) => f.server.once("exit", () => r()));
  f.server.kill("SIGTERM");
  await ended;
  let log = "";
  second = spawn(resolve(".scratch/bin/todo-server"), [], {
    env: f.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  second.stdout!.on("data", (x) => (log += x));
  second.stderr!.on("data", (x) => (log += x));
  let url = "";
  const deadline = Date.now() + 60000;
  while (!url && Date.now() < deadline) {
    assert.equal(second.exitCode, null, log);
    url = log.match(/Listening on (http:\/\/127.0.0.1:\d+)/)?.[1] ?? "";
    if (!url) await Bun.sleep(10);
  }
  assert.ok(url, log);
  const after = await (
      await fetch(url + "/diagnostics/profiler/runs/" + id + "/export", {
        headers,
      })
    ).json(),
    tasks = await (
      await fetch(url + "/profiles/work/tasks", { headers })
    ).json();
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].title, "Benchmark Task 000");
  const pagesAfter = await collect(url);
  assert.equal(pagesAfter, pagesBefore);
  const runs = await (
    await fetch(url + "/diagnostics/profiler/runs", { headers })
  ).json();
  assert.equal(
    runs.runs.find((r: { run: { run_id: string } }) => r.run.run_id === id)
      .events,
    95,
  );
  writeFileSync(
    evidence + "/result.json",
    JSON.stringify(
      {
        result: "PASS",
        pages_before: pagesBefore,
        pages_after: pagesAfter,
        input_bytes: inputBytes,
        limit: recordingLimits.batchBytes,
        events: selected.events.length,
        old_snapshot_form_bytes: inputBytes + 116,
        receipt,
        live_show: { status: show.status, body: showBody },
        live_export: { status: exported.status, body: exportBody },
        after_restart_export: after,
        task_read_passed: true,
      },
      null,
      2,
    ),
  );
  assert.equal(
    exported.status,
    200,
    "Accepted input became unreadable after adding its known admission snapshot",
  );
  assert.equal(after.batches[0].run.admission.incomplete, true);
} finally {
  if (second && second.exitCode === null && second.signalCode === null) {
    const stopped = new Promise<void>((r) => second!.once("exit", () => r()));
    second.kill("SIGTERM");
    await stopped;
  }
  await f.close();
}
