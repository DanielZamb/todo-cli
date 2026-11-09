import { Effect, Schema } from "effect";
import type { AccessRequest } from "./auth/model.ts";
import type { Profile } from "./entities.ts";
import { ProfileId } from "./ids.ts";
import { TaskIdPrefix } from "./limits.ts";
import type { OperationStore } from "./store/store.ts";

export const TaskLookupDetails = Schema.Struct({
  profile: Schema.Struct({ id: ProfileId, name: Schema.String }),
  task_id: Schema.String,
  recovery: Schema.String,
});
export const shellQuote = (value: string) =>
  /^[a-zA-Z0-9_./:-]+$/.test(value)
    ? value
    : `'${value.replaceAll("'", "'\\''")}'`;

export const shellFlag = (flag: string, value: string) =>
  `${flag}${value.startsWith("--") ? "=" : " "}${shellQuote(value)}`;

export const taskLookupError = Effect.fn(function* (
  store: OperationStore,
  request: AccessRequest,
  task_id: string,
  transport: "cli" | "http" = "cli",
) {
  const { profiles } = yield* store.auth.read(request);
  const profile = profiles.find((value) => value.id === request.profile);
  return authorizedTaskLookupError(profile, task_id, transport);
});

function authorizedTaskLookupError(
  profile: Pick<Profile, "id" | "name"> | undefined,
  task_id: string,
  transport: "cli" | "http" = "cli",
): { message: string; details?: typeof TaskLookupDetails.Type } {
  if (!profile) return { message: "Task not found" };
  const validPrefix = Schema.is(TaskIdPrefix)(task_id);
  const prefix = shellFlag("--prefix", validPrefix ? task_id : "<hex-prefix>");
  const routes =
    transport === "http"
      ? ` HTTP: GET /profiles/${encodeURIComponent(profile.id)}/tasks?prefix=${validPrefix ? encodeURIComponent(task_id) : "<hex-prefix>"} or GET /tasks/lookup?prefix=${validPrefix ? encodeURIComponent(task_id) : "<hex-prefix>"}.`
      : "";
  const recovery = `Run todo list ${shellFlag("--profile", profile.id)} ${prefix} for this Profile, or todo lookup ${prefix} across Profiles this credential can access.${routes} Mutations need the full Task id and an explicit Profile.`;
  return {
    message: `Task not found in Profile ${profile.name} (${profile.id}). ${recovery}`,
    details: {
      profile: { id: profile.id, name: profile.name },
      task_id,
      recovery,
    },
  };
}
