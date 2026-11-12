import { Database } from "bun:sqlite";
import assert from "node:assert/strict";
import { Effect, Schema } from "effect";
import {
  Task,
  TaskId,
  ProfileId,
  Version,
  TaskTime,
} from "../../packages/domain/src/index.ts";
import {
  copyTask,
  createSeries,
  revertTask,
} from "../../packages/domain/src/commands.ts";
import { baseline, database } from "./baseline.ts";
import { applyPatch, difference, bytes } from "./patch.ts";
import { type Observer, attach } from "./observer.ts";
import type { openCase } from "./driver.ts";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { writeFileSync, readFileSync } from "node:fs";
type Case = Awaited<ReturnType<typeof openCase>>;
const run = Effect.runPromise;
export async function correctness(c: Case) {
  let checks = 0;
  const db = database(c.store),
    get = (id: string) =>
      Schema.decodeUnknownSync(Task)(
        JSON.parse(
          db
            .query<{ payload: string }, [string]>(
              "SELECT payload FROM tasks WHERE id=?",
            )
            .get(id)?.payload ?? "null",
        ),
      );
  const check = () => {
    c.observer.poll();
    assert.deepEqual(
      c.observer.replica,
      baseline(c.store, "p0", c.observer.at),
    );
    checks++;
  };
  for (let i = 0; i < 100; i++) {
    const row = get("p0-t040"),
      before = c.observer.replica;
    assert.equal(
      (
        await run(
          c.commands.edit(
            { ...c.request, task_id: row.id },
            {
              from_version: row.row_version,
              changes: {
                title: "generated " + i,
                energy: (i % 5) + 1,
                priority: i % 2 ? "P1" : "P4",
              },
            },
          ),
        )
      ).outcome,
      "committed",
    );
    check();
    const p = difference(before, c.observer.replica, "whole");
    assert.deepEqual(applyPatch(before, p), c.observer.replica);
  }
  const external = get("p0-t040"),
    cli = spawnSync(
      resolve(".scratch/sync-patches/bin/cli"),
      [
        "--db",
        join(c.directory, "scratch.db"),
        "--profile",
        "p0",
        "--format",
        "json",
        "edit",
        external.id,
        "--expected-version",
        String(external.row_version),
        "--title",
        "old CLI external edit",
      ],
      {
        env: {
          ...process.env,
          HOME: join(c.directory, "home"),
          SYNC_EXPERIMENT_CONFIG: "",
        },
        encoding: "utf8",
      },
    );
  assert.equal(cli.status, 0, cli.stderr + cli.stdout);
  check();
  const before = c.observer.replica,
    root = get("p0-t000");
  assert.equal(
    (
      await run(
        c.commands.transition(
          { ...c.request, task_id: root.id },
          { from_version: root.row_version, action: "complete" },
        ),
      )
    ).outcome,
    "committed",
  );
  check();
  const patch = difference(before, c.observer.replica, "whole"),
    broken = { ...patch, computed: { ...patch.computed } };
  delete broken.computed["p0-t015"];
  assert.throws(() =>
    assert.deepEqual(applyPatch(before, broken), c.observer.replica),
  );
  assert.equal(c.observer.replica.computed["p0-t015"]?.ready, true);
  const unchanged = before.rows["p0-t170"];
  assert.equal(applyPatch(before, patch).rows["p0-t170"], unchanged);
  const target = get("p0-t040");
  const old = target.row_version;
  assert.equal(
    (
      await run(
        c.commands.edit(
          { ...c.request, task_id: target.id },
          { from_version: old, changes: { title: "remote rename" } },
        ),
      )
    ).outcome,
    "committed",
  );
  check();
  assert.equal(
    (
      await run(
        c.commands.edit(
          { ...c.request, task_id: target.id },
          { from_version: old, changes: { title: "refused" } },
        ),
      )
    ).outcome,
    "rejected",
  );
  check();
  assert.equal(c.observer.replica.rows[target.id]?.title, "remote rename");
  assert.equal(
    (
      await run(
        copyTask(
          c.store,
          { ...c.request, task_id: target.id },
          {
            from_version: get(target.id).row_version,
            destination_profile: Schema.decodeUnknownSync(ProfileId)("p1"),
          },
        ),
      )
    ).outcome,
    "committed",
  );
  check();
  const d = get("p0-t011"),
    preview = await run(
      c.commands.delete(
        { ...c.request, task_id: d.id },
        { from_version: d.row_version, dry_run: true },
      ),
    );
  assert.equal(preview.outcome, "committed");
  if (preview.outcome !== "committed") throw Error("preview");
  assert.ok(preview.dependency_fingerprint);
  assert.equal(
    (
      await run(
        c.commands.delete(
          { ...c.request, task_id: d.id },
          {
            from_version: d.row_version,
            with_dependencies: true,
            dependency_fingerprint: preview.dependency_fingerprint,
          },
        ),
      )
    ).outcome,
    "committed",
  );
  check();
  const history = await run(c.store.history());
  const deleted = history.filter((o) => o.event.kind === "TaskDeleted").at(-1);
  assert.ok(deleted);
  assert.equal(
    (
      await run(
        revertTask(
          c.store,
          { ...c.request, task_id: d.id },
          { from_version: get(d.id).row_version, seq: deleted.seq },
        ),
      )
    ).outcome,
    "committed",
  );
  check();
  const series = await run(
    createSeries(c.store, c.request, {
      task: { title: "Daily" },
      recurrence: {
        dtstart: { kind: "date", date: c.config.at.slice(0, 10) },
        rrule: "FREQ=DAILY",
        exdate: [],
      },
    }),
  );
  assert.equal(series.outcome, "committed");
  check();
  if (series.outcome === "committed") {
    assert.equal(
      (
        await run(
          c.commands.transition(
            { ...c.request, task_id: series.task.id },
            { from_version: series.task.row_version, action: "complete" },
          ),
        )
      ).outcome,
      "committed",
    );
    check();
  }
  const timed = get("p0-t041");
  assert.equal(
    (
      await run(
        c.commands.edit(
          { ...c.request, task_id: timed.id },
          {
            from_version: timed.row_version,
            changes: {
              due_at: Schema.decodeUnknownSync(TaskTime)({
                kind: "instant",
                utc: new Date(Date.now() - 1000).toISOString(),
                time_zone: "UTC",
              }),
            },
          },
        ),
      )
    ).outcome,
    "committed",
  );
  await run(c.store.scheduled.runDue());
  check();
  const state = c.observer.replica;
  const pending = new Map([
    ["first", "pending"],
    ["second", "pending"],
  ]);
  for (const order of ["reply-first", "stream-first"]) {
    let r = state;
    const p = difference(state, state, "whole");
    for (const _ of [order, "echo"]) {
      if (r.cursor === p.to) continue;
      r = applyPatch(r, p);
    }
    pending.delete("first");
    assert.equal(pending.get("second"), "pending");
    assert.equal(r.cursor, state.cursor);
  }
  assert.deepEqual(db.query("PRAGMA foreign_key_check").all(), []);
  const snap = await run(c.store.snapshots.create("experiment"));
  check();
  await run(c.store.snapshots.restore(snap.id));
  check();
  const doomed = get("p0-t040");
  assert.equal(
    (
      await run(
        c.commands.delete(
          { ...c.request, task_id: doomed.id },
          { from_version: doomed.row_version },
        ),
      )
    ).outcome,
    "committed",
  );
  check();
  assert.equal(
    (
      await run(
        c.commands.purge(
          { ...c.request, task_id: doomed.id },
          { from_version: get(doomed.id).row_version },
        ),
      )
    ).outcome,
    "committed",
  );
  check();
  assert.equal(c.observer.replica.rows[doomed.id], undefined);
  assert.equal(c.observer.ring.length, 0);
  const staged = new Database(snap.path, { readonly: true });
  const violations = staged.query("PRAGMA foreign_key_check").all();
  staged.close();
  writeFileSync(
    "docs/evidence/sync-experiment/restore-" + c.observer.arm + ".json",
    JSON.stringify({ violations }),
  );
  let purgeRestore = "";
  try {
    await run(c.store.snapshots.restore(snap.id));
  } catch (error) {
    purgeRestore = String(error);
  }
  assert.ok(purgeRestore.includes("foreign keys"));
  check();
  assert.equal(c.observer.replica.rows[doomed.id], undefined);
  return {
    arm: c.observer.arm,
    checks,
    purge_restore_unproven: purgeRestore,
    descendant_mutant_failed: true,
    identity_preserved: true,
    resets: c.observer.resets,
    ring: c.observer.memory(),
  };
}
