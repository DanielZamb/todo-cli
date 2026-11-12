import { existsSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { DiagnosticRecordings } from "../../../../packages/domain/src/recordings.ts";
const root = dirname(resolve(process.env.TODO_DB ?? ""));
if (!root.includes("todo-diag-joins-")) throw new Error("Scratch fixture only");
const original = DiagnosticRecordings.prototype.ingest;
Reflect.set(
  DiagnosticRecordings.prototype,
  "ingest",
  async function (
    this: DiagnosticRecordings,
    ...args: Parameters<typeof original>
  ) {
    if (existsSync(join(root, "hold-ingest"))) {
      writeFileSync(join(root, "ingest-held"), "held");
      const end = Date.now() + 60000;
      while (!existsSync(join(root, "release-ingest")) && Date.now() < end)
        await Bun.sleep(5);
    }
    return original.apply(this, args);
  },
);

const compare = DiagnosticRecordings.prototype.compare;
Reflect.set(
  DiagnosticRecordings.prototype,
  "compare",
  async function (
    this: DiagnosticRecordings,
    ...args: Parameters<typeof compare>
  ) {
    if (existsSync(join(root, "hold-ingest"))) {
      writeFileSync(join(root, "ingest-held"), "held");
      const end = Date.now() + 60000;
      while (!existsSync(join(root, "release-ingest")) && Date.now() < end)
        await Bun.sleep(5);
    }
    return compare.apply(this, args);
  },
);
await import("../../../../apps/server/src/main.ts");
