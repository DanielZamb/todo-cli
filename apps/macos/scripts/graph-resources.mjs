import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
if (process.env.TODO_MACOS_GRAPH_RESOURCE_LOCK !== "1") {
  const result = spawnSync(
    "/usr/bin/lockf",
    [
      "-k",
      "/tmp/todo-search-electron.lock",
      process.execPath,
      ...process.argv.slice(1),
    ],
    {
      env: { ...process.env, TODO_MACOS_GRAPH_RESOURCE_LOCK: "1" },
      stdio: "inherit",
    },
  );
  process.exit(result.status ?? 1);
}
const command = "bun apps/electron/scripts/build-graph-browser.ts";
const destination = process.argv[2];
assert.ok(
  destination,
  `Pass a bundle resource directory. Build with ${command}.`,
);
const target = resolve(destination);
const lock = JSON.parse(
  readFileSync(
    join(root, "apps/electron/graph-browser/graph-browser.lock.json"),
    "utf8",
  ),
);
function verify(directory) {
  try {
    assert.deepEqual(
      readdirSync(directory).sort(),
      Object.keys(lock.files).sort(),
    );
    for (const [name, identity] of Object.entries(lock.files)) {
      assert.equal(name, name.split("/").at(-1));
      const file = join(directory, name);
      assert.ok(lstatSync(file).isFile() && !lstatSync(file).isSymbolicLink());
      const data = readFileSync(file);
      assert.equal(data.length, identity.bytes);
      assert.equal(
        createHash("sha256").update(data).digest("hex"),
        identity.sha256,
      );
    }
  } catch (error) {
    throw new Error(
      `Missing or mismatching graph resources in ${directory}. Build with ${command}.`,
      { cause: error },
    );
  }
}
if (!process.argv.includes("--check-only")) {
  const guard = spawnSync("sh", [join(root, "scripts/disk-guard.sh")], {
    stdio: "inherit",
  });
  if (guard.status !== 0) process.exit(guard.status ?? 1);
  const build = spawnSync(
    "sh",
    [
      join(root, "apps/electron/scripts/guarded-run.sh"),
      "bun",
      "apps/electron/scripts/build-graph-browser.ts",
    ],
    {
      cwd: root,
      stdio: "inherit",
    },
  );
  if (build.status !== 0) process.exit(build.status ?? 1);
  const emitted = join(root, "apps/electron/dist/graph-browser");
  verify(emitted);
  mkdirSync(target, { recursive: true });
  cpSync(emitted, target, { recursive: true });
}
verify(target);
process.stdout.write(
  `${JSON.stringify({
    directory: target,
    lockSHA256: createHash("sha256")
      .update(
        readFileSync(
          join(root, "apps/electron/graph-browser/graph-browser.lock.json"),
        ),
      )
      .digest("hex"),
    files: lock.files,
    status: "PASS",
  })}\n`,
);
