import { Schema, Struct } from "effect";
import type { AuthAttemptRejected } from "../events.ts";
import { ProfileId } from "../ids.ts";
import { FinishTask, StartSeries } from "../recurrence.ts";
import { Instant } from "../time.ts";

export class AuthError extends Error {
  readonly _tag = "AuthError";
  readonly code = "auth";
  constructor(
    readonly detail: AuthAttemptRejected["detail"],
    readonly actor = "anonymous",
  ) {
    super("Authentication or authorization failed");
  }
}

export const AccessScope = Schema.Literals(["read-only", "read-write"]);
export type AccessScope = typeof AccessScope.Type;
export const CredentialInfo = Schema.Struct({
  id: Schema.NonEmptyString,
  kind: Schema.Literals(["session", "token"]),
  name: Schema.NullOr(Schema.NonEmptyString),
  profile: Schema.NullOr(ProfileId),
  scope: AccessScope,
  created_at: Instant,
  expires_at: Instant,
  revoked_at: Schema.NullOr(Instant),
});
export type CredentialInfo = typeof CredentialInfo.Type;
export const OwnerRequest = Schema.Struct({ credential: Schema.String });
export const AccessRequest = Schema.Struct({
  ...OwnerRequest.fields,
  profile: ProfileId,
});
export type AccessRequest = typeof AccessRequest.Type;
export const TokenOptions = Schema.Struct({
  name: Schema.NonEmptyString,
  profile: Schema.NullOr(ProfileId),
  scope: AccessScope,
  expires_at: Schema.optional(Instant),
});
export type TokenOptions = typeof TokenOptions.Type;

export const StartSeriesRequest = Schema.Struct({
  ...Struct.omit(StartSeries.fields, ["actor", "occurred_at"]),
  ...OwnerRequest.fields,
});
export type StartSeriesRequest = typeof StartSeriesRequest.Type;

export const FinishTaskRequest = Schema.Struct({
  ...Struct.omit(FinishTask.fields, ["actor", "occurred_at"]),
  ...OwnerRequest.fields,
});
export type FinishTaskRequest = typeof FinishTaskRequest.Type;
