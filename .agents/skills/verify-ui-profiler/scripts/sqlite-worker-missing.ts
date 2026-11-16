import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
const evidence = resolve(
  process.argv[2] ??
    "docs/evidence/ui-speed/recordings-sql-corrections/native-worker",
);
mkdirSync(evidence, { recursive: true });
const root = await mkdtemp(join(tmpdir(), "todo-worker-file-")),
  file = join(root, "client.mjs");
const built = spawnSync(
  "bun",
  [
    "build",
    "packages/domain/src/recordings.ts",
    "--target",
    "bun",
    "--outfile",
    file,
  ],
  { encoding: "utf8" },
);
assert.equal(built.status, 0, built.stderr);
const bytes = await readFile(file),
  lib = await import(file);
await unlink(file);
const s = lib.DiagnosticRecordings.start(join(root, "db"));
try {
  await s.whenReady();
  assert.equal(s.health().condition, "unavailable");
  assert.equal(s.health().failures, 1);
  await writeFile(file, bytes);
  const until = Date.now() + 65000;
  while (s.health().condition !== "available" && Date.now() < until)
    await Bun.sleep(100);
  assert.equal(s.health().condition, "available");
  assert.equal((await s.runs()).runs.length, 0);
  writeFileSync(
    join(evidence, "result.json"),
    JSON.stringify(
      {
        result: "PASS",
        fault: "Actual missing worker module, not OS resource exhaustion",
        health: s.health(),
      },
      null,
      2,
    ),
  );
} finally {
  await s.close();
  await rm(root, { recursive: true, force: true });
}
