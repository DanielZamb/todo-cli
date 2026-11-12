import { randomUUID } from "node:crypto";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "@effect/vitest";
import { validateRecordingBatch } from "../src/diagnostic-recordings.ts";
import { DiagnosticRecordings } from "../src/store/diagnostic-recordings.ts";
import {
  decodeManifest,
  manifestName,
} from "../src/store/recording-manifest.ts";
import { modelBatch } from "./fixtures/recording-authority.ts";

it("missing or corrupt sole authorities make both clean and marked runs absent and release orphans", async () => {
  for (const marked of [false, true])
    for (const mode of ["missing", "corrupt"]) {
      const root = await mkdtemp(join(tmpdir(), "todo-authority-absence-"));
      let store = await DiagnosticRecordings.open(root);
      const a = modelBatch(),
        b = modelBatch();
      try {
        store.ingest(a);
        store.ingest(b);
        await store.flush();
        if (marked) {
          expect(() =>
            store.ingest(
              validateRecordingBatch({
                ...a,
                batch_id: randomUUID(),
                events: [{ ...a.events[0], action_id: randomUUID() }],
              }),
            ),
          ).toThrow();
          await store.flush();
        }
        await store.close();
        const path = join(root, manifestName(a.run.run_id));
        if (mode === "missing") await rm(path);
        else await writeFile(path, "not a manifest");
        store = await DiagnosticRecordings.open(root);
        expect((await store.runs()).runs.map((x) => x.run.run_id)).toEqual([
          b.run.run_id,
        ]);
        await expect(store.show(a.run.run_id)).rejects.toThrow(
          "run is missing",
        );
        await expect(store.export(a.run.run_id)).rejects.toThrow(
          "run is missing",
        );
        await expect(store.compare(a.run.run_id, b.run.run_id)).rejects.toThrow(
          "run is missing",
        );
        expect((await store.show(b.run.run_id)).summary[0]?.starts).toBe(1);
        expect(store.status().bytes).toBe(4096);
        expect(store.status().admission_bytes).toBe(4096);
        expect(store.status().segments).toBe(1);
        expect(
          (await readdir(root)).filter((n) => /^\d{13}-/u.test(n)).length,
        ).toBe(1);
      } finally {
        await store.close();
        await rm(root, { recursive: true, force: true });
      }
    }
});
it("exports every acknowledged near-limit event across marked pages in order after restart and retries atomically", async () => {
  const root = await mkdtemp(join(tmpdir(), "todo-authority-split-"));
  let store = await DiagnosticRecordings.open(root);
  const seed = modelBatch(),
    base = seed.events[0];
  const events = Array.from({ length: 95 }, (_, i) => ({
    ...base,
    sequence: i + 1,
    monotonic_ms: i + 1,
    name: "span.finished",
    stage: "task_materialization",
    duration_ms: 1,
    outcome: "completed",
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
    request_id: randomUUID(),
    refresh_id: randomUUID(),
    parent_span_id: randomUUID(),
    wall_anchor_ms: 1000000000000,
  }));
  const batch = validateRecordingBatch({ ...seed, events });
  try {
    store.ingest({
      ...seed,
      events: [],
      run: {
        ...seed.run,
        admission: {
          schema_version: 1,
          policy: "whole_batch",
          refused_batches: 1,
          unadmitted_events: 3,
          incomplete: true,
        },
      },
    });
    await store.flush();
    const receipt = store.ingest(batch);
    await store.flush();
    expect(store.settledReceipt(receipt, batch.batch_id).accepted).toBe(true);
    const verify = async () => {
      let cursor: string | undefined;
      const found: unknown[] = [];
      let pages = 0;
      do {
        const page = await store.export(seed.run.run_id, cursor);
        expect(Buffer.byteLength(JSON.stringify(page))).toBeLessThanOrEqual(
          131072,
        );
        expect(page.batches[0]?.run.admission?.refused_batches).toBe(1);
        found.push(...(page.batches[0]?.events ?? []));
        cursor = page.next_cursor ?? undefined;
        pages++;
      } while (cursor);
      expect(found).toEqual(batch.events);
      expect(pages).toBeGreaterThan(1);
      expect((await store.runs()).runs[0]?.events).toBe(95);
    };
    await verify();
    await store.close();
    store = await DiagnosticRecordings.open(root);
    await verify();
    const before = store.status().segments;
    const retry = store.ingest(batch);
    await store.flush();
    expect(store.settledReceipt(retry, batch.batch_id).duplicate).toBe(true);
    expect(store.status().segments).toBe(before);
    await verify();
    expect(() =>
      store.ingest(
        validateRecordingBatch({
          ...batch,
          events: [
            ...batch.events.slice(0, -1),
            { ...batch.events[94], duration_ms: 99 },
          ],
        }),
      ),
    ).toThrow();
    await store.flush();
  } finally {
    await store.close();
    await rm(root, { recursive: true, force: true });
  }
});
it("manifest rotation counts evicted events and retains a healthy peer", async () => {
  const root = await mkdtemp(join(tmpdir(), "todo-authority-cap-"));
  const store = await DiagnosticRecordings.open(root);
  const a = modelBatch(),
    b = modelBatch();
  try {
    store.ingest(b);
    await store.flush();
    const peer = await readFile(join(root, manifestName(b.run.run_id)), "utf8");
    Reflect.set(store, "manifestCapacity", () => 2048);
    for (let i = 0; i < 20; i++) {
      store.ingest(modelBatch(a.run.run_id, i * 3));
      await store.flush();
    }
    const text = await readFile(join(root, manifestName(a.run.run_id)), "utf8"),
      m = decodeManifest(text);
    expect(Buffer.byteLength(text)).toBeLessThanOrEqual(262144);
    expect(m.segments.length).toBeLessThan(20);
    expect(m.loss.capacity_events).toBe((20 - m.segments.length) * 3);
    expect(m.run.admission?.incomplete).toBe(true);
    expect(
      (await store.show(a.run.run_id)).summary[0]?.fraction_by_20_ms,
    ).toBeNull();
    expect(await readFile(join(root, manifestName(b.run.run_id)), "utf8")).toBe(
      peer,
    );
    expect((await store.show(b.run.run_id)).summary[0]?.starts).toBe(1);
  } finally {
    await store.close();
    await rm(root, { recursive: true, force: true });
  }
});
it("refuses a live clean summary while its refusal manifest cannot be published, then retries the whole import", async () => {
  const root = await mkdtemp(join(tmpdir(), "todo-manifest-dirty-")),
    store = await DiagnosticRecordings.open(root),
    a = modelBatch();
  try {
    store.ingest(a);
    await store.flush();
    const blocker = join(root, manifestName(a.run.run_id) + ".tmp");
    const { mkdir } = await import("node:fs/promises");
    await mkdir(blocker);
    expect(() =>
      store.ingest(
        validateRecordingBatch({
          ...a,
          batch_id: randomUUID(),
          events: [{ ...a.events[0], action_id: randomUUID() }],
        }),
      ),
    ).toThrow();
    await store.flush();
    await expect(store.show(a.run.run_id)).rejects.toThrow(
      "metadata is unavailable",
    );
    await expect(store.export(a.run.run_id)).rejects.toThrow(
      "metadata is unavailable",
    );
    await rm(blocker, { recursive: true });
    store.ingest(a);
    await store.flush();
    expect(
      (await store.show(a.run.run_id)).summary[0]?.fraction_by_20_ms,
    ).toBeNull();
  } finally {
    await store.close();
    await rm(root, { recursive: true, force: true });
  }
});
it("keeps admissions closed until recovery has finished reading all authorities", async () => {
  const root = await mkdtemp(join(tmpdir(), "todo-manifest-ready-"));
  let store = await DiagnosticRecordings.open(root);
  const seed = modelBatch();
  store.ingest(seed);
  await store.flush();
  await store.close();
  store = DiagnosticRecordings.start(root);
  const original: unknown = Reflect.get(store, "read");
  let calls = 0,
    release: () => void = () => {},
    entered: () => void = () => {};
  const held = new Promise<void>((r) => {
      entered = r;
    }),
    gate = new Promise<void>((r) => {
      release = r;
    });
  Reflect.set(store, "read", async (name: string) => {
    if (name === manifestName(seed.run.run_id) && ++calls === 2) {
      entered();
      await gate;
    }
    if (typeof original !== "function") throw new Error("Missing read");
    return original.call(store, name);
  });
  try {
    await held;
    const next = modelBatch();
    expect(store.ingest(next).accepted).toBe(false);
    release();
    await store.flush();
    expect(store.ingest(next).accepted).toBe(true);
    await store.flush();
    expect((await store.show(next.run.run_id)).summary[0]?.starts).toBe(1);
  } finally {
    release();
    await store.close();
    await rm(root, { recursive: true, force: true });
  }
});
it("recovers counted eviction from the sole manifest when the global status file is absent", async () => {
  const root = await mkdtemp(join(tmpdir(), "todo-manifest-loss-"));
  let store = await DiagnosticRecordings.open(root);
  const a = modelBatch();
  try {
    store.ingest(a);
    await store.flush();
    const map: unknown = Reflect.get(store, "manifests"),
      evict: unknown = Reflect.get(store, "evict");
    expect(map instanceof Map).toBe(true);
    if (!(map instanceof Map) || typeof evict !== "function")
      throw new Error("Missing boundary");
    await evict.call(store, a.run.run_id, [map.get(a.run.run_id).segments[0]]);
    await store.close();
    await rm(join(root, "status.json"));
    store = await DiagnosticRecordings.open(root);
    expect(store.status().loss.capacity_events).toBe(3);
    expect(store.status().loss.dropped_events).toBe(3);
    expect(
      (await store.export(a.run.run_id)).batches[0]?.run.admission?.incomplete,
    ).toBe(true);
  } finally {
    await store.close();
    await rm(root, { recursive: true, force: true });
  }
});
it("charges a failed temporary removal and cleans it before any later recording growth", async () => {
  const root = await mkdtemp(join(tmpdir(), "todo-manifest-temp-")),
    store = await DiagnosticRecordings.open(root);
  const { chmod } = await import("node:fs/promises");
  try {
    await store.flush();
    const path = join(root, "failed.json.tmp");
    await writeFile(path, "partial");
    await chmod(root, 0o500);
    const atomic: unknown = Reflect.get(store, "atomic");
    if (typeof atomic !== "function") throw new Error("Missing boundary");
    await expect(
      atomic.call(store, "failed.json", "replacement"),
    ).rejects.toThrow();
    expect(store.status().bytes).toBe(4096);
    await chmod(root, 0o700);
    const receipt = store.ingest(modelBatch());
    await store.flush();
    expect(store.settledReceipt(receipt, "").accepted).toBe(true);
    expect((await readdir(root)).includes("failed.json.tmp")).toBe(false);
    expect(store.status().bytes).toBe(4096);
  } finally {
    await chmod(root, 0o700);
    await store.close();
    await rm(root, { recursive: true, force: true });
  }
});
