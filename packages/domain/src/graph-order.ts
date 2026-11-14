import type { Task } from "./entities.ts";
import { indexGraph, type TaskGraph } from "./graph-model.ts";
import type { TaskId } from "./ids.ts";

const dueKey = (task: Task) =>
  task.due_at === null
    ? null
    : task.due_at.kind === "date"
      ? task.due_at.date
      : task.due_at.utc;
export function compareGraphTasks(a: Task, b: Task) {
  const aDue = dueKey(a);
  const bDue = dueKey(b);
  return (
    a.priority.localeCompare(b.priority) ||
    (aDue === null
      ? bDue === null
        ? 0
        : 1
      : bDue === null
        ? -1
        : aDue.localeCompare(bDue)) ||
    a.created_at.localeCompare(b.created_at) ||
    a.id.localeCompare(b.id)
  );
}

class TaskHeap {
  private readonly values: Task[] = [];
  constructor(private readonly compare: (a: Task, b: Task) => number) {}
  push(task: Task) {
    let index = this.values.length;
    this.values.push(task);
    while (index > 0) {
      const parentIndex = (index - 1) >>> 1;
      const parent = this.values[parentIndex];
      if (!parent || this.compare(parent, task) <= 0) break;
      this.values[index] = parent;
      index = parentIndex;
    }
    this.values[index] = task;
  }
  pop(): Task | undefined {
    const first = this.values[0];
    const last = this.values.pop();
    if (!first || !last || this.values.length === 0) return first;
    let index = 0;
    for (;;) {
      const leftIndex = index * 2 + 1;
      const left = this.values[leftIndex];
      if (!left) break;
      const right = this.values[leftIndex + 1];
      const childIndex =
        right && this.compare(right, left) < 0 ? leftIndex + 1 : leftIndex;
      const child = this.values[childIndex];
      if (!child || this.compare(last, child) <= 0) break;
      this.values[index] = child;
      index = childIndex;
    }
    this.values[index] = last;
    return first;
  }
}

export function topologicalOrder(
  graph: TaskGraph,
  remaining?: ReadonlyMap<TaskId, { readonly energy: number }>,
): TaskId[] {
  const index = indexGraph(graph);
  const degrees = new Map(
    [...index.upstream].map(([id, blockers]) => [id, blockers.length]),
  );
  const heap = new TaskHeap(
    (a, b) =>
      (remaining
        ? (remaining.get(a.id)?.energy ?? 0) -
          (remaining.get(b.id)?.energy ?? 0)
        : 0) || compareGraphTasks(a, b),
  );
  for (const task of index.tasks.values())
    if (degrees.get(task.id) === 0) heap.push(task);
  const result: TaskId[] = [];
  for (let task = heap.pop(); task; task = heap.pop()) {
    result.push(task.id);
    for (const dependent of index.downstream.get(task.id) ?? []) {
      const degree = (degrees.get(dependent) ?? 0) - 1;
      degrees.set(dependent, degree);
      const next = index.tasks.get(dependent);
      if (degree === 0 && next) heap.push(next);
    }
  }
  return result;
}
