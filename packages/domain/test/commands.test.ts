import { Database } from "bun:sqlite";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "@effect/vitest";
import {
  CreateTask,
  ProfileId,
  Project,
  Recurrence,
  Tag,
  TaskId,
  TaskPatch,
  TimeZoneId,
  Version,
} from "@todo/domain";
import {
  copyTask,
  createTask,
  editSeries,
  filterTasks,
  moveTask,
  mutateTask,
  readTasks,
  revertTask,
  skipOccurrence,
} from "@todo/domain/commands";
import { renderReview, taskView } from "@todo/domain/presentation";
import {
  type OperationStore,
  openStore,
  TaskCommands,
} from "@todo/domain/store";
import { Effect, Schema } from "effect";
import { TestClock } from "effect/testing";
import { profile, time, work } from "./store-fixtures.ts";

const usingStore = <A, E>(
  run: (store: OperationStore, path: string) => Effect.Effect<A, E>,
  seed?: (path: string) => void,
) =>
  Effect.scoped(
    Effect.gen(function* () {
      yield* TestClock.setTime(Date.parse(time));
      const directory = yield* Effect.acquireRelease(
        Effect.sync(() => mkdtempSync(join(tmpdir(), "todo-x01-test-"))),
        (directory) =>
          Effect.sync(() =>
            rmSync(directory, { recursive: true, force: true }),
          ),
      );
      if (seed) yield* Effect.sync(() => seed(join(directory, "scratch.db")));
      const store = yield* Effect.acquireRelease(
        openStore({ path: join(directory, "scratch.db") }),
        (store) => Effect.orDie(store.close()),
      );
      yield* store.putProfile(work);
      yield* store.auth.setupOwner("scratch commands passphrase");
      return yield* run(store, join(directory, "scratch.db"));
    }),
  );

it.effect(
  "Revert of a redacted completion returns task_purged for its surviving Occurrence",
  () =>
    usingStore((store) =>
      Effect.gen(function* () {
        const session = yield* store.auth.signIn("scratch commands passphrase");
        const request = { credential: session.credential, profile };
        const created = yield* createTask(store, request, {
          title: "Shared completion",
          recurrence: JSON.stringify({
            dtstart: { kind: "date", date: "2026-10-27" },
            rrule: "FREQ=DAILY;COUNT=2",
            exdate: [],
          }),
        });
        yield* mutateTask(store, request, "done", created.task.id, 1);
        const completion = (yield* store.history()).find(
          (entry) => entry.event.kind === "TaskCompleted",
        );
        const successor = (yield* store.tasks()).find(
          (task) => task.id !== created.task.id,
        );
        if (!completion || !successor)
          throw new Error("Missing completion or successor");
        yield* mutateTask(store, request, "rm", created.task.id, 2);
        yield* mutateTask(store, request, "rm", created.task.id, 3, {}, true);
        expect(
          yield* revertTask(
            store,
            { ...request, task_id: successor.id },
            { from_version: successor.row_version, seq: completion.seq },
          ),
        ).toEqual({ outcome: "rejected", reason: "task_purged", latest: null });
        expect(
          (yield* store.tasks()).map((task) => [
            task.id === successor.id,
            task.row_version,
            task.title,
          ]),
        ).toEqual([[true, 1, "Shared completion"]]);
      }),
    ),
);

it.effect(
  "shares CLI preparation and typed commands, preserving metadata, instants, recurrence, conflicts and Purge",
  () =>
    usingStore((store) =>
      Effect.gen(function* () {
        const session = yield* store.auth.signIn("scratch commands passphrase");
        const request = { credential: session.credential, profile };
        const commands = new TaskCommands(store);
        const created = yield* createTask(store, request, {
          title: "  Write shared commands  ",
          project: "Port",
          tag: ["Proof, proof", "Core"],
          recurrence: JSON.stringify({
            dtstart: { kind: "date", date: "2026-10-27" },
            rrule: "FREQ=DAILY;COUNT=3",
            exdate: [],
          }),
        });
        const target = { ...request, task_id: created.task.id };
        const data = yield* readTasks(store, request);
        expect(
          data.views.map((task) => [task.title, task.project, task.tags]),
        ).toEqual([["Write shared commands", "Port", ["core", "proof"]]]);
        const edited = yield* commands.edit(target, {
          from_version: created.task.row_version,
          changes: {
            due_at: {
              kind: "instant",
              utc: time,
              time_zone: Schema.decodeUnknownSync(TimeZoneId)("America/Bogota"),
            },
          },
        });
        expect(edited.outcome).toBe("committed");
        const stale = yield* Effect.flip(
          mutateTask(store, request, "edit", created.task.id, 1, {
            title: "Stale title",
          }),
        );
        expect([stale._tag, "code" in stale ? stale.code : null]).toEqual([
          "CommandError",
          "occ_conflict",
        ]);
        const latest = yield* commands.get(target);
        expect([latest?.title, latest?.row_version, latest?.due_at]).toEqual([
          "Write shared commands",
          2,
          { kind: "instant", utc: time, time_zone: "America/Bogota" },
        ]);
        yield* mutateTask(store, request, "done", created.task.id, 2);
        const next = (yield* commands.list(request)).find(
          (task) => task.status === "open",
        );
        expect([next?.occurrence?.date, next?.title, next?.tags]).toEqual([
          "2026-10-28",
          "Write shared commands",
          created.task.tags,
        ]);
        if (!next) throw new Error("Missing successor");
        yield* mutateTask(store, request, "edit", next.id, 1, {
          recurrence: "",
        });
        const nextTarget = { ...request, task_id: next.id };
        expect((yield* commands.get(nextTarget))?.occurrence).toBe(null);
        yield* mutateTask(store, request, "rm", next.id, 2);
        yield* mutateTask(store, request, "rm", next.id, 3, {}, true);
        expect(yield* commands.get(nextTarget)).toBe(null);
        expect((yield* store.tasks()).some((task) => task.id === next.id)).toBe(
          false,
        );
        expect(
          (yield* store.history())
            .filter((entry) => entry.event.kind.startsWith("Task"))
            .map((entry) => [entry.outcome, entry.reason, entry.event.kind]),
        ).toEqual([
          ["committed", null, "TaskCreated"],
          ["committed", null, "TaskEdited"],
          ["rejected", "conflict", "TaskAttemptRejected"],
          ["committed", null, "TaskHistoryRedacted"],
          ["committed", null, "TaskHistoryRedacted"],
          ["committed", null, "TaskHistoryRedacted"],
          ["committed", null, "TaskHistoryRedacted"],
        ]);
      }),
    ),
  20000,
);

