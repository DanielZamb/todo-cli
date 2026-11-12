import { randomUUID } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "@effect/vitest";
import { vi } from "vitest";
import {
  recordingLimits,
  validateRecordingBatch,
} from "../src/diagnostic-recordings.ts";
import {
  recordingComparisonRefusal,
  summarizeRecording,
} from "../src/diagnostic-run-summary.ts";
import { DiagnosticRecordings } from "../src/store/diagnostic-recordings.ts";
import { event, uuid } from "./fixtures/diagnostic-recording.ts";

const batch = (run = uuid) =>
  validateRecordingBatch({
    schema_version: 1,
    batch_id: randomUUID(),
    run: {
      run_id: run,
      app: "macos",
      build_id: event.build_id,
      contract_id: event.contract_id,
    },
    events: [{ ...event, run_id: run }],
  });
it("refuses a conflicting producer sequence without improving either deadline fraction", async () => {
  const root = await mkdtemp(join(tmpdir(), "todo-sequence-conflict-"));
  const store = await DiagnosticRecordings.open(root);
  try {
    const first = batch();
    store.ingest(first);
    await store.flush();
    const conflicting = validateRecordingBatch({
      ...batch(),
      events: [
        { ...event, action_id: randomUUID() },
        {
          ...event,
          sequence: 2,
          monotonic_ms: 18,
          name: "ui.result.committed",
          duration_ms: 8,
          outcome: "completed",
          correct: true,
          render_stage: "layout_complete",
        },
      ],
    });
    expect(() => store.ingest(conflicting)).toThrow(
      "Recording sequence conflicts",
    );
    expect(() => store.ingest(conflicting, true)).toThrow(
      "Recording sequence conflicts",
    );
    const same = batch();
    expect(store.ingest(same).accepted).toBe(true);
    expect(store.status().segments).toBe(1);
    await store.flush();
    const row = (await store.show(uuid)).summary[0];
    expect(row?.starts).toBe(1);
    expect(row?.completed_samples).toBe(0);
    expect(row?.fraction_by_20_ms).toBe(0);
    expect(row?.fraction_by_300_ms).toBe(0);
  } finally {
    await store.close();
    await rm(root, { recursive: true, force: true });
  }
});
it("backs off a permanently failed expiry for a full minute and resumes normal scheduling after recovery", async () => {
  const root = await mkdtemp(join(tmpdir(), "todo-expiry-backoff-"));
  vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
  vi.setSystemTime(1000);
  const timer = vi.spyOn(globalThis, "setTimeout");
  const store = await DiagnosticRecordings.open(root);
  try {
    store.ingest(batch());
    await store.flush();
    const name = (await readdir(root)).find((name) => /^\d/u.test(name));
    if (!name) throw new Error("Missing segment");
    const path = join(root, name),
      text = await readFile(path, "utf8");
    await rm(path);
    await mkdir(path);
    await vi.advanceTimersByTimeAsync(recordingLimits.retentionMs + 1);
    await store.flush();
    expect(store.status().loss.storage_failures).toBe(1);
    expect(timer.mock.calls.at(-1)?.[1]).toBe(60000);
    const timers = timer.mock.calls.length;
    store.ingest(batch(randomUUID()));
    await store.flush();
    expect(timer.mock.calls.length).toBe(timers);
    expect(store.status().loss.storage_failures).toBe(2);
    await vi.advanceTimersByTimeAsync(59999);
    await store.flush();
    expect(store.status().loss.storage_failures).toBe(2);
    await vi.advanceTimersByTimeAsync(1);
    await store.flush();
    expect(store.status().loss.storage_failures).toBe(3);
    expect(timer.mock.calls.at(-1)?.[1]).toBe(60000);
    await rm(path, { recursive: true });
    await writeFile(path, text, { mode: 0o600 });
    await vi.advanceTimersByTimeAsync(60000);
    await store.flush();
    expect(store.status().segments).toBe(0);
    expect(store.status().loss.expired_events).toBe(1);
    store.ingest(batch(randomUUID()));
    await store.flush();
    expect(timer.mock.calls.at(-1)?.[1]).toBe(recordingLimits.retentionMs + 1);
  } finally {
    await store.close();
    timer.mockRestore();
    vi.useRealTimers();
    await rm(root, { recursive: true, force: true });
  }
});
it("keeps only retained and actually pending manifests during continuous admission", async () => {
  const root = await mkdtemp(join(tmpdir(), "todo-busy-manifests-"));
  const store = await DiagnosticRecordings.open(root, { appBytes: 4096 });
  try {
    store.ingest(batch(randomUUID()));
    for (let n = 0; n < 1000; n++) {
      const previous = store.flush();
      expect(store.ingest(batch(randomUUID())).accepted).toBe(true);
      await previous;
      const manifests: unknown = Reflect.get(store, "manifests");
      if (!(manifests instanceof Map)) throw new Error("Missing manifests");
      expect(manifests.size).toBeLessThanOrEqual(2);
      const index: unknown = Reflect.get(store, "eventIndex");
      if (typeof index !== "object" || !index)
        throw new Error("Missing event index");
      const events: unknown = Reflect.get(index, "events");
      if (!(events instanceof Map)) throw new Error("Missing event identities");
      expect(events.size).toBeLessThanOrEqual(2);
      expect(store.status().segments).toBe(1);
      expect(store.status().queued_bytes).toBeGreaterThan(0);
    }
  } finally {
    await store.close();
    await rm(root, { recursive: true, force: true });
  }
});

