// The Catalog query (CONTEXT.md: Catalog): one checked read lease gathers the
// Profile's rows, counts and lists; filtering, search and grouping run after
// it, as TaskCommands.list does, because search yields between steps.
import { Clock, Effect, Schema } from "effect";
import type { AccessRequest, AuthError } from "./auth/model.ts";
import {
  type CatalogChanged,
  type CatalogGroupName,
  CatalogQuery,
  type CatalogReply,
  type CatalogTask,
} from "./catalog-contract.ts";
import { compareNames, compareTasks } from "./catalog-order.ts";
import {
  checkTimeZone,
  type PlanningMembership,
  planningDay,
  planningMembership,
  type UnknownTimeZone,
} from "./planning-day.ts";
import type { CatalogRow } from "./store/catalog-projection.ts";
import type { StoreError } from "./store/error.ts";
import type { OperationStore } from "./store/store.ts";
import {
  filterTaskRecords,
  filterTaskRecordsEffect,
  type TaskFilters,
} from "./task-filters.ts";
import type { TaskRead } from "./task-read.ts";
import { type SearchTooBroad, taskSearchExecution } from "./task-search.ts";
import { CalendarDate, Instant } from "./time.ts";

/** known_generation, known_seq and known_day go together. Exit 2, invalid_args. */
export class CatalogUsageError extends Error {
  readonly _tag = "CatalogUsageError";
  readonly code = "invalid_args";
}
/** The Profile was never created. Exit 3, not_found. Decided after the lease, so nothing is recorded. */
export class CatalogProfileMissing extends Error {
  readonly _tag = "CatalogProfileMissing";
  readonly code = "not_found";
  constructor(readonly profile: string) {
    super("Profile not found; choose a Profile from GET /profiles");
  }
}

const CatalogFields = Schema.Struct({ query: CatalogQuery });
const unresolved = (status: CatalogRow["status"]) =>
  status === "open" || status === "snoozed";

const viewMember = (
  view: NonNullable<CatalogQuery["view"]>,
  member: PlanningMembership,
) =>
  view === "all"
    ? true
    : view === "today"
      ? member.today
      : view === "overdue"
        ? member.overdue
        : view === "scheduled"
          ? member.scheduled
          : member.inbox;

/** Each Task once: Overdue, then Due today, then Scheduled today. */
const groupOf = (
  view: NonNullable<CatalogQuery["view"]>,
  task: TaskRead,
  member: PlanningMembership,
): CatalogGroupName =>
  view === "all"
    ? task.priority
    : view === "today"
      ? member.overdue
        ? "Overdue"
        : member.dueToday
          ? "Due today"
          : "Scheduled today"
      : view === "overdue"
        ? "Overdue"
        : view === "scheduled"
          ? "Scheduled"
          : "Inbox";

const groupNames = (
  view: NonNullable<CatalogQuery["view"]>,
): readonly CatalogGroupName[] =>
  view === "all"
    ? ["P1", "P2", "P3", "P4"]
    : view === "today"
      ? ["Overdue", "Due today", "Scheduled today"]
      : view === "overdue"
        ? ["Overdue"]
        : view === "scheduled"
          ? ["Scheduled"]
          : ["Inbox"];

const taskFilters = (query: CatalogQuery): TaskFilters => {
  const {
    view: _view,
    tasks: _tasks,
    project_id: _project,
    tag_id: _tag,
    now: _now,
    time_zone: _zone,
    known_generation: _generation,
    known_seq: _seq,
    known_day: _day,
    ...filters
  } = query;
  return filters;
};

export type CatalogError =
  | AuthError
  | StoreError
  | SearchTooBroad
  | UnknownTimeZone
  | CatalogUsageError
  | CatalogProfileMissing;
const calendarDate = Schema.decodeUnknownSync(CalendarDate);

export class CatalogReads {
  constructor(private readonly store: OperationStore) {}

