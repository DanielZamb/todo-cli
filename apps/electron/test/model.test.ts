import { expect, it } from "@effect/vitest";
import { Task, TaskTime } from "@todo/domain";
import { Effect, Schema } from "effect";
import {
  conflicts,
  conflictText,
  editorFor,
  merge,
  rebaseEditor,
  taskTagNames,
  timeText,
} from "../src/model.ts";

const task = Schema.decodeUnknownSync(Task)({
  id: "task-1",
  profile_id: "work",
  entity_version: 1,
  row_version: 1,
  title: "Prepare launch notes",
  description: null,
  project_id: null,
  priority: "P1",
  scheduled_at: null,
  due_at: null,
  energy: null,
  estimate_min: null,
  source: "electron",
  tags: [],
  status: "open",
  occurrence: null,
  created_at: "2026-10-27T00:00:00Z",
  updated_at: "2026-10-27T00:00:00Z",
  completed_at: null,
  deleted_at: null,
});
it.effect(
  "requires a choice for every overlapping field and preserves disjoint accepted changes",
  () =>
    Effect.sync(() => {
      const base = editorFor(task);
      const draft = {
        ...base,
        changes: {
          ...base.changes,
          title: "My launch notes",
          description: "My description",
        },
      };
      const latest = {
        ...task,
        title: "Latest launch notes",
        priority: Schema.decodeUnknownSync(Task.fields.priority)("P2"),
        project_id: Schema.decodeUnknownSync(Task.fields.project_id)("website"),
      };
      expect(conflicts(draft, latest)).toEqual(["title"]);
      expect(merge(draft, latest, { title: "mine" })).toEqual({
        title: "My launch notes",
        description: "My description",
        priority: "P2",
        project_id: "website",
        tags: [],
        due_at: null,
        scheduled_at: null,
        energy: null,
        estimate_min: null,
      });
      expect(merge(draft, latest, { title: "latest" }).title).toBe(
        "Latest launch notes",
      );
    }),
);
it.effect(
  "keeps every overlapping field unresolved and accepts identical concurrent changes",
  () =>
    Effect.sync(() => {
      const base = editorFor(task);
      const draft = {
        ...base,
        changes: {
          ...base.changes,
          title: "Mine",
          priority: Schema.decodeUnknownSync(Task.fields.priority)("P2"),
        },
      };
      const latest = {
        ...task,
        title: "Theirs",
        priority: Schema.decodeUnknownSync(Task.fields.priority)("P3"),
      };
      expect(conflicts(draft, latest)).toEqual(["title", "priority"]);
      expect(conflicts(draft, { ...latest, title: "Mine" })).toEqual([
        "priority",
      ]);
    }),
);
it.effect(
  "omits the current time zone in rows and keeps a differing zone",
  () =>
    Effect.sync(() => {
      const value = Schema.decodeUnknownSync(TaskTime)({
        kind: "instant",
        utc: "2026-10-27T15:00:00Z",
        time_zone: "America/Bogota",
      });
      expect(timeText(value, "America/Bogota")).toBe("October 27 at 10:00 AM");
      expect(timeText(value, "Europe/London")).toBe(
        "October 27 at 10:00 AM · America/Bogota",
      );
      expect(
        timeText(
          Schema.decodeUnknownSync(TaskTime)({
            kind: "date",
            date: "2026-10-27",
          }),
        ),
      ).toBe("October 27");
    }),
);

