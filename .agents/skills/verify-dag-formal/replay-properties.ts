import { Database } from "bun:sqlite";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { Effect } from "effect";
import {
  append,
  at,
  create,
  delta,
  edge,
  profile,
  task,
} from "../packages/domain/scripts/dag-proof.ts";
import { openStore } from "../packages/domain/src/store/store.ts";
import type { Task } from "../packages/domain/src/entities.ts";
const directory = process.argv[2];
assert.ok(directory);
const scratch = mkdtempSync(join(directory, "todo-dag-f-replay-"));
let activeProperty = "setup";
let input: unknown = null;
let cases = 0,
  rebuilds = 0;
const same = (property: string, actual: unknown, expected: unknown) => {
  activeProperty = property;
  assert.deepEqual(actual, expected, `BEHAVIORAL_FAILURE:${property}`);
};
function permutations(items: number[]): number[][] {
  return items.length === 0
    ? [[]]
    : items.flatMap((v, i) =>
        permutations(items.filter((_, j) => i !== j)).map((rest) => [
          v,
          ...rest,
        ]),
      );
}
async function replayCase(
  nodes: number,
  pairs: readonly [number, number][],
  order: readonly number[],
  initial: boolean,
) {
  input = { nodes, pairs, order, initial, case: cases };
  const dir = join(scratch, String(cases));
  mkdirSync(dir);
  const path = join(dir, "scratch.db");
  const store = await Effect.runPromise(openStore({ path }));
  const run = <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromise(effect);
  const id = (n: number) => String(n).padStart(3, "0");
  try {
    await run(
      store.putProfile({
        id: profile,
        name: "Formal replay",
        created_at: at,
        updated_at: at,
      }),
    );
    for (const [i, n] of order.entries()) {
      const result = await run(
        append(
          store,
          create(
            task(id(n)),
            initial ? pairs.filter(([, d]) => d === n).map(([b]) => id(b)) : [],
          ),
        ),
      );
      same("initial-edges", result.outcome, "committed");
      if (initial && i === Math.floor(nodes / 2))
        await run(store.takeSnapshot());
    }
    if (!initial) {
      await run(store.takeSnapshot());
      const versions = new Map(order.map((n) => [n, 1]));
      for (const [i, [b, d]] of pairs.entries()) {
        const v = versions.get(d);
        assert.ok(v);
        const result = await run(append(store, delta(id(d), id(b), v)));
        same("edge-append", result.outcome, "committed");
        versions.set(d, v + 1);
        if (i === Math.floor(pairs.length / 2)) await run(store.takeSnapshot());
      }
    }
    const expectedEdges = pairs
      .map(([b, d]) => edge(id(d), id(b)))
      .sort(
        (a, b) =>
          a.dependent_id.localeCompare(b.dependent_id) ||
          a.blocker_id.localeCompare(b.blocker_id),
      );
    const expectedTasks: Task[] = order
      .map((n) => task(id(n), { row_version: task(id(n)).row_version }))
      .sort((a, b) => a.id.localeCompare(b.id));
    const expectedVersions = order
      .map((n) => ({
        id: id(n),
        version: initial ? 1 : 1 + pairs.filter(([, d]) => d === n).length,
      }))
      .sort((a, b) => a.id.localeCompare(b.id));
    const expectedFull = expectedTasks.map((t) => ({
      ...t,
      row_version: expectedVersions.find((v) => v.id === t.id)?.version,
    }));
    async function verify(phase: string) {
      const db = new Database(path, { readonly: true });
      try {
        same(
          `replay-${phase}`,
          db
            .query(
              "SELECT profile_id,dependent_id,blocker_id FROM task_dependencies ORDER BY profile_id,dependent_id,blocker_id",
            )
            .all(),
          expectedEdges,
        );
        same(
          "replay-versions",
          db.query("SELECT id,version FROM task_versions ORDER BY id").all(),
          expectedVersions,
        );
        same(
          "replay-foreign-keys",
          db.query("PRAGMA foreign_key_check").all(),
          [],
        );
      } finally {
        db.close();
      }
      same("replay-tasks", await run(store.tasks()), expectedFull);
    }
    await verify("durable");
    await run(store.rebuild());
    rebuilds++;
    await verify("beginning");
    await run(store.rebuild({ useSnapshot: true }));
    rebuilds++;
    await verify("checkpoint");
    cases++;
  } finally {
    await run(store.close());
  }
}
try {
  const onlyLiteral = process.argv.includes("--literal");
  for (let n = 1; n <= (onlyLiteral ? 2 : 3); n++) {
    const nodes = Array.from({ length: n }, (_, i) => i);
    const possible: [number, number][] = nodes.flatMap((a) =>
      nodes
        .filter((b) => a !== b)
        .map((b) => [a, b] satisfies [number, number]),
    );
    for (let mask = 0; mask < 2 ** possible.length; mask++) {
      const pairs = possible.filter((_, i) => (mask & (1 << i)) !== 0);
      const order = permutations(nodes).find((order) =>
        pairs.every(([b, d]) => order.indexOf(b) < order.indexOf(d)),
      );
      if (order) await replayCase(n, pairs, order, cases % 2 === 0);
    }
  }
  let randomState = 260911;
  const random = () => {
    randomState ^= randomState << 13;
    randomState ^= randomState >>> 17;
    randomState ^= randomState << 5;
    return (randomState >>> 0) / 4294967296;
  };
  for (let k = 0; k < (onlyLiteral ? 2 : 64); k++) {
    const n = 4 + (k % 9);
    const order = Array.from({ length: n }, (_, i) => i);
    const pairs: [number, number][] = [];
    for (let d = 1; d < n; d++)
      for (let b = 0; b < d; b++)
        if (b === 0 || random() < 0.25) pairs.push([b, d]);
    await replayCase(n, pairs, order, k % 2 === 0);
  }
  console.log(
    JSON.stringify({
      status: "pass",
      seed: 260911,
      cases,
      rebuilds,
      bounds: {
        exhaustiveNodes: onlyLiteral ? 2 : 3,
        randomCases: onlyLiteral ? 2 : 64,
        randomNodes: [4, 12],
      },
      initialEdges: "alternating TaskCreated v2 and compact events",
    }),
  );
} catch (error) {
  console.error(`BEHAVIORAL_FAILURE:${activeProperty}`);
  console.log(
    JSON.stringify({
      status: "fail",
      property: activeProperty,
      input,
      error: String(error),
      cases,
      rebuilds,
    }),
  );
  process.exitCode = 1;
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
