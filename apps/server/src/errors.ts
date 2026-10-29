import {
  Forbidden,
  InternalError,
  ProfileNotFound,
  Unauthorized,
} from "@todo/api";
import type { AuthError } from "@todo/domain";
import { Effect, Schema } from "effect";

const authError = (error: AuthError) =>
  error.detail === "profile_deleted"
    ? Schema.decodeUnknownSync(ProfileNotFound)({
        generated_at: new Date().toISOString(),
        code: "not_found",
        message: "Profile not found; choose a Profile from GET /profiles",
      })
    : error.detail === "profile_scope" ||
        error.detail === "write_scope" ||
        error.detail === "owner_required"
      ? new Forbidden({ message: error.detail })
      : new Unauthorized({ message: error.detail });

export const translate = <A, R>(
  effect: Effect.Effect<A, AuthError | { readonly _tag: "StoreError" }, R>,
) =>
  effect.pipe(
    Effect.catchTag("AuthError", (error) => Effect.fail(authError(error))),
    Effect.catchTag("StoreError", () =>
      Effect.fail(new InternalError({ message: "Storage operation failed" })),
    ),
  );
