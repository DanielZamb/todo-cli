import assert from "node:assert/strict";
import { existsSync, writeFileSync } from "node:fs";
import { dirname, basename, join } from "node:path";
import { DiagnosticRecordings } from "../../../../packages/domain/src/store/diagnostic-recordings.ts";
assert.ok(process.env.TODO_DB);
const scratch = dirname(process.env.TODO_DB);
assert.ok(basename(scratch).startsWith("todo-diag-joins-"));
assert.equal(process.env.HOME, join(scratch, "home"));
const original: unknown = Reflect.get(DiagnosticRecordings.prototype, "read");
assert.equal(typeof original, "function");
let held = false;
Reflect.set(
  DiagnosticRecordings.prototype,
  "read",
  async function (this: object, name: string) {
    if (!held && name.endsWith(".admission.json")) {
      held = true;
      writeFileSync(join(scratch, "manifest-recovery-held"), "held");
      while (!existsSync(join(scratch, "manifest-recovery-release")))
        await Bun.sleep(10);
    }
    if (typeof original === "function") return original.call(this, name);
    throw new Error("Missing boundary");
  },
);
await import("../../../../apps/server/src/main.ts");
