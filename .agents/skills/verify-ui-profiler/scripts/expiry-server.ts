import assert from "node:assert/strict";
import { mkdir, readdir, rm } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { DiagnosticRecordings } from "../../../../packages/domain/src/store/diagnostic-recordings.ts";
import { recordingLimits, validateRecordingBatch } from "../../../../packages/domain/src/diagnostic-recordings.ts";
import { event, uuid } from "../../../../packages/domain/test/fixtures/diagnostic-recording.ts";
assert.ok(process.env.TODO_DB);
assert.ok(basename(dirname(process.env.TODO_DB)).startsWith("todo-diag-joins-"));
assert.equal(process.env.HOME, join(dirname(process.env.TODO_DB), "home"));
if (process.argv.includes("--expiry-fault")) {
  const directory = join(dirname(process.env.TODO_DB), "owned-expiry-fault");
  let now = Date.now();
  const recordings = await DiagnosticRecordings.open(directory, {now: () => now});
  recordings.ingest(validateRecordingBatch({schema_version:1,batch_id:uuid,run:{run_id:uuid,app:"macos",build_id:event.build_id,contract_id:event.contract_id},events:[event]}));
  await recordings.flush();
  const name = (await readdir(directory)).find(name => /^\d/u.test(name)); assert.ok(name);
  await rm(join(directory,name)); await mkdir(join(directory,name));
  now += recordingLimits.retentionMs + 1;
  const arm: unknown = Reflect.get(recordings,"armExpiry"); assert.equal(typeof arm,"function");
  if(typeof arm !== "function") throw new Error("Missing expiry timer"); arm.call(recordings);
  for(let n=0;n<100 && recordings.status().loss.storage_failures===0;n++) await Bun.sleep(5);
  assert.equal(recordings.status().loss.storage_failures,1);
  process.once("exit",() => process.stderr.write(`expiry-final:${JSON.stringify(recordings.status())}\n`));
}
process.argv = process.argv.filter(argument => argument !== "--expiry-fault");
await import("../../../../apps/server/src/main.ts");