it.effect(
  "gives foreign and missing metadata and Task IDs identical rejections without foreign names in History",
  () =>
    usingStore((store) =>
      Effect.gen(function* () {
        const personal = Schema.decodeUnknownSync(ProfileId)("personal");
        yield* store.putProfile({ ...work, id: personal, name: "Personal" });
        const session = yield* store.auth.signIn("scratch commands passphrase");
        const commands = new TaskCommands(store);
        const ownerRequest = { credential: session.credential, profile };
        const project = Schema.decodeUnknownSync(Project)({
          id: "personal-project",
          profile_id: personal,
          name: "Sensitive personal Project",
          created_at: time,
          updated_at: time,
        });
        const tag = Schema.decodeUnknownSync(Tag)({
          id: "personal-tag",
          profile_id: personal,
          name: "Sensitive personal Tag",
        });
        const foreign = yield* commands.create(
          { ...ownerRequest, profile: personal },
          {
            title: "Private task",
            project_id: project.id,
            tags: [tag.id],
          },
          { definitions: { project, tags: [tag] } },
        );
        expect(foreign.outcome).toBe("committed");
        if (foreign.outcome !== "committed")
          throw new Error("Missing private task");
        const writer = yield* store.auth.issueToken({
          credential: session.credential,
          token: { name: "work writer", profile, scope: "read-write" },
        });
        const reader = yield* store.auth.issueToken({
          credential: session.credential,
          token: { name: "work reader", profile, scope: "read-only" },
        });
        const request = { credential: writer.credential, profile };
        const own = yield* createTask(store, request, {
          title: "Keep work unchanged",
        });
        const display = taskView(
          { ...own.task, project_id: project.id, tags: [tag.id] },
          yield* store.projects(),
          yield* store.tags(),
        );
        expect([display.project, display.tags]).toEqual([
          undefined,
          ["personal-tag"],
        ]);
        const missingProject = Schema.decodeUnknownSync(Project.fields.id)(
          "missing-project",
        );
        const missingTag = Schema.decodeUnknownSync(Tag.fields.id)(
          "missing-tag",
        );
        for (const input of [
          { project_id: missingProject, tags: [] },
          { project_id: project.id, tags: [] },
          { project_id: null, tags: [missingTag] },
          { project_id: null, tags: [tag.id] },
          { project_id: missingProject, tags: [missingTag] },
          { project_id: project.id, tags: [tag.id] },
        ]) {
          expect(
            yield* commands.create(request, {
              title: "Rejected task",
              ...input,
            }),
          ).toEqual({
            outcome: "rejected",
            reason: "validation",
            latest: null,
          });
          expect(
            yield* commands.edit(
              { ...request, task_id: own.task.id },
              { from_version: own.task.row_version, changes: input },
            ),
          ).toEqual({
            outcome: "rejected",
            reason: "validation",
            latest: own.task,
          });
        }
        const metadataView = yield* store.auth.read({
          credential: reader.credential,
          profile,
        });
        const rejections = metadataView.history.filter(
          (entry) => entry.event.kind === "TaskAttemptRejected",
        );
        expect(rejections).toHaveLength(12);
        for (const entry of rejections) {
          expect(entry.reason).toBe("validation");
          if (entry.event.kind === "TaskAttemptRejected")
            expect(entry.event.violations).toEqual([
              {
                field: "event",
                code: "validation",
                received: expect.objectContaining(
                  entry.event.attempted_kind === "TaskCreated"
                    ? { project: null, tags: [] }
                    : {
                        project_before: null,
                        project_after: null,
                        tags_before: [],
                        tags_after: [],
                      },
                ),
              },
            ]);
        }
        expect(
          metadataView.tasks.map((task) => [task.title, task.row_version]),
        ).toEqual([["Keep work unchanged", 1]]);
        for (const id of [
          foreign.task.id,
          Schema.decodeUnknownSync(TaskId)("missing-task"),
        ]) {
          const target = { ...request, task_id: id };
          const version = {
            from_version: Schema.decodeUnknownSync(Version)(1),
          };
          expect(yield* commands.get(target)).toBe(null);
          expect(
            yield* commands.edit(target, {
              ...version,
              changes: { title: "Attempt" },
            }),
          ).toEqual({ outcome: "not-found" });
          expect(yield* commands.delete(target, version)).toEqual({
            outcome: "not-found",
          });
          expect(yield* commands.purge(target, version)).toEqual({
            outcome: "not-found",
          });
          for (const action of ["complete", "cancel", "reopen"] as const) {
            expect(
              yield* commands.transition(target, { ...version, action }),
            ).toEqual({ outcome: "not-found" });
          }
        }
        const history = yield* store.auth.read({
          credential: reader.credential,
          profile,
        });
        const serialized = JSON.stringify(history.history);
        expect([
          serialized.includes("Sensitive personal Project"),
          serialized.includes("Sensitive personal Tag"),
          serialized.includes("Private task"),
        ]).toEqual([false, false, false]);
      }),
    ),
  20000,
);

const dailyRule = {
  dtstart: { kind: "date", date: "2030-01-01" },
  rrule: "FREQ=DAILY;COUNT=4",
  exdate: [],
};
const instantRule = {
  dtstart: {
    kind: "instant",
    utc: "2030-01-01T09:00:00Z",
    time_zone: "America/Bogota",
  },
  rrule: "FREQ=DAILY;COUNT=4",
  exdate: [],
};
const access = (store: OperationStore) =>
  store.auth
    .signIn("scratch commands passphrase")
    .pipe(
      Effect.map((session) => ({ credential: session.credential, profile })),
    );

