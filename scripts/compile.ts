import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const [source, output] = process.argv.slice(2);
if (!source || !output) throw new Error("Usage: compile.ts <source> <output>");
let build = process.env.TODO_BUILD_ID;
if (!build) {
  try {
    build = execFileSync("git", ["rev-parse", "--short", "HEAD"], {
      cwd: import.meta.dirname,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    build = "dev";
  }
}
const destination = resolve(output);
mkdirSync(dirname(destination), { recursive: true });
execFileSync(
  "bun",
  [
    "build",
    "--compile",
    resolve(source),
    "--define",
    `TODO_BUILD_ID=${JSON.stringify(build)}`,
    "--outfile",
    destination,
  ],
  { cwd: dirname(destination), stdio: "inherit" },
);
