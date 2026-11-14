import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Clock, Effect, Schema } from "effect";
import { TaskCommands } from "../src/commands.ts";
import { graphEnergy } from "../src/graph-energy.ts";
import { queryGraph } from "../src/graph-queries.ts";
import { ProfileId } from "../src/ids.ts";
import { ImportReport, type ImportRequest } from "../src/import.ts";
import { importTasks } from "../src/import-tasks.ts";
import type { OperationStore } from "../src/store/store.ts";
import { at, profile } from "./dag-proof.ts";

export const proveImportDependencies = (
  store: OperationStore,
  items: ImportRequest["items"],
) =>
  Effect.gen(function* () {
    yield* store.putProfile({
      id: profile,
      name: "DAG",
      created_at: at,
      updated_at: at,
    });
    yield* store.auth.setupOwner("Dependency import proof");
    const session = yield* store.auth.signIn("Dependency import proof");
    const request = { ...session, profile };
    const commands = new TaskCommands(store);
    yield* store.snapshots.create("before Dependency import preview");
    const before = {
      tasks: yield* store.tasks(),
      edges: yield* store.dependencies(),
      history: yield* store.history(),
      checkpoints: yield* store.takeSnapshot(),
      snapshots: yield* store.snapshots.list(),
    };
    const copies = () =>
      readdirSync(store.snapshots.directory)
        .sort()
        .map((name) => [
          name,
          readFileSync(join(store.snapshots.directory, name)).toString(
            "base64",
          ),
        ]);
    const snapshotFiles = copies();
    const preview = yield* importTasks(store, request, {
      items,
      dry_run: true,
    });
    assert.deepEqual(preview.totals, {
      created: 4,
      updated: 0,
      unchanged: 0,
      rejected: 0,
    });
    assert.deepEqual(
      preview.items.map((row) => [row.external_id, row.task_id]),
      [
        ["goal", null],
        ["right", null],
        ["source", null],
        ["left", null],
      ],
    );
    assert.deepEqual(yield* store.tasks(), before.tasks);
    assert.deepEqual(yield* store.dependencies(), before.edges);
    assert.deepEqual(yield* store.history(), before.history);
    assert.deepEqual(yield* store.snapshots.list(), before.snapshots);
    assert.deepEqual(copies(), snapshotFiles);
    const applied = yield* importTasks(store, request, { items });
    assert.deepEqual(applied.totals, {
      created: 4,
      updated: 0,
      unchanged: 0,
      rejected: 0,
    });
    assert.deepEqual(
      applied.items.map((row) => row.external_id),
      ["goal", "right", "source", "left"],
    );
    const id = (external: string) => {
      const row = applied.items.find((row) => row.external_id === external);
      assert.ok(row?.task_id);
      return row.task_id;
    };
    const graph = yield* store.graph(profile);
    assert.equal(graph.edges.length, 4);
    assert.deepEqual(
      graph.tasks.map((task) => task.row_version),
      [1, 1, 1, 1],
    );
    const report = queryGraph(graph, id("goal"), at);
    assert.ok(report);
    assert.equal(report.shape, "dag");
    assert.deepEqual(
      report.nodes.map((node) => node.task.title),
      ["Source", "Left", "Right", "Goal"],
    );
    assert.deepEqual(graphEnergy(graph).values.get(id("goal")), {
      energy: 10,
      unweighted: 0,
    });
    const beforeRepeat = yield* store.history();
    const repeated = yield* importTasks(store, request, { items });
    assert.deepEqual(repeated.totals, {
      created: 0,
      updated: 0,
      unchanged: 4,
      rejected: 0,
    });
    assert.deepEqual(yield* store.history(), beforeRepeat);
    const stable = {
      tasks: yield* store.tasks(),
      edges: yield* store.dependencies(),
    };
    const blocked = yield* importTasks(store, request, {
      items: [
        {
          external_id: "goal",
          title: "Must roll back",
          status: "done",
          depends_on: ["source"],
        },
      ],
    });
    assert.equal(blocked.items[0]?.error?.code, "blocked");
    assert.equal(
      blocked.items[0]?.error?.details?.dependency_error?.code,
      "blocked",
    );
    assert.deepEqual(
      Schema.encodeSync(ImportReport)(blocked).items[0]?.error?.details,
      blocked.items[0]?.error?.details,
    );
    assert.equal(blocked.items[0]?.error?.details?.current_version, 1);
    assert.deepEqual(yield* store.tasks(), stable.tasks);
    assert.deepEqual(yield* store.dependencies(), stable.edges);
    const missing = yield* importTasks(store, request, {
      items: [
        {
          external_id: "missing",
          title: "Missing reference",
          depends_on: ["absent"],
        },
      ],
    });
    assert.equal(missing.items[0]?.outcome, "rejected");
    assert.match(
      missing.items[0]?.error?.message ?? "",
      /visible Task in this Profile/,
    );
    assert.deepEqual(yield* store.tasks(), stable.tasks);
    const other = Schema.decodeUnknownSync(ProfileId)("other");
    yield* store.putProfile({
      id: other,
      name: "Other",
      created_at: at,
      updated_at: at,
    });
    yield* commands.create(
      { ...session, profile: other },
      { title: "Private foreign title", external_id: "foreign" },
    );
    const cross = yield* importTasks(store, request, {
      items: [
        {
          external_id: "cross",
          title: "Foreign reference",
          depends_on: ["foreign"],
        },
      ],
    });
    assert.equal(cross.items[0]?.outcome, "rejected");
    assert.equal(
      JSON.stringify(cross).includes("Private foreign title"),
      false,
    );
    assert.equal(
      (yield* store.tasks()).some((task) => task.title === "Foreign reference"),
      false,
    );
    const unlinked = yield* commands.create(request, {
      title: "Unlinked not adopted",
    });
    assert.equal(unlinked.outcome, "committed");
    if (unlinked.outcome === "committed") {
      const failedAdoption = yield* importTasks(store, request, {
        items: [
          {
            external_id: "dependent-adoption",
            title: "Must not link failed adoption",
            depends_on: ["adopted-later"],
          },
          {
            external_id: "adopted-later",
            task_id: unlinked.task.id,
            from_version: 999,
          },
        ],
      });
      assert.deepEqual(
        failedAdoption.items.map((row) => row.outcome),
        ["rejected", "rejected"],
      );
      assert.equal(
        (yield* store.tasks()).some(
          (task) => task.external_id === "dependent-adoption",
        ),
        false,
      );
    }
    const cycle = yield* importTasks(store, request, {
      items: [
        { external_id: "cycle-a", title: "Cycle A", depends_on: ["cycle-b"] },
        { external_id: "cycle-b", title: "Cycle B", depends_on: ["cycle-a"] },
        { external_id: "independent", title: "Independent" },
      ],
    });
    assert.deepEqual(
      cycle.items.map((row) => [
        row.external_id,
        row.outcome,
        row.error?.code ?? null,
      ]),
      [
        ["cycle-a", "rejected", "dependency_cycle"],
        ["cycle-b", "rejected", "dependency_cycle"],
        ["independent", "created", null],
      ],
    );
    assert.equal(
      (yield* store.tasks()).some(
        (task) =>
          task.external_id === "cycle-a" || task.external_id === "cycle-b",
      ),
      false,
    );
    const stale = yield* importTasks(store, request, {
      items: [
        {
          external_id: "goal",
          from_version: 99,
          title: "Stale graph update",
          depends_on: [],
        },
      ],
    });
    assert.equal(stale.items[0]?.error?.code, "occ_conflict");
    assert.equal((yield* store.dependencies()).length, 4);
    const changed = yield* importTasks(store, request, {
      items: [{ external_id: "goal", depends_on: ["source"] }],
    });
    assert.equal(changed.items[0]?.outcome, "updated");
    assert.ok(changed.items[0]?.changed_fields.includes("depends_on"));
    assert.equal(
      (yield* store.dependencies()).filter(
        (edge) => edge.dependent_id === id("goal"),
      ).length,
      1,
    );
    const changedTask = (yield* store.tasks()).find(
      (task) => task.id === id("goal"),
    );
    assert.ok(changedTask);
    assert.equal(changedTask.row_version, 4);
    const same = yield* importTasks(store, request, {
      items: [{ external_id: "goal", depends_on: ["source"] }],
    });
    assert.equal(same.items[0]?.outcome, "unchanged");
    const skipped = yield* importTasks(store, request, {
      items: [
        { external_id: "bad", title: "Bad", depends_on: ["missing-ref"] },
      ],
      close_missing: true,
    });
    assert.equal(skipped.totals.rejected, 1);
    assert.equal(
      (yield* store.tasks()).find((task) => task.external_id === "independent")
        ?.status,
      "open",
    );
    const closed = yield* importTasks(store, request, {
      items: [{ external_id: "goal" }],
      close_missing: true,
    });
    assert.equal(closed.totals.rejected, 0);
    assert.equal(
      (yield* store.tasks()).find((task) => task.external_id === "independent")
        ?.status,
      "cancelled",
    );
    const tasks = yield* store.tasks();
    const edges = yield* store.dependencies();
    yield* store.takeSnapshot();
    yield* store.rebuild();
    assert.deepEqual(yield* store.tasks(), tasks);
    assert.deepEqual(yield* store.dependencies(), edges);
    yield* store.rebuild({ useSnapshot: true });
    assert.deepEqual(yield* store.tasks(), tasks);
    assert.deepEqual(yield* store.dependencies(), edges);
  }).pipe(Effect.provideService(Clock.Clock, Clock.Clock.defaultValue()));
