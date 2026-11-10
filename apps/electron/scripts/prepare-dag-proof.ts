import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../../..");
const directory = join(root, ".scratch/bin");
mkdirSync(directory, { recursive: true });
const sources = execFileSync(
  "rg",
  ["--files", "apps/cli", "apps/server", "packages", "pnpm-lock.yaml"],
  { cwd: root, encoding: "utf8" },
)
  .trim()
  .split("\n")
  .sort();
const hash = createHash("sha256");
for (const path of sources)
  hash.update(path).update(readFileSync(join(root, path)));
const source_hash = hash.digest("hex");
const head = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: root,
  encoding: "utf8",
}).trim();
const cache = `${source_hash}-${head}`;
const cli = join(directory, `todo-${cache}`);
const server = join(directory, `server-${cache}`);
const seed = join(directory, `seed-${cache}`);
for (const [entry, outfile] of [
  ["apps/cli/src/main.ts", cli],
  ["apps/server/src/main.ts", server],
  ["apps/server/scripts/seed-verification.ts", seed],
]) {
  if (!entry || !outfile || existsSync(outfile)) continue;
  execFileSync("sh", [join(root, "scripts/disk-guard.sh")], {
    stdio: "inherit",
  });
  execFileSync(
    "bun",
    [
      "build",
      join(root, entry),
      "--compile",
      "--define",
      `TODO_BUILD_ID=${JSON.stringify(head)}`,
      "--outfile",
      outfile,
    ],
    { cwd: directory, stdio: "inherit" },
  );
}
const identity = {
  source_hash,
  head,
  cli,
  server,
  seed,
  cli_sha256: createHash("sha256").update(readFileSync(cli)).digest("hex"),
  server_sha256: createHash("sha256")
    .update(readFileSync(server))
    .digest("hex"),
  seed_sha256: createHash("sha256").update(readFileSync(seed)).digest("hex"),
  version: execFileSync(cli, ["--version"], { encoding: "utf8" }).trim(),
};
writeFileSync(
  join(directory, "build.json"),
  `${JSON.stringify(identity, null, 2)}\n`,
);
process.stdout.write(`${JSON.stringify(identity, null, 2)}\n`);