it.effect(
  "C05-1 reapplying a rule on January 2 keeps the January 3 due date",
  () =>
    usingStore((store) =>
      Effect.gen(function* () {
        const request = yield* access(store);
        const first = yield* createTask(store, request, {
          title: "Daily",
          due: "2030-01-01",
          recurrence: JSON.stringify(dailyRule),
        });
        yield* mutateTask(store, request, "done", first.task.id, 1);
        const second = (yield* readTasks(store, request)).tasks.find(
          (task) => task.status === "open",
        );
        if (!second) throw new Error("Missing January 2");
        yield* mutateTask(store, request, "edit", second.id, 1, {
          recurrence: JSON.stringify(dailyRule),
        });
        yield* mutateTask(store, request, "done", second.id, 2);
        expect(
          (yield* readTasks(store, request)).tasks
            .filter((task) => task.status === "open")
            .map((task) => [task.occurrence?.date, task.due_at]),
        ).toEqual([["2030-01-03", { kind: "date", date: "2030-01-03" }]]);
        const state = yield* store.tasks();
        yield* store.rebuild();
        expect(yield* store.tasks()).toEqual(state);
      }),
    ),
);

for (const action of ["done", "cancel"] as const)
  it.effect(`C05-2 date-to-instant rule edits permit ${action}`, () =>
    usingStore((store) =>
      Effect.gen(function* () {
        const request = yield* access(store);
        const first = yield* createTask(store, request, {
          title: "Change kind",
          recurrence: JSON.stringify(dailyRule),
        });
        yield* mutateTask(store, request, "edit", first.task.id, 1, {
          recurrence: JSON.stringify(instantRule),
        });
        yield* mutateTask(store, request, action, first.task.id, 2);
        expect(
          (yield* readTasks(store, request)).tasks
            .filter((task) => task.status === "open")
            .map((task) => [task.occurrence?.date, task.occurrence?.time]),
        ).toEqual([
          [
            "2030-01-02",
            {
              kind: "instant",
              utc: "2030-01-02T09:00:00Z",
              time_zone: "America/Bogota",
            },
          ],
        ]);
      }),
    ),
  );

it.effect("C05-3 clearing a migrated legacy rule prevents a successor", () =>
  usingStore(
    (store) =>
      Effect.gen(function* () {
        const request = yield* access(store);
        yield* mutateTask(store, request, "edit", "legacy-1", 7, {
          recurrence: "",
        });
        yield* mutateTask(store, request, "done", "legacy-1", 8);
        expect(
          (yield* readTasks(store, request)).tasks.map((task) => [
            task.id,
            task.status,
            task.row_version,
          ]),
        ).toEqual([["legacy-1", "done", 9]]);
        expect(
          (yield* store.series()).map((series) => [
            series.id,
            series.row_version,
            series.deleted_at !== null,
          ]),
        ).toEqual([["legacy-series:legacy-1", 8, true]]);
      }),
    (path) => {
      const db = new Database(path);
      try {
        db.exec(
          readFileSync(
            new URL("fixtures/v2-recurrence.sql", import.meta.url),
            "utf8",
          ),
        );
      } finally {
        db.close();
      }
    },
  ),
);

it.effect(
  "C05-6 presents the rule and Series relationship for recurring Tasks",
  () =>
    usingStore((store) =>
      Effect.gen(function* () {
        const request = yield* access(store);
        const created = yield* createTask(store, request, {
          title: "Inspect rule",
          recurrence: JSON.stringify(dailyRule),
        });
        const view = Schema.decodeUnknownSync(
          Schema.Struct({
            recurrence: Recurrence,
            series_id: Schema.String,
            occurrence: Schema.Struct({
              series_id: Schema.String,
              date: Schema.String,
            }),
          }),
        )((yield* readTasks(store, request)).views[0]);
        expect(view.recurrence).toEqual(dailyRule);
        expect([
          view.series_id,
          view.occurrence.series_id,
          view.occurrence.date,
        ]).toEqual([
          created.task.occurrence?.series_id,
          created.task.occurrence?.series_id,
          "2030-01-01",
        ]);
      }),
    ),
);

it.effect("C05-7 records authenticated invalid edits in rejected History", () =>
  usingStore((store) =>
    Effect.gen(function* () {
      const request = yield* access(store);
      const created = yield* createTask(store, request, {
        title: "Validate energy",
      });
      const error = yield* Effect.flip(
        mutateTask(store, request, "edit", created.task.id, 1, { energy: "6" }),
      );
      expect([error._tag, "exit" in error ? error.exit : null]).toEqual([
        "CommandError",
        2,
      ]);
      const rejected = (yield* store.history()).filter(
        (entry) => entry.outcome === "rejected",
      );
      expect(
        rejected.map((entry) => [
          entry.reason,
          entry.from_version,
          entry.event.kind,
        ]),
      ).toEqual([["validation", 1, "TaskAttemptRejected"]]);
      expect(
        (yield* readTasks(store, request)).tasks.map((task) => [
          task.title,
          task.energy,
          task.row_version,
        ]),
      ).toEqual([["Validate energy", null, 1]]);
    }),
  ),
);

it.effect("X01 records invalid CLI creation in rejected History", () =>
  usingStore((store) =>
    Effect.gen(function* () {
      const request = yield* access(store);
      const error = yield* Effect.flip(
        createTask(store, request, { title: "Task", energy: "6" }),
      );
      expect([error._tag, "exit" in error ? error.exit : null]).toEqual([
        "CommandError",
        2,
      ]);
      expect(
        (yield* store.history())
          .filter((entry) => entry.outcome === "rejected")
          .map((entry) => [entry.reason, entry.from_version, entry.event]),
      ).toEqual([
        [
          "validation",
          null,
          {
            kind: "TaskAttemptRejected",
            entity_version: 1,
            occurred_at: "2026-10-27T14:00:00.000Z",
            attempted_kind: "TaskCreated",
            task_id: null,
            violations: [
              {
                field: "event",
                code: "validation",
                received: {
                  kind: "TaskCreated",
                  occurred_at: "2026-10-27T14:00:00.000Z",
                  input: { title: "Task", energy: "6" },
                },
              },
            ],
          },
        ],
      ]);
      expect(yield* store.tasks()).toEqual([]);
    }),
  ),
);

