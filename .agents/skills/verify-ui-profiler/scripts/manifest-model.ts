import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DiagnosticRecordings } from "../../../../packages/domain/src/store/diagnostic-recordings.ts";
import {
  inspectManifest,
  manifestName,
  segmentName,
  encodeManifest,
  decodeManifest,
} from "../../../../packages/domain/src/store/recording-manifest.ts";
import {
  validateRecordingBatch,
  recordingLimits,
  type RecordingBatch,
} from "../../../../packages/domain/src/diagnostic-recordings.ts";
import { RecordingQueries } from "../../../../packages/domain/src/store/recording-queries.ts";
import { modelBatch } from "../../../../packages/domain/test/fixtures/recording-authority.ts";
const evidence = resolve(
  process.argv[2] ?? "docs/evidence/ui-speed/recordings-manifest/model",
);
mkdirSync(evidence, { recursive: true });
const rows: object[] = [];
let checked = 0,
  prefixes = 0;
async function reopenImage(
  files: ReadonlyMap<string, string>,
  at: number,
  a: RecordingBatch,
  healthy: RecordingBatch,
) {
  const root = await mkdtemp(join(tmpdir(), "todo-manifest-enumerated-"));
  let store: DiagnosticRecordings | undefined;
  try {
    for (const [name, text] of files)
      await writeFile(join(root, name), text, { mode: 0o600 });
    const inspected = await inspectManifest(
      files.get(manifestName(a.run.run_id)),
      async (name) => files.get(name),
    );
    const cutoff = at - recordingLimits.retentionMs;
    const kept =
      inspected?.manifest.segments.filter((s) => s.time >= cutoff) ?? [];
    const present =
      !!inspected &&
      (kept.length > 0 || inspected.manifest.updated_at >= cutoff);
    const marked =
      !!inspected &&
      (inspected.manifest.run.admission?.incomplete ||
        kept.length !== inspected.manifest.segments.length);
    store = await DiagnosticRecordings.open(root, { now: () => at });
    const listed = await store.runs();
    assert.equal(
      listed.runs.some((r) => r.run.run_id === a.run.run_id),
      present,
    );
    assert.equal((await store.show(healthy.run.run_id)).summary[0]?.starts, 1);
    assert.equal(
      (await store.compare(healthy.run.run_id, healthy.run.run_id)).comparable,
      true,
    );
    if (present) {
      const shown = await store.show(a.run.run_id);
      assert.equal(shown.run.admission?.incomplete, marked);
      assert.equal(
        shown.summary.reduce((n, r) => n + r.starts, 0),
        kept.length,
      );
      for (const r of shown.summary) {
        assert.equal(r.fraction_by_20_ms, marked ? null : 1);
        assert.equal(r.fraction_by_300_ms, marked ? null : 1);
      }
      const events: unknown[] = [];
      let cursor: string | undefined;
      do {
        const page = await store.export(a.run.run_id, cursor);
        assert.ok(Buffer.byteLength(JSON.stringify(page)) <= 131072);
        assert.equal(page.batches[0]?.run.admission?.incomplete, marked);
        events.push(...(page.batches[0]?.events ?? []));
        cursor = page.next_cursor ?? undefined;
      } while (cursor);
      assert.deepEqual(
        events,
        kept.flatMap((s) => inspected?.batches.get(s.id)?.events ?? []),
      );
    } else {
      await assert.rejects(store.show(a.run.run_id), /run is missing/);
      await assert.rejects(store.export(a.run.run_id), /run is missing/);
      await assert.rejects(
        store.compare(a.run.run_id, healthy.run.run_id),
        /run is missing/,
      );
    }
    const segments = (present ? kept.length : 0) + 1;
    assert.equal(store.status().segments, segments);
    assert.equal(store.status().bytes, segments * 4096);
    assert.equal(store.status().admission_bytes, (present ? 2 : 1) * 4096);
    const index: unknown = Reflect.get(
      Reflect.get(store, "eventIndex"),
      "events",
    );
    assert.ok(index instanceof Map);
    assert.equal(index.size, segments * 3);
    assert.equal(
      (await readdir(root)).some((n) => n.endsWith(".tmp")),
      false,
    );
    const retry = validateRecordingBatch({
      ...a,
      run: {
        ...a.run,
        admission: {
          schema_version: 1,
          policy: "whole_batch",
          refused_batches: 1,
          unadmitted_events: 3,
          incomplete: true,
        },
      },
    });
    const receipt = store.ingest(retry);
    await store.flush();
    assert.equal(store.settledReceipt(receipt, retry.batch_id).accepted, true);
    const count = store.status().segments,
      again = store.ingest(retry);
    await store.flush();
    assert.equal(store.settledReceipt(again, retry.batch_id).duplicate, true);
    assert.equal(store.status().segments, count);
    for (const r of (await store.show(a.run.run_id)).summary) {
      assert.equal(r.fraction_by_20_ms, null);
      assert.equal(r.fraction_by_300_ms, null);
    }
    assert.equal((await store.show(healthy.run.run_id)).summary[0]?.starts, 1);
    return !present ? "absent" : marked ? "marked" : "exact";
  } finally {
    await store?.close();
    await rm(root, { recursive: true, force: true });
  }
}
for (const marked of [false, true])
  for (const operation of [
    "ingest",
    "refuse",
    "import",
    "export",
    "rotate",
    "evict",
    "expire",
    "restart",
  ]) {
    const root = await mkdtemp(join(tmpdir(), "todo-manifest-model-"));
    let now = 1000,
      store = await DiagnosticRecordings.open(root, { now: () => now });
    const a = modelBatch(),
      b = modelBatch(a.run.run_id, 3),
      healthy = modelBatch(),
      next = modelBatch(a.run.run_id, 6);
    const images = new Map<
      string,
      { files: Map<string, string>; points: string[]; at: number }
    >();
    const snapshot = async (point: string, extra?: [string, string]) => {
      const files = new Map<string, string>();
      for (const name of await readdir(root))
        if (name !== "writer.lock")
          try {
            files.set(name, await readFile(join(root, name), "utf8"));
          } catch {}
      if (extra) files.set(...extra);
      prefixes++;
      const hash = createHash("sha256")
          .update(JSON.stringify({ at: now, files: [...files].sort() }))
          .digest("hex"),
        old = images.get(hash);
      if (old) old.points.push(point);
      else images.set(hash, { files, points: [point], at: now });
    };
    try {
      store.ingest(a);
      store.ingest(b);
      await store.flush();
      now += 6 * 86400000;
      store.ingest(healthy);
      await store.flush();
      const conflict = () => {
        try {
          store.ingest(
            validateRecordingBatch({
              ...a,
              batch_id: randomUUID(),
              events: [{ ...a.events[0], action_id: randomUUID() }],
            }),
          );
        } catch {}
      };
      if (marked) {
        conflict();
        await store.flush();
      }
      await snapshot("operation.entry");
      const attach = (subject: object) => {
        const restores: (() => void)[] = [];
        for (const method of ["atomic", "remove", "read"]) {
          const original: unknown = Reflect.get(subject, method);
          if (typeof original !== "function")
            throw new Error("Missing file boundary");
          Reflect.set(
            subject,
            method,
            async function (this: object, ...args: unknown[]) {
              const name = String(args[0]);
              await snapshot(`${method}.before:${name}`);
              if (method === "atomic") {
                const text = String(args[1]);
                await snapshot(`open.temporary:${name}`, [`${name}.tmp`, ""]);
                await snapshot(`write.partial:${name}`, [
                  `${name}.tmp`,
                  text.slice(0, Math.floor(text.length / 2)),
                ]);
                await snapshot(`flush.temporary:${name}`, [
                  `${name}.tmp`,
                  text,
                ]);
              }
              const value: unknown = await original.apply(this, args);
              await snapshot(`${method}.after:${name}`);
              return value;
            },
          );
          restores.push(() => Reflect.set(subject, method, original));
        }
        return () => {
          for (const restore of restores) restore();
        };
      };
      attach(store);
      if (operation === "ingest") store.ingest(next);
      if (operation === "refuse") conflict();
      if (operation === "import")
        store.ingest({
          ...next,
          run: {
            ...next.run,
            admission: {
              schema_version: 1,
              policy: "whole_batch",
              refused_batches: 7,
              unadmitted_events: 21,
              incomplete: true,
            },
          },
        });
      if (operation === "export") await store.export(a.run.run_id);
      if (operation === "rotate") {
        const manifests: unknown = Reflect.get(store, "manifests");
        assert.ok(manifests instanceof Map);
        const m = manifests.get(a.run.run_id);
        Reflect.set(
          store,
          "manifestCapacity",
          () => Buffer.byteLength(encodeManifest(m)) + 100,
        );
        store.ingest(next);
      }
      if (operation === "evict") {
        const manifests: unknown = Reflect.get(store, "manifests");
        assert.ok(manifests instanceof Map);
        const m = manifests.get(a.run.run_id),
          fn: unknown = Reflect.get(store, "evict");
        assert.equal(typeof fn, "function");
        if (typeof fn === "function")
          await fn.call(store, a.run.run_id, [m.segments[0]]);
      }
      if (operation === "expire") {
        now += 2 * 86400000;
        await store.runs();
      }
      if (operation === "restart") {
        await store.close();
        const restore = attach(DiagnosticRecordings.prototype);
        try {
          store = await DiagnosticRecordings.open(root, { now: () => now });
        } finally {
          restore();
        }
      }
      await store.flush();
      await snapshot("operation.completed");
      const actual = await store.show(healthy.run.run_id);
      assert.equal(actual.summary[0]?.starts, 1);
      if (operation === "ingest" || operation === "import")
        assert.equal(
          (await store.show(a.run.run_id)).summary.reduce(
            (n, r) => n + r.starts,
            0,
          ),
          3,
        );
      let cases = 0,
        absent = 0,
        incomplete = 0,
        exact = 0;
      for (const { files, points, at } of images.values()) {
        const before = { absent, incomplete, exact };
        const filesystem = { absent: 0, marked: 0, exact: 0 };
        const target = [...files.keys()].filter(
          (name) =>
            name === manifestName(a.run.run_id) ||
            (/^\d.*\.json$/u.test(name) &&
              files.get(name)?.includes(a.run.run_id)),
        );
        assert.ok(target.length <= 5);
        const variants = 4 ** target.length;
        for (let code = 0; code < variants; code++) {
          const changed = new Map(files);
          let digits = code;
          for (const name of target) {
            const mode = digits % 4;
            digits = Math.floor(digits / 4);
            if (mode === 1) changed.delete(name);
            if (mode === 2)
              changed.set(name, (files.get(name) ?? "").slice(0, 9));
            if (mode === 3)
              changed.set(
                name,
                (files.get(name) ?? "").replace('"run_id"', '"bad_id"'),
              );
          }
          const authority = await inspectManifest(
            changed.get(manifestName(a.run.run_id)),
            async (name) => changed.get(name),
          );
          const good = await inspectManifest(
            changed.get(manifestName(healthy.run.run_id)),
            async (name) => changed.get(name),
          );
          assert.ok(good);
          assert.equal(good.bad.length, 0);
          const map = new Map([[healthy.run.run_id, good.manifest]]);
          if (authority) map.set(a.run.run_id, authority.manifest);
          const queries = new RecordingQueries({
            manifests: map,
            read: async (s, run) => {
              const source =
                run.run_id === healthy.run.run_id ? good : authority;
              const value = source?.batches.get(s.id);
              assert.ok(value);
              return value;
            },
            status: () => store.status(),
            recovered: () => false,
            unavailable: () => false,
          });
          assert.equal(
            (await queries.show(healthy.run.run_id)).summary[0]?.starts,
            1,
          );
          assert.equal(
            (await queries.compare(healthy.run.run_id, healthy.run.run_id))
              .comparable,
            true,
          );
          const originalM = files.get(manifestName(a.run.run_id));
          if (
            changed.get(manifestName(a.run.run_id)) !== originalM ||
            !originalM
          ) {
            assert.equal(authority, undefined);
            await assert.rejects(queries.show(a.run.run_id), /run is missing/);
            await assert.rejects(
              queries.export(a.run.run_id),
              /run is missing/,
            );
            absent++;
          } else {
            assert.ok(authority);
            const raw = decodeManifest(originalM);
            const lost = raw.segments.filter((s) => {
              const text = changed.get(segmentName(s));
              return (
                text === undefined ||
                createHash("sha256").update(text).digest("hex") !== s.checksum
              );
            });
            const shouldMark = raw.run.admission?.incomplete || lost.length > 0;
            assert.equal(
              authority.manifest.run.admission?.incomplete,
              shouldMark,
            );
            const shown = await queries.show(a.run.run_id);
            assert.equal(
              shown.summary.reduce((n, r) => n + r.starts, 0),
              raw.segments.length - lost.length,
            );
            for (const row of shown.summary)
              if (shouldMark) {
                assert.equal(row.fraction_by_20_ms, null);
                assert.equal(row.fraction_by_300_ms, null);
              } else assert.equal(row.fraction_by_20_ms, 1);
            let cursor: string | undefined,
              total = 0;
            do {
              const page = await queries.export(a.run.run_id, cursor);
              assert.ok(Buffer.byteLength(JSON.stringify(page)) <= 131072);
              total += page.batches[0]?.events.length ?? 0;
              cursor = page.next_cursor ?? undefined;
            } while (cursor);
            assert.equal(total, (raw.segments.length - lost.length) * 3);
            if (shouldMark) incomplete++;
            else exact++;
          }
          cases++;
          checked++;
          filesystem[await reopenImage(changed, at, a, healthy)]++;
        }
        rows.push({
          marked,
          operation,
          points,
          files: target.length,
          blobs: target.filter((n) => n !== manifestName(a.run.run_id)).length,
          authority: files.has(manifestName(a.run.run_id)),
          variants,
          filesystem,
          outcomes: {
            absent: absent - before.absent,
            marked: incomplete - before.incomplete,
            exact: exact - before.exact,
          },
        });
      }
      writeFileSync(
        join(evidence, "result.json"),
        JSON.stringify({ result: "RUNNING", checked, prefixes, rows }, null, 2),
      );
      writeFileSync(
        join(evidence, `summary-${marked}-${operation}.json`),
        JSON.stringify({ cases, absent, incomplete, exact }, null, 2),
      );
    } finally {
      await store.close();
      await rm(root, { recursive: true, force: true });
    }
  }
writeFileSync(
  join(evidence, "result.json"),
  JSON.stringify({ result: "PASS", checked, prefixes, rows }, null, 2),
);
const table = [
  "| Starting run | Operation | Crash prefixes | Data / authority files | States | Reader: absent / marked / exact | Retry |",
  "| --- | --- | --- | --- | ---: | --- | --- |",
  ...rows.map((row) => {
    const r = JSON.parse(JSON.stringify(row));
    const points = r.points
      .map((s: string) =>
        s.replace(/[a-f0-9-]{36}/giu, "ID").replace(/\d{13}/gu, "TIME"),
      )
      .join("<br>");
    return `| ${r.marked ? "marked" : "clean"} | ${r.operation} | ${points} | ${r.blobs} blobs, manifest ${r.authority ? "present" : "absent"}; each present file valid / missing / truncated / corrupt | ${r.variants} | ${r.filesystem.absent} / ${r.filesystem.marked} / ${r.filesystem.exact} | Marked import retry and duplicate retry verified on disk; retained facts deduplicate, absent facts publish under a new manifest; an existing mark cannot clear |`;
  }),
].join("\n");
writeFileSync(join(evidence, "lifecycle.md"), table + "\n");
