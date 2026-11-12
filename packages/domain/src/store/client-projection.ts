import type { Database } from "bun:sqlite";
import { Schema } from "effect";
import { ProfileSummary, ProjectSummary, TagSummary } from "../client-reads.ts";
import { type Profile, Project, Tag, Task } from "../entities.ts";
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

  readonly profiles = (profiles: readonly Profile[]) => {
    const counts = this.db
      .query(`SELECT visible.value AS id,
      count(t.id) AS visible_task_count,
      count(CASE WHEN t.status='open' THEN 1 END) AS open_task_count,
      count(CASE WHEN t.status='open' AND t.due_at IS NULL AND t.scheduled_at IS NULL THEN 1 END) AS inbox_task_count
      FROM json_each(?) visible LEFT JOIN tasks t ON t.profile_id=visible.value AND t.deleted_at IS NULL
      GROUP BY visible.value`)
      .all(JSON.stringify(profiles.map((profile) => profile.id)));
    const Count = Schema.Struct({
      id: ProfileSummary.fields.id,
      visible_task_count: ProfileSummary.fields.visible_task_count,
      open_task_count: ProfileSummary.fields.open_task_count,
      inbox_task_count: ProfileSummary.fields.inbox_task_count,
    });
    const rows = Schema.decodeUnknownSync(Schema.Array(Count))(counts);
    return Schema.decodeUnknownSync(Schema.Array(ProfileSummary))(
      profiles.map((profile) => ({
        ...profile,
        ...rows.find((row) => row.id === profile.id),
      })),
    );
  };

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
