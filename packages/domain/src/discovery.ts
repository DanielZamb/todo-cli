import { Effect, Schema } from "effect";
import { ProfileSummary } from "./client-reads.ts";
import { Profile } from "./entities.ts";
import { TaskId } from "./ids.ts";
import type { OperationStore } from "./store/store.ts";
import { filterTaskRecords, TaskFilters } from "./task-filters.ts";

export const LookupQuery = Schema.Struct({
  prefix: TaskFilters.fields.prefix.schema,
});
export const DirectoryQuery = Schema.Struct({
  include_projects: Schema.optionalKey(Schema.Literals(["true", "false"])),
});
export const LookupMatch = Schema.Struct({
  profile: Schema.Struct({ id: Profile.fields.id, name: Profile.fields.name }),
  task_id: TaskId,
  title: Schema.String,
  project: Schema.NullOr(Schema.String),
});
export const LookupResponse = Schema.Struct({
  generated_at: Schema.String,
  prefix: LookupQuery.fields.prefix,
  matches: Schema.Array(LookupMatch),
});
export const ProfileListResponse = Schema.Struct({
  generated_at: Schema.String,
  profiles: Schema.Array(ProfileSummary),
});

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const byName = (
  a: { name: string; id: string },
  b: { name: string; id: string },
) => compare(a.name, b.name) || compare(a.id, b.id);

export class Discovery {
  constructor(private readonly store: OperationStore) {}

  readonly directory = (credential: string) =>
    this.store.auth.readSnapshot((auth) =>
      Effect.gen(function* () {
        const profiles = yield* auth.profileSummaries({ credential });
        const directory = yield* Effect.forEach(
          [...profiles].sort(byName),
          (profile) =>
            auth.metadata({ credential, profile: profile.id }).pipe(
              Effect.map((data) => ({
                ...profile,
                projects: data.projects
                  .map(({ id, name }) => ({ id, name }))
                  .sort(byName),
              })),
            ),
        );
        yield* auth.profiles({ credential });
        return directory;
      }),
    );

  readonly lookup = (credential: string, input: typeof LookupQuery.Type) =>
    this.store.auth.readSnapshot((auth) =>
      Effect.gen(function* () {
        const { prefix } = input;
        const profiles = yield* auth.profiles({ credential });
        const groups = yield* Effect.forEach(
          [...profiles].sort(byName),
          (profile) =>
            auth.catalog({ credential, profile: profile.id }).pipe(
              Effect.map((data) =>
                filterTaskRecords(
                  data.tasks.filter((task) => task.deleted_at === null),
                  { prefix },
                  data,
                )
                  .sort((a, b) => compare(a.id, b.id))
                  .map((task) => ({
                    profile: { id: profile.id, name: profile.name },
                    task_id: task.id,
                    title: task.title,
                    project:
                      data.projects.find(
                        (project) => project.id === task.project_id,
                      )?.name ?? null,
                  })),
              ),
            ),
        );
        yield* auth.profiles({ credential });
        return groups.flat();
      }),
    );
}
