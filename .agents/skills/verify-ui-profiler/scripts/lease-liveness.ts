import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DiagnosticRecordings } from "../../../../packages/domain/src/store/diagnostic-recordings.ts";
const rows: object[] = [];
for (const captured of [false, true]) {
  const root = await mkdtemp(join(tmpdir(), "todo-lease-liveness-"));
  const source = `import { DiagnosticRecordings } from ${JSON.stringify(resolve("packages/domain/src/store/diagnostic-recordings.ts"))};
    const store = await DiagnosticRecordings.open(${JSON.stringify(root)});
    setInterval(() => { ${captured ? "store.status();" : ""} Bun.gc(true); }, 10);
    process.stdout.write("ready\\n");`;
  const child = Bun.spawn([process.execPath, "--eval", source], { stdout: "pipe", stderr: "pipe" });
  try {
    const reader = child.stdout.getReader();
    assert.equal(new TextDecoder().decode((await reader.read()).value), "ready\n");
    reader.releaseLock();
    await Bun.sleep(200);
    const contender = await DiagnosticRecordings.open(root);
    const failures = contender.status().loss.storage_failures;
    rows.push({ captured, child_running: child.exitCode === null, contender_storage_failures: failures });
    await contender.close();
    assert.equal(failures, captured ? 1 : 0);
  } finally {
    child.kill(); await child.exited; await rm(root, { recursive: true, force: true });
  }
}
await writeFile(resolve(process.argv[2] ?? "docs/evidence/ui-speed/recordings-completeness/lease-liveness.json"), JSON.stringify(rows, null, 2));