it.effect("X01 records a missing Task CLI edit in rejected History", () =>
  usingStore((store) =>
    Effect.gen(function* () {
      const request = yield* access(store);
      const error = yield* Effect.flip(
        mutateTask(store, request, "edit", "missing-task", 1, {
          title: "Attempt",
        }),
      );
      expect([
        error._tag,
        "exit" in error ? error.exit : null,
        "code" in error ? error.code : null,
      ]).toEqual(["CommandError", 3, "not_found"]);
      expect(
        (yield* store.history())
          .filter((entry) => entry.outcome === "rejected")
          .map((entry) => [entry.reason, entry.from_version, entry.event]),
      ).toEqual([
        [
          "profile_mismatch",
          1,
          {
            kind: "TaskAttemptRejected",
            entity_version: 1,
            occurred_at: "2026-10-27T14:00:00.000Z",
            attempted_kind: "TaskEdited",
            task_id: "missing-task",
            violations: [
              {
                field: "event",
                code: "profile_mismatch",
                received: {
                  kind: "TaskEdited",
                  occurred_at: "2026-10-27T14:00:00.000Z",
                  task_id: "missing-task",
                },
              },
            ],
          },
        ],
      ]);
      expect(yield* store.tasks()).toEqual([]);
    }),
  ),
);

for (const input of [
  { title: " " },
  { title: "\t\n" },
  { title: "Task", source: "other" },
  { title: "Task", source: "" },
])
  it(`X01 canonical Task inputs reject ${JSON.stringify(input)}`, () => {
    expect(Schema.is(CreateTask)(input)).toBe(false);
    expect(Schema.is(TaskPatch)(input)).toBe(false);
  });

it("X01 canonical Task inputs allow each supported source", () => {
  for (const source of ["manual", "agent", "import"]) {
    expect(Schema.is(CreateTask)({ title: "Task", source })).toBe(true);
    expect(Schema.is(TaskPatch)({ source })).toBe(true);
  }
});

it.effect("X01 typed commands reject blank titles without changing Tasks", () =>
  usingStore((store) =>
    Effect.gen(function* () {
      const request = yield* access(store);
      const commands = new TaskCommands(store);
      expect(yield* commands.create(request, { title: " \t" })).toEqual({
        outcome: "rejected",
        reason: "validation",
        latest: null,
      });
      const created = yield* commands.create(request, { title: "Keep title" });
      if (created.outcome !== "committed") throw new Error("Missing Task");
      expect(
        yield* commands.edit(
          { ...request, task_id: created.task.id },
          { from_version: created.task.row_version, changes: { title: "\n " } },
        ),
      ).toEqual({
        outcome: "rejected",
        reason: "validation",
        latest: created.task,
      });
      expect(
        (yield* store.tasks()).map((task) => [task.title, task.row_version]),
      ).toEqual([["Keep title", 1]]);
      expect(
        (yield* store.history())
          .filter((entry) => entry.outcome === "rejected")
          .map((entry) => [entry.reason, entry.from_version, entry.event.kind]),
      ).toEqual([
        ["validation", null, "TaskAttemptRejected"],
        ["validation", 1, "TaskAttemptRejected"],
      ]);
    }),
  ),
);

it.effect("C05-9 normalizes an uppercase Tag filter", () =>
  usingStore((store) =>
    Effect.gen(function* () {
      const request = yield* access(store);
      yield* createTask(store, request, { title: "Tagged", tag: ["alpha"] });
      expect(
        filterTasks(
          (yield* readTasks(store, request)).views,
          { tag: "ALPHA" },
          time,
        ).map((task) => task.title),
      ).toEqual(["Tagged"]);
    }),
  ),
);

it.effect("uses the shared Inbox predicate for filtering and Review", () =>
  usingStore((store) =>
    Effect.gen(function* () {
      const request = yield* access(store);
      yield* createTask(store, request, {
        title: "Project Inbox",
        project: "Port",
      });
      yield* createTask(store, request, {
        title: "Due without Project",
        due: "2030-01-01",
      });
      const done = yield* createTask(store, request, {
        title: "Done without dates",
      });
      yield* mutateTask(store, request, "done", done.task.id, 1);
      const data = yield* readTasks(store, request);
      expect(
        filterTasks(data.views, { inbox: true }, time).map(
          (task) => task.title,
        ),
      ).toEqual(["Project Inbox"]);
      const review = renderReview(data.views, "daily", "md", time);
      expect(review).toContain("## Inbox\n- [ ] [P3] Project Inbox");
      expect(review).not.toContain("Due without Project");
      expect(review).not.toContain("Done without dates");
    }),
  ),
);

const legacyFixture = (path: string) => {
  const db = new Database(path);
  try {
    db.exec(
      readFileSync(
        new URL("fixtures/v2-recurrence.sql", import.meta.url),
        "utf8",
      ),
    );
  } finally {
    db.close();
  }
};