it("does not acknowledge a pending event duplicate as already stored", async () => {
  const root = await mkdtemp(join(tmpdir(), "todo-pending-event-"));
  const store = await DiagnosticRecordings.open(root);
  try {
    store.ingest(batch());
    expect(store.ingest(batch()).durability).toBe("queued");
    await store.flush();
    expect(store.ingest(batch()).durability).toBe("stored");
  } finally {
    await store.close();
    await rm(root, { recursive: true, force: true });
  }
});

it("bounds pending identities before the byte queue fills", async () => {
  const root = await mkdtemp(join(tmpdir(), "todo-pending-bound-"));
  const store = await DiagnosticRecordings.open(root);
  try {
    let accepted = 0;
    for (let n = 0; n < 1025; n++)
      accepted += Number(store.ingest(batch(randomUUID())).accepted);
    expect(accepted).toBe(1024);
    expect(store.status().loss.dropped_batches).toBe(1);
    expect(store.status().queued_bytes).toBeLessThan(1048576);
    const manifests: unknown = Reflect.get(store, "manifests");
    if (!(manifests instanceof Map)) throw new Error("Missing manifests");
    expect(manifests.size).toBe(1024);
  } finally {
    await store.close();
    await rm(root, { recursive: true, force: true });
  }
});
it("refuses summaries of legacy segments containing conflicting sequences", async () => {
  const root = await mkdtemp(join(tmpdir(), "todo-legacy-conflict-"));
  const first = await DiagnosticRecordings.open(root);
  first.ingest(batch());
  await first.close();
  const second = validateRecordingBatch({
    ...batch(),
    events: [{ ...event, action_id: randomUUID() }],
  });
  const received = Date.now();
  await writeFile(
    join(root, `${received}-${second.batch_id}.json`),
    JSON.stringify({ received, batch: second }),
    { mode: 0o600 },
  );
  const recovered = await DiagnosticRecordings.open(root);
  try {
    expect(recovered.status().segments).toBe(2);
    await expect(recovered.show(uuid)).rejects.toThrow(
      "Recording sequence conflicts",
    );
    expect(() => recovered.ingest(batch())).toThrow(
      "Recording sequence conflicts",
    );
  } finally {
    await recovered.close();
    await rm(root, { recursive: true, force: true });
  }
});

it("uses the same conflict rule in the public pure reducer", () => {
  const first = batch();
  const conflicting = validateRecordingBatch({
    ...batch(),
    events: [{ ...event, action_id: randomUUID() }],
  });
  expect(() =>
    summarizeRecording([...first.events, ...conflicting.events]),
  ).toThrow("Recording sequence conflicts");
  expect(
    summarizeRecording([...first.events, ...first.events])[0]?.starts,
  ).toBe(1);
});

it("refuses two contradictory results for one action instead of keeping the faster first one", () => {
  const events = validateRecordingBatch({
    ...batch(),
    events: [
      event,
      {
        ...event,
        sequence: 2,
        monotonic_ms: 18,
        name: "ui.result.committed",
        duration_ms: 8,
        outcome: "completed",
        correct: true,
        render_stage: "layout_complete",
      },
      {
        ...event,
        sequence: 3,
        monotonic_ms: 10010,
        name: "ui.result.committed",
        duration_ms: 10000,
        outcome: "failed",
        correct: false,
        render_stage: "layout_complete",
      },
    ],
  }).events;
  expect(() => summarizeRecording(events)).toThrow(
    "Recording action phases conflict",
  );
});

it("names each safe comparison refusal without returning any condition value", () => {
  const before = {
    ...batch().run,
    comparison: {
      fixture_hash: "c".repeat(64),
      script_hash: "d".repeat(64),
      environment_hash: "e".repeat(64),
      configuration: "release",
      render_stage: "layout_complete",
      concurrency: 1,
    } as const,
  };
  expect(recordingComparisonRefusal(before, before)).toBeUndefined();
  expect(recordingComparisonRefusal(before, batch().run)).toBe(
    "missing_comparison",
  );
  expect(
    recordingComparisonRefusal(before, { ...before, build_id: "dev" }),
  ).toBe("unknown_build");
  expect(
    recordingComparisonRefusal(before, { ...before, contract_id: "unknown" }),
  ).toBe("unknown_contract");
  expect(recordingComparisonRefusal(before, { ...before, app: "cli" })).toBe(
    "app_mismatch",
  );
  expect(
    recordingComparisonRefusal(before, {
      ...before,
      contract_id: "f".repeat(64),
    }),
  ).toBe("contract_mismatch");
  for (const [after, reason] of [
    [
      { ...before.comparison, fixture_hash: "f".repeat(64) },
      "fixture_mismatch",
    ],
    [{ ...before.comparison, script_hash: "f".repeat(64) }, "script_mismatch"],
    [
      { ...before.comparison, environment_hash: "f".repeat(64) },
      "environment_mismatch",
    ],
    [
      { ...before.comparison, configuration: "unknown" },
      "unknown_configuration",
    ],
    [
      { ...before.comparison, configuration: "debug" },
      "configuration_mismatch",
    ],
    [{ ...before.comparison, render_stage: "unknown" }, "unknown_render_stage"],
    [
      { ...before.comparison, render_stage: "unavailable" },
      "unknown_render_stage",
    ],
    [
      { ...before.comparison, render_stage: "presented_frame" },
      "render_stage_mismatch",
    ],
    [{ ...before.comparison, concurrency: 2 }, "concurrency_mismatch"],
  ] as const)
    expect(
      recordingComparisonRefusal(before, { ...before, comparison: after }),
    ).toBe(reason);
});
