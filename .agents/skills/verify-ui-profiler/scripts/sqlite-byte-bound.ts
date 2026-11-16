import "./sqlite-watchdog-preload.ts";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DiagnosticRecordings } from "../../../../packages/domain/src/recordings.ts";
import { modelBatch } from "../../../../packages/domain/test/fixtures/recording-authority.ts";
const evidence = resolve(
  process.argv[2] ?? "docs/evidence/ui-speed/recordings-sql-corrections/bytes",
);
mkdirSync(evidence, { recursive: true });
const root = await mkdtemp(join(tmpdir(), "todo-worker-bytes-")),
  s = await DiagnosticRecordings.open(join(root, "db"));
const waiting: Promise<unknown>[] = [];
try {
  await writeFile(join(root, "controlled-worker-mode"), "hang");
  waiting.push(s.ingest(modelBatch()));
  const end = Date.now() + 5000;
  while (!existsSync(join(root, "controlled-worker-held")) && Date.now() < end)
    await Bun.sleep(5);
  assert.ok(existsSync(join(root, "controlled-worker-held")));
  let refused = 0;
  for (let i = 0; i < 10; i++)
    waiting.push(
      s.show("x".repeat(131072)).catch((e) => {
        if (e.reason === "rpc_capacity") refused++;
      }),
    );
  await Bun.sleep(100);
  assert.equal(refused, 3);
  assert.equal(Reflect.get(s, "pending").size, 8);
  assert.ok(s.status().queued_bytes > 917504);
  assert.ok(s.status().queued_bytes <= 1048576);
  writeFileSync(
    join(evidence, "result.json"),
    JSON.stringify(
      { result: "PASS", refused, pending: 8, bytes: s.status().queued_bytes },
      null,
      2,
    ),
  );
} finally {
  await s.close();
  await Promise.allSettled(waiting);
  await rm(root, { recursive: true, force: true });
}
