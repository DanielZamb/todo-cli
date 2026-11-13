import { Database } from "bun:sqlite";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// The review-4 swap witness made deterministic: a real Task database created
// by the compiled CLI, with one committed and un-checkpointed WAL transaction
// captured while its writer is open, is renamed over recordings.db right after
// the immutable preflight closes. Usage: <checkout root> <todo CLI binary>.
const root = resolve(process.argv[2] ?? ".");
const cliBinary = resolve(process.argv[3] ?? ".scratch/bin/todo");
const { RecordingDatabase } = await import(
  join(root, "packages/domain/src/recordings-sqlite.ts")
);
const base = mkdtempSync(join(tmpdir(), "todo-swap-witness-"));
const rec = join(base, "rec"),
  home = join(base, "home"),
  task = join(base, "task");
mkdirSync(home);
mkdirSync(task);
const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");
const snap = (dir: string) =>
  readdirSync(dir)
    .sort()
    .map((name) => {
      const path = join(dir, name);
      const bytes = readFileSync(path);
      return {
        name,
        bytes: bytes.length,
        mode: statSync(path).mode & 0o777,
        sha256: sha(bytes),
      };
    });
try {
  new RecordingDatabase(rec).close();
  const taskPath = join(task, "todo.db");
  for (const args of [
    ["init", "--password-stdin"],
    ["login", "--password-stdin"],
    ["add", "Scratch Task before swap", "--format", "json"],
  ]) {
    const r = spawnSync(cliBinary, ["--profile", "work", ...args], {
      env: { ...process.env, HOME: home, TODO_DB: taskPath },
      input: args.includes("--password-stdin")
        ? "Scratch swap passphrase\n"
        : undefined,
      encoding: "utf8",
    });
    if (r.status !== 0) throw new Error(`${args.join(" ")}: ${r.stderr}`);
  }
  const peer = new Database(taskPath);
  peer.query("PRAGMA wal_autocheckpoint=0").get();
  peer.query("CREATE TABLE peer_marker(x)").run();
  peer.query("INSERT INTO peer_marker VALUES(1)").run();
  copyFileSync(taskPath, join(base, "captured"));
  copyFileSync(`${taskPath}-wal`, join(base, "captured-wal"));
  peer.close();
  const capturedWalBytes = statSync(join(base, "captured-wal")).size;
  if (capturedWalBytes === 0) throw new Error("setup: empty Task WAL");
  const close = Database.prototype.close;
  let swapped = false;
  let afterSwap: ReturnType<typeof snap> = [];
  Reflect.set(
    Database.prototype,
    "close",
    function (this: Database, ...args: unknown[]) {
      const result = Reflect.apply(close, this, args);
      if (!swapped && String(this.filename).includes("immutable=1")) {
        swapped = true;
        for (const side of ["-wal", "-shm"])
          rmSync(join(rec, `recordings.db${side}`), { force: true });
        renameSync(join(base, "captured-wal"), join(rec, "recordings.db-wal"));
        renameSync(join(base, "captured"), join(rec, "recordings.db"));
        afterSwap = snap(rec);
      }
      return result;
    },
  );
  let error = "";
  try {
    new RecordingDatabase(rec).close();
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  Reflect.set(Database.prototype, "close", close);
  const after = snap(rec);
  const copy = join(base, "copy");
  mkdirSync(copy);
  for (const name of readdirSync(rec))
    copyFileSync(join(rec, name), join(copy, name));
  const check = new Database(join(copy, "recordings.db"), { readonly: true });
  const logical = {
    tasks: check.query("SELECT count(*) n FROM tasks").get(),
    marker: check.query("SELECT x FROM peer_marker").all(),
  };
  check.close();
  console.log(
    JSON.stringify(
      {
        swapped,
        error,
        captured_wal_bytes: capturedWalBytes,
        files_unchanged_since_swap:
          JSON.stringify(afterSwap) === JSON.stringify(after),
        after_swap: afterSwap,
        after,
        logical,
      },
      null,
      1,
    ),
  );
} finally {
  rmSync(base, { recursive: true, force: true });
}