it.effect(
  "preserves unsaved metadata when a status action returns a newer accepted Task",
  () =>
    Effect.sync(() => {
      const editor = editorFor(task);
      const dirty = {
        ...editor,
        changes: {
          ...editor.changes,
          title: "Unsaved title",
          description: "Unsaved notes",
        },
      };
      const accepted = Schema.decodeUnknownSync(Task)({
        ...task,
        row_version: 2,
        status: "done",
        completed_at: "2026-10-27T01:00:00Z",
      });
      expect(rebaseEditor(dirty, accepted)).toEqual({
        base: accepted,
        changes: {
          title: "Unsaved title",
          description: "Unsaved notes",
          priority: "P1",
          project_id: null,
          tags: [],
          due_at: null,
          scheduled_at: null,
          energy: null,
          estimate_min: null,
        },
      });
    }),
);
it.effect("shows readable date conflicts and discovered metadata names", () =>
  Effect.sync(() => {
    const changes = {
      ...editorFor(task).changes,
      due_at: Schema.decodeUnknownSync(TaskTime)({
        kind: "date",
        date: "2026-10-28",
      }),
      project_id: Schema.decodeUnknownSync(Task.fields.project_id)("website"),
      tags: Schema.decodeUnknownSync(Task.fields.tags)(["launch"]),
    };
    expect(conflictText("due_at", changes, [], [])).toBe("October 28");
    expect(
      conflictText(
        "project_id",
        changes,
        [{ id: "website", name: "Website" }],
        [],
      ),
    ).toBe("Website");
    expect(
      conflictText("tags", changes, [], [{ id: "launch", name: "Launch" }]),
    ).toBe("Launch");
  }),
);

it.effect(
  "merges pending names with their Project and Tags and displays discovered conflict names",
  () =>
    Effect.sync(() => {
      const base = editorFor(task);
      const draft = {
        ...base,
        changes: {
          ...base.changes,
          project_name: "My Project",
          tag_names: ["focus"],
        },
      };
      const latest = {
        ...task,
        project_id: Schema.decodeUnknownSync(Task.fields.project_id)(
          "remote-project",
        ),
        tags: Schema.decodeUnknownSync(Task.fields.tags)(["remote-tag"]),
      };
      expect(conflicts(draft, latest)).toEqual(["project_id", "tags"]);
      expect(conflictText("project_id", draft.changes, [], [])).toBe(
        "My Project",
      );
      expect(conflictText("tags", draft.changes, [], [])).toBe("focus");
      expect(
        conflictText(
          "project_id",
          editorFor(latest).changes,
          [{ id: "remote-project", name: "Other Project" }],
          [],
        ),
      ).toBe("Other Project");
      expect(
        conflictText(
          "tags",
          editorFor(latest).changes,
          [],
          [{ id: "remote-tag", name: "remote" }],
        ),
      ).toBe("remote");
      const mine = merge(draft, latest, { project_id: "mine", tags: "mine" });
      expect(mine.project_name).toBe("My Project");
      expect(mine.tag_names).toEqual(["focus"]);
      const theirs = merge(draft, latest, {
        project_id: "latest",
        tags: "latest",
      });
      expect(theirs.project_id).toBe("remote-project");
      expect(theirs.tags).toEqual(["remote-tag"]);
      expect(theirs.project_name).toBeUndefined();
      expect(theirs.tag_names).toBeUndefined();
    }),
);

it.effect("task rows include every Tag in case-insensitive name order", () =>
  Effect.sync(() => {
    const tagged = {
      ...task,
      tags: Schema.decodeUnknownSync(Task.fields.tags)([
        "z-tag",
        "ready-tag",
        "a-tag",
      ]),
    };
    expect(
      taskTagNames(tagged, [
        { id: "ready-tag", name: "ready" },
        { id: "z-tag", name: "Zulu" },
        { id: "a-tag", name: "alpha" },
      ]),
    ).toEqual(["alpha", "ready", "Zulu"]);
    expect(taskTagNames(tagged, [])).toEqual(["a-tag", "ready-tag", "z-tag"]);
  }),
);

it("accepting an Attachment keeps the old Version when an unsaved field overlaps", () => {
  const base = editorFor(task);
  const draft = {
    ...base,
    changes: { ...base.changes, title: "My unsaved title" },
  };
  const accepted = Schema.decodeUnknownSync(Task)({
    ...task,
    title: "Remote title",
    row_version: 3,
    attachments: [
      {
        id: "attachment-1",
        kind: "file",
        path: "/tmp/draft.md",
        label: "jira",
        added_at: "2026-10-29T00:00:00Z",
      },
    ],
  });
  const result = acceptAttachmentTask(draft, accepted);
  expect(result.changes.title).toBe("My unsaved title");
  expect(result.base.title).toBe("Prepare launch notes");
  expect(result.base.row_version).toBe(1);
  expect(result.base.attachments?.[0]?.label).toBe("jira");
});

import { acceptAttachmentTask } from "../src/attachment-model.ts";
