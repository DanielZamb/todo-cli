import { isMainThread, workerData } from "node:worker_threads";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { RecordingDatabase } from "../../../../packages/domain/src/recordings-sqlite.ts";
if (!isMainThread && workerData?.todoRecordings === 1) {
  const original = Reflect.get(RecordingDatabase.prototype, "progress");
  let steps = 0;
  Reflect.set(
    RecordingDatabase.prototype,
    "progress",
    function (this: RecordingDatabase) {
      original.call(this);
      const path = join(workerData.directory, "read-mode");
      const mode = existsSync(path) ? readFileSync(path, "utf8") : "";
      if (mode === "slow")
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 350);
      if (mode === "stop" && ++steps === 3) {
        writeFileSync(join(workerData.directory, "read-stopped"), "stopped");
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);
      }
    },
  );
}
