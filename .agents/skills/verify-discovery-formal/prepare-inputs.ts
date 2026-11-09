import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { Schema } from "effect";
import {
  repositoryInput,
  verificationRoot,
} from "../../../scripts/verification-inputs";
import { inputDefault } from "./inputs";

const root = verificationRoot(import.meta.dirname);
const candidate = process.argv[2];
assert.match(
  candidate ?? "",
  /^[a-f0-9]{40}$/,
  "Pass the reviewed full merged-source SHA",
);
assert.ok(candidate);
const base = join(root, "docs/evidence/discovery-formal");
mkdirSync(base, { recursive: true });
const evidence = mkdtempSync(join(base, "prepare-"));
const hash = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
const receipts: {
  label: string;
  path: string;
  sha256: string;
  actualExit: 0;
}[] = [];
function run(label: string, command: string, args: string[]) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    timeout: 600_000,
    maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env, VITEST_MAX_WORKERS: "1" },
  });
  writeFileSync(join(evidence, `${label}.stdout`), result.stdout ?? "");
  writeFileSync(join(evidence, `${label}.stderr`), result.stderr ?? "");
  writeFileSync(
    join(evidence, `${label}.json`),
    JSON.stringify(
      {
        command,
        args,
        exit: result.status,
        signal: result.signal,
        error: result.error?.message,
      },
      null,
      2,
    ),
  );
  const exit = join(evidence, `${label}.exit`);
  writeFileSync(exit, `${result.status}\n`);
  assert.equal(
    result.error,
    undefined,
    `${label}: execution failure, inspect ${evidence}`,
  );
  assert.equal(
    result.status,
    0,
    `${label}: fresh prerequisite failed, inspect ${evidence}`,
  );
  receipts.push({
    label,
    path: relative(root, exit),
    sha256: hash(readFileSync(exit)),
    actualExit: 0,
  });
}
try {
  const available = Number(
    execFileSync("df", ["-k", "/System/Volumes/Data"], { encoding: "utf8" })
      .trim()
      .split("\n")[1]
      ?.trim()
      .split(/\s+/)[3],
  );
  assert.ok(
    available >= 31_457_280,
    `DISK HOLD: ${available} KiB available; require 30 GiB before this batch`,
  );
  const directories = [
    "apps/cli/src",
    "apps/cli/scripts",
    "apps/cli/test",
    "apps/server/src",
    "apps/server/scripts",
    "packages/domain/src",
    "packages/domain/test",
    "packages/api/src",
  ];
  const paths = directories
    .flatMap((directory) =>
      readdirSync(join(root, directory), { recursive: true }).flatMap((path) =>
        typeof path === "string" && path.endsWith(".ts")
          ? [join(directory, path)]
          : [],
      ),
    )
    .sort();
  const sourceFiles = paths.map((path) => {
    const bytes = readFileSync(repositoryInput(root, path, "backend source"));
    assert.equal(
      hash(bytes),
      hash(
        execFileSync("git", ["show", `${candidate}:${path}`], {
          cwd: root,
          maxBuffer: 32 * 1024 * 1024,
        }),
      ),
      `Commit the reviewed source before preparing: ${path}`,
    );
    return { path, sha256: hash(bytes) };
  });
  run("domain", "pnpm", [
    "--filter",
    "@todo/domain",
    "test",
    "discovery.test.ts",
    "profile-resolution.test.ts",
    "--maxWorkers=1",
    "--no-file-parallelism",
  ]);
  run("scope-control", "bun", [
    ".agents/skills/verify-discovery/scripts/properties.ts",
    join(evidence, "properties"),
  ]);
  run("build", "bun", [".agents/skills/verify-cli/scripts/cache-binaries.ts"]);
  const producer = Schema.decodeUnknownSync(
    Schema.Struct({
      cli: Schema.String,
      server: Schema.String,
      seed: Schema.String,
      head: Schema.String,
      sourceHash: Schema.String,
    }),
  )(JSON.parse(readFileSync(join(root, ".scratch/bin/build.json"), "utf8")));
  const sourceHash = createHash("sha256");
  for (const path of paths)
    sourceHash.update(path).update(readFileSync(join(root, path)));
  assert.equal(producer.sourceHash, sourceHash.digest("hex"));
  const binary = (path: string) => ({
    path: relative(root, path),
    sha256: hash(
      readFileSync(
        repositoryInput(root, relative(root, path), "backend binary"),
      ),
    ),
  });
  run("compiled", "bun", [
    ".agents/skills/verify-discovery/scripts/drive.ts",
    join(evidence, "compiled"),
  ]);
  run("boundaries", "bun", [
    ".agents/skills/verify-discovery/scripts/run-review-boundaries.ts",
    join(evidence, "boundaries"),
  ]);
  run("enrichment-history", "bun", [
    ".agents/skills/verify-discovery/scripts/run-review-boundaries.ts",
    join(evidence, "enrichment-history"),
    "enrichment-history",
  ]);
  const producerDirectory = dirname(realpathSync(producer.cli));
  const suffix = /^[a-f0-9]{12}-([a-f0-9]{12})$/.exec(
    basename(producerDirectory),
  )?.[1];
  assert.ok(
    suffix,
    "Backend cache has no canonical producer commit; run the documented build step",
  );
  const builtHead = execFileSync(
    "git",
    ["rev-parse", "--verify", `${suffix}^{commit}`],
    { cwd: root, encoding: "utf8" },
  ).trim();
  for (const value of [producer.server, producer.seed])
    assert.equal(
      dirname(realpathSync(value)),
      producerDirectory,
      "Backend artifacts must share one actual producer",
    );
  for (const file of sourceFiles)
    assert.equal(
      hash(
        execFileSync("git", ["show", `${builtHead}:${file.path}`], {
          cwd: root,
          maxBuffer: 32 * 1024 * 1024,
        }),
      ),
      file.sha256,
      `Producer source differs: ${file.path}`,
    );
  const inputs = {
    candidateCommit: candidate,
    backend: {
      builtHead,
      sourceHash: producer.sourceHash,
      sourceFiles,
      binaries: {
        cli: binary(producer.cli),
        server: binary(producer.server),
        seed: binary(producer.seed),
      },
    },
    receipts,
  };
  const path = join(root, inputDefault);
  writeFileSync(path, `${JSON.stringify(inputs, null, 2)}\n`);
  writeFileSync(
    join(evidence, "inputs.json"),
    `${JSON.stringify(inputs, null, 2)}\n`,
  );
  writeFileSync(
    join(evidence, "result.json"),
    JSON.stringify(
      {
        passed: true,
        candidate,
        available,
        manifest: relative(root, path),
        receipts,
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({ passed: true, evidence, manifest: relative(root, path) }),
  );
} catch (error) {
  writeFileSync(
    join(evidence, "result.json"),
    JSON.stringify(
      { passed: false, candidate, receipts, error: String(error) },
      null,
      2,
    ),
  );
  console.error(error);
  process.exitCode = 1;
}
