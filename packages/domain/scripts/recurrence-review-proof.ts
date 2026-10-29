import { Database } from "bun:sqlite";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Series } from "@todo/domain";
import { openStore } from "@todo/domain/store";
import { Effect, Schema } from "effect";
import { finish, monthly, start, weekly } from "../test/recurrence-fixtures.ts";
import {
  actor,
  later,
  profile,
  task,
  time,
  work,
} from "../test/store-fixtures.ts";

export const proveReviewFixes = (scratch: string, evidence: string) =>
  Effect.gen(function* () {
    const actions: unknown[] = [];
    const legacyPath = join(scratch, "existing-v2.db");
    const fixture = new Database(legacyPath);
    try {
      fixture.exec(
        readFileSync(
          join(
            process.cwd(),
            "packages/domain/test/fixtures/v2-recurrence.sql",
          ),
          "utf8",
        ),
      );
      assert.deepEqual(fixture.query("PRAGMA user_version").get(), {
        user_version: 2,
      });
    } finally {
      fixture.close();
    }
    const legacy = yield* openStore({ path: legacyPath, create: false });
    try {
      assert.equal(
        (yield* legacy.tasks()).find((t) => t.id === "legacy-1")?.occurrence,
        null,
      );
      const result = yield* legacy.finishTask(
        finish("legacy-1", "legacy-next", "complete", 7),
      );
      assert.equal(result.outcome, "committed");
      assert.deepEqual(
        (yield* legacy.tasks()).map((t) => [
          t.id,
          t.status,
          t.occurrence?.date ?? null,
        ]),
        [
          ["legacy-1", "done", null],
          ["legacy-2", "done", null],
          ["legacy-next", "open", "2026-10-28"],
        ],
      );
      assert.deepEqual(
        (yield* legacy.tasks()).find((t) => t.id === "legacy-next")
          ?.scheduled_at,
        { kind: "instant", utc: "2026-10-28T14:00:00Z", time_zone: "UTC" },
      );
      const tasks = yield* legacy.tasks();
      assert.deepEqual(yield* legacy.rebuild(), tasks);
      actions.push({
        finding: 1,
        action: "finish-existing-v2",
        schema_before: 2,
        schema_after: (yield* legacy.settings()).user_version,
        result,
        tasks,
        replay: "equal",
      });
    } finally {
      yield* legacy.close();
    }

    const store = yield* openStore({ path: join(scratch, "review-fixes.db") });
    try {
      yield* store.putProfile(work);
      const project = {
        id: "project",
        profile_id: profile,
        name: "Port",
        created_at: time,
        updated_at: time,
      };
      const tag = { id: "tag", profile_id: profile, name: "focus" };
      assert.equal(
        (yield* store.append({
          actor,
          profile,
          event: {
            kind: "TaskCreated",
            entity_version: 1,
            occurred_at: time,
            task: { ...task, project_id: "project", tags: ["tag"] },
            series: null,
            project,
            tags: [tag],
          },
        })).outcome,
        "committed",
      );
      const metadata = Schema.decodeUnknownSync(Series)({
        ...weekly,
        id: "metadata",
        task: { ...weekly.task, project_id: "project", tags: ["tag"] },
      });
      const started = yield* store.startSeries(
        start(metadata, "metadata-first"),
      );
      assert.equal(started.outcome, "committed");
      assert.deepEqual(
        (yield* store.tasks()).find((t) => t.id === "metadata-first")?.tags,
        ["tag"],
      );
      assert.equal(
        (yield* store.tasks()).find((t) => t.id === "metadata-first")
          ?.project_id,
        "project",
      );
      actions.push({
        finding: 2,
        action: "start-with-project-and-tag",
        result: started,
      });

      yield* store.startSeries(start(weekly, "w1"));
      const completed = yield* store.finishTask(finish("w1", "w2"));
      const reverted = yield* store.revert({
        actor,
        profile,
        seq: completed.seq,
        occurred_at: later,
      });
      assert.equal(reverted.outcome, "committed");
      const recompleted = yield* store.finishTask(
        finish("w1", "w3", "complete", 3),
      );
      assert.equal(recompleted.outcome, "committed");
      assert.deepEqual(
        (yield* store.tasks())
          .filter(
            (t) =>
              t.occurrence?.series_id === weekly.id &&
              t.status === "open" &&
              t.deleted_at === null,
          )
          .map((t) => [t.id, t.occurrence?.date]),
        [["w3", "2026-03-09"]],
      );
      assert.equal(
        (yield* store.tasks()).find((t) => t.id === "w2")?.deleted_at,
        later,
      );
      actions.push({
        finding: 3,
        action: "finish-after-revert",
        completed,
        reverted,
        recompleted,
      });

      const midnight = Schema.decodeUnknownSync(Series)({
        ...weekly,
        id: "midnight",
        recurrence: {
          dtstart: {
            kind: "instant",
            utc: "2026-03-07T04:00:00Z",
            time_zone: "America/New_York",
          },
          rrule: "FREQ=HOURLY;INTERVAL=2;COUNT=3",
          exdate: [],
        },
        task: { ...weekly.task, due_at: { kind: "date", date: "2026-03-06" } },
      });
      yield* store.startSeries(start(midnight, "midnight-first"));
      const crossed = yield* store.finishTask(
        finish("midnight-first", "midnight-second"),
      );
      assert.equal(crossed.outcome, "committed");
      const second = (yield* store.tasks()).find(
        (t) => t.id === "midnight-second",
      );
      assert.deepEqual(second?.occurrence?.time, {
        kind: "instant",
        utc: "2026-03-07T06:00:00Z",
        time_zone: "America/New_York",
      });
      assert.deepEqual(second?.due_at, { kind: "date", date: "2026-03-07" });
      actions.push({
        finding: 4,
        action: "cross-midnight",
        result: crossed,
        task: second,
      });

      const invalid = {
        ...start(weekly, "invalid"),
        series: { ...weekly, task: { ...weekly.task, title: "" } },
      };
      const invalidStart = yield* store.startSeries(invalid);
      const invalidFinish = yield* store.finishTask({
        ...finish("w1", "unused"),
        next_task_id: "",
      });
      assert.deepEqual(
        [
          invalidStart.outcome,
          invalidStart.reason,
          invalidFinish.outcome,
          invalidFinish.reason,
        ],
        ["rejected", "validation", "rejected", "validation"],
      );
      assert.equal(
        (yield* store.tasks()).some((t) => t.id === "invalid"),
        false,
      );
      if (invalidStart.event.kind !== "TaskAttemptRejected")
        throw new Error("Expected invalid-title rejection");
      assert.deepEqual(invalidStart.event.violations[0]?.received, {
        ...invalid,
        kind: "TaskCreated",
      });
      actions.push({
        finding: 5,
        action: "reject-invalid-command-schema",
        invalidStart,
        invalidFinish,
      });

      for (const rrule of [
        "FREQ=DAILY;COUNT=2;COUNT=3",
        "FREQ=DAILY;UNTIL=20261028;UNTIL=20261030",
      ]) {
        const series = Schema.decodeUnknownSync(Series)({
          ...monthly,
          id: `duplicate:${rrule}`,
          recurrence: { ...monthly.recurrence, rrule },
        });
        const result = yield* store.startSeries(
          start(series, "duplicate-first"),
        );
        assert.deepEqual(
          [result.outcome, result.reason],
          ["rejected", "validation"],
        );
        actions.push({
          finding: 6,
          action: "reject-duplicate-rule-part",
          rrule,
          result,
        });
      }

      const unordered = Schema.decodeUnknownSync(Series)({
        ...monthly,
        id: "unordered",
        recurrence: { ...monthly.recurrence, rrule: "COUNT=2;FREQ=DAILY" },
      });
      const first = yield* store.startSeries(
        start(unordered, "unordered-first"),
      );
      const next = yield* store.finishTask(
        finish("unordered-first", "unordered-second"),
      );
      const exhausted = yield* store.finishTask(
        finish("unordered-second", "unordered-third"),
      );
      assert.deepEqual(
        [first.outcome, next.outcome, exhausted.outcome],
        ["committed", "committed", "committed"],
      );
      assert.deepEqual(
        (yield* store.tasks())
          .filter((t) => t.occurrence?.series_id === "unordered")
          .map((t) => [t.id, t.occurrence?.date]),
        [
          ["unordered-first", "2026-01-30"],
          ["unordered-second", "2026-01-31"],
        ],
      );
      actions.push({
        finding: 7,
        action: "accept-unordered-rule",
        first,
        next,
        exhausted,
      });

      const tasks = yield* store.tasks();
      const history = yield* store.history();
      yield* store.takeSnapshot();
      assert.deepEqual(yield* store.rebuild(), tasks);
      assert.deepEqual(yield* store.rebuild({ useSnapshot: true }), tasks);
      writeFileSync(
        join(evidence, "04-review-fixes.json"),
        `${JSON.stringify({ outcome: "PASS", actions, tasks, history, full_replay: "equal", snapshot_replay: "equal" }, null, 2)}\n`,
      );
    } finally {
      yield* store.close();
    }
  });
