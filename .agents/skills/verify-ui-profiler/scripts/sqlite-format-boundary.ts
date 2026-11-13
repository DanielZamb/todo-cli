import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  chmod,
  copyFile,
  readFile,
  rm,
  stat,
} from "node:fs/promises";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { RecordingDatabase } from "../../../../packages/domain/src/recordings-sqlite.ts";
const evidence = resolve(
  process.argv[2] ?? "docs/evidence/ui-speed/recordings-format-boundary",
);
mkdirSync(evidence, { recursive: true });
const root = await mkdtemp(join(tmpdir(), "todo-recording-boundary-"));
try {
  const taskDir = join(root, "task"),
    copyDir = join(root, "copy"),
    home = join(root, "home");
  await Promise.all([mkdir(taskDir), mkdir(copyDir), mkdir(home)]);
  const taskPath = join(taskDir, "recordings.db"),
    env = { ...process.env, HOME: home, TODO_DB: taskPath };
  for (const args of [
    ["init", "--password-stdin"],
    ["login", "--password-stdin"],
    ["add", "Scratch boundary Task", "--format", "json"],
  ]) {
    const r = spawnSync(
      resolve(".scratch/bin/todo"),
      ["--profile", "work", ...args],
      {
        env,
        input: args.includes("--password-stdin")
          ? "Scratch boundary passphrase\n"
          : undefined,
        encoding: "utf8",
      },
    );
    assert.equal(r.status, 0, r.stderr);
  }
  await copyFile(taskPath, join(copyDir, "recordings.db"));
  const rows = [];
  for (const dir of [taskDir, copyDir]) {
    const path = join(dir, "recordings.db");
    await chmod(path, 0o640);
    await chmod(dir, 0o750);
    const before = await readFile(path),
      beforeHash = createHash("sha256").update(before).digest("hex");
    assert.throws(() => new RecordingDatabase(dir), {
      message: "Foreign database refused",
    });
    const after = await readFile(path),
      afterHash = createHash("sha256").update(after).digest("hex");
    assert.equal(afterHash, beforeHash);
    assert.equal((await stat(path)).mode & 0o777, 0o640);
    assert.equal((await stat(dir)).mode & 0o777, 0o750);
    rows.push({
      kind: dir === taskDir ? "Task database" : "Task database copy",
      beforeHash,
      afterHash,
      fileMode: 0o640,
      directoryMode: 0o750,
    });
  }
  writeFileSync(
    join(evidence, "result.json"),
    JSON.stringify({ result: "PASS", rows }, null, 2),
  );
} finally {
  await rm(root, { recursive: true, force: true });
}
