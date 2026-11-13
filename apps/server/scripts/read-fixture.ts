import { setSystemTime } from "bun:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  CalendarDate,
  DependencyCommands,
  Instant,
  Profile,
  ProfileId,
  type Task,
  TimeZoneId,
} from "@todo/domain";
import { AttachmentCommands } from "@todo/domain/attachments";
import { copyTask, createSeries, moveTask } from "@todo/domain/commands";
import { openStore, TaskCommands } from "@todo/domain/store";
import { Effect, Schema } from "effect";

setSystemTime(new Date("2026-11-11T18:00:00Z"));
const root = resolve(process.argv[2] ?? ".scratch/server-reads/rich");
assert.ok(root.startsWith(`${resolve(".scratch")}/`));
mkdirSync(root, { recursive: true });
const run = Effect.runPromise;
const store = await run(
  openStore({
    path: join(root, "scratch.db"),
    attachmentRoot: join(root, "attachments"),
  }),
);
try {
  const at = Schema.decodeUnknownSync(Instant)("2026-11-11T18:00:00.000Z");
  await run(store.auth.setupOwner("read control scratch only"));
  const { credential } = await run(
    store.auth.signIn("read control scratch only"),
  );
  const credentials = [credential];
  for (const id of ["work", "personal", "deleted", "empty"])
    await run(
      store.putProfile(
        Schema.decodeUnknownSync(Profile)({
          id,
          name: id,
          created_at: at,
          updated_at: at,
        }),
      ),
    );
  for (const [name, profile, scope] of [
    ["unscoped", null, "read-only"],
    ["scoped", "work", "read-only"],
    ["writer", "work", "read-write"],
    ["deleted", "deleted", "read-only"],
  ] as const) {
    const token = await run(
      store.auth.issueToken({
        credential,
        token: {
          name,
          profile:
            profile === null
              ? null
              : Schema.decodeUnknownSync(ProfileId)(profile),
          scope,
        },
      }),
    );
    credentials.push(token.credential);
  }
  const commands = new TaskCommands(store);
  const profile = Schema.decodeUnknownSync(ProfileId)("work");
  const request = { credential, profile };
  const created: Task[] = [];
  for (const title of [
    "Inbox",
    "Overdue",
    "Today",
    "Scheduled",
    "Closed",
    "Cancelled",
    "Deleted",
    "Purged",
    "Blocker",
    "Dependent",
    "Copy and Move",
  ]) {
    const result = await run(
      commands.create(request, {
        title,
        project_name: "Project",
        tag_names: ["Tag"],
        attachments: [
          {
            kind: "link",
            url: "https://example.invalid/reference",
            label: "Reference",
          },
        ],
        ...(title === "Overdue"
          ? {
              due_at: {
                kind: "date",
                date: Schema.decodeUnknownSync(CalendarDate)("2026-11-10"),
              },
            }
          : {}),
        ...(title === "Today"
          ? {
              due_at: {
                kind: "date",
                date: Schema.decodeUnknownSync(CalendarDate)("2026-11-11"),
              },
            }
          : {}),
        ...(title === "Scheduled"
          ? {
              scheduled_at: {
                kind: "date",
                date: Schema.decodeUnknownSync(CalendarDate)("2026-11-12"),
              },
            }
          : {}),
      }),
    );
    assert.equal(result.outcome, "committed");
    if (result.outcome !== "committed") throw new Error("Seed rejected");
    created.push(result.task);
  }
  for (const task of created) {
    const target = { ...request, task_id: task.id };
    if (["Closed", "Cancelled"].includes(task.title))
      assert.equal(
        (
          await run(
            commands.transition(target, {
              from_version: task.row_version,
              action: task.title === "Closed" ? "complete" : "cancel",
            }),
          )
        ).outcome,
        "committed",
      );
    if (["Deleted", "Purged"].includes(task.title)) {
      assert.equal(
        (await run(commands.delete(target, { from_version: task.row_version })))
          .outcome,
        "committed",
      );
      if (task.title === "Purged") {
        const before = (await run(store.tasks())).find((t) => t.id === task.id);
        assert.ok(before);
        const purged = await run(
          store.auth.append({
            ...request,
            event: {
              kind: "TaskPurged",
              entity_version: 1,
              occurred_at: at,
              task_id: task.id,
              before,
            },
          }),
        );
        assert.equal(purged.outcome, "committed");
      }
    }
    if (task.title === "Copy and Move") {
      await run(
        copyTask(store, target, {
          from_version: task.row_version,
          destination_profile: Schema.decodeUnknownSync(ProfileId)("personal"),
        }),
      );
      await run(
        moveTask(store, target, {
          from_version: task.row_version,
          destination_profile: Schema.decodeUnknownSync(ProfileId)("personal"),
        }),
      );
    }
  }
  const blocker = created.find((t) => t.title === "Blocker");
  const dependent = created.find((t) => t.title === "Dependent");
  assert.ok(blocker && dependent);
  const dependencies = new DependencyCommands(store);
  await run(
    dependencies.change(
      { ...request, task_id: dependent.id },
      { from_version: dependent.row_version, blocker_id: blocker.id },
      "depend",
    ),
  );
  await run(
    dependencies.change(
      { ...request, task_id: blocker.id },
      { from_version: blocker.row_version, blocker_id: dependent.id },
      "depend",
    ),
  );
  const currentDependent = (await run(store.tasks())).find(
    (t) => t.id === dependent.id,
  );
  assert.ok(currentDependent);
  await run(
    dependencies.change(
      { ...request, task_id: dependent.id },
      { from_version: currentDependent.row_version, blocker_id: blocker.id },
      "undepend",
    ),
  );
  const v2 = await run(
    commands.create(request, {
      title: "Initial Dependency",
      depends_on: [blocker.id],
    }),
  );
  assert.equal(v2.outcome, "committed");
  const inbox = created.find((t) => t.title === "Inbox");
  assert.ok(inbox);
  await run(
    commands.edit(
      { ...request, task_id: inbox.id },
      { from_version: inbox.row_version, changes: { title: "Edited Inbox" } },
    ),
  );
  const edit = (await run(store.history()))
    .reverse()
    .find((entry) => entry.event.kind === "TaskEdited");
  assert.ok(edit);
  await run(store.auth.revert({ ...request, seq: edit.seq }));
  const afterRevert = (await run(store.tasks())).find((t) => t.id === inbox.id);
  const attachment = afterRevert?.attachments?.[0];
  assert.ok(afterRevert && attachment);
  await run(
    new AttachmentCommands(store).detach(
      { ...request, task_id: inbox.id },
      { from_version: afterRevert.row_version, attachment_id: attachment.id },
    ),
  );
  const detached = (await run(store.tasks())).find((t) => t.id === inbox.id);
  assert.ok(detached);
  await run(
    new AttachmentCommands(store).attach(
      { ...request, task_id: inbox.id },
      {
        from_version: detached.row_version,
        name: "Reference",
        label: "Added reference",
        location: { kind: "link", url: "https://example.invalid/added" },
      },
    ),
  );
  const closed = (await run(store.tasks())).find((t) => t.title === "Closed");
  assert.ok(closed);
  await run(
    commands.transition(
      { ...request, task_id: closed.id },
      { from_version: closed.row_version, action: "reopen" },
    ),
  );
  await run(
    commands.create(request, {
      title: "Instant Reminder",
      due_at: {
        kind: "instant",
        utc: at,
        time_zone: Schema.decodeUnknownSync(TimeZoneId)("UTC"),
      },
    }),
  );
  await run(store.scheduled.runDue());
  const imageTask = (await run(store.tasks())).find(
    (task) => task.id === inbox.id,
  );
  assert.ok(imageTask);
  assert.equal(
    (
      await run(
        new AttachmentCommands(store).upload(
          { ...request, task_id: inbox.id },
          {
            from_version: imageTask.row_version,
            name: "pixel.png",
            label: "Pixel",
            mime_type: "image/png",
            data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j+XcAAAAASUVORK5CYII=",
          },
        ),
      )
    ).outcome,
    "committed",
  );
  await run(
    createSeries(store, request, {
      task: {
        title: "Daily Series",
        project_name: "Series Project",
        tag_names: ["series"],
      },
      recurrence: {
        rrule: "FREQ=DAILY;COUNT=3",
        dtstart: {
          kind: "date",
          date: Schema.decodeUnknownSync(CalendarDate)("2026-11-11"),
        },
        exdate: [],
      },
    }),
  );
  const occurrence = (await run(store.tasks())).find(
    (t) => t.occurrence !== null,
  );
  assert.ok(occurrence);
  await run(
    commands.transition(
      { ...request, task_id: occurrence.id },
      { from_version: occurrence.row_version, action: "complete" },
    ),
  );
  await run(
    store.auth.deleteProfile({
      credential,
      profile,
      options: { with_tasks: false, dry_run: false },
    }),
  );
  await run(
    Effect.exit(
      store.auth.authenticate({
        ...request,
        credential: "invalid",
        access: "read",
      }),
    ),
  );
  await run(
    store.auth.deleteProfile({
      credential,
      profile: Schema.decodeUnknownSync(ProfileId)("deleted"),
      options: { with_tasks: true, dry_run: false },
    }),
  );
  const snapshot = await run(
    store.snapshots.create("read differential fixture"),
  );
  await run(store.snapshots.restore(snapshot.id, { dryRun: false }));
  await run(store.takeSnapshot());
  const history = await run(store.history());
  const kinds = new Set<string>(
    history.flatMap((entry) =>
      entry.event.kind === "TaskHistoryRedacted"
        ? [entry.event.kind, entry.event.original_kind]
        : [entry.event.kind],
    ),
  );
  for (const kind of [
    "TaskCreated",
    "TaskEdited",
    "TaskCompleted",
    "TaskCancelled",
    "TaskReopened",
    "TaskDeleted",
    "TaskPurged",
    "TaskReverted",
    "TaskMovedIn",
    "TaskMovedOut",
    "AttachmentAdded",
    "AttachmentRemoved",
    "DependencyAdded",
    "DependencyRemoved",
    "TaskHistoryRedacted",
    "TaskAttemptRejected",
    "AuthChanged",
    "AuthAttemptRejected",
    "ReminderFired",
    "ProfileDeleted",
    "ProfileDeletionRejected",
    "DatabaseRestored",
  ])
    assert.ok(kinds.has(kind), `Fixture must contain ${kind}`);
  assert.equal(
    history.filter((entry) => entry.outcome === "rejected").length,
    3,
  );
  assert.equal(
    (await run(store.tasks())).some((task) => task.title === "Purged"),
    false,
  );
  writeFileSync(
    join(root, "fixtures.json"),
    JSON.stringify([
      {
        id: "rich-lifecycle",
        path: join(root, "scratch.db"),
        credential,
        credentials,
        all_tasks: true,
        attachment_root: join(root, "attachments"),
        extra_tasks: created
          .filter((task) => task.title === "Purged")
          .map(({ id, profile_id }) => ({ id, profile_id })),
      },
    ]),
  );
} finally {
  await run(store.close());
}
