import {
  ProfileResolutionError,
  type ResolveProfileRequest,
} from "@todo/domain";
import { CommandError } from "@todo/domain/commands";
import type { OperationStore } from "@todo/domain/store";
import { Effect } from "effect";

export const resolveProfile = (
  store: OperationStore,
  request: ResolveProfileRequest,
  message = "Profile not found; run todo init --profile <name>",
) =>
  store.auth
    .resolveProfile(request)
    .pipe(
      Effect.mapError((error) =>
        error instanceof ProfileResolutionError
          ? new CommandError(3, "not_found", message)
          : error,
      ),
    );