for (const action of ["done", "cancel"] as const)
  for (const roundTrip of [false, true])
    it.effect(
      `S05 moved legacy Task can ${action}, round trip ${roundTrip}`,
      () =>
        usingStore(
          (store) =>
            Effect.gen(function* () {
              const request = yield* access(store);
              const personal = Schema.decodeUnknownSync(ProfileId)("personal");
              const id = Schema.decodeUnknownSync(TaskId)("legacy-1");
              const moved = yield* moveTask(
                store,
                { ...request, task_id: id },
                {
                  from_version: Schema.decodeUnknownSync(Version)(7),
                  destination_profile: personal,
                },
              );
              expect(moved.outcome).toBe("committed");
              let destination = personal;
              let version = 8;
              if (roundTrip) {
                expect(
                  (yield* moveTask(
                    store,
                    { ...request, profile: personal, task_id: id },
                    {
                      from_version: Schema.decodeUnknownSync(Version)(8),
                      destination_profile: profile,
                    },
                  )).outcome,
                ).toBe("committed");
                destination = profile;
                version = 9;
              }
              yield* mutateTask(
                store,
                { ...request, profile: destination },
                action,
                id,
                version,
              );
              expect(
                (yield* store.tasks()).map((task) => [
                  task.id,
                  task.profile_id,
                  task.status,
                  task.row_version,
                  task.occurrence,
                ]),
              ).toEqual([
                [
                  "legacy-1",
                  destination,
                  action === "done" ? "done" : "cancelled",
                  version + 1,
                  null,
                ],
                ["legacy-2", "personal", "done", 2, null],
              ]);
              expect(
                (yield* readTasks(store, { ...request, profile: destination }))
                  .views[0]?.recurrence,
              ).toBeUndefined();
              const state = yield* store.tasks();
              yield* store.rebuild({ useSnapshot: false });
              expect(yield* store.tasks()).toEqual(state);
              yield* store.takeSnapshot();
              yield* store.rebuild();
              expect(yield* store.tasks()).toEqual(state);
            }),
          legacyFixture,
        ),
    );

it.effect("S05 Revert of a legacy move restores its Series membership", () =>
  usingStore(
    (store) =>
      Effect.gen(function* () {
        const request = yield* access(store);
        const personal = Schema.decodeUnknownSync(ProfileId)("personal");
        const id = Schema.decodeUnknownSync(TaskId)("legacy-1");
        yield* moveTask(
          store,
          { ...request, task_id: id },
          {
            from_version: Schema.decodeUnknownSync(Version)(7),
            destination_profile: personal,
          },
        );
        const arrival = (yield* store.history()).find(
          (entry) => entry.event.kind === "TaskMovedIn",
        );
        if (!arrival) throw new Error("Missing arrival");
        expect(
          (yield* revertTask(
            store,
            { ...request, profile: personal, task_id: id },
            {
              from_version: Schema.decodeUnknownSync(Version)(8),
              seq: arrival.seq,
            },
          )).outcome,
        ).toBe("committed");
        yield* mutateTask(store, request, "done", id, 9);
        expect(
          (yield* store.tasks())
            .filter((task) => task.status === "open")
            .map((task) => [task.profile_id, task.occurrence?.date]),
        ).toEqual([["work", "2026-10-28"]]);
      }),
    legacyFixture,
  ),
);

for (const edit of [false, true])
  it.effect(`S05 migrated Series supports edit and skip, edit ${edit}`, () =>
    usingStore(
      (store) =>
        Effect.gen(function* () {
          const request = yield* access(store);
          const target = {
            ...request,
            task_id: Schema.decodeUnknownSync(TaskId)("legacy-1"),
          };
          if (edit)
            expect(
              (yield* editSeries(store, target, {
                from_version: Schema.decodeUnknownSync(Version)(7),
                changes: { title: "Weekly legacy" },
                recurrence: Schema.decodeUnknownSync(Recurrence)({
                  dtstart: {
                    kind: "instant",
                    utc: "2026-10-27T14:00:00.000Z",
                    time_zone: "UTC",
                  },
                  rrule: "FREQ=WEEKLY",
                  exdate: [],
                }),
              })).outcome,
            ).toBe("committed");
          const skipped = yield* skipOccurrence(store, target, {
            from_version: Schema.decodeUnknownSync(Version)(edit ? 8 : 7),
          });
          expect(skipped.outcome).toBe("committed");
          expect(
            (yield* store.tasks())
              .filter((task) => task.status === "open")
              .map((task) => [task.title, task.occurrence?.date]),
          ).toEqual([
            [
              edit ? "Weekly legacy" : "Ship the port",
              edit ? "2026-11-03" : "2026-10-28",
            ],
          ]);
        }),
      legacyFixture,
    ),
  );

it.effect(
  "S05 terminal Series edit preserves the active successor cursor",
  () =>
    usingStore((store) =>
      Effect.gen(function* () {
        const request = yield* access(store);
        const created = yield* createTask(store, request, {
          title: "Daily",
          recurrence: JSON.stringify(dailyRule),
        });
        const target = { ...request, task_id: created.task.id };
        yield* skipOccurrence(store, target, {
          from_version: Schema.decodeUnknownSync(Version)(1),
        });
        const result = yield* editSeries(store, target, {
          from_version: Schema.decodeUnknownSync(Version)(2),
          changes: {},
          recurrence: Schema.decodeUnknownSync(Recurrence)(instantRule),
        });
        expect([
          result.outcome,
          result.outcome === "rejected" ? result.reason : null,
        ]).toEqual(["rejected", "validation"]);
        const next = (yield* store.tasks()).find(
          (task) => task.status === "open",
        );
        if (!next) throw new Error("Missing successor");
        expect(
          (yield* skipOccurrence(
            store,
            { ...request, task_id: next.id },
            { from_version: next.row_version },
          )).outcome,
        ).toBe("committed");
        expect(
          (yield* store.tasks())
            .filter((task) => task.status === "open")
            .map((task) => [task.occurrence?.date, task.occurrence?.time]),
        ).toEqual([["2030-01-03", { kind: "date", date: "2030-01-03" }]]);
      }),
    ),
);

it.effect("S05 reopened Occurrence cannot strand an existing successor", () =>
  usingStore((store) =>
    Effect.gen(function* () {
      const request = yield* access(store);
      const first = yield* createTask(store, request, {
        title: "Dates",
        recurrence: JSON.stringify(dailyRule),
      });
      const target = { ...request, task_id: first.task.id };
      yield* skipOccurrence(store, target, {
        from_version: Schema.decodeUnknownSync(Version)(1),
      });
      yield* new TaskCommands(store).transition(target, {
        from_version: Schema.decodeUnknownSync(Version)(2),
        action: "reopen",
      });
      const result = yield* editSeries(store, target, {
        from_version: Schema.decodeUnknownSync(Version)(3),
        changes: {},
        recurrence: Schema.decodeUnknownSync(Recurrence)(instantRule),
      });
      expect([
        result.outcome,
        result.outcome === "rejected" ? result.reason : null,
      ]).toEqual(["rejected", "validation"]);
      const successor = (yield* store.tasks()).find(
        (task) => task.occurrence?.date === "2030-01-02",
      );
      if (!successor) throw new Error("Missing successor");
      expect(
        (yield* skipOccurrence(
          store,
          { ...request, task_id: successor.id },
          { from_version: successor.row_version },
        )).outcome,
      ).toBe("committed");
      expect(
        (yield* store.tasks())
          .filter((task) => task.occurrence?.date === "2030-01-03")
          .map((task) => [task.status, task.occurrence?.time]),
      ).toEqual([["open", { kind: "date", date: "2030-01-03" }]]);
    }),
  ),
);

