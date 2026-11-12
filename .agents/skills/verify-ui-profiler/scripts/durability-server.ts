import assert from "node:assert/strict";
import { existsSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { Schema } from "effect";
import { DiagnosticRunId } from "../../../../packages/domain/src/client-diagnostics.ts";
import { DiagnosticRecordings } from "../../../../packages/domain/src/store/diagnostic-recordings.ts";

const point = Schema.decodeUnknownSync(Schema.Literals([
  "before_mark", "mark_temp", "after_mark", "data_temp", "after_data", "after_ack", "fail_mark", "fail_data",
]))(process.argv[process.argv.indexOf("--durability-point") + 1]);
const run = Schema.decodeUnknownSync(DiagnosticRunId)(process.argv[process.argv.indexOf("--durability-run") + 1]);
assert.ok(process.env.TODO_DB);
const scratch = dirname(process.env.TODO_DB);
assert.ok(basename(scratch).startsWith("todo-diag-joins-"));
assert.equal(process.env.HOME, join(scratch, "home"));
const directory = join(scratch, "diagnostic-recordings");
const original: unknown = Reflect.get(DiagnosticRecordings.prototype, "atomic");
assert.equal(typeof original, "function");
if (typeof original !== "function") throw new Error("Missing atomic file boundary");
let fired = false;
const barrier = async (name: string, partial = false) => {
  fired = true;
  writeFileSync(join(scratch, "durability-barrier.json"), JSON.stringify({ point, name, constructed_partial_temp: partial }));
  await new Promise<void>(() => {});
};
assert.equal(Reflect.set(DiagnosticRecordings.prototype, "atomic", async function (this: object, name: string, text: string) {
  const mark = name === `${run}.admission.json`, data = /^\d{13}-/u.test(name);
  if (point === "fail_mark" && mark && !existsSync(join(scratch, "durability-repaired")))
    throw Object.assign(new Error("Verification-only mark I/O failure"), { code: "EIO" });
  if (!fired && mark && point === "before_mark") await barrier(name);
  if (!fired && ((mark && point === "mark_temp") || (data && point === "data_temp"))) {
    writeFileSync(join(directory, `${name}.tmp`), text.slice(0, 40), { mode: 0o600 });
    await barrier(name, true);
  }
  if (!fired && data && point === "fail_data") {
    fired = true;
    throw Object.assign(new Error("Verification-only data I/O failure"), { code: "EIO" });
  }
  await original.call(this, name, text);
  if (!fired && ((mark && point === "after_mark") || (data && point === "after_data"))) await barrier(name);
}), true);
process.argv = process.argv.slice(0, 2);
await import("../../../../apps/server/src/main.ts");
