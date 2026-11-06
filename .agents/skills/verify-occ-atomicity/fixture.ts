import { Schema } from "effect";
import { Attachment } from "../../../packages/domain/src/attachments.ts";
import { Profile, Task } from "../../../packages/domain/src/entities.ts";
import { Event } from "../../../packages/domain/src/events.ts";
import { ActorId } from "../../../packages/domain/src/ids.ts";

export const time = "2026-11-03T12:00:00Z";
export const later = "2026-11-03T13:00:00Z";
export const actor = Schema.decodeUnknownSync(ActorId)("fv01");
export const profile = Schema.decodeUnknownSync(Profile)({
  id: "fv01",
  name: "FV01",
  created_at: time,
  updated_at: time,
});
export const initial = Schema.decodeUnknownSync(Task)({
  id: "fv01-task",
  profile_id: profile.id,
  entity_version: 1,
  row_version: 1,
  title: "Initial Task",
  description: null,
  status: "open",
  project_id: null,
  priority: "P2",
  scheduled_at: null,
  due_at: null,
  energy: null,
  estimate_min: null,
  source: "agent",
  tags: [],
  occurrence: null,
  created_at: time,
  updated_at: time,
  completed_at: null,
  deleted_at: null,
  attachments: [],
});
export const attachment = Schema.decodeUnknownSync(Attachment)({
  id: "fv01-link",
  kind: "link",
  url: "https://example.com/fv01",
  added_at: later,
});
export const created = Schema.decodeUnknownSync(Event)({
  kind: "TaskCreated",
  entity_version: 1,
  occurred_at: time,
  task: initial,
  series: null,
  project: null,
  tags: [],
});
export const kinds = ["TaskEdited", "AttachmentAdded", "TaskDeleted"] as const;
export type Kind = (typeof kinds)[number];
export function proposal(before: Task, version: number, kind: Kind) {
  const after = Schema.decodeUnknownSync(Task)({
    ...before,
    row_version: version,
    updated_at: later,
    ...(kind === "TaskEdited"
      ? { title: "Imported Task", external_id: "repository:fv01" }
      : kind === "AttachmentAdded"
        ? { attachments: [attachment] }
        : { deleted_at: later }),
  });
  const event = Schema.decodeUnknownSync(Event)({
    kind,
    entity_version: 1,
    occurred_at: later,
    before,
    after,
    ...(kind === "TaskEdited"
      ? {
          series_before: null,
          series_after: null,
          project_before: null,
          project_after: null,
          tags_before: [],
          tags_after: [],
        }
      : {}),
  });
  if (!("after" in event))
    throw new Error("The fixture requires a Task change with an after value");
  return event;
}
