// The Catalog's reads from the projection: everything it needs to count,
// order and group a Profile's Tasks comes from stored columns, without
// decoding a Task. Only the Tasks a reply returns are decoded.
import type { Database } from "bun:sqlite";
import { Schema } from "effect";
import { type AuthorizedRead, readAuthority } from "../auth/authorized-read.ts";
import { Edge } from "../dependencies.ts";
import { diagnosticSync } from "../diagnostic-context.ts";
import { Task, TaskPriority, TaskStatus } from "../entities.ts";
import { ProjectId, TagId, TaskId } from "../ids.ts";
import { Instant, TaskTime } from "../time.ts";

const StoredTime = Schema.NullOr(Schema.fromJsonString(TaskTime));
export const CatalogRow = Schema.Struct({
  id: TaskId,
  status: TaskStatus,
  priority: TaskPriority,
  created_at: Instant,
  project_id: Schema.NullOr(ProjectId),
  energy: Schema.NullOr(Schema.Int),
  due_at: StoredTime,
  scheduled_at: StoredTime,
});
export type CatalogRow = typeof CatalogRow.Type;
const TagLink = Schema.Struct({ task_id: TaskId, tag_id: TagId });

export class CatalogProjection {
  constructor(private readonly db: Database) {}

  /** Every visible Task's ordering, membership and graph columns, its Tag links, and the Profile's Dependency edges. */
  readonly rows = (read: AuthorizedRead) => {
    const profile = readAuthority(read, "read", this.db).profile;
    return diagnosticSync(
      "database",
      () => ({
        rows: Schema.decodeUnknownSync(Schema.Array(CatalogRow))(
          this.db
            .query(
              "SELECT id,status,priority,created_at,project_id,energy,due_at,scheduled_at FROM tasks WHERE profile_id=? AND deleted_at IS NULL",
            )
            .all(profile),
        ),
        links: Schema.decodeUnknownSync(Schema.Array(TagLink))(
          this.db
            .query(
              "SELECT l.task_id,l.tag_id FROM task_tags l JOIN tasks t ON t.id=l.task_id WHERE t.profile_id=? AND t.deleted_at IS NULL",
            )
            .all(profile),
        ),
        // The statement store.graph uses for the same Profile's edges.
        edges: Schema.decodeUnknownSync(Schema.Array(Edge))(
          this.db
            .query(
              "SELECT * FROM task_dependencies WHERE profile_id=? ORDER BY profile_id,dependent_id,blocker_id",
            )
            .all(profile),
        ),
      }),
      { statement: "store.projection" },
    );
  };

  /** The payload text of the visible Tasks with these ids; every visible Task when ids is null. */
  readonly payloads = (read: AuthorizedRead, ids: readonly TaskId[] | null) => {
    const profile = readAuthority(read, "read", this.db).profile;
    return diagnosticSync(
      "database",
      () =>
        ids === null
          ? this.db
              .query<{ id: TaskId; payload: string }, [string]>(
                "SELECT id,payload FROM tasks WHERE profile_id=? AND deleted_at IS NULL",
              )
              .all(profile)
          : this.db
              .query<{ id: TaskId; payload: string }, [string, string]>(
                "SELECT id,payload FROM tasks WHERE profile_id=? AND deleted_at IS NULL AND id IN (SELECT value FROM json_each(?))",
              )
              .all(profile, JSON.stringify(ids)),
      { statement: "store.read" },
    );
  };

  /** The database's schema version (PRAGMA user_version), changed only by a migration. */
  readonly schemaVersion = (read: AuthorizedRead) => {
    readAuthority(read, "read", this.db);
    return (
      this.db.query<{ user_version: number }, []>("PRAGMA user_version").get()
        ?.user_version ?? 0
    );
  };

  /**
   * Whether any operation was committed after `seq`. Global on purpose: the
   * Catalog lists every Profile's counts, so another Profile's change is a
   * change. Rejected attempts change nothing and are not counted.
   */
  readonly committedSince = (read: AuthorizedRead, seq: number) => {
    readAuthority(read, "read", this.db);
    return (
      this.db
        .query<{ found: number }, [number]>(
          "SELECT EXISTS(SELECT 1 FROM op_log WHERE seq>? AND outcome='committed') AS found",
        )
        .get(seq)?.found === 1
    );
  };
}

/** Owned payload text to Tasks, outside any lease. */
export const decodeCatalogTasks = (
  rows: readonly { readonly payload: string }[],
) =>
  diagnosticSync("task_materialization", () =>
    rows.map((row) => Schema.decodeUnknownSync(Task)(JSON.parse(row.payload))),
  );
