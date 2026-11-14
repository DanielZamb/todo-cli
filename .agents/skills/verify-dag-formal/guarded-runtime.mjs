import { spawnSync } from "node:child_process";
import { beforeCompile, DiskStop } from "./compile-safety.mjs";
import { captureCompile, finishCompile } from "./compile-artifacts.mjs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
const priorStop = process.env.DAG_F_DISK_STOP_FILE;
if (priorStop && existsSync(priorStop)) {
  console.error(
    "DISK STOP " + JSON.parse(readFileSync(priorStop, "utf8")).stdout.trim(),
  );
  process.exit(3);
}
const args = process.argv.slice(2);
const compiler =
  args[0] === "build" ||
  args.some((arg) => arg.includes("typescript/bin/tsc")) ||
  args.includes("--compile");
const outputIndex = args.indexOf("--outfile");
const output =
  outputIndex >= 0
    ? args[outputIndex + 1]
    : args.find((arg) => arg.startsWith("--outfile="))?.slice(10);
const capture = compiler
  ? captureCompile({
      output,
      evidence: process.env.DAG_F_GUARD_EVIDENCE,
      label: "nested-cli-compiler",
    })
  : null;
const forwarded =
  process.env.DAG_F_WRAP_BUILDS === "1" && args[0] !== "build"
    ? [
        "--preload",
        join(
          dirname(fileURLToPath(import.meta.url)),
          "compile-only-preload.mjs",
        ),
        ...args,
      ]
    : args;
let guard;
if (compiler) {
  try {
    guard = beforeCompile({
      evidence: process.env.DAG_F_GUARD_EVIDENCE,
      label: "nested-cli-compiler",
    });
  } catch (error) {
    if (error instanceof DiskStop) {
      console.error(error.message);
      process.exit(3);
    }
    throw error;
  }
}
const startedAt = new Date().toISOString();
const result = spawnSync(process.env.DAG_F_REAL_BUN, forwarded, {
  stdio: "inherit",
  env: process.env,
});
if (capture) finishCompile(capture);
const stopPath = process.env.DAG_F_DISK_STOP_FILE;
const stop =
  stopPath && existsSync(stopPath)
    ? JSON.parse(readFileSync(stopPath, "utf8"))
    : null;
const effectiveExit = stop ? 3 : (result.status ?? 1);
if (guard || stop) {
  writeFileSync(
    join(
      process.env.DAG_F_GUARD_EVIDENCE,
      `runtime-command-${process.pid}-${Date.now()}.json`,
    ),
    JSON.stringify(
      {
        executable: process.env.DAG_F_REAL_BUN,
        args,
        forwarded,
        cwd: process.cwd(),
        pid: process.pid,
        startedAt,
        guard,
        parentExit: result.status,
        signal: result.signal,
        effectiveExit,
        stopPath: stop ? stopPath : null,
      },
      null,
      2,
    ) + "\n",
  );
}
if (stop) {
  console.error("DISK STOP " + stop.stdout.trim());
  process.exit(3);
}
if (result.error) throw result.error;
process.exit(effectiveExit);
