import { repositoryInput } from "../../../../scripts/verification-inputs.ts";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { Schema } from "effect";

const root = resolve(import.meta.dirname, "../../../..");
const evidence = process.argv[2];
assert.ok(evidence && isAbsolute(evidence) && !existsSync(evidence));
const manifest = Schema.decodeUnknownSync(Schema.Struct({ cli: Schema.String, sourceHash: Schema.String, head: Schema.String }))(JSON.parse(readFileSync(join(root, ".scratch/bin/build.json"), "utf8")));
const driver = Schema.decodeUnknownSync(Schema.Literals(["review-boundaries", "enrichment-history"]))(process.argv[3] ?? "review-boundaries");
const source = join(import.meta.dirname, `${driver}.ts`);
const hash = createHash("sha256").update(readFileSync(source));
if (driver === "enrichment-history") hash.update(readFileSync(join(import.meta.dirname, "build-enrichment-history.ts")));
const scriptHash = hash.digest("hex");
const binary = join(root, ".scratch/bin", `review-${manifest.sourceHash.slice(0, 12)}-${scriptHash.slice(0, 12)}`, "driver");
if (!existsSync(binary)) {
  const guard = spawnSync("sh", [repositoryInput(root, "scripts/disk-guard.sh", "Discovery verification guard")], { cwd: root, stdio: "inherit" });
  assert.equal(guard.status, 0);
  const build = spawnSync("bun", driver === "enrichment-history"
    ? [join(import.meta.dirname, "build-enrichment-history.ts"), binary]
    : [join(root, "scripts/compile.ts"), source, binary], { cwd: root, encoding: "utf8" });
  writeFileSync(evidence + ".build.log", build.stdout + build.stderr);
  assert.equal(build.status, 0, build.stdout + build.stderr);
}
const result = spawnSync(binary, [manifest.cli, evidence], { cwd: root, encoding: "utf8", timeout: 600000 });
mkdirSync(evidence, { recursive: true });
writeFileSync(join(evidence, "command.log"), result.stdout + result.stderr);
writeFileSync(join(evidence, "driver-provenance.json"), JSON.stringify({ ...manifest, scriptHash, binary, exit: result.status, signal: result.signal, error: result.error?.message }, null, 2));
process.stdout.write(result.stdout);
process.stderr.write(result.stderr);
assert.equal(result.status, 0);
