import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
export function workspaceTypePaths(candidate, names) {
  return Object.fromEntries(names.flatMap((name) => {
    const directory = join(candidate, "packages", name);
    const exports = JSON.parse(readFileSync(join(directory, "package.json"), "utf8")).exports;
    return Object.entries(exports).map(([key, path]) => [
      `@todo/${name}` + (key === "." ? "" : key.slice(1)),
      [resolve(directory, path)],
    ]);
  }));
}
export const digest = (bytes) =>
  createHash("sha256").update(bytes).digest("hex");
export function object(root, ref, path) {
  const result = spawnSync("git", ["show", `${ref}:${path}`], {
    cwd: root,
    maxBuffer: 20 * 1024 * 1024,
  });
  assert.equal(
    result.status,
    0,
    `Missing immutable object ${ref}:${path}: ${result.stderr}`,
  );
  return result.stdout;
}
export function materialize(root, directory, pin) {
  const listed = spawnSync(
    "git",
    [
      "ls-tree",
      "-r",
      "-z",
      pin.commit,
      ...(pin.scopes ?? [
        "packages/domain",
        ".agents/skills/verify-occ-atomicity",
      ]),
    ],
    { cwd: root, encoding: "utf8", maxBuffer: 4 * 1024 * 1024 },
  );
  assert.equal(listed.status, 0);
  const entries = listed.stdout
    .split("\0")
    .filter(Boolean)
    .map((row) => {
      const [metadata, path] = row.split("\t");
      assert.ok(metadata && path);
      const [mode, type, blob] = metadata.split(" ");
      assert.equal(type, "blob");
      assert.equal(mode, "100644", `Unexpected source file mode: ${path}`);
      const bytes = object(root, pin.commit, path);
      mkdirSync(dirname(join(directory, path)), { recursive: true });
      writeFileSync(join(directory, path), bytes);
      return { path, gitBlob: blob, sha256: digest(bytes) };
    });
  const manifests = pin.manifests ?? [
    "package.json",
    "pnpm-lock.yaml",
    "packages/domain/package.json",
  ];
  for (const path of manifests)
    assert.equal(
      digest(object(root, pin.commit, path)),
      digest(readFileSync(join(root, path))),
      `Installed dependency/source contract differs: ${path}`,
    );
  for (const path of ["package.json", "tsconfig.base.json"])
    writeFileSync(join(directory, path), object(root, pin.commit, path));
  return {
    commit: pin.commit,
    files: entries,
    dependencyManifests: manifests.map((path) => ({
      path,
      sha256: digest(object(root, pin.commit, path)),
    })),
  };
}
