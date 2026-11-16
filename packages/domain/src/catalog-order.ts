// The one Task order and the one name order every read and client shares.
import type { Task } from "./entities.ts";

export type UndatedDuePlacement = "first" | "last";
/**
 * Where a Task without a due date sorts inside its priority. The owner chose
 * "last" on 2026-11-13 (Q8, ADR-0009); "first" was the order `todo list` and
 * `export` had before.
 */
export const undatedDuePlacement: UndatedDuePlacement = "last";

type OrderedTask = Pick<Task, "priority" | "due_at" | "created_at" | "id">;

const units = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const dueKey = (task: OrderedTask) =>
  task.due_at === null
    ? null
    : task.due_at.kind === "date"
      ? task.due_at.date
      : task.due_at.utc;

/** Priority, due date (a date, or an instant's UTC text), created_at, id; all by code units. */
export const taskOrder =
  (undated: UndatedDuePlacement) => (a: OrderedTask, b: OrderedTask) => {
    const left = dueKey(a);
    const right = dueKey(b);
    const due =
      left === right
        ? 0
        : left === null
          ? undated === "first"
            ? -1
            : 1
          : right === null
            ? undated === "first"
              ? 1
              : -1
            : units(left, right);
    return (
      units(a.priority, b.priority) ||
      due ||
      units(a.created_at, b.created_at) ||
      units(a.id, b.id)
    );
  };

export const compareTasks = taskOrder(undatedDuePlacement);

const nameCollator = new Intl.Collator("und", {
  usage: "sort",
  sensitivity: "accent",
  numeric: true,
});

/**
 * Profiles, Projects and Tags: the root collation (case-insensitive,
 * accent-sensitive, digit runs as numbers), then the name and then the id by
 * code units, so equal names still sort the same way everywhere.
 */
export const compareNames = (
  a: { readonly name: string; readonly id: string },
  b: { readonly name: string; readonly id: string },
) =>
  nameCollator.compare(a.name, b.name) ||
  units(a.name, b.name) ||
  units(a.id, b.id);
