import assert from "node:assert/strict";
import { Database } from "bun:sqlite";
import { spawn, spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  chmodSync,
  statSync,
  rmSync,
  readdirSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { RecordingDatabase } from "../../../../packages/domain/src/recordings-sqlite.ts";
import { modelBatch } from "../../../../packages/domain/test/fixtures/recording-authority.ts";
const [mode, rootArg, tagArg] = process.argv.slice(2);
if (mode === "child") {
  assert.ok(rootArg && tagArg);
  const root = resolve(rootArg),
    tag = tagArg,
    dir = join(
      root,
      tagArg.startsWith("server") ? "diagnostic-recordings" : "database",
    ),
    events: string[] = [];
  let error = "";
  try {
    const db = new RecordingDatabase(dir, {
      openBoundary: (point) => {
        events.push(point);
        if (
          point === (tag.endsWith("held") ? "excluded" : "before_exclusion")
        ) {
          writeFileSync(join(root, tag + "-ready"), point);
          const end = Date.now() + 15000;
          while (!existsSync(join(root, tag + "-resume")) && Date.now() < end)
            Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5);
          assert.ok(existsSync(join(root, tag + "-resume")));
        }
      },
    });
    db.close();
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  writeFileSync(
    join(root, tag + "-result.json"),
    JSON.stringify({ error, events }),
  );
} else {
  const evidence = resolve(
    mode ?? "docs/evidence/ui-speed/recordings-initialization",
  );
  mkdirSync(evidence, { recursive: true });
  const rows: object[] = [];
  const snapshot = (dir: string) => ({
    mode: statSync(dir).mode & 511,
    files: readdirSync(dir)
      .sort()
      .map((name) => ({
        name,
        mode: statSync(join(dir, name)).mode & 511,
        sha256: createHash("sha256")
          .update(readFileSync(join(dir, name)))
          .digest("hex"),
      })),
  });
  const start = (root: string, tag: string) => {
    const child = spawn(process.execPath, ["child", root, tag], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let log = "";
    child.stderr.on("data", (b) => (log += b));
    const done = new Promise<number | null>((r) => child.once("exit", r));
    return { child, done, log: () => log };
  };
  const ready = async (root: string, tag: string) => {
    const end = Date.now() + 10000;
    while (!existsSync(join(root, tag + "-ready")) && Date.now() < end)
      await Bun.sleep(5);
    assert.ok(existsSync(join(root, tag + "-ready")));
  };
  for (const fixture of ["new", "existing", "task", "held", "pair"]) {
    const root = mkdtempSync(join(tmpdir(), "todo-init-control-")),
      dir = join(root, "database"),
      path = join(dir, "recordings.db");
    mkdirSync(dir, { mode: 0o750 });
    if (fixture !== "new") writeFileSync(path, "");
    const tag = fixture === "held" ? "held" : "a",
      a = start(root, tag);
    let b: ReturnType<typeof start> | undefined;
    try {
      await ready(root, tag);
      if (fixture === "pair") {
        b = start(root, "b");
        await ready(root, "b");
        writeFileSync(join(root, "a-resume"), "");
        writeFileSync(join(root, "b-resume"), "");
        assert.equal(await a.done, 0, a.log());
        assert.equal(await b.done, 0, b.log());
        const x = JSON.parse(readFileSync(join(root, "a-result.json"), "utf8")),
          y = JSON.parse(readFileSync(join(root, "b-result.json"), "utf8"));
        assert.equal(x.error, "");
        assert.equal(y.error, "");
        assert.equal(
          [...x.events, ...y.events].filter((p) => p === "initialized").length,
          1,
        );
        const db = new RecordingDatabase(dir),
          batch = modelBatch();
        assert.equal(db.ingest(batch, Date.now()).accepted, true);
        assert.equal(
          db.export(batch.run.run_id).batches.flatMap((b) => b.events).length,
          3,
        );
        db.close();
        rows.push({ fixture, first: x, second: y });
      } else if (fixture === "held") {
        const peer = new Database(path);
        try {
          assert.throws(
            () =>
              peer.exec("PRAGMA busy_timeout=1;CREATE TABLE foreign_peer(x)"),
            /locked/u,
          );
        } finally {
          peer.close();
        }
        writeFileSync(join(root, "held-resume"), "");
        assert.equal(await a.done, 0, a.log());
        const result = JSON.parse(
          readFileSync(join(root, "held-result.json"), "utf8"),
        );
        assert.equal(result.error, "");
        const header = readFileSync(path);
        assert.equal(header.readUInt32BE(68), 0x544f4452);
        assert.equal(header.readUInt32BE(60), 1);
        rows.push({
          fixture,
          result,
          peer: "busy during exclusion; owned recording header afterwards",
        });
      } else {
        if (fixture === "task") {
          const home = join(root, "home");
          mkdirSync(home);
          for (const args of [
            ["init", "--password-stdin"],
            ["login", "--password-stdin"],
            ["add", "Scratch race Task", "--format", "json"],
          ]) {
            const r = spawnSync(
              resolve(".scratch/bin/todo"),
              ["--profile", "work", ...args],
              {
                env: { ...process.env, HOME: home, TODO_DB: path },
                input: args.includes("--password-stdin")
                  ? "Scratch race passphrase\n"
                  : undefined,
                encoding: "utf8",
              },
            );
            assert.equal(r.status, 0, r.stderr);
          }
        } else {
          const peer = new Database(path);
          peer.exec(
            "CREATE TABLE foreign_peer(value TEXT);INSERT INTO foreign_peer VALUES('Committed before exclusion')",
          );
          peer.close();
        }
        chmodSync(path, 0o640);
        chmodSync(dir, 0o750);
        const before = snapshot(dir);
        writeFileSync(join(root, "a-resume"), "");
        assert.equal(await a.done, 0, a.log());
        const result = JSON.parse(
          readFileSync(join(root, "a-result.json"), "utf8"),
        );
        assert.equal(result.error, "Foreign database refused");
        assert.deepEqual(snapshot(dir), before);
        assert.equal(result.events.includes("initialized"), false);
        rows.push({ fixture, result, before, after: snapshot(dir) });
      }
    } finally {
      for (const p of [a, b].filter((p) => p !== undefined))
        if (p.child.exitCode === null && p.child.signalCode === null)
          p.child.kill("SIGTERM");
      await Promise.all([a.done, b?.done]);
      rmSync(root, { recursive: true, force: true });
    }
  }
  writeFileSync(
    join(evidence, "result.json"),
    JSON.stringify({ result: "PASS", rows }, null, 2),
  );
}
