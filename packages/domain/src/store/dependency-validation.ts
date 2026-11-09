import type { Database } from "bun:sqlite";
import { Schema } from "effect";
import { type DependencyError, emptyDependencies } from "../dependencies.ts";
import {
  checkDependencyAddition,
  checkDependencyStatuses,
} from "../dependency-rules.ts";
import { Task } from "../entities.ts";
import type { Event } from "../events.ts";
import type { ProfileId, TaskId } from "../ids.ts";
import {
  edgeKey,
  hasDependents,
  incidentEdges,
  upstream,
} from "./dependencies.ts";
import { changes, readTasks } from "./projection.ts";

export class DependencyRefusal extends Error {
  constructor(
    readonly reason: string,
    readonly witness?: DependencyError,
  ) {
    super(reason);
  }
}
export function validateDependencies(
  db: Database,
  event: Event,
  profile: ProfileId,
) {
  const resolved = changes(event, profile);
  const delta = resolved.dependencies ?? emptyDependencies();
  const fail = (reason = "validation"): never => {
    throw new DependencyRefusal(reason);
  };
  if (
    !db
      .query(
        "SELECT 1 FROM profiles WHERE id=? AND id NOT IN (SELECT profile FROM profile_deletions)",
      )
      .get(profile)
  )
    fail("profile_mismatch");
  const ids = new Set([
    ...resolved.tasks.flatMap((change) => {
      const task = change.after ?? change.before;
      return task ? [task.id] : [];
    }),
    ...delta.versions.map((version) => version.id),
    ...delta.added.flatMap((edge) => [edge.dependent_id, edge.blocker_id]),
  ]);
  for (const change of resolved.tasks) {
    if (
      !change.before ||
      !change.after ||
      change.after.deleted_at !== null ||
      (change.after.status !== "open" && change.after.status !== "snoozed")
    )
      continue;
    for (const row of db
      .query<{ dependent_id: string }, [string, string]>(
        "SELECT dependent_id FROM task_dependencies JOIN tasks ON tasks.id=dependent_id WHERE task_dependencies.profile_id=? AND blocker_id=? AND tasks.status='done' AND tasks.deleted_at IS NULL",
      )
      .all(profile, change.before.id))
      ids.add(Schema.decodeUnknownSync(Task.fields.id)(row.dependent_id));
  }
  const load = (id: TaskId) => {
    const row = db
      .query<{ payload: string }, [string]>(
        "SELECT payload FROM tasks WHERE id=?",
      )
      .get(id);
    return row ? Schema.decodeUnknownSync(Task)(JSON.parse(row.payload)) : null;
  };
  const initial =
    event.kind === "TaskReverted"
      ? readTasks(db).filter((task) => task.profile_id === profile)
      : [...ids].flatMap((id) => {
          const task = load(id);
          return task ? [task] : [];
        });
  for (const task of initial)
    if (
      task.status === "done" ||
      resolved.tasks.some(
        (change) =>
          change.after?.id === task.id && change.after.status === "done",
      )
    )
      for (const id of upstream(db, profile, task.id)) ids.add(id);
  const current = new Map(
    [
      ...initial,
      ...[...ids].flatMap((id) => {
        const task = load(id);
        return task ? [task] : [];
      }),
    ].map((task) => [task.id, task]),
  );
  const proposed = new Map(current);
  const primaryIds = new Set<TaskId>();
  for (const change of resolved.tasks) {
    const task = change.after ?? change.before;
    if (!task) continue;
    primaryIds.add(task.id);
    if (change.after) proposed.set(task.id, change.after);
    else proposed.delete(task.id);
  }
  const removed = new Set(delta.removed.map(edgeKey));
  const added = new Set(delta.added.map(edgeKey));
  if (
    removed.size !== delta.removed.length ||
    added.size !== delta.added.length ||
    [...removed].some((key) => added.has(key))
  )
    fail();
  const affected = new Set<TaskId>();
  for (const [edges, removing] of [
    [delta.removed, true],
    [delta.added, false],
  ] as const) {
    for (const edge of edges) {
      if (edge.profile_id !== profile) fail("dependency_profile_mismatch");
      const exists =
        db
          .query(
            "SELECT 1 FROM task_dependencies WHERE profile_id=? AND dependent_id=? AND blocker_id=?",
          )
          .get(profile, edge.dependent_id, edge.blocker_id) !== null;
      if (removing !== exists) fail("conflict");
      affected.add(edge.dependent_id);
    }
  }
  const versions = new Set<TaskId>();
  for (const version of delta.versions) {
    const task = current.get(version.id);
    if (
      versions.has(version.id) ||
      primaryIds.has(version.id) ||
      !affected.has(version.id)
    )
      fail();
    if (
      !task ||
      task.profile_id !== profile ||
      task.deleted_at !== null ||
      task.row_version !== version.from_version
    )
      fail("conflict");
    const durable = db
      .query<{ version: number }, [string]>(
        "SELECT version FROM task_versions WHERE id=?",
      )
      .get(version.id)?.version;
    if (
      durable !== version.from_version ||
      version.to_version !== version.from_version + 1 ||
      version.updated_at !== event.occurred_at
    )
      fail();
    versions.add(version.id);
  }
  for (const id of affected)
    if (!primaryIds.has(id) && !versions.has(id)) fail();
  for (const id of primaryIds) {
    const after = proposed.get(id);
    if (after && after.deleted_at === null) continue;
    for (const edge of incidentEdges(db, profile, id))
      if (!removed.has(edgeKey(edge))) fail();
  }
  if (event.kind === "TaskDeleted" || event.kind === "TaskMovedOut") {
    const task = event.kind === "TaskDeleted" ? event.before : event.task;
    if (
      delta.added.length ||
      delta.removed.some(
        (edge) => edge.dependent_id !== task.id && edge.blocker_id !== task.id,
      )
    )
      fail();
  } else if (event.kind === "TaskCreated") {
    if (
      delta.removed.length ||
      delta.versions.length ||
      delta.added.some((edge) => edge.dependent_id !== event.task.id)
    )
      fail();
  } else if (
    event.kind !== "TaskReverted" &&
    event.kind !== "DependencyAdded" &&
    event.kind !== "DependencyRemoved" &&
    (delta.added.length || delta.removed.length || delta.versions.length)
  )
    fail();
  const accepted = new Map<string, (typeof delta.added)[number]>();
  const traversal = {
    upstream: (id: TaskId) =>
      [
        ...upstream(db, profile, id).filter(
          (blocker_id) =>
            !removed.has(
              edgeKey({ profile_id: profile, dependent_id: id, blocker_id }),
            ),
        ),
        ...[...accepted.values()]
          .filter((edge) => edge.dependent_id === id)
          .map((edge) => edge.blocker_id),
      ].sort(),
    hasDependents: (id: TaskId) =>
      hasDependents(db, profile, id) ||
      [...accepted.values()].some((edge) => edge.blocker_id === id),
  };
  for (const edge of delta.added) {
    const witness = checkDependencyAddition({
      edge,
      tasks: proposed,
      traversal,
      occurred_at: event.occurred_at,
    });
    if (witness) throw new DependencyRefusal(witness.code, witness);
    accepted.set(edgeKey(edge), edge);
  }
  const witness = checkDependencyStatuses({
    tasks: proposed,
    before: current,
    upstream: traversal.upstream,
    occurred_at: event.occurred_at,
  });
  if (witness) throw new DependencyRefusal(witness.code, witness);
}
