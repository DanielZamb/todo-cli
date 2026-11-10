import { Schema } from "effect";
import { Tag, Task } from "../src/entities.ts";
import { later, taskInput, time } from "./store-fixtures.ts";

export const linkTags = Schema.decodeUnknownSync(Schema.Array(Tag))([
  { id: "tag-a", profile_id: "work", name: "alpha" },
  { id: "tag-b", profile_id: "work", name: "beta" },
  { id: "tag-c", profile_id: "work", name: "gamma" },
  { id: "tag-d", profile_id: "work", name: "delta" },
]);
export const linkedTask = (
  id: string,
  tags: readonly string[] = ["tag-a", "tag-b", "tag-c"],
) =>
  Schema.decodeUnknownSync(Task)({
    ...taskInput,
    id,
    title: `Task ${id}`,
    tags,
  });
export const linkCreated = (task: Task) => ({
  kind: "TaskCreated",
  entity_version: 1,
  occurred_at: time,
  task,
  series: null,
  project: null,
  tags: linkTags.filter((tag) => task.tags.includes(tag.id)),
});
export const linkEdited = (
  before: Task,
  tags: readonly string[],
  title = "Edited Task",
) => {
  const after = Schema.decodeUnknownSync(Task)({
    ...before,
    tags,
    title,
    row_version: before.row_version + 1,
    updated_at: later,
  });
  return {
    kind: "TaskEdited",
    entity_version: 1,
    occurred_at: later,
    before,
    after,
    series_before: null,
    series_after: null,
    project_before: null,
    project_after: null,
    tags_before: linkTags.filter((tag) => before.tags.includes(tag.id)),
    tags_after: linkTags.filter((tag) => after.tags.includes(tag.id)),
  };
};
export const tagCases = [
  { name: "unchanged", tags: ["tag-a", "tag-b", "tag-c"] },
  { name: "reordered", tags: ["tag-c", "tag-a", "tag-b"] },
  { name: "add", tags: ["tag-a", "tag-b", "tag-c", "tag-d"] },
  { name: "remove", tags: ["tag-a", "tag-b"] },
  { name: "empty", tags: [] },
] satisfies readonly { name: string; tags: readonly string[] }[];
