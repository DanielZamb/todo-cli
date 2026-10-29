import { Database } from "bun:sqlite";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { basename, isAbsolute, join, relative } from "node:path";
import { openStore } from "@todo/domain/store";
import { Effect, Schema } from "effect";
import { RRuleTemporal } from "rrule-temporal";
import { nextOccurrenceTime, TaskTime } from "../src/index.ts";
import {
  finish,
  monthly,
  recurrence,
  start,
  weekly,
} from "../test/recurrence-fixtures.ts";
import { work } from "../test/store-fixtures.ts";

import { proveReviewFixes } from "./recurrence-review-proof.ts";

const [scratch, evidence] = process.argv.slice(2);
if (
  !scratch ||
  !evidence ||
  !isAbsolute(scratch) ||
  !isAbsolute(evidence) ||
  !basename(scratch).startsWith("todo-c03-verify-") ||
  !relative(scratch, evidence).startsWith("..")
)
  throw new Error(
    "Use a fresh todo-c03-verify-* scratch directory and external absolute evidence directory",
  );
const path = join(scratch, "scratch.db");
const save = (name: string, value: unknown) =>
  writeFileSync(join(evidence, name), `${JSON.stringify(value, null, 2)}\n`);
const actions: unknown[] = [];

await Effect.runPromise(
  Effect.gen(function* () {
    const store = yield* openStore({ path });
    try {
      yield* store.putProfile(work);
      const first = yield* store.startSeries(start(weekly, "w1"));
      assert.equal(first.outcome, "committed");
      actions.push({
        action: "startSeries",
        input: start(weekly, "w1"),
        result: first,
      });
      const completed = yield* store.finishTask(finish("w1", "w2"));
      actions.push({
        action: "complete",
        input: finish("w1", "w2"),
        result: completed,
      });
      assert.equal(completed.outcome, "committed");
      assert.deepEqual(
        (yield* store.tasks()).map((t) => [t.id, t.status, t.scheduled_at]),
        [
          [
            "w1",
            "done",
            {
              kind: "instant",
              utc: "2026-03-06T14:00:00Z",
              time_zone: "America/New_York",
            },
          ],
          [
            "w2",
            "open",
            {
              kind: "instant",
              utc: "2026-03-09T13:00:00Z",
              time_zone: "America/New_York",
            },
          ],
        ],
      );
      save("01-dst.json", {
        tasks: yield* store.tasks(),
        history: yield* store.history(),
      });
      const stale = yield* store.finishTask(finish("w1", "duplicate"));
      assert.deepEqual([stale.outcome, stale.reason], ["rejected", "conflict"]);
      actions.push({ action: "stale-complete", result: stale });
      const db = new Database(path);
      db.exec(
        "CREATE TRIGGER fail_next BEFORE INSERT ON tasks WHEN NEW.id='w3' BEGIN SELECT RAISE(ABORT, 'injected failure'); END",
      );
      const failed = yield* Effect.exit(
        store.finishTask(finish("w2", "w3", "cancel")),
      );
      assert.equal(failed._tag, "Failure");
      assert.equal((yield* store.history()).length, 3);
      assert.deepEqual(
        (yield* store.tasks()).map((t) => [t.id, t.status]),
        [
          ["w1", "done"],
          ["w2", "open"],
        ],
      );
      db.exec("DROP TRIGGER fail_next");
      db.close();
      actions.push({
        action: "failed-successor-insert",
        outcome: failed._tag,
        history_length: 3,
      });
      const cancelled = yield* store.finishTask(finish("w2", "w3", "cancel"));
      assert.equal(cancelled.outcome, "committed");
      assert.deepEqual(
        (yield* store.tasks()).find((t) => t.id === "w3")?.scheduled_at,
        {
          kind: "instant",
          utc: "2026-03-11T13:00:00Z",
          time_zone: "America/New_York",
        },
      );
      actions.push({ action: "cancel", result: cancelled });
      const exhausted = yield* store.finishTask(finish("w3", "w4"));
      assert.equal(exhausted.outcome, "committed");
      assert.equal((yield* store.tasks()).length, 3);
      actions.push({ action: "count-exhaustion", result: exhausted });
      yield* store.startSeries(start(monthly, "m1"));
      yield* store.finishTask(finish("m1", "m2"));
      yield* store.finishTask(finish("m2", "m3", "cancel"));
      assert.deepEqual(
        (yield* store.tasks())
          .filter((t) => t.id.startsWith("m"))
          .map((t) => t.scheduled_at),
        [
          { kind: "date", date: "2026-01-30" },
          { kind: "date", date: "2026-02-27" },
          { kind: "date", date: "2026-03-31" },
        ],
      );
      save("02-bysetpos.json", {
        tasks: yield* store.tasks(),
        history: yield* store.history(),
      });
      assert.deepEqual(
        yield* nextOccurrenceTime(
          recurrence({
            ...weekly.recurrence,
            rrule: "FREQ=DAILY;UNTIL=20260309T130000Z",
            exdate: [],
          }),
          Schema.decodeUnknownSync(TaskTime)({
            kind: "instant",
            utc: "2026-03-08T13:00:00Z",
            time_zone: "America/New_York",
          }),
        ),
        {
          kind: "instant",
          utc: "2026-03-09T13:00:00Z",
          time_zone: "America/New_York",
        },
      );
      const before = yield* store.tasks();
      yield* store.takeSnapshot();
      const original = RRuleTemporal.prototype.next;
      RRuleTemporal.prototype.next = () => {
        throw new Error("Replay must not expand recurrence");
      };
      try {
        assert.deepEqual(yield* store.rebuild(), before);
        assert.deepEqual(yield* store.rebuild({ useSnapshot: true }), before);
      } finally {
        RRuleTemporal.prototype.next = original;
      }
      save("03-replay.json", {
        expansion_disabled: true,
        full_replay: "equal",
        snapshot_replay: "equal",
        tasks: yield* store.tasks(),
        history: yield* store.history(),
      });
      save("actions.json", actions);
      save("result.json", {
        outcome: "PASS",
        tasks: yield* store.tasks(),
        history_count: (yield* store.history()).length,
      });
    } finally {
      yield* store.close();
    }
  }),
);

await Effect.runPromise(proveReviewFixes(scratch, evidence));
