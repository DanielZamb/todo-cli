import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../../../..");
const names = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "packages/domain", "packages/api", "apps/cli/src", "apps/server/src", "apps/server/scripts/seed-verification.ts", "pnpm-lock.yaml"], { cwd: root, encoding: "utf8" }).trim().split("\n").sort();
const digest = createHash("sha256");
for (const name of names) if (existsSync(join(root, name))) { digest.update(name); digest.update(readFileSync(join(root, name))); }
const sourceHash = digest.digest("hex");
const directory = join(root, ".scratch", "bin");
mkdirSync(directory, { recursive: true });
const binaries = { cli: join(directory, `todo-${sourceHash}`), server: join(directory, `todo-server-${sourceHash}`), seed: join(directory, `seed-${sourceHash}`) };
for (const [source, binary] of [["apps/cli/src/main.ts", binaries.cli], ["apps/server/src/main.ts", binaries.server], ["apps/server/scripts/seed-verification.ts", binaries.seed]]) {
  if (!existsSync(binary)) execFileSync("bun", ["build", "--compile", join(root, source), "--outfile", binary], { cwd: directory, stdio: "inherit" });
}
const receipt = { sourceHash, head: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(), ...binaries };
writeFileSync(join(directory, "build.json"), `${JSON.stringify(receipt, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(receipt)}\n`);
