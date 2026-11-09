import { spawnSync } from "node:child_process";
import { beforeCompile, DiskStop } from "./compile-safety.mjs";
import { captureCompile, finishCompile } from "./compile-artifacts.mjs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const args = process.argv.slice(2);
const compiler =
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
if (compiler) {
  try {
    beforeCompile({
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
const forwarded =
  process.env.DAG_F_WRAP_BUILDS === "1"
    ? [
        "--preload",
        join(
          dirname(fileURLToPath(import.meta.url)),
          "compile-only-preload.mjs",
        ),
        ...args,
      ]
    : args;
const result = spawnSync(process.env.DAG_F_REAL_BUN, forwarded, {
  stdio: "inherit",
  env: process.env,
});
if (capture) finishCompile(capture);
if (result.error) throw result.error;
process.exit(result.status ?? 1);
