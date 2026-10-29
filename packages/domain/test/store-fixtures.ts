import { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";
import { Schema } from "effect";
import {
  ActorId,
  Instant,
  Profile,
  ProfileId,
  Sequence,
  Task,
} from "../src/index.ts";

export const actor = Schema.decodeUnknownSync(ActorId)("test-actor");
export const profile = Schema.decodeUnknownSync(ProfileId)("work");
export const time = Schema.decodeUnknownSync(Instant)("2026-10-27T14:00:00Z");
export const later = Schema.decodeUnknownSync(Instant)("2026-10-27T15:00:00Z");
export const sequence = Schema.decodeUnknownSync(Sequence);
export const work = Schema.decodeUnknownSync(Profile)({
  id: "work",
  name: "Work",
  created_at: time,
  updated_at: time,
});
export const taskInput = {
  id: "task-1",
  profile_id: "work",
  entity_version: 1,
  row_version: 1,
  title: "Write the store",
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
};
export const task = Schema.decodeUnknownSync(Task)(taskInput);
export const created = {
  kind: "TaskCreated",
  entity_version: 1,
  occurred_at: time,
  task,
  series: null,
  project: null,
  tags: [],
};
export const edited = {
  kind: "TaskEdited",
  entity_version: 1,
  occurred_at: later,
  before: task,
  after: {
    ...task,
    title: "Ship the store",
    row_version: 2,
    updated_at: later,
  },
  series_before: null,
  series_after: null,
  project_before: null,
  project_after: null,
  tags_before: [],
  tags_after: [],
};

export function seedLegacy(path: string) {
  const db = new Database(path, { create: true });
  try {
    db.exec(
      readFileSync(new URL("fixtures/0001_init.sql", import.meta.url), "utf8"),
    );
    db.exec(
      readFileSync(new URL("fixtures/legacy.sql", import.meta.url), "utf8"),
    );
  } finally {
    db.close();
  }
}
