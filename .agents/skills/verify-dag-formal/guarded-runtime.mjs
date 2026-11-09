import { spawnSync } from "node:child_process";
import { beforeCompile, DiskStop } from "./compile-safety.mjs";
const args = process.argv.slice(2);
const compiler =
  args.some((arg) => arg.includes("typescript/bin/tsc")) ||
  (args[0] === "build" && args.includes("--compile"));
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
const result = spawnSync(process.env.DAG_F_REAL_BUN, args, {
  stdio: "inherit",
  env: process.env,
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
