import { Database } from "bun:sqlite";
import { Effect, Schema } from "effect";
import type { OperationStore } from "../../packages/domain/src/store/store.ts";
import {
  Task,
  Series,
  ProfileSummary,
  ProjectSummary,
  TagSummary,
  ProfileId,
} from "../../packages/domain/src/index.ts";
import { ClientProjection } from "../../packages/domain/src/store/client-projection.ts";
import {
  indexGraph,
  dependencyState,
} from "../../packages/domain/src/graph-model.ts";
import { graphEnergy } from "../../packages/domain/src/graph-energy.ts";
import {
  topologicalOrder,
  compareGraphTasks,
} from "../../packages/domain/src/graph-order.ts";
import { taskView } from "../../packages/domain/src/presentation.ts";
import { filterTasks } from "../../packages/domain/src/commands.ts";
import type { Replica } from "./model.ts";
export function database(store: object): Database {
  const db = Reflect.get(store, "db");
  if (!(db instanceof Database)) throw Error("missing database");
  return db;
}
export const sequence = (db: Database) =>
  db
    .query<{ seq: number }, []>("SELECT coalesce(max(seq),0) seq FROM op_log")
    .get()?.seq ?? 0;
export function baseline(
  store: OperationStore,
  profile: string,
  at: string,
  credentialId?: string,
): Replica {
  const db = database(store);
  return db
    .transaction(() => {
      if (credentialId)
        db.query("SELECT * FROM credentials WHERE id=?").get(credentialId);
      const p = Schema.decodeUnknownSync(ProfileId)(profile),
        graph = Effect.runSync(store.graph(p)),
        tasks = graph.tasks.filter((t) => t.deleted_at === null),
        index = indexGraph(graph),
        energy = graphEnergy(graph),
        generation =
          store.snapshots.generationSync().generation +
          "|purge:" +
          (db
            .query<{ seq: number }, []>(
              "SELECT coalesce(max(seq),0) seq FROM op_log WHERE outcome='committed' AND json_extract(event,'$.kind') IN ('TaskPurged','TaskHistoryRedacted')",
            )
            .get()?.seq ?? 0),
        seq = sequence(db);
      const projects = Schema.decodeUnknownSync(Schema.Array(ProjectSummary))(
        db
          .query(
            `SELECT p.*,count(t.id) open_task_count FROM projects p LEFT JOIN tasks t ON t.project_id=p.id AND t.profile_id=p.profile_id AND t.status='open' AND t.deleted_at IS NULL WHERE p.profile_id=? GROUP BY p.id ORDER BY p.id`,
          )
          .all(profile),
      );
      const tags = Schema.decodeUnknownSync(Schema.Array(TagSummary))(
        db
          .query(
            `SELECT g.*,count(t.id) open_task_count FROM tags g LEFT JOIN task_tags l ON l.tag_id=g.id LEFT JOIN tasks t ON t.id=l.task_id AND t.profile_id=g.profile_id AND t.status='open' AND t.deleted_at IS NULL WHERE g.profile_id=? GROUP BY g.id ORDER BY g.id`,
          )
          .all(profile),
      );
      const profiles = Schema.decodeUnknownSync(Schema.Array(ProfileSummary))(
        db
          .query(
            `SELECT p.*,count(t.id) visible_task_count,count(CASE WHEN t.status='open' THEN 1 END) open_task_count,count(CASE WHEN t.status='open' AND t.due_at IS NULL AND t.scheduled_at IS NULL THEN 1 END) inbox_task_count FROM profiles p LEFT JOIN tasks t ON t.profile_id=p.id AND t.deleted_at IS NULL WHERE p.id NOT IN (SELECT profile FROM profile_deletions) GROUP BY p.id ORDER BY p.id`,
          )
          .all(),
      );
      const series = Schema.decodeUnknownSync(Schema.Array(Series))(
        db
          .query<{ payload: string }, [string]>(
            "SELECT payload FROM series WHERE json_extract(payload,'$.profile_id')=? ORDER BY id",
          )
          .all(profile)
          .map((r) => JSON.parse(r.payload)),
      );
      const views = tasks
          .filter((t) => t.status === "open")
          .map((t) => taskView(t, projects, tags, series)),
        day = at.slice(0, 10),
        overdue = new Set(
          filterTasks(views, { overdue: true }, at).map((t) => t.id),
        );
      const ids = (predicate: (t: (typeof tasks)[number]) => boolean) =>
        tasks.filter(predicate).map((t) => t.id);
      return {
        profile,
        generation,
        cursor: generation + ":" + seq + ":" + day,
        profiles,
        projects,
        tags,
        series,
        rows: Object.fromEntries(tasks.map((t) => [t.id, t])),
        computed: Object.fromEntries(
          tasks.map((t) => [
            t.id,
            {
              ...dependencyState(t, index),
              depends_on: index.upstream.get(t.id) ?? [],
              blocks: index.downstream.get(t.id) ?? [],
              remaining_energy: energy.values.get(t.id) ?? {
                energy: 0,
                unweighted: 0,
              },
            },
          ]),
        ),
        lists: {
          default: [...tasks].sort(compareGraphTasks).map((t) => t.id),
          dependency: topologicalOrder(graph),
          lightest: topologicalOrder(graph, energy.values),
          inbox: ids(
            (t) =>
              t.status === "open" &&
              t.due_at === null &&
              t.scheduled_at === null,
          ),
          overdue: ids((t) => overdue.has(t.id)),
          today_overdue: ids((t) => overdue.has(t.id)),
          today_due: views
            .filter((t) => t.due_at?.slice(0, 10) === day)
            .map((t) => t.id),
          today_scheduled: views
            .filter((t) => t.scheduled_at?.slice(0, 10) === day)
            .map((t) => t.id),
          scheduled: ids((t) => t.status === "open" && t.scheduled_at !== null),
        },
      };
    })
    .deferred();
}
