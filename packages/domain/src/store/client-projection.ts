import type { Database } from "bun:sqlite";
import { Schema } from "effect";
import { ProfileSummary, ProjectSummary, TagSummary } from "../client-reads.ts";
import { Project, Tag, Task } from "../entities.ts";
import type { ProfileId } from "../ids.ts";

export class ClientProjection {
  constructor(private readonly db: Database) {}

  readonly metadata = (profile: ProfileId) => ({
    projects: Schema.decodeUnknownSync(Schema.Array(Project))(
      this.db
        .query("SELECT * FROM projects WHERE profile_id=? ORDER BY id")
        .all(profile),
    ),
    tags: Schema.decodeUnknownSync(Schema.Array(Tag))(
      this.db
        .query("SELECT * FROM tags WHERE profile_id=? ORDER BY id")
        .all(profile),
    ),
  });

  readonly tasks = (profile: ProfileId) =>
    this.db
      .query<{ payload: string }, [string]>(
        "SELECT payload FROM tasks WHERE profile_id=? ORDER BY id",
      )
      .all(profile)
      .map((row) => Schema.decodeUnknownSync(Task)(JSON.parse(row.payload)));

  readonly catalog = (profile: ProfileId) => ({
    ...this.metadata(profile),
    tasks: this.tasks(profile),
  });

  readonly profiles = (profile: ProfileId | null) =>
    Schema.decodeUnknownSync(Schema.Array(ProfileSummary))(
      this.db
        .query(`SELECT p.*,
        count(t.id) AS visible_task_count,
        count(CASE WHEN t.status='open' THEN 1 END) AS open_task_count,
        count(CASE WHEN t.status='open' AND t.due_at IS NULL AND t.scheduled_at IS NULL THEN 1 END) AS inbox_task_count
        FROM profiles p LEFT JOIN tasks t ON t.profile_id=p.id AND t.deleted_at IS NULL
        WHERE p.id NOT IN (SELECT profile FROM profile_deletions) AND (? IS NULL OR p.id=?)
        GROUP BY p.id ORDER BY p.id`)
        .all(profile, profile),
    );

  readonly projects = (profile: ProfileId) =>
    Schema.decodeUnknownSync(Schema.Array(ProjectSummary))(
      this.db
        .query(`SELECT p.*,count(t.id) AS open_task_count FROM projects p
        LEFT JOIN tasks t ON t.profile_id=p.profile_id AND t.project_id=p.id AND t.status='open' AND t.deleted_at IS NULL
        WHERE p.profile_id=? GROUP BY p.id ORDER BY p.id`)
        .all(profile),
    );

  readonly tags = (profile: ProfileId) =>
    Schema.decodeUnknownSync(Schema.Array(TagSummary))(
      this.db
        .query(`SELECT g.*,count(t.id) AS open_task_count FROM tags g
        LEFT JOIN task_tags l ON l.tag_id=g.id
        LEFT JOIN tasks t ON t.id=l.task_id AND t.profile_id=g.profile_id AND t.status='open' AND t.deleted_at IS NULL
        WHERE g.profile_id=? GROUP BY g.id ORDER BY g.id`)
        .all(profile),
    );
}
