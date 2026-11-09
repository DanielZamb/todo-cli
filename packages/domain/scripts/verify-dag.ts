import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, isAbsolute, join } from "node:path";
import { Effect } from "effect";
import { openStore } from "../src/store/store.ts";
import {
  append,
  at,
  create,
  current,
  dagCases,
  delta,
  edge,
  profile,
  proveMigrationAndGuards,
  provePurgeEndpoint,
  runDagCase,
  task,
} from "./dag-proof.ts";
import { proveDependencyCommands } from "./dependency-command-proof.ts";
import { proveGraphAlgorithms } from "./graph-proof.ts";

const [mode, directory, evidence] = process.argv.slice(2);
if (
  !directory ||
  !isAbsolute(directory) ||
  !basename(directory).startsWith("todo-dag-")
)
  throw new Error("Expected private todo-dag- scratch directory");
const path = join(directory, "race.db");
const waitFor = async (file: string) => {
  const deadline = Date.now() + 60000;
  while (!existsSync(file)) {
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${file}`);
    await Bun.sleep(10);
  }
};
if (mode === "A" || mode === "B") {
  const store = await Effect.runPromise(openStore({ path }));
  try {
    const observed = await Effect.runPromise(current(store, mode));
    assert.equal(observed.row_version, 1);
    writeFileSync(join(directory, `ready-${mode}`), "ready");
    await waitFor(join(directory, "go"));
    const result = await Effect.runPromise(
      append(store, delta(mode, mode === "A" ? "B" : "A", 1)),
    );
    writeFileSync(
      join(directory, `result-${mode}.json`),
      JSON.stringify(result),
    );
  } finally {
    await Effect.runPromise(store.close());
  }
} else {
  if (
    mode !== "drive" ||
    !evidence ||
    !isAbsolute(evidence) ||
    evidence.startsWith(directory)
  )
    throw new Error(
      "Usage: verify-dag drive <scratch> <evidence outside scratch>",
    );
  mkdirSync(evidence, { recursive: true });
  const receipts: unknown[] = [];
  proveGraphAlgorithms();
  receipts.push({ name: "graph-algorithms", outcome: "passed" });
  for (const [name, run] of Object.entries(dagCases)) {
    const caseDirectory = join(directory, name);
    mkdirSync(caseDirectory);
    await Effect.runPromise(
      runDagCase(join(caseDirectory, "scratch.db"), (store) =>
        Effect.gen(function* () {
          yield* run(store);
          writeFileSync(
            join(evidence, `${name}.json`),
            JSON.stringify(
              {
                tasks: yield* store.tasks(),
                edges: yield* store.dependencies(),
                history: yield* store.history(),
              },
              null,
              2,
            ),
          );
        }),
      ),
    );
    receipts.push({ name, outcome: "passed" });
  }
  for (const target of ["A", "B"] as const) {
    const caseDirectory = join(directory, `purge-${target}`);
    mkdirSync(caseDirectory);
    await Effect.runPromise(
      runDagCase(join(caseDirectory, "scratch.db"), (store) =>
        provePurgeEndpoint(store, target, join(caseDirectory, "scratch.db")),
      ),
    );
    receipts.push({ name: `purge-${target}`, outcome: "passed" });
  }
  mkdirSync(join(directory, "public-commands"));
  await Effect.runPromise(
    runDagCase(
      join(directory, "public-commands/scratch.db"),
      proveDependencyCommands,
    ),
  );
  receipts.push({
    name: "authenticated-dependency-commands",
    outcome: "passed",
  });
  mkdirSync(join(directory, "migration"));
  await Effect.runPromise(
    proveMigrationAndGuards(join(directory, "migration/scratch.db")),
  );
  receipts.push({ name: "migration-and-guards", outcome: "passed" });
  await Effect.runPromise(
    runDagCase(path, (store) =>
      Effect.gen(function* () {
        yield* store.putProfile({
          id: profile,
          name: "DAG",
          created_at: at,
          updated_at: at,
        });
        yield* append(store, create(task("A")));
        yield* append(store, create(task("B")));
      }),
    ),
  );
  const children = ["A", "B"].map((mode) => {
    const child = spawn(process.execPath, [mode, directory], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk;
    });
    child.stderr.on("data", (chunk) => {
      output += chunk;
    });
    return {
      child,
      done: new Promise<void>((resolve, reject) => {
        child.on("error", reject);
        child.on("exit", (code) => {
          writeFileSync(join(evidence, `race-${mode}.log`), output);
          code === 0
            ? resolve()
            : reject(new Error(`Race ${mode} exited ${code}: ${output}`));
        });
      }),
    };
  });
  try {
    await Promise.all([
      waitFor(join(directory, "ready-A")),
      waitFor(join(directory, "ready-B")),
    ]);
    writeFileSync(join(directory, "go"), "go");
    await Promise.all(children.map((child) => child.done));
  } finally {
    for (const { child } of children)
      if (child.exitCode === null) child.kill("SIGTERM");
  }
  const results = ["A", "B"].map((name) =>
    JSON.parse(readFileSync(join(directory, `result-${name}.json`), "utf8")),
  );
  assert.deepEqual(results.map((value) => value.outcome).sort(), [
    "committed",
    "rejected",
  ]);
  assert.equal(
    results.find((value) => value.outcome === "rejected")?.reason,
    "dependency_cycle",
  );
  await Effect.runPromise(
    runDagCase(path, (store) =>
      Effect.gen(function* () {
        const edges = yield* store.dependencies();
        assert.ok(
          JSON.stringify(edges) === JSON.stringify([edge("A", "B")]) ||
            JSON.stringify(edges) === JSON.stringify([edge("B", "A")]),
        );
        const tasks = yield* store.tasks();
        assert.deepEqual(tasks.map((task) => task.row_version).sort(), [1, 2]);
        yield* store.takeSnapshot();
        yield* store.rebuild();
        assert.deepEqual(yield* store.dependencies(), edges);
        yield* store.rebuild({ useSnapshot: true });
        assert.deepEqual(yield* store.dependencies(), edges);
        writeFileSync(
          join(evidence, "race.json"),
          JSON.stringify(
            { results, tasks, edges, history: yield* store.history() },
            null,
            2,
          ),
        );
      }),
    ),
  );
  receipts.push({
    name: "opposite-edge-process-race",
    outcome: "passed",
    child_exit_codes: children.map(({ child }) => child.exitCode),
  });
  writeFileSync(
    join(evidence, "result.json"),
    JSON.stringify(
      { proof: "compiled domain library on scratch SQLite", receipts },
      null,
      2,
    ),
  );
  process.stdout.write("PASS compiled DAG library drive\n");
}
