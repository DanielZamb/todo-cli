import { Database } from "bun:sqlite";
import assert from "node:assert/strict";
import { Effect, Schema } from "effect";
import { Task } from "../../../packages/domain/src/entities.ts";
import {
  type OperationStore,
  openStore,
} from "../../../packages/domain/src/store/store.ts";
import {
  actor,
  created,
  initial,
  kinds,
  profile,
  proposal,
} from "./fixture.ts";

const run = Effect.runPromise;
const append = (store: OperationStore, event: unknown) =>
  run(store.append({ actor, profile: profile.id, event }));
const single = async (store: OperationStore) => {
  const tasks = await run(store.tasks());
  assert.equal(tasks.length, 1);
  const task = tasks[0];
  assert.ok(task);
  return task;
};
async function seed(store: OperationStore, version = 1) {
  await run(store.putProfile(profile));
  assert.equal((await append(store, created)).outcome, "committed");
  for (let next = 2; next <= version; next++) {
    const event = proposal(await single(store), next, "TaskEdited");
    assert.equal((await append(store, event)).outcome, "committed");
  }
}

async function enumerate() {
  let checked = 0;
  for (let currentVersion = 1; currentVersion <= 3; currentVersion++) {
    const seedStore = await run(openStore({ path: ":memory:" }));
    try {
      await seed(seedStore, currentVersion);
      await run(seedStore.takeSnapshot());
      const current = await single(seedStore);
      const history = await run(seedStore.history());
      for (let beforeVersion = 1; beforeVersion <= 3; beforeVersion++) {
        for (const exactContent of [true, false]) {
          for (const afterVersion of [
            currentVersion + 1,
            ...[1, 2, 3, 4].filter((version) => version !== currentVersion + 1),
          ]) {
            for (const kind of kinds) {
              const store = await run(seedStore.fork());
              const before = Schema.decodeUnknownSync(Task)({
                ...current,
                row_version: beforeVersion,
                title: exactContent
                  ? current.title
                  : "Different before content",
              });
              const event = proposal(before, afterVersion, kind);
              const expectedCommit =
                beforeVersion === currentVersion &&
                exactContent &&
                afterVersion === currentVersion + 1;
              const context = { current, before, event, expectedCommit };
              try {
                const entry = await append(store, event);
                const observed = {
                  outcome: entry.outcome,
                  reason: entry.reason,
                };
                assert.deepEqual(
                  observed,
                  expectedCommit
                    ? { outcome: "committed", reason: null }
                    : {
                        outcome: "rejected",
                        reason:
                          beforeVersion !== currentVersion || !exactContent
                            ? "conflict"
                            : "validation",
                      },
                  JSON.stringify({ ...context, observed }),
                );
                const expectedTask = expectedCommit ? event.after : current;
                assert.deepEqual(
                  await run(store.tasks()),
                  [expectedTask],
                  JSON.stringify(context),
                );
                const actualHistory = await run(store.history());
                assert.equal(actualHistory.length, history.length + 1);
                assert.deepEqual(actualHistory.slice(0, -1), history);
                assert.deepEqual(actualHistory.at(-1), entry);
                assert.equal(entry.from_version, beforeVersion);
                assert.equal(
                  entry.to_version,
                  expectedCommit ? afterVersion : null,
                );
                assert.deepEqual(
                  await run(store.rebuild()),
                  [expectedTask],
                  JSON.stringify(context),
                );
                assert.deepEqual(
                  await run(store.rebuild({ useSnapshot: true })),
                  [expectedTask],
                  JSON.stringify(context),
                );
                checked++;
              } finally {
                await run(store.close());
              }
            }
          }
        }
      }
    } finally {
      await run(seedStore.close());
    }
  }
  return { checked, expected: 216, replayChecks: checked * 2 };
}

const [mode, path] = process.argv.slice(2);
if (mode === "enumerate") {
  console.log(JSON.stringify(await enumerate()));
} else {
  assert.ok(path);
  assert.ok(
    path.includes("fv01-check-"),
    "Only the verifier's scratch database is allowed",
  );
  const store = await run(openStore({ path }));
  try {
    switch (mode) {
      case "seed":
        await seed(store);
        console.log(JSON.stringify({ seeded: true }));
        break;
      case "attempt": {
        const before = await single(store);
        process.stdout.write("READY\n");
        for await (const _chunk of Bun.stdin.stream()) break;
        const kind =
          process.env.FV01_KIND === "attachment"
            ? "AttachmentAdded"
            : "TaskEdited";
        const expectedBefore =
          process.env.FV01_KIND === "stale"
            ? { ...before, title: "Different before content" }
            : before;
        const entry = await append(
          store,
          proposal(expectedBefore, before.row_version + 1, kind),
        );
        console.log(JSON.stringify({ entry }));
        break;
      }
      case "inspect": {
        const sql = new Database(path, { readonly: true });
        try {
          const versions = sql
            .query("SELECT id,version FROM task_versions ORDER BY id")
            .all();
          console.log(
            JSON.stringify({
              tasks: await run(store.tasks()),
              history: await run(store.history()),
              versions,
              replay: await run(store.rebuild()),
            }),
          );
        } finally {
          sql.close();
        }
        break;
      }
      case "rollback": {
        const sql = new Database(path);
        sql.exec(
          "CREATE TRIGGER fv01_fail BEFORE INSERT ON tasks BEGIN SELECT RAISE(ABORT, 'fv01 projection failure'); END;",
        );
        try {
          const before = await single(store);
          const failed = await run(
            Effect.isFailure(
              store.append({
                actor,
                profile: profile.id,
                event: proposal(before, 2, "AttachmentAdded"),
              }),
            ),
          );
          assert.equal(failed, true);
          assert.deepEqual(await run(store.tasks()), [initial]);
          assert.equal((await run(store.history())).length, 1);
          assert.deepEqual(await run(store.rebuild()), [initial]);
          console.log(JSON.stringify({ rollback: true }));
        } finally {
          sql.close();
        }
        break;
      }
      default:
        throw new Error(`Unknown mode: ${mode}`);
    }
  } finally {
    await run(store.close());
  }
}