it.effect(
  "task commands share CLI name resolution and keep rejected definitions out of the projection",
  () =>
    usingStore((store) =>
      Effect.gen(function* () {
        const session = yield* store.auth.signIn("scratch commands passphrase");
        const request = { credential: session.credential, profile };
        const commands = new TaskCommands(store);
        const created = yield* commands.create(request, {
          title: "Names",
          project_name: "Client Project",
          tag_names: [" FOCUS ", "focus", "Ready,FOCUS"],
        });
        expect(created.outcome).toBe("committed");
        if (created.outcome !== "committed") return;
        const cli = yield* createTask(store, request, {
          title: "CLI reuse",
          project: "Client Project",
          tag: ["READY", "focus"],
        });
        expect(cli.task.project_id).toBe(created.task.project_id);
        expect([...cli.task.tags].sort()).toEqual(
          [...created.task.tags].sort(),
        );
        const other = yield* commands.create(request, { title: "Reuse" });
        if (other.outcome !== "committed")
          throw new Error("Expected committed task");
        const edited = yield* commands.edit(
          { ...request, task_id: other.task.id },
          {
            from_version: Schema.decodeUnknownSync(Version)(1),
            changes: {
              project_name: "Client Project",
              tag_names: ["Focus", "ready"],
            },
          },
        );
        expect(edited.outcome).toBe("committed");
        if (edited.outcome !== "committed") return;
        expect(edited.task.project_id).toBe(created.task.project_id);
        expect(edited.task.tags).toEqual(created.task.tags);
        const stale = yield* commands.edit(
          { ...request, task_id: other.task.id },
          {
            from_version: Schema.decodeUnknownSync(Version)(1),
            changes: {
              project_name: "Rejected Project",
              tag_names: ["rejected"],
            },
          },
        );
        expect(stale.outcome).toBe("rejected");
        expect((yield* store.projects()).map((entry) => entry.name)).toEqual([
          "Client Project",
        ]);
        expect((yield* store.tags()).map((entry) => entry.name).sort()).toEqual(
          ["focus", "ready"],
        );
        const cleared = yield* commands.edit(
          { ...request, task_id: other.task.id },
          {
            from_version: Schema.decodeUnknownSync(Version)(2),
            changes: { project_name: "", tag_names: [] },
          },
        );
        if (cleared.outcome !== "committed") throw new Error("Expected clear");
        expect(cleared.task.project_id).toBe(null);
        expect(cleared.task.tags).toEqual([]);
      }),
    ),
);

it.effect(
  "C10 move resolves Project and Tags in the destination and preserves identity",
  () =>
    usingStore((store) =>
      Effect.gen(function* () {
        const request = yield* access(store);
        const destination = Schema.decodeUnknownSync(ProfileId)("personal");
        yield* store.putProfile({ ...work, id: destination, name: "personal" });
        yield* createTask(store, request, { title: "Unrelated move source" });
        const created = yield* createTask(store, request, {
          title: "Move metadata",
          project: "ARG",
          tag: ["focus"],
        });
        yield* TestClock.setTime(Date.parse("2026-10-28T15:00:00Z"));
        const otherBefore = (yield* store.tasks()).filter(
          (task) => task.id !== created.task.id,
        );
        const result = yield* moveTask(
          store,
          { ...request, task_id: created.task.id },
          {
            from_version: created.task.row_version,
            destination_profile: destination,
          },
        );
        expect(result.outcome).toBe("committed");
        expect(
          result.outcome === "committed" ? result.task.updated_at : null,
        ).toBe("2026-10-28T15:00:00.000Z");
        expect(
          (yield* store.tasks()).filter((task) => task.profile_id === profile),
        ).toEqual(otherBefore);
        const target = yield* readTasks(store, {
          ...request,
          profile: destination,
        });
        expect(
          target.views.map((t) => [
            t.id,
            t.title,
            t.project,
            t.tags,
            t.created_at,
            t.row_version,
          ]),
        ).toEqual([
          [
            created.task.id,
            "Move metadata",
            "ARG",
            ["focus"],
            "2026-10-27T14:00:00Z",
            2,
          ],
        ]);
        const state = yield* store.tasks();
        yield* store.rebuild({ useSnapshot: false });
        expect(yield* store.tasks()).toEqual(state);
      }),
    ),
);

