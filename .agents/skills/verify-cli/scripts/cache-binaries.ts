import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../../../..");
const sources = [
  "apps/cli/src",
  "apps/cli/scripts",
  "apps/cli/test",
  "apps/server/src",
  "apps/server/scripts",
  "packages/domain/src",
  "packages/domain/test",
  "packages/api/src",
]
  .flatMap((directory) =>
    readdirSync(join(root, directory), { recursive: true }).flatMap((name) =>
      typeof name === "string" && name.endsWith(".ts")
        ? [join(directory, name)]
        : [],
    ),
  )
  .sort();
const hash = createHash("sha256");
for (const file of sources)
  hash.update(file).update(readFileSync(join(root, file)));
const sourceHash = hash.digest("hex");
const head = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: root,
  encoding: "utf8",
}).trim();
const directory = join(
  root,
  ".scratch/bin",
  `${sourceHash.slice(0, 12)}-${head.slice(0, 12)}`,
);
mkdirSync(directory, { recursive: true });
const binaries = {
  cli: join(directory, "todo"),
  server: join(directory, "todo-server"),
  seed: join(directory, "seed"),
};
for (const [key, file] of [
  ["cli", "apps/cli/src/main.ts"],
  ["server", "apps/server/src/main.ts"],
  ["seed", "apps/server/scripts/seed-verification.ts"],
] as const) {
  if (!existsSync(binaries[key])) {
    execFileSync("sh", [join(root, "scripts/disk-guard.sh")], { cwd: root, stdio: "inherit" });
    execFileSync(
      "bun",
      [join(root, "scripts/compile.ts"), join(root, file), binaries[key]],
      { cwd: root, stdio: "inherit" },
    );
  }
}
writeFileSync(
  join(root, ".scratch/bin/build.json"),
  `${JSON.stringify({ ...binaries, sourceHash, head }, null, 2)}\n`,
);
process.stdout.write(
  `Cached compiled CLI, server and seed for ${sourceHash}\n`,
);
