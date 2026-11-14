import assert from "node:assert/strict";
import { Clock, Effect, Schema } from "effect";
import {
  copyTask,
  moveTask,
  revertTask,
  TaskCommands,
} from "../src/commands.ts";
import { batchDepend, DependencyCommands } from "../src/dependency-commands.ts";
import { dependencyAdvice } from "../src/dependency-rules.ts";
import { ActorId, ProfileId, TaskId, Version } from "../src/ids.ts";
import type { OperationStore } from "../src/store/store.ts";
import { append, at, create, edge, profile, task } from "./dag-proof.ts";

export const proveDependencyCommands = (store: OperationStore) =>
  Effect.gen(function* () {
    yield* store.putProfile({
      id: profile,
      name: "DAG",
      created_at: at,
      updated_at: at,
    });
    const other = Schema.decodeUnknownSync(ProfileId)("other");
    yield* store.putProfile({
      id: other,
      name: "Other",
      created_at: at,
      updated_at: at,
    });
    yield* store.auth.setupOwner("Dependency command proof");
    const session = yield* store.auth.signIn("Dependency command proof");
    const request = { ...session, profile };
    const commands = new TaskCommands(store);
    const dependencies = new DependencyCommands(store);
    for (const name of [
      "A",
      "B",
      "C",
      "D",
      ...Array.from({ length: 14 }, (_, i) => `blocker-${i}`),
    ])
      yield* append(store, create(task(name)));
    yield* store.append({
      actor: Schema.decodeUnknownSync(ActorId)("proof"),
      profile: other,
      event: create(task("foreign", { profile_id: other })),
    });
    const id = (value: string) => Schema.decodeUnknownSync(TaskId)(value);
    const version = (value: number) => Schema.decodeUnknownSync(Version)(value);
    const target = (name: string) => ({ ...request, task_id: id(name) });
    const change = (
      dependent: string,
      blocker: string,
      from: number,
      action: "depend" | "undepend" = "depend",
    ) =>
      dependencies.change(
        target(dependent),
        { blocker_id: id(blocker), from_version: version(from) },
        action,
      );
    const linked = yield* change("B", "A", 1);
    assert.equal(linked.outcome, "success");
    const historyBeforeNoop = yield* store.history();
    const noop = yield* change("B", "A", 1);
    assert.equal(noop.outcome, "success");
    if (noop.outcome === "success")
      assert.deepEqual(
        [
          noop.report.outcome,
          noop.report.from_version,
          noop.report.to_version,
          noop.report.seq,
        ],
        ["unchanged", 2, 2, null],
      );
    const absent = yield* change("A", "D", 999, "undepend");
    assert.equal(absent.outcome, "success");
    assert.deepEqual(yield* store.history(), historyBeforeNoop);
    const stale = yield* change("B", "C", 1);
    assert.equal(stale.outcome, "rejected");
    if (stale.outcome === "rejected") assert.equal(stale.reason, "conflict");
    for (const blocker of ["foreign", "missing"]) {
      const failure = yield* change("B", blocker, 2, "undepend");
      assert.equal(failure.outcome, "rejected");
      if (failure.outcome === "rejected")
        assert.equal(
          failure.dependency_error?.code,
          "dependency_profile_mismatch",
        );
    }
    yield* change("C", "B", 1);
    const cycle = yield* change("A", "C", 1);
    assert.equal(cycle.outcome, "rejected");
    if (cycle.outcome === "rejected")
      assert.deepEqual(cycle.dependency_error?.details, {
        dependent_id: "A",
        blocker_id: "C",
        path: ["A", "B", "C", "A"],
      });
    const self = yield* change("A", "A", 1);
    assert.equal(self.outcome, "rejected");
    if (self.outcome === "rejected")
      assert.equal(self.dependency_error?.code, "dependency_cycle");
    const redundant = yield* change("C", "A", 2);
    assert.equal(redundant.outcome, "success");
    if (redundant.outcome === "success")
      assert.deepEqual(
        redundant.report.warnings.map((w) =>
          w.code === "redundant_dependency" ? w.path : w.count,
        ),
        [["A", "B", "C"]],
      );
    assert.deepEqual(yield* store.dependencies(), [
      edge("B", "A"),
      edge("C", "A"),
      edge("C", "B"),
    ]);
    const blocked = yield* commands.transition(target("C"), {
      from_version: version(3),
      action: "complete",
    });
    assert.equal(blocked.outcome, "rejected");
    if (blocked.outcome === "rejected") {
      assert.equal(blocked.dependency_error?.code, "blocked");
      assert.match(blocked.message ?? "", /Finish or cancel/);
    }
    const originalSeq = linked.outcome === "success" ? linked.report.seq : null;
    assert.ok(originalSeq);
    const reverted = yield* revertTask(store, target("B"), {
      from_version: version(2),
      seq: originalSeq,
    });
    assert.equal(reverted.outcome, "committed");
    assert.deepEqual(yield* store.dependencies(), [
      edge("C", "A"),
      edge("C", "B"),
    ]);
    const completed = yield* commands.transition(target("A"), {
      from_version: version(1),
      action: "complete",
    });
    assert.equal(completed.outcome, "committed");
    yield* commands.transition(target("B"), {
      from_version: version(3),
      action: "cancel",
    });
    yield* commands.transition(target("C"), {
      from_version: version(3),
      action: "complete",
    });
    const reopen = yield* commands.transition(target("A"), {
      from_version: version(2),
      action: "reopen",
    });
    assert.equal(reopen.outcome, "rejected");
    if (reopen.outcome === "rejected") {
      assert.equal(reopen.dependency_error?.code, "blocks_done_task");
      assert.match(reopen.message ?? "", /todo add "<title>" --depends-on C/);
    }
    const completionSeq = (yield* store.history()).find(
      (entry) =>
        entry.event.kind === "TaskCompleted" && entry.event.before.id === "A",
    )?.seq;
    assert.ok(completionSeq);
    const undoDone = yield* revertTask(store, target("A"), {
      from_version: version(2),
      seq: completionSeq,
    });
    assert.equal(undoDone.outcome, "rejected");
    if (undoDone.outcome === "rejected")
      assert.equal(undoDone.dependency_error?.code, "blocks_done_task");
    const initial = yield* commands.create(request, {
      title: "Initially linked",
      depends_on: [id("A")],
    });
    assert.equal(initial.outcome, "committed");
    if (initial.outcome === "committed") {
      assert.equal(initial.task.row_version, 1);
      assert.ok(
        (yield* store.dependencies()).some(
          (edge) =>
            edge.dependent_id === initial.task.id && edge.blocker_id === "A",
        ),
      );
    }
    const taskCount = (yield* store.tasks()).length;
    const badInitial = yield* commands.create(request, {
      title: "Must not survive",
      depends_on: [id("missing")],
    });
    assert.equal(badInitial.outcome, "rejected");
    if (badInitial.outcome === "rejected")
      assert.equal(
        badInitial.dependency_error?.code,
        "dependency_profile_mismatch",
      );
    assert.equal((yield* store.tasks()).length, taskCount);
    for (let i = 0; i < 14; i++) {
      const count = i + 1;
      const result = yield* change("D", `blocker-${i}`, count);
      if (count === 14) {
        assert.equal(result.outcome, "rejected");
        if (result.outcome === "rejected")
          assert.equal(result.dependency_error?.message, dependencyAdvice(14));
      } else {
        assert.equal(result.outcome, "success");
        if (result.outcome === "success")
          assert.deepEqual(
            result.report.warnings,
            count > 8
              ? [
                  {
                    code: "many_dependencies",
                    dependent_id: id("D"),
                    count,
                    message: dependencyAdvice(count),
                  },
                ]
              : [],
          );
      }
    }
    const beforePreview = {
      tasks: yield* store.tasks(),
      edges: yield* store.dependencies(),
      history: yield* store.history(),
      snapshots: yield* store.snapshots.list(),
    };
    const preview = yield* commands.delete(target("A"), {
      from_version: version(2),
      dry_run: true,
    });
    assert.equal(preview.outcome, "committed");
    assert.deepEqual(
      {
        tasks: yield* store.tasks(),
        edges: yield* store.dependencies(),
        history: yield* store.history(),
        snapshots: yield* store.snapshots.list(),
      },
      beforePreview,
    );
    const refusal = yield* commands.delete(target("A"), {
      from_version: version(2),
    });
    assert.equal(refusal.outcome, "rejected");
    if (refusal.outcome === "rejected")
      assert.equal(refusal.dependency_error?.code, "has_dependencies");
    yield* change("blocker-0", "A", 1);
    const changed = yield* commands.delete(target("A"), {
      from_version: version(2),
      with_dependencies: true,
      ...(preview.outcome === "committed" && preview.dependency_fingerprint
        ? { dependency_fingerprint: preview.dependency_fingerprint }
        : {}),
    });
    assert.equal(changed.outcome, "rejected");
    if (changed.outcome === "rejected")
      assert.equal(changed.dependency_error?.code, "has_dependencies");
    const batchBefore = {
      tasks: yield* store.tasks(),
      edges: yield* store.dependencies(),
      history: yield* store.history(),
      snapshots: yield* store.snapshots.list(),
    };
    const batch = yield* batchDepend(store, request, {
      dry_run: true,
      items: [
        {
          action: "undepend",
          dependent_id: id("C"),
          blocker_id: id("A"),
          from_version: version(4),
        },
        {
          action: "undepend",
          dependent_id: id("C"),
          blocker_id: id("B"),
          from_version: version(5),
        },
      ],
    });
    assert.deepEqual(
      batch.results.map((row) =>
        "result" in row ? row.result.to_version : row.error.code,
      ),
      [5, 6],
    );
    assert.deepEqual(
      {
        tasks: yield* store.tasks(),
        edges: yield* store.dependencies(),
        history: yield* store.history(),
        snapshots: yield* store.snapshots.list(),
      },
      batchBefore,
    );
    const copied = yield* copyTask(store, target("D"), {
      from_version: version(14),
      destination_profile: other,
    });
    assert.equal(copied.outcome, "committed");
    if (copied.outcome === "committed")
      assert.equal(
        (yield* store.dependencies()).some(
          (e) =>
            e.dependent_id === copied.task.id ||
            e.blocker_id === copied.task.id,
        ),
        false,
      );
    const moved = yield* moveTask(store, target("D"), {
      from_version: version(14),
      destination_profile: other,
    });
    assert.equal(moved.outcome, "committed");
    if (moved.outcome === "committed")
      assert.equal(moved.removed_dependencies?.length, 13);
    assert.equal(
      (yield* store.dependencies()).some((e) => e.dependent_id === "D"),
      false,
    );
  }).pipe(Effect.provideService(Clock.Clock, Clock.Clock.defaultValue()));
