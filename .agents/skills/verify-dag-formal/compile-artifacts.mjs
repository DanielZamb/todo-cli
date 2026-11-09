import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { digest } from "./candidate-inputs.mjs";
import { beforeCompile } from "./compile-safety.mjs";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const free = () => {
  const result = spawnSync("df", ["-k", root], { encoding: "utf8" });
  assert.equal(result.status, 0);
  return (
    Number(result.stdout.trim().split("\n").at(-1).trim().split(/\s+/)[3]) *
    1024
  );
};
export function captureCompile({ output, evidence, label }) {
  const directories = [
    ...new Set([process.cwd(), ...(output ? [dirname(resolve(output))] : [])]),
  ].filter(
    (directory) =>
      resolve(directory) === root || resolve(directory).startsWith(root + "/"),
  );
  const snapshots = directories.map((directory) => {
    const actual = realpathSync(directory);
    assert.ok(
      actual === root || actual.startsWith(root + "/"),
      "Compiler directory outside owned worktree",
    );
    assert.equal(
      actual,
      resolve(directory),
      "Compiler directory follows a symlink",
    );
    return { directory: actual, names: new Set(readdirSync(actual)) };
  });
  return {
    snapshots,
    output: output && resolve(output),
    evidence,
    label,
    started: Date.now(),
    beforeAvailableBytes: free(),
  };
}
export function finishCompile(capture) {
  const { snapshots, output, evidence, label } = capture;
  const outputHash =
    output && existsSync(output) ? digest(readFileSync(output)) : null;
  const compilerHash = digest(
    readFileSync(process.env.DAG_F_REAL_BUN ?? process.execPath),
  );
  const ps = spawnSync("ps", ["-axo", "pid=,command="], { encoding: "utf8" });
  assert.equal(ps.status, 0);
  const compilerRunning = ps.stdout
    .split("\n")
    .some(
      (line) =>
        line.includes(root) && /\bbun\s+build\b|\s--compile(?:\s|$)/.test(line),
    );
  const artifacts = [];
  for (const { directory, names } of snapshots)
    for (const name of readdirSync(directory)) {
      if (names.has(name) || !/^\..+\.bun-build$/.test(name)) continue;
      const path = join(directory, name),
        stat = lstatSync(path);
      if (
        !stat.isFile() ||
        stat.isSymbolicLink() ||
        stat.uid !== process.getuid()
      ) {
        artifacts.push({ path, action: "retained-unproven-ownership" });
        continue;
      }
      const hash = digest(readFileSync(path));
      const open = spawnSync("/usr/sbin/lsof", ["-nP", "-Fpcn", path], {
        encoding: "utf8",
      });
      assert.ok(open.status === 0 || open.status === 1);
      assert.equal(open.stderr, "");
      const inUse = compilerRunning || open.stdout.length > 0;
      const after = lstatSync(path);
      const unchanged =
        stat.ino === after.ino &&
        stat.dev === after.dev &&
        stat.size === after.size &&
        stat.mtimeMs === after.mtimeMs;
      const remove =
        !inUse && unchanged && (outputHash === hash || compilerHash === hash);
      const beforeAvailableBytes = free();
      if (remove) unlinkSync(path);
      artifacts.push({
        path,
        bytes: stat.size,
        sha256: hash,
        outputHash,
        compilerHash,
        inode: stat.ino,
        uid: stat.uid,
        inUse,
        unchanged,
        action: remove
          ? "unlinked-own-new-compiler-temporary"
          : "retained-ambiguous-or-in-use",
        beforeAvailableBytes,
        afterAvailableBytes: free(),
      });
    }
  writeFileSync(
    join(
      evidence,
      `compile-temporaries-${label.replaceAll(/[^a-zA-Z0-9_.-]/g, "_")}-${process.pid}-${capture.started}.json`,
    ),
    JSON.stringify(
      {
        label,
        compilerSettled: true,
        output,
        snapshots: snapshots.map(({ directory, names }) => ({
          directory,
          preexistingNames: [...names],
        })),
        beforeAvailableBytes: capture.beforeAvailableBytes,
        afterAvailableBytes: free(),
        artifacts,
        capacityNote:
          "Logical unlinks are separate from observed APFS capacity; prior files and ambiguous artifacts are retained.",
      },
      null,
      2,
    ) + "\n",
  );
}
export const guardedCompiler = (build, context) => async (options) => {
  const capture = captureCompile({
    ...context,
    output: options.compile?.outfile,
  });
  beforeCompile(context);
  try {
    return await build(options);
  } finally {
    finishCompile(capture);
  }
};
