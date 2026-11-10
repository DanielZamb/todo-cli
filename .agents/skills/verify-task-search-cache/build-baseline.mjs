import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
const root = resolve(import.meta.dirname, "../../..");
const commit = process.argv[2];
assert.match(commit ?? "", /^[a-f0-9]{40}$/);
const projectionCommit = process.argv[3];
if (projectionCommit) assert.match(projectionCommit, /^[a-f0-9]{40}$/);
const directory = join(root, ".scratch", `cache-baseline-${commit}${projectionCommit ? `-${projectionCommit}` : ""}`);
mkdirSync(directory, { recursive: true });
const archive = join(directory, "source.tar");
if (!existsSync(archive)) {
  execFileSync(
    "git",
    [
      "archive",
      "--format=tar",
      `--output=${archive}`,
      commit,
      "apps/cli",
      "apps/server",
      "packages/domain",
      "packages/api",
      "scripts/compile.ts",
      "package.json",
      "tsconfig.base.json",
    ],
    { cwd: root },
  );
  execFileSync("tar", ["-xf", archive, "-C", directory]);
  if (projectionCommit)
    writeFileSync(
      join(directory, "packages/domain/src/store/projection.ts"),
      execFileSync("git", ["show", `${projectionCommit}:packages/domain/src/store/projection.ts`], { cwd: root }),
    );
  symlinkSync(join(root, "node_modules"), join(directory, "node_modules"));
  for (const unit of [
    "apps/cli",
    "apps/server",
    "packages/domain",
    "packages/api",
  ]) {
    const modules = join(directory, unit, "node_modules");
    mkdirSync(modules, { recursive: true });
    for (const entry of readdirSync(join(root, unit, "node_modules"))) {
      if (entry === "@todo") {
        mkdirSync(join(modules, entry));
        for (const name of readdirSync(join(root, unit, "node_modules/@todo")))
          symlinkSync(
            join(directory, "packages", name),
            join(modules, entry, name),
          );
      } else
        symlinkSync(
          realpathSync(join(root, unit, "node_modules", entry)),
          join(modules, entry),
        );
    }
  }
}
assert.equal(
  realpathSync(join(directory, "apps/cli/node_modules/@todo/domain")),
  join(directory, "packages/domain"),
);
const hash = createHash("sha256");
const files = [
  "apps/cli/src",
  "apps/server/src",
  "packages/domain/src",
  "packages/api/src",
]
  .flatMap((dir) =>
    readdirSync(join(directory, dir), { recursive: true })
      .filter((name) => name.endsWith(".ts"))
      .map((name) => join(dir, name)),
  )
  .sort();
for (const file of files)
  hash.update(file).update(readFileSync(join(directory, file)));
const sourceHash = hash.digest("hex");
const binaryDirectory = join(
  root,
  ".scratch/bin",
  `uncached-${sourceHash.slice(0, 12)}-${commit.slice(0, 12)}`,
);
mkdirSync(binaryDirectory, { recursive: true });
const binaries = {
  cli: join(binaryDirectory, "todo"),
  server: join(binaryDirectory, "todo-server"),
};
for (const [key, source] of [
  ["cli", "apps/cli/src/main.ts"],
  ["server", "apps/server/src/main.ts"],
]) {
  if (existsSync(binaries[key])) continue;
  execFileSync("sh", [join(root, "scripts/disk-guard.sh")], {
    stdio: "inherit",
  });
  execFileSync(
    "bun",
    [join(root, "scripts/compile.ts"), join(directory, source), binaries[key]],
    {
      cwd: directory,
      env: { ...process.env, TODO_BUILD_ID: commit.slice(0, 8) },
      stdio: "inherit",
    },
  );
}
const manifest = join(
  root,
  "docs/evidence/perf-cache/integrated-before-binaries.json",
);
writeFileSync(
  manifest,
  JSON.stringify(
    {
      ...binaries,
      head: commit,
      projectionOverlay: projectionCommit ? {
        commit: projectionCommit,
        path: "packages/domain/src/store/projection.ts",
        purpose: "Keep the separately reviewed Tag relink optimization identical in both inputs; matcher and CLI remain the uncached base source",
      } : null,
      sourceHash,
      archiveSha256: createHash("sha256")
        .update(readFileSync(archive))
        .digest("hex"),
      source: directory,
      files,
      protectedSourceHashes: Object.fromEntries(
        [
          "packages/domain/src/task-search.ts",
          "packages/domain/src/task-filters.ts",
          "packages/domain/src/store/projection.ts",
        ].map((path) => [
          path,
          createHash("sha256")
            .update(readFileSync(join(directory, path)))
            .digest("hex"),
        ]),
      ),
      binarySha256: Object.fromEntries(
        Object.entries(binaries).map(([key, path]) => [
          key,
          createHash("sha256").update(readFileSync(path)).digest("hex"),
        ]),
      ),
    },
    null,
    2,
  ),
);
console.log(manifest);
