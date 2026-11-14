// The Catalog's reads from the projection: everything it needs to count,
// order and group a Profile's Tasks comes from stored columns, without
// decoding a Task. Only the Tasks a reply returns are decoded.
import type { Database } from "bun:sqlite";
import { Schema } from "effect";
import { type AuthorizedRead, readAuthority } from "../auth/authorized-read.ts";
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
  due_at: StoredTime,
  scheduled_at: StoredTime,
});
export type CatalogRow = typeof CatalogRow.Type;
const TagLink = Schema.Struct({ task_id: TaskId, tag_id: TagId });

export class CatalogProjection {
  constructor(private readonly db: Database) {}

  /** Every visible Task's ordering and membership columns, its Tag links, and whether any Dependency exists. */
  readonly rows = (read: AuthorizedRead) => {
    const profile = readAuthority(read, "read", this.db).profile;
    return diagnosticSync(
      "database",
      () => ({
        rows: Schema.decodeUnknownSync(Schema.Array(CatalogRow))(
          this.db
            .query(
              "SELECT id,status,priority,created_at,project_id,due_at,scheduled_at FROM tasks WHERE profile_id=? AND deleted_at IS NULL",
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
        dependencies:
          this.db
            .query<{ found: number }, [string]>(
              "SELECT EXISTS(SELECT 1 FROM task_dependencies WHERE profile_id=?) AS found",
            )
            .get(profile)?.found === 1,
      }),
      { statement: "store.projection" },
    );
  };

  /** The visible Tasks with these ids, decoded; every visible Task when ids is null. */
  readonly tasks = (read: AuthorizedRead, ids: readonly TaskId[] | null) => {
    const profile = readAuthority(read, "read", this.db).profile;
    const rows = diagnosticSync(
      "database",
      () =>
        ids === null
          ? this.db
              .query<{ payload: string }, [string]>(
                "SELECT payload FROM tasks WHERE profile_id=? AND deleted_at IS NULL",
              )
              .all(profile)
          : this.db
              .query<{ payload: string }, [string, string]>(
                "SELECT payload FROM tasks WHERE profile_id=? AND deleted_at IS NULL AND id IN (SELECT value FROM json_each(?))",
              )
              .all(profile, JSON.stringify(ids)),
      { statement: "store.read" },
    );
    return diagnosticSync("task_materialization", () =>
      rows.map((row) =>
        Schema.decodeUnknownSync(Task)(JSON.parse(row.payload)),
      ),
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