for (const status of ["open", "done", "cancelled"] as const) {
  it.effect(
    `C10 copy preserves ${status} fields, source Tasks and replays provenance`,
    () =>
      usingStore((store) =>
        Effect.gen(function* () {
          const request = yield* access(store);
          const destination = Schema.decodeUnknownSync(ProfileId)("personal");
          yield* store.putProfile({
            ...work,
            id: destination,
            name: "Personal",
          });
          const other = yield* createTask(store, request, {
            title: "Untouched source Task",
          });
          const created = yield* createTask(store, request, {
            title: "Copy metadata",
            desc: "Full description",
            project: "ARG",
            tag: ["focus"],
            priority: "P1",
            due: "2030-01-04",
            scheduled: "2030-01-02",
            energy: "3",
            estimate: "45",
            source: "agent",
          });
          if (status !== "open")
            yield* mutateTask(
              store,
              request,
              status === "done" ? "done" : "cancel",
              created.task.id,
              1,
            );
          const before = yield* store.tasks();
          const source = before.find((t) => t.id === created.task.id);
          if (!source) throw new Error("Missing source");
          yield* TestClock.setTime(Date.parse("2026-10-28T15:00:00Z"));
          const result = yield* copyTask(
            store,
            { ...request, task_id: source.id },
            {
              from_version: source.row_version,
              destination_profile: destination,
            },
          );
          expect(result.outcome).toBe("committed");
          if (result.outcome !== "committed") throw new Error("Copy rejected");
          expect(result.task.id).not.toBe(source.id);
          expect([
            result.task.title,
            result.task.description,
            result.task.priority,
            result.task.due_at,
            result.task.scheduled_at,
            result.task.energy,
            result.task.estimate_min,
            result.task.source,
            result.task.status,
            result.task.created_at,
            result.task.updated_at,
            result.task.completed_at,
            result.task.row_version,
            result.task.occurrence,
          ]).toEqual([
            "Copy metadata",
            "Full description",
            "P1",
            { kind: "date", date: "2030-01-04" },
            { kind: "date", date: "2030-01-02" },
            3,
            45,
            "agent",
            status,
            "2026-10-27T14:00:00.000Z",
            "2026-10-28T15:00:00.000Z",
            source.completed_at,
            1,
            null,
          ]);
          expect(
            (yield* store.tasks()).filter((t) => t.profile_id === profile),
          ).toEqual(before);
          expect(
            (yield* readTasks(store, {
              ...request,
              profile: destination,
            })).views.map((t) => [t.project, t.tags]),
          ).toEqual([["ARG", ["focus"]]]);
          const entry = (yield* store.history()).find(
            (e) =>
              e.event.kind === "TaskCreated" &&
              e.event.task.id === result.task.id,
          );
          expect(
            entry?.event.kind === "TaskCreated"
              ? entry.event.copied_from
              : null,
          ).toEqual({
            profile_id: "work",
            profile_name: "Work",
            source_task_id: source.id,
          });
          const historyBefore = yield* store.history();
          const conflict = yield* copyTask(
            store,
            { ...request, task_id: source.id },
            {
              from_version: Schema.decodeUnknownSync(Version)(99),
              destination_profile: destination,
            },
          );
          expect(
            conflict.outcome === "rejected"
              ? [conflict.reason, conflict.latest?.row_version]
              : conflict.outcome,
          ).toEqual(["conflict", source.row_version]);
          expect((yield* store.tasks()).length).toBe(3);
          expect(
            historyBefore
              .filter(
                (e) =>
                  e.event.kind === "TaskCreated" &&
                  e.event.task.id === other.task.id,
              )
              .map((e) =>
                e.event.kind === "TaskCreated" ? e.event.copied_from : null,
              ),
          ).toEqual([undefined]);
          const state = yield* store.tasks();
          yield* store.rebuild({ useSnapshot: false });
          expect(yield* store.tasks()).toEqual(state);
          yield* store.takeSnapshot();
          yield* store.rebuild();
          expect(yield* store.tasks()).toEqual(state);
        }),
      ),
  );
}

it.effect("C10 copies an Occurrence as a plain Task", () =>
  usingStore((store) =>
    Effect.gen(function* () {
      const request = yield* access(store);
      const destination = Schema.decodeUnknownSync(ProfileId)("personal");
      yield* store.putProfile({ ...work, id: destination, name: "Personal" });
      const created = yield* createTask(store, request, {
        title: "Recurring",
        recurrence: JSON.stringify(dailyRule),
      });
      const before = yield* store.tasks();
      const result = yield* copyTask(
        store,
        { ...request, task_id: created.task.id },
        {
          from_version: created.task.row_version,
          destination_profile: destination,
        },
      );
      if (result.outcome !== "committed") throw new Error("Copy rejected");
      expect(result.task.occurrence).toBeNull();
      yield* mutateTask(
        store,
        { ...request, profile: destination },
        "done",
        result.task.id,
        1,
      );
      expect(
        (yield* store.tasks()).filter((t) => t.profile_id === profile),
      ).toEqual(before);
      expect(
        (yield* store.tasks()).filter((t) => t.profile_id === destination)
          .length,
      ).toBe(1);
    }),
  ),
);

it.effect(
  "C10 failed transfer rolls back destination metadata and leaves all source Tasks unchanged",
  () =>
    usingStore((store, path) =>
      Effect.gen(function* () {
        const request = yield* access(store);
        const destination = Schema.decodeUnknownSync(ProfileId)("personal");
        yield* store.putProfile({ ...work, id: destination, name: "Personal" });
        const source = yield* createTask(store, request, {
          title: "Atomic source",
          project: "Atomic Project",
          tag: ["atomic-tag"],
        });
        yield* createTask(store, request, { title: "Atomic unrelated source" });
        const tasks = yield* store.tasks();
        const projects = yield* store.projects();
        const tags = yield* store.tags();
        const history = yield* store.history();
        const database = new Database(path);
        try {
          database.exec(
            "CREATE TRIGGER c10_fail_transfer BEFORE INSERT ON tasks WHEN NEW.profile_id='personal' BEGIN SELECT RAISE(ABORT, 'forced transfer failure'); END",
          );
          for (const transfer of [copyTask, moveTask]) {
            const error = yield* Effect.flip(
              transfer(
                store,
                { ...request, task_id: source.task.id },
                {
                  from_version: source.task.row_version,
                  destination_profile: destination,
                },
              ),
            );
            expect(error._tag).toBe("StoreError");
            expect(yield* store.tasks()).toEqual(tasks);
            expect(yield* store.projects()).toEqual(projects);
            expect(yield* store.tags()).toEqual(tags);
            expect(yield* store.history()).toEqual(history);
          }
        } finally {
          database.close();
        }
      }),
    ),
);

