import { Schema } from "effect";
import { Profile } from "./entities.ts";
import { Instant } from "./time.ts";

export const DeleteProfile = Schema.Struct({
  with_tasks: Schema.Boolean,
  dry_run: Schema.Boolean,
});
export type DeleteProfile = typeof DeleteProfile.Type;
export const ProfileDeletionReport = Schema.Struct({
  generated_at: Instant,
  profile: Profile,
  dry_run: Schema.Boolean,
  tasks_affected: Schema.Int,
  sessions_revoked: Schema.Literal(0),
  access_tokens_revoked: Schema.Int,
});
export type ProfileDeletionReport = typeof ProfileDeletionReport.Type;
export const ProfileDeletionRefusal = Schema.Struct({
  generated_at: Instant,
  code: Schema.Literals(["not_found", "last_profile", "profile_not_empty"]),
  message: Schema.String,
  details: Schema.Struct({ visible_task_count: Schema.Int }),
});
export type ProfileDeletionRefusal = typeof ProfileDeletionRefusal.Type;
export type ProfileDeletionResult =
  | { readonly outcome: "deleted"; readonly report: ProfileDeletionReport }
  | { readonly outcome: "refused"; readonly error: ProfileDeletionRefusal };
