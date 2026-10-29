import { expect, it } from "@effect/vitest";
import { Schema } from "effect";
import { Project, Series, Tag, Task, TaskDetails } from "../src/entities.ts";
import { renderTask, taskView } from "../src/presentation.ts";

it("encodes every optional Task field without dropping or renaming fields", () => {
  const recurrence = {
    dtstart: { kind: "date", date: "2030-01-01" },
    rrule: "FREQ=DAILY",
    exdate: [],
  };
  const task = Schema.decodeUnknownSync(Task)({
    id: "task-all-fields",
    profile_id: "fixture-profile",
    entity_version: 1,
    row_version: 7,
    title: "Every field",
    description: "- description",
    project_id: "fixture-project",
    priority: "P1",
    status: "done",
    scheduled_at: { kind: "date", date: "2030-01-01" },
    due_at: {
      kind: "instant",
      utc: "2030-01-02T09:00:00.000Z",
      time_zone: "America/Bogota",
    },
    energy: 5,
    estimate_min: 45,
    source: "agent",
    tags: ["fixture-tag"],
    occurrence: {
      id: "fixture-occurrence",
      series_id: "fixture-series",
      date: "2030-01-01",
      time: { kind: "date", date: "2030-01-01" },
    },
    created_at: "2029-12-01T00:00:00.000Z",
    updated_at: "2030-01-01T12:00:00.000Z",
    completed_at: "2030-01-01T12:00:00.000Z",
    deleted_at: null,
  });
  const project = Schema.decodeUnknownSync(Project)({
    id: "fixture-project",
    profile_id: task.profile_id,
    name: "work",
    created_at: task.created_at,
    updated_at: task.updated_at,
  });
  const tag = Schema.decodeUnknownSync(Tag)({
    id: "fixture-tag",
    profile_id: task.profile_id,
    name: "cli",
  });
  const series = Schema.decodeUnknownSync(Series)({
    id: "fixture-series",
    profile_id: task.profile_id,
    entity_version: 1,
    row_version: 1,
    recurrence,
    task: Schema.decodeUnknownSync(TaskDetails)(task),
    created_at: task.created_at,
    updated_at: task.updated_at,
    deleted_at: null,
  });
  expect(
    renderTask(
      taskView(task, [project], [tag], [series]),
      "json",
      "2030-01-03T00:00:00.000Z",
    ),
  ).toBe(`{
  "generated_at": "2030-01-03T00:00:00Z",
  "task": {
    "id": "task-all-fields",
    "user_id": "fixture-profile",
    "entity_version": 1,
    "row_version": 7,
    "title": "Every field",
    "recurrence": {
      "dtstart": {
        "kind": "date",
        "date": "2030-01-01"
      },
      "rrule": "FREQ=DAILY",
      "exdate": []
    },
    "series_id": "fixture-series",
    "occurrence": {
      "id": "fixture-occurrence",
      "series_id": "fixture-series",
      "date": "2030-01-01",
      "time": {
        "kind": "date",
        "date": "2030-01-01"
      }
    },
    "description": "- description",
    "status": "done",
    "project": "work",
    "priority": "P1",
    "scheduled_at": "2030-01-01",
    "due_at": "2030-01-02T09:00:00Z",
    "energy": 5,
    "estimate_min": 45,
    "source": "agent",
    "created_at": "2029-12-01T00:00:00Z",
    "updated_at": "2030-01-01T12:00:00Z",
    "completed_at": "2030-01-01T12:00:00Z",
    "tags": [
      "cli"
    ]
  }
}
`);
});
