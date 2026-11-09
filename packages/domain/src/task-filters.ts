import { Effect, Schema } from "effect";
import { type Project, type Tag, type Task, TaskPriority } from "./entities.ts";
import { graphEnergy } from "./graph-energy.ts";
import { dependencyState, indexGraph, type TaskGraph } from "./graph-model.ts";
import { topologicalOrder } from "./graph-order.ts";
import { inputLimits } from "./limits.ts";
import type { TaskRead } from "./task-read.ts";
import {
  matchTaskSearchSteps,
  parseTaskSearch,
  SearchTooBroad,
  type TaskSearchExecution,
  taskSearchExecution,
} from "./task-search.ts";
import { CalendarDate, type TaskTime } from "./time.ts";

const dateFilter = Schema.String.check(
  Schema.isPattern(/^(none|\d{4}-\d{2}-\d{2})$/u),
  Schema.makeFilter(
    (value) => value === "none" || Schema.is(CalendarDate)(value),
  ),
).annotate({
  description:
    "A valid ISO calendar date (YYYY-MM-DD) in the Task's stored time zone, or none for a missing date.",
});
export const TaskFilters = Schema.Struct({
  ready: Schema.optionalKey(
    Schema.Literal(true).annotate({
      description:
        "Only Ready Tasks. Use --blocked or --status for another set; false is invalid.",
    }),
  ),
  blocked: Schema.optionalKey(
    Schema.Literal(true).annotate({
      description:
        "Only Blocked Tasks. Use --status for terminal Tasks; false is invalid.",
    }),
  ),
  order: Schema.optionalKey(Schema.Literals(["topo", "lightest"])),
  text: Schema.optionalKey(
    Schema.String.check(Schema.isMaxLength(inputLimits.searchText)).annotate({
      description:
        "Search title and description with word prefixes, typo tolerance, quoted phrases and exclusions. Blank text returns empty search_matches.",
    }),
  ),
  prefix: Schema.optionalKey(
    Schema.String.check(
      Schema.isMinLength(1),
      Schema.isMaxLength(36),
      Schema.isPattern(/^[0-9A-Fa-f-]+$/u),
    ).annotate({
      description:
        "Case-insensitive literal Task id prefix. Hex digits and hyphens only.",
    }),
  ),
  project: Schema.optionalKey(Schema.String),
  tag: Schema.optionalKey(Schema.String),
  status: Schema.optionalKey(
    Schema.Literals(["open", "done", "cancelled", "snoozed", "closed"]),
  ),
  priority: Schema.optionalKey(TaskPriority),
  due: Schema.optionalKey(dateFilter),
  scheduled: Schema.optionalKey(dateFilter),
  attachment: Schema.optionalKey(Schema.String),
  energy: Schema.optionalKey(
    Schema.Literals(["1", "2", "3", "4", "5", "none"]),
  ),
  estimate: Schema.optionalKey(
    Schema.String.check(Schema.isPattern(/^(none|[1-9]\d*)$/u)),
  ),
});
export type TaskFilters = typeof TaskFilters.Type;

