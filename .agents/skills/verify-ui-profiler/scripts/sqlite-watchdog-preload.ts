import { isMainThread, workerData } from "node:worker_threads";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { RecordingDatabase } from "../../../../packages/domain/src/recordings-sqlite.ts";
if (!isMainThread && workerData?.todoRecordings === 1) {
  const root = dirname(workerData.directory),
    original = RecordingDatabase.prototype.ingest;
  Reflect.set(
    RecordingDatabase.prototype,
    "ingest",
    function (
      this: RecordingDatabase,
      ...args: Parameters<RecordingDatabase["ingest"]>
    ) {
      const file = join(root, "controlled-worker-mode"),
        mode = existsSync(file) ? readFileSync(file, "utf8") : "";
      if (mode === "hang") {
        writeFileSync(join(root, "controlled-worker-held"), "ingest entered");
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);
      }
      if (mode === "throw")
        throw new Error("Controlled worker exception, never echo this");
      return original.apply(this, args);
    },
  );
}
