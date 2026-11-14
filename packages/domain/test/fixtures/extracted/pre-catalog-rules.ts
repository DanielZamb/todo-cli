// The rules as they were at 9a372e86, copied verbatim, so the extracted
// functions in catalog-order.ts and tag-name.ts can be compared with them.
import type { Task } from "../../../src/entities.ts";

type Ordered = Pick<Task, "priority" | "due_at" | "created_at" | "id">;

// commands.ts readTasks
export const readTasksComparator = (a: Ordered, b: Ordered) =>
  a.priority.localeCompare(b.priority) ||
  (a.due_at === null
    ? ""
    : a.due_at.kind === "date"
      ? a.due_at.date
      : a.due_at.utc
  ).localeCompare(
    b.due_at === null
      ? ""
      : b.due_at.kind === "date"
        ? b.due_at.date
        : b.due_at.utc,
  ) ||
  a.created_at.localeCompare(b.created_at) ||
  a.id.localeCompare(b.id);

// commands.ts metadata (create, edit, Move and Copy resolution)
export const metadataTagNames = (tag: readonly string[]) =>
  [
    ...new Set(
      tag
        .flatMap((t) => t.split(","))
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean),
    ),
  ].sort();

// commands.ts checkSubmittedNames: the value each part is measured as
export const submittedNameParts = (value: string) =>
  value.split(",").map((name) => name.trim().toLowerCase());

// import-tasks.ts
export const importTagNames = (names: readonly string[]) =>
  names
    .flatMap((name) => name.split(","))
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean);

// limits.ts TagNameInput: the length each part is measured at
export const limitPartLength = (part: string) =>
  part.trim().toLowerCase().length;

// task-filters.ts filterTaskRecordSteps
export const filterTagMatches = (stored: string, query: string) =>
  stored.toLowerCase() === query.trim().toLowerCase();

// commands.ts filterTasks (Move, Copy and export scopes): the query side
export const legacyFilterQuery = (query: string) => query.trim().toLowerCase();
