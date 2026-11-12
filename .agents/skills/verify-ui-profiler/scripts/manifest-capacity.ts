import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DiagnosticRecordings } from "../../../../packages/domain/src/store/diagnostic-recordings.ts";
import {
  decodeManifest,
  manifestName,
} from "../../../../packages/domain/src/store/recording-manifest.ts";
import { modelBatch } from "../../../../packages/domain/test/fixtures/recording-authority.ts";
const evidence = resolve(
  process.argv[2] ?? "docs/evidence/ui-speed/recordings-manifest/capacity",
);
mkdirSync(evidence, { recursive: true });
const root = await mkdtemp(join(tmpdir(), "todo-capacity-")),
  store = await DiagnosticRecordings.open(root),
  a = modelBatch(),
  b = modelBatch();
try {
  store.ingest(b);
  await store.flush();
  const peer = await readFile(join(root, manifestName(b.run.run_id)), "utf8");
  for (let n = 0; n < 1100; n++) {
    const r = store.ingest(modelBatch(a.run.run_id, n * 3));
    await store.flush();
    assert.equal(store.settledReceipt(r, "").accepted, true);
  }
  const text = await readFile(join(root, manifestName(a.run.run_id)), "utf8"),
    m = decodeManifest(text);
  assert.ok(Buffer.byteLength(text) <= 262144);
  assert.equal(
    await readFile(join(root, manifestName(b.run.run_id)), "utf8"),
    peer,
  );
  assert.equal(m.loss.capacity_events, (1100 - m.segments.length) * 3);
  assert.equal(m.run.admission?.incomplete, true);
  let allocated = 0;
  for (const name of await readdir(root))
    allocated += (await stat(join(root, name))).blocks * 512;
  writeFileSync(
    join(evidence, "result.json"),
    JSON.stringify(
      {
        result: "PASS",
        manifest_bytes: Buffer.byteLength(text),
        manifest_cap: 262144,
        segments: m.segments.length,
        events: m.segments.reduce((n, s) => n + s.events, 0),
        loss: m.loss,
        status: store.status(),
        allocated_bytes: allocated,
        peer_unchanged: true,
        descriptor_bytes: Buffer.byteLength(JSON.stringify(m.segments[0])),
      },
      null,
      2,
    ),
  );
} finally {
  await store.close();
  await rm(root, { recursive: true, force: true });
}