it.effect("C10 a copied Task survives source Purge and full replay", () =>
  usingStore((store) =>
    Effect.gen(function* () {
      const request = yield* access(store);
      const destination = Schema.decodeUnknownSync(ProfileId)("personal");
      yield* store.putProfile({ ...work, id: destination, name: "Personal" });
      const source = yield* createTask(store, request, {
        title: "Copied content survives",
      });
      const copied = yield* copyTask(
        store,
        { ...request, task_id: source.task.id },
        {
          from_version: source.task.row_version,
          destination_profile: destination,
        },
      );
      if (copied.outcome !== "committed") throw new Error("Copy failed");
      yield* mutateTask(store, request, "rm", source.task.id, 1);
      yield* mutateTask(store, request, "rm", source.task.id, 2, {}, true);
      expect(
        (yield* store.tasks()).map((t) => [t.id, t.title, t.profile_id]),
      ).toEqual([[copied.task.id, "Copied content survives", "personal"]]);
      yield* store.rebuild({ useSnapshot: false });
      expect(
        (yield* store.tasks()).map((t) => [t.id, t.title, t.profile_id]),
      ).toEqual([[copied.task.id, "Copied content survives", "personal"]]);
    }),
  ),
);

it.effect(
  "C11 rejects Copy within a Profile and records the attempted Task",
  () =>
    usingStore((store) =>
      Effect.gen(function* () {
        const session = yield* store.auth.signIn("scratch commands passphrase");
        const request = { credential: session.credential, profile };
        const source = yield* createTask(store, request, {
          title: "Copy source",
          external_id: "repo:copy",
        });
        const before = yield* store.tasks();
        expect(
          yield* copyTask(
            store,
            { ...request, task_id: source.task.id },
            {
              from_version: Schema.decodeUnknownSync(Version)(1),
              destination_profile: profile,
            },
          ),
        ).toMatchObject({
          outcome: "rejected",
          reason: "validation",
          message: "Copy needs a different Profile.",
        });
        expect(yield* store.tasks()).toEqual(before);
        expect(
          (yield* store.history())
            .filter((entry) => entry.outcome === "rejected")
            .map((entry) => [
              entry.reason,
              entry.from_version,
              entry.event.kind === "TaskAttemptRejected"
                ? entry.event.task_id
                : null,
            ]),
        ).toEqual([["validation", 1, source.task.id]]);
      }),
    ),
);

it.effect(
  "C11 Copy to another Profile clears the external id and leaves the source unchanged",
  () =>
    usingStore((store) =>
      Effect.gen(function* () {
        const destination = Schema.decodeUnknownSync(ProfileId)("personal");
        yield* store.putProfile({ ...work, id: destination, name: "Personal" });
        const session = yield* store.auth.signIn("scratch commands passphrase");
        const request = { credential: session.credential, profile };
        const source = yield* createTask(store, request, {
          title: "Copy source",
          external_id: "repo:copy",
        });
        const before = yield* store.tasks();
        const result = yield* copyTask(
          store,
          { ...request, task_id: source.task.id },
          {
            from_version: Schema.decodeUnknownSync(Version)(1),
            destination_profile: destination,
          },
        );
        expect(result.outcome).toBe("committed");
        if (result.outcome !== "committed") throw new Error("Copy rejected");
        expect([
          result.task.profile_id,
          result.task.external_id,
          result.task.row_version,
        ]).toEqual([destination, null, 1]);
        expect(
          (yield* store.tasks()).filter((task) => task.profile_id === profile),
        ).toEqual(before);
        expect(result.task.id).not.toBe(source.task.id);
      }),
    ),
);

for (const clash of [false, true]) {
  it.effect(
    `C11 Move ${clash ? "reports an external id clash without changing either Profile" : "keeps the external id in the destination Profile"}`,
    () =>
      usingStore((store) =>
        Effect.gen(function* () {
          const destination = Schema.decodeUnknownSync(ProfileId)("personal");
          yield* store.putProfile({
            ...work,
            id: destination,
            name: "Personal",
          });
          const session = yield* store.auth.signIn(
            "scratch commands passphrase",
          );
          const request = { credential: session.credential, profile };
          const source = yield* createTask(store, request, {
            title: "Move source",
            external_id: "repo:move",
          });
          if (clash)
            yield* createTask(
              store,
              { ...request, profile: destination },
              { title: "Keep target", external_id: "repo:move" },
            );
          const before = yield* store.tasks();
          const result = yield* moveTask(
            store,
            { ...request, task_id: source.task.id },
            {
              from_version: Schema.decodeUnknownSync(Version)(1),
              destination_profile: destination,
            },
          );
          if (clash) {
            expect(result).toMatchObject({
              outcome: "rejected",
              reason: "external_id_conflict",
              message:
                '"Personal" already has a Task with external id "repo:move". Choose another Profile.',
              details: { external_id: "repo:move", profile_id: "personal" },
            });
            expect(yield* store.tasks()).toEqual(before);
            expect(
              (yield* store.history())
                .filter((entry) => entry.outcome === "rejected")
                .map((entry) => entry.reason),
            ).toEqual(["external_id_conflict"]);
          } else {
            expect(result.outcome).toBe("committed");
            if (result.outcome !== "committed")
              throw new Error("Move rejected");
            expect([
              result.task.id,
              result.task.external_id,
              result.task.profile_id,
              result.task.row_version,
            ]).toEqual([source.task.id, "repo:move", destination, 2]);
          }
        }),
      ),
  );
}

it.effect(
  "resolves a named Project when a client clears its old Project ID",
  () =>
    usingStore((store) =>
      Effect.gen(function* () {
        const request = yield* access(store);
        const commands = new TaskCommands(store);
        const created = yield* commands.create(request, {
          title: "New metadata",
          project_id: null,
          project_name: "Client Project",
          tag_names: ["deep focus"],
        });
        expect(created.outcome).toBe("committed");
        if (created.outcome !== "committed")
          throw new Error("Expected creation");
        expect(
          (yield* store.projects()).map((p) => [
            p.id === created.task.project_id,
            p.name,
          ]),
        ).toEqual([[true, "Client Project"]]);
        const edited = yield* commands.edit(
          { ...request, task_id: created.task.id },
          {
            from_version: created.task.row_version,
            changes: { project_id: null, project_name: "New Project" },
          },
        );
        if (edited.outcome !== "committed") throw new Error("Expected edit");
        expect(
          (yield* store.projects()).find((p) => p.id === edited.task.project_id)
            ?.name,
        ).toBe("New Project");
      }),
    ),
);
