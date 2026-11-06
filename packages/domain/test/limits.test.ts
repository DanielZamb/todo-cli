import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "@effect/vitest";
import { Effect, Schema } from "effect";
import { TestClock } from "effect/testing";
import { AttachManyRequest, AttachmentInput } from "../src/attachments.ts";
import { BatchEditRequest } from "../src/batch-edit.ts";
import { Task } from "../src/entities.ts";
import { ImportRequest } from "../src/import.ts";
import { QuickAddInput } from "../src/quick-add.ts";
import { openStore, TaskCommands } from "../src/store/store.ts";
import { CreateSeries, CreateTask, TaskPatch } from "../src/task-commands.ts";
import { profile, work } from "./store-fixtures.ts";

const text = (length: number) => "a".repeat(length);
const list = <A>(length: number, item: A) => Array.from({ length }, () => item);
const valid = <S extends Schema.Top>(schema: S) => Schema.is(schema);

describe("input limits", () => {
  it("accepts values at each limit and refuses one past it", () => {
    expect(valid(CreateTask)({ title: text(1_000) })).toBe(true);
    expect(valid(CreateTask)({ title: text(1_001) })).toBe(false);
    expect(valid(TaskPatch)({ description: text(100_000) })).toBe(true);
    expect(valid(TaskPatch)({ description: text(100_001) })).toBe(false);
    expect(valid(TaskPatch)({ project_name: text(200) })).toBe(true);
    expect(valid(TaskPatch)({ project_name: text(201) })).toBe(false);
    expect(valid(TaskPatch)({ tag_names: [text(201)] })).toBe(false);
    expect(valid(TaskPatch)({ tag_names: list(100, "tag") })).toBe(true);
    expect(valid(TaskPatch)({ tag_names: list(101, "tag") })).toBe(false);
    expect(valid(TaskPatch)({ external_id: text(1_001) })).toBe(false);
    expect(
      valid(AttachmentInput)({ kind: "file", path: `/${text(4_095)}` }),
    ).toBe(true);
    expect(
      valid(AttachmentInput)({ kind: "file", path: `/${text(4_096)}` }),
    ).toBe(false);
    expect(
      valid(AttachmentInput)({
        kind: "link",
        url: `https://example.com/${text(8_192)}`,
      }),
    ).toBe(false);
    expect(
      valid(AttachmentInput)({
        kind: "link",
        url: "https://example.com/",
        label: text(201),
      }),
    ).toBe(false);
    expect(
      valid(QuickAddInput)({
        text: text(2_001),
        now: "2026-11-05T12:00:00.000Z",
        time_zone: "UTC",
      }),
    ).toBe(false);
    const series = (rrule: string, exdates: number) => ({
      task: { title: "Daily" },
      recurrence: {
        dtstart: { kind: "date", date: "2026-11-05" },
        rrule,
        exdate: list(exdates, { kind: "date", date: "2026-11-06" }),
      },
    });
    expect(valid(CreateSeries)(series("FREQ=DAILY", 1_000))).toBe(true);
    expect(valid(CreateSeries)(series(`FREQ=DAILY;${text(1_000)}`, 0))).toBe(
      false,
    );
    expect(valid(CreateSeries)(series("FREQ=DAILY", 1_001))).toBe(false);
  });

  it("refuses more than 1,000 items in one batch edit, import or attach-many request", () => {
    const item = { task_id: "t", from_version: 1 };
    const batch = (count: number) => ({
      items: Array.from({ length: count }, (_, index) => ({
        ...item,
        task_id: `t${index}`,
      })),
      changes: { priority: "P1" },
    });
    expect(valid(BatchEditRequest)(batch(1_000))).toBe(true);
    expect(valid(BatchEditRequest)(batch(1_001))).toBe(false);
    expect(valid(ImportRequest)({ items: list(1_000, {}) })).toBe(true);
    expect(valid(ImportRequest)({ items: list(1_001, {}) })).toBe(false);
    expect(valid(AttachManyRequest)({ items: list(1_001, {}) })).toBe(false);
  });

  it("still reads stored Tasks written before the limits", () => {
    const stored = Schema.decodeUnknownSync(Task)({
      title: text(5_000),
      description: text(200_000),
      project_id: null,
      priority: "P3",
      scheduled_at: null,
      due_at: null,
      energy: null,
      estimate_min: null,
      source: "manual",
      tags: [],
      id: "old-task",
      profile_id: "work",
      entity_version: 1,
      row_version: 1,
      status: "open",
      occurrence: null,
      created_at: "2026-10-01T00:00:00.000Z",
      updated_at: "2026-10-01T00:00:00.000Z",
      completed_at: null,
      deleted_at: null,
    });
    expect(stored.title.length).toBe(5_000);
  });

  it.effect(
    "records a refused oversized write in History as its size alone, not in full",
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          yield* TestClock.setTime(Date.parse("2026-11-05T12:00:00Z"));
          const directory = yield* Effect.acquireRelease(
            Effect.sync(() => mkdtempSync(join(tmpdir(), "todo-limits-"))),
            (path) =>
              Effect.sync(() => rmSync(path, { recursive: true, force: true })),
          );
          const store = yield* Effect.acquireRelease(
            openStore({ path: join(directory, "scratch.db") }),
            (value) => Effect.orDie(value.close()),
          );
          yield* store.putProfile(work);
          yield* store.auth.setupOwner("scratch limits passphrase");
          const session = yield* store.auth.signIn("scratch limits passphrase");
          const request = { credential: session.credential, profile };
          const commands = new TaskCommands(store);
          const result = yield* commands.create(request, {
            title: "Bloat",
            description: text(20_000_000),
          });
          expect(result.outcome).toBe("rejected");
          expect(yield* commands.list(request)).toEqual([]);
          const rejected = (yield* store.history()).filter(
            (entry) => entry.event.kind === "TaskAttemptRejected",
          );
          expect(rejected).toHaveLength(1);
          const event = rejected[0]?.event;
          const received =
            event?.kind === "TaskAttemptRejected"
              ? event.violations[0]?.received
              : undefined;
          expect(received).toMatchObject({ truncated: true });
          expect(JSON.stringify(received).length).toBeLessThan(2_200);
          expect(JSON.stringify(rejected).length).toBeLessThan(4_000);
        }),
      ),
  );
});
