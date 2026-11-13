import { setSystemTime } from "bun:test";
import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { Database } from "bun:sqlite";
import { Effect, Schema } from "effect";
import { openStore, TaskCommands } from "../../../../packages/domain/src/store/store.ts";
import { ProfileId, TaskId } from "../../../../packages/domain/src/ids.ts";
setSystemTime(new Date("2026-11-11T18:00:00Z"));
const root = resolve(".scratch/server-reads/diagnostics-hold");
mkdirSync(root, { recursive: !0 });
const fixtures = await Bun.file(".scratch/server-reads/checkpoints/fixtures.json").json(), owner = fixtures.find((x) => x.id === "n178-p8-large1-h2048");
assert.ok(owner);
const variants = [];
for (const name of ["owner", "snapshots"]) {
  const directory = join(root, name);
  mkdirSync(directory, { recursive: !0 });
  const path = join(directory, "scratch.db");
  copyFileSync(owner.path, path);
  if (name === "snapshots") {
    const run = Effect.runPromise, store = await run(openStore({ path }));
    try {
      const db = Reflect.get(store, "db"), row = db.query("SELECT id,profile_id FROM tasks WHERE json_extract(payload,'$.deleted_at') IS NULL ORDER BY id LIMIT 1").get();
      assert.ok(row);
      const request = { credential: owner.credential, profile: Schema.decodeUnknownSync(ProfileId)(row.profile_id), task_id: Schema.decodeUnknownSync(TaskId)(row.id) }, commands = new TaskCommands(store);
      for (let i = 0;i < 16; i++) {
        const current = await run(commands.get(request));
        assert.ok(current);
        const edited = await run(commands.edit(request, { from_version: current.row_version, changes: { title: "Diagnostic checkpoint " + i } }));
        assert.equal(edited.outcome, "committed");
        await run(store.takeSnapshot());
      }
      for (let i = 0;i < 8; i++)
        await run(store.snapshots.create("diagnostic realistic backup " + i));
    } finally {
      await run(store.close());
    }
  }
  const db = new Database(path), sizes = db.query("SELECT count(*) AS checkpoints,coalesce(sum(length(CAST(payload AS BLOB))),0) AS checkpointBytes FROM snapshots").get();
  db.close();
  const manifest = join(directory, "fixture.json");
  writeFileSync(manifest, JSON.stringify({ path, credential: owner.credential }));
  variants.push({ name, manifest, ...sizes });
}
writeFileSync(join(root, "fixtures.json"), JSON.stringify(variants, null, 2));
console.log(JSON.stringify(variants));
