import { randomUUID } from "node:crypto";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "@effect/vitest";
import { validateRecordingBatch } from "../src/diagnostic-recordings.ts";
import { DiagnosticRecordings } from "../src/store/diagnostic-recordings.ts";
import { manifestName } from "../src/store/recording-manifest.ts";
import { modelBatch } from "./fixtures/recording-authority.ts";

it("enumerates every missing, truncated and corrupt subset of a two-segment refused run", async () => {
  const source = await mkdtemp(join(tmpdir(), "todo-authority-source-"));
  const a = modelBatch(),
    b = modelBatch(a.run.run_id, 3),
    healthy = modelBatch();
  let store = await DiagnosticRecordings.open(source);
  try {
    store.ingest(a);
    store.ingest(b);
    store.ingest(healthy);
    await store.flush();
    expect(() =>
      store.ingest(
        validateRecordingBatch({
          ...a,
          batch_id: randomUUID(),
          events: [{ ...a.events[0], action_id: randomUUID() }],
        }),
      ),
    ).toThrow("Whole batch refused");
    await store.flush();
    await store.close();
    const files = new Map<string, string>();
    for (const name of await readdir(source))
      if (name.endsWith(".json"))
        files.set(name, await readFile(join(source, name), "utf8"));
    const manifest = JSON.parse(
      files.get(manifestName(a.run.run_id)) ?? "",
    ).manifest;
    const names = [
      manifestName(a.run.run_id),
      ...manifest.segments.map(
        (s: { time: number; id: string }) =>
          `${String(s.time).padStart(13, "0")}-${s.id}.json`,
      ),
    ];
    expect(names.length).toBe(3);
    for (let state = 0; state < 64; state++) {
      const root = await mkdtemp(join(tmpdir(), "todo-authority-state-"));
      try {
        for (const [name, text] of files)
          await writeFile(join(root, name), text);
        let code = state;
        for (const name of names) {
          const mode = code % 4;
          code = Math.floor(code / 4);
          if (mode === 1) await rm(join(root, name));
          if (mode === 2)
            await writeFile(
              join(root, name),
              (files.get(name) ?? "").slice(0, 12),
            );
          if (mode === 3)
            await writeFile(
              join(root, name),
              (files.get(name) ?? "").replace('"run_id"', '"bad_id"'),
            );
        }
        store = await DiagnosticRecordings.open(root);
        expect((await store.show(healthy.run.run_id)).summary[0]?.starts).toBe(
          1,
        );
        expect(
          (await store.compare(healthy.run.run_id, healthy.run.run_id))
            .comparable,
        ).toBe(true);
        const listed = await store.runs();
        if (state % 4 !== 0) {
          expect(listed.runs.some((x) => x.run.run_id === a.run.run_id)).toBe(
            false,
          );
          await expect(store.show(a.run.run_id)).rejects.toThrow(
            "run is missing",
          );
          await expect(store.export(a.run.run_id)).rejects.toThrow(
            "run is missing",
          );
          await expect(
            store.compare(a.run.run_id, healthy.run.run_id),
          ).rejects.toThrow("run is missing");
        } else {
          const shown = await store.show(a.run.run_id);
          expect(shown.run.admission?.incomplete).toBe(true);
          for (const row of shown.summary) {
            expect(row.fraction_by_20_ms).toBeNull();
            expect(row.fraction_by_300_ms).toBeNull();
          }
          expect(
            (await store.export(a.run.run_id)).batches[0]?.run.admission
              ?.incomplete,
          ).toBe(true);
        }
        await store.close();
      } finally {
        await store.close();
        await rm(root, { recursive: true, force: true });
      }
    }
  } finally {
    await store.close();
    await rm(source, { recursive: true, force: true });
  }
});
