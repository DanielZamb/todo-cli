import { DiagnosticRecordings } from "../../../../packages/domain/src/recordings.ts";
import { existsSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
const root = dirname(process.env.TODO_DB ?? "");
if (!root.includes("todo-diag-joins-")) throw new Error("Scratch only");
const original = DiagnosticRecordings.start;
Reflect.set(
  DiagnosticRecordings,
  "start",
  (...args: Parameters<typeof original>) => {
    if (!existsSync(join(root, "factory-repaired"))) {
      writeFileSync(join(root, "factory-failed"), "failed");
      throw new Error("Controlled private factory failure");
    }
    return original(...args);
  },
);
await import("../../../../apps/server/src/main.ts");
