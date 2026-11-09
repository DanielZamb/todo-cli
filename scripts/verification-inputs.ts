import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";

export function verificationRoot(from: string): string {
  return realpathSync(
    execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd: from,
      encoding: "utf8",
    }).trim(),
  );
}

export function repositoryPath(
  root: string,
  path: string,
  name: string,
): string {
  assert.ok(
    path.length > 0 && !isAbsolute(path),
    `${name}: use a repo-relative input path`,
  );
  const target = resolve(root, path);
  const inside = (value: string) => {
    const part = relative(root, value);
    return part !== ".." && !part.startsWith("../") && !isAbsolute(part);
  };
  assert.ok(inside(target), `${name}: input must stay inside the repo`);
  let ancestor = target;
  while (!existsSync(ancestor)) ancestor = dirname(ancestor);
  assert.ok(
    inside(realpathSync(ancestor)),
    `${name}: input symlink escapes the repo`,
  );
  return target;
}

export function repositoryInput(
  root: string,
  path: string,
  name: string,
): string {
  const target = repositoryPath(root, path, name);
  assert.ok(existsSync(target), `${name}: missing repo input ${path}`);
  return target;
}
