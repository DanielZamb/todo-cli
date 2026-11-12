import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, basename } from "node:path";
import { DiagnosticRecordings } from "../../../../packages/domain/src/recordings.ts";
assert.ok(process.env.TODO_DB);
const scratch = dirname(process.env.TODO_DB);
assert.ok(basename(scratch).startsWith("todo-diag-joins-"));
const path = join(scratch, "identity-clock-days");
Reflect.set(DiagnosticRecordings.prototype, "time", function () {
  return (
    Date.now() +
    (existsSync(path) ? Number(readFileSync(path, "utf8")) * 86400000 : 0)
  );
});
await import("../../../../apps/server/src/main.ts");