  read(
    request: AccessRequest,
    query: CatalogQuery = {},
  ): Effect.Effect<CatalogReply, CatalogError> {
    return Effect.suspend((): Effect.Effect<CatalogReply, CatalogError> => {
      const unknownZone = checkTimeZone(query.time_zone);
      if (unknownZone) return Effect.fail(unknownZone);
      const known = [query.known_generation, query.known_seq, query.known_day];
      if (
        known.some((value) => value === undefined) &&
        known.some((value) => value !== undefined)
      )
        return Effect.fail(
          new CatalogUsageError(
            "known_generation, known_seq and known_day go together; send all three from an earlier reply, or none.",
          ),
        );
      const selected = Object.freeze({
        credential: request.credential,
        profile: request.profile,
      });
      const search = this.store.searchWords.read(selected.profile);
      return Effect.gen({ self: this }, function* () {
        const clock = Schema.decodeUnknownSync(Instant)(
          new Date(yield* Clock.currentTimeMillis).toISOString(),
        );
        const lease = yield* this.store.auth.withMetadata(
          selected,
          CatalogFields,
          { query: { ...query } },
          (read, metadata) =>
            Effect.gen({ self: this }, function* () {
              const authority = yield* this.store.auth.checkRead(read, "read");
              const fields = authority.fields.query;
              const position = read.position;
              if (position === null)
                return yield* Effect.die(
                  new Error("A Profile read lease carries its position"),
                );
              const now = fields.now ?? clock;
              const day = planningDay(now, fields.time_zone);
              if (
                fields.known_generation === position.generation &&
                fields.known_day === day.today &&
                fields.known_seq !== undefined &&
                fields.known_seq <= position.seq &&
                !(yield* this.store.committedSince(read, fields.known_seq))
              )
                return { kind: "unchanged" as const, position, day };
              const profiles = yield* this.store.auth.profileSummaries({
                credential: authority.credential,
              });
              const projects = yield* this.store.auth.projects(selected);
              const tags = yield* this.store.auth.tags(selected);
              const light = yield* this.store.catalogRows(read);
              const graphNeeded =
                light.dependencies ||
                fields.ready !== undefined ||
                fields.blocked !== undefined ||
                fields.order !== undefined;
              const view = fields.view ?? "all";
              const members = new Map(
                light.rows.map((row) => [row.id, planningMembership(row, day)]),
              );
              const tagged =
                fields.tag_id === undefined
                  ? null
                  : new Set(
                      light.links
                        .filter((link) => link.tag_id === fields.tag_id)
                        .map((link) => link.task_id),
                    );
              const candidates = new Set(
                light.rows
                  .filter(
                    (row) =>
                      (fields.project_id === undefined ||
                        row.project_id === fields.project_id) &&
                      (tagged === null || tagged.has(row.id)),
                  )
                  .flatMap((row) => {
                    const member = members.get(row.id);
                    return member && viewMember(view, member) ? [row.id] : [];
                  }),
              );
              const graph = graphNeeded
                ? yield* this.store.graphRead(read)
                : null;
              const tasks =
                graph?.tasks.filter((task) => task.deleted_at === null) ??
                (yield* this.store.catalogTasks(
                  read,
                  fields.tasks === "matching" ? [...candidates] : null,
                ));
              return {
                kind: "changed" as const,
                position,
                day,
                now,
                fields,
                view,
                profiles,
                projects,
                tags,
                metadata,
                light,
                members,
                candidates,
                graph,
                tasks,
              };
            }),
          (absent) =>
            Effect.succeed({
              kind: "absent" as const,
              profile: absent.requested,
            }),
        );
        if (lease.kind === "absent")
          return yield* Effect.fail(new CatalogProfileMissing(lease.profile));
        if (lease.kind === "unchanged")
          return {
            unchanged: true,
            position: lease.position,
            day: calendarDate(lease.day.today),
          } satisfies CatalogReply;
        const { fields, view, metadata, graph, members } = lease;
        const filters = taskFilters(fields);
        const sorted = [...lease.tasks].sort(compareTasks);
        const candidates = sorted.filter((task) =>
          lease.candidates.has(task.id),
        );
        const matching = yield* filters.text === undefined
          ? Effect.sync(() =>
              filterTaskRecords(
                candidates,
                filters,
                metadata,
                undefined,
                graph ?? undefined,
              ),
            )
          : filterTaskRecordsEffect(
              candidates,
              filters,
              metadata,
              {
                ...taskSearchExecution(),
                prepare: (text) => this.store.searchWords.words(search, text),
              },
              graph ?? undefined,
            );
        const statuses = new Map(
          lease.light.rows.map((row) => [row.id, row.status]),
        );
        const tagNames = new Map(
          metadata.tags.map((tag) => [tag.id, tag.name]),
        );
        const present = (task: TaskRead): CatalogTask => ({
          ...task,
          tags: [...task.tags].sort((a, b) =>
            compareNames(
              { id: a, name: tagNames.get(a) ?? a },
              { id: b, name: tagNames.get(b) ?? b },
            ),
          ),
          ...(task.depends_on === undefined
            ? {}
            : {
                open_blocker_count: task.depends_on.filter((id) => {
                  const status = statuses.get(id);
                  return status !== undefined && unresolved(status);
                }).length,
              }),
        });
        const ordered =
          view === "all" && filters.order !== undefined
            ? [
                {
                  name:
                    filters.order === "topo"
                      ? ("Dependency order" as const)
                      : ("Lightest first" as const),
                  task_ids: matching.map((task) => task.id),
                },
              ]
            : groupNames(view).map((name) => ({
                name,
                task_ids: [...matching]
                  .sort(compareTasks)
                  .filter((task) => {
                    const member = members.get(task.id);
                    return (
                      member !== undefined &&
                      groupOf(view, task, member) === name
                    );
                  })
                  .map((task) => task.id),
              }));
        const matched = new Map(matching.map((task) => [task.id, task]));
        const rows =
          fields.tasks === "matching"
            ? ordered.flatMap((group) =>
                group.task_ids.flatMap((id) => {
                  const task = matched.get(id);
                  return task ? [present(task)] : [];
                }),
              )
            : filterTaskRecords(
                sorted,
                {},
                metadata,
                undefined,
                graph ?? undefined,
              ).map((task) => present(matched.get(task.id) ?? task));
        const counted = [...members.values()];
        const count = (key: keyof PlanningMembership) =>
          counted.filter((member) => member[key]).length;
        return {
          unchanged: false,
          position: lease.position,
          day: calendarDate(lease.day.today),
          now: lease.now,
          profiles: lease.profiles,
          projects: lease.projects,
          tags: lease.tags,
          counts: {
            all: count("open"),
            today: count("today"),
            overdue: count("overdue"),
            scheduled: count("scheduled"),
            inbox: count("inbox"),
          },
          view: { name: view, groups: ordered },
          tasks: rows,
        } satisfies CatalogChanged;
      });
    });
  }
}