function matchesDate(value: TaskTime | null, filter: TaskFilters["due"]) {
  if (filter === undefined) return true;
  if (filter === "none") return value === null;
  if (value === null) return false;
  const date =
    value.kind === "date"
      ? value.date
      : new Intl.DateTimeFormat("en-CA", {
          timeZone: value.time_zone,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date(value.utc));
  return date === filter;
}

function* filterTaskRecordSteps(
  tasks: readonly Task[],
  filters: TaskFilters,
  definitions: { projects: readonly Project[]; tags: readonly Tag[] },
  execution: TaskSearchExecution = taskSearchExecution(),
  graph?: TaskGraph,
): Generator<void, TaskRead[]> {
  const search =
    filters.text === undefined ? undefined : parseTaskSearch(filters.text);
  const prefix = filters.prefix?.toLowerCase();
  const attachmentQuery = filters.attachment?.trim().toLowerCase();
  const index = indexGraph(graph ?? { tasks, edges: [] });
  const energy = graph ? graphEnergy(graph) : undefined;
  const members = new Set(tasks.map((task) => task.id));
  const ordered =
    graph && filters.order
      ? topologicalOrder(
          graph,
          filters.order === "lightest" ? energy?.values : undefined,
        ).flatMap((id) => {
          const task = index?.tasks.get(id);
          return task && members.has(id) ? [task] : [];
        })
      : tasks;
  const selected = ordered.filter(
    (task) =>
      (filters.ready === undefined ||
        (index && dependencyState(task, index).ready)) &&
      (filters.blocked === undefined ||
        (index && dependencyState(task, index).blocked)) &&
      (prefix === undefined || task.id.toLowerCase().startsWith(prefix)) &&
      (filters.project === undefined ||
        definitions.projects.some(
          (project) =>
            project.profile_id === task.profile_id &&
            project.id === task.project_id &&
            project.name === filters.project,
        )) &&
      (filters.tag === undefined ||
        definitions.tags.some(
          (tag) =>
            tag.profile_id === task.profile_id &&
            task.tags.includes(tag.id) &&
            tag.name.toLowerCase() === filters.tag?.trim().toLowerCase(),
        )) &&
      (filters.status === undefined ||
        (filters.status === "closed"
          ? task.status === "done" || task.status === "cancelled"
          : task.status === filters.status)) &&
      (filters.priority === undefined || task.priority === filters.priority) &&
      matchesDate(task.due_at, filters.due) &&
      matchesDate(task.scheduled_at, filters.scheduled) &&
      (filters.energy === undefined ||
        (filters.energy === "none"
          ? task.energy === null
          : task.energy === Number(filters.energy))) &&
      (filters.estimate === undefined ||
        (filters.estimate === "none"
          ? task.estimate_min === null
          : String(task.estimate_min) === filters.estimate)) &&
      (!attachmentQuery ||
        (task.attachments ?? []).some((attachment) =>
          [
            attachment.label,
            attachment.name,
            attachment.kind === "link" ? attachment.url : attachment.path,
          ].some((value) => value?.toLowerCase().includes(attachmentQuery)),
        )),
  );
  const records: TaskRead[] = [];
  for (const stored of selected) {
    const task = graph
      ? {
          ...stored,
          depends_on: index.upstream.get(stored.id) ?? [],
          blocks: index.downstream.get(stored.id) ?? [],
          ...dependencyState(stored, index),
          remaining_energy: energy?.values.get(stored.id) ?? {
            energy: 0,
            unweighted: 0,
          },
        }
      : stored;

    if (search === undefined) records.push(task);
    else {
      const result = yield* matchTaskSearchSteps(task, search, execution);
      if (result.accepted)
        records.push({ ...task, search_matches: result.matches });
    }
    yield;
  }
  execution.work.check();
  return records;
}

export function filterTaskRecords(
  ...args: Parameters<typeof filterTaskRecordSteps>
) {
  const steps = filterTaskRecordSteps(...args);
  let step = steps.next();
  while (!step.done) step = steps.next();
  return step.value;
}

export function runTaskRecordSteps<E = never>(
  steps: Generator<void, TaskRead[]>,
  checkpoint: Effect.Effect<void, E> = Effect.promise(
    () => new Promise<void>((resolve) => setImmediate(resolve)),
  ),
) {
  let completed = false;
  const next = () =>
    Effect.try({
      try: () => {
        try {
          const step = steps.next();
          completed = step.done === true;
          return step;
        } catch (error) {
          completed = true;
          throw error;
        }
      },
      catch: (error) => error,
    }).pipe(
      Effect.catch((error) =>
        error instanceof SearchTooBroad
          ? Effect.fail(error)
          : Effect.die(error),
      ),
    );
  return Effect.gen(function* () {
    let step = yield* next();
    while (!step.done) {
      yield* checkpoint;
      step = yield* next();
    }
    return step.value;
  }).pipe(
    Effect.ensuring(
      Effect.sync(() => {
        if (!completed) {
          completed = true;
          steps.return([]);
        }
      }),
    ),
  );
}

export function filterTaskRecordsEffect(
  ...args: Parameters<typeof filterTaskRecordSteps>
) {
  return Effect.suspend(() =>
    runTaskRecordSteps(filterTaskRecordSteps(...args)),
  );
}
