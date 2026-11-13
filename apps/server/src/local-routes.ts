import { BadRequest, TodoApi } from "@todo/api";
import { executeBackendCommand } from "@todo/domain/backend-command";
import type { OperationStore } from "@todo/domain/store";
import { Effect } from "effect";
import { HttpApiBuilder } from "effect/http-api";
import type { databaseEndpoint } from "./database-endpoint.ts";
import type { OutsideCommit } from "./outside-commit.ts";

export const localRoutes = (
  store: OperationStore,
  endpoint: ReturnType<typeof databaseEndpoint>,
  outside: OutsideCommit,
) =>
  HttpApiBuilder.group(TodoApi, "local", (handlers) =>
    handlers.handleAll({
      databaseProof: ({ payload }) =>
        Effect.gen(function* () {
          const proof = endpoint?.proof(payload.nonce);
          if (!proof)
            return yield* new BadRequest({
              message: "Server database binding unavailable",
            });
          return proof;
        }),
      nudge: ({ headers }) =>
        Effect.gen(function* () {
          if (
            !endpoint?.authorize(
              headers["x-todo-incarnation"],
              headers["x-todo-proof"],
              "nudge",
            )
          )
            return yield* new BadRequest({ message: "Local proof required" });
          outside.notify();
          return null;
        }),
      runCommand: ({ payload, headers }) =>
        Effect.gen(function* () {
          if (
            !endpoint?.authorize(
              headers["x-todo-incarnation"],
              headers["x-todo-proof"],
              "command",
            )
          )
            return yield* new BadRequest({ message: "Local proof required" });
          const authorization = headers.authorization ?? "";
          const credential = authorization.startsWith("Bearer ")
            ? authorization.slice(7)
            : "";
          return yield* executeBackendCommand(store, credential, payload);
        }),
    }),
  );
