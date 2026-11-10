import { ExitStatus, TaskLookupDetails } from "@todo/domain";
import { Schema } from "effect";
import { HttpClientError } from "effect/http";
import {
  dependencyBatchFailure,
  dependencyRecovery,
  hasDependencyError,
  nestedDependencyError,
} from "./dependency-presentation.ts";
import type { Reply, Request } from "./protocol.ts";

const dependencyRequests = new Set<Request["_tag"]>([
  "depend",
  "undepend",
  "batchDepend",
  "graph",
  "dependencyCandidates",
  "delete",
]);
export const isDependencyRequest = (request: Request | undefined) =>
  request !== undefined && dependencyRequests.has(request._tag);
const dependencyCodeByTag = new Map([
  ["BadRequest", "invalid_args"],
  ["InvalidTask", "invalid_args"],
  ["Forbidden", "forbidden"],
  ["Unauthorized", "auth_required"],
  ["NotFound", "not_found"],
  ["InternalError", "runtime"],
  ["Conflict", "conflict"],
]);

export function exitDetail(error: unknown): string | undefined {
  const status = Schema.decodeUnknownExit(ExitStatus)(error);
  return status._tag === "Success"
    ? `error ${status.value.exit_code} - ${status.value.exit_meaning}`
    : undefined;
}

export function taskLookupDetails(
  error: unknown,
): typeof TaskLookupDetails.Type | null {
  const parsed = Schema.decodeUnknownExit(
    Schema.Struct({ details: TaskLookupDetails }),
  )(error);
  return parsed._tag === "Success" ? parsed.value.details : null;
}

const Message = Schema.Struct({ message: Schema.String });
export function errorReply(
  error: unknown,
  request?: Request,
): Extract<Reply, { _tag: "error" }> {
  if (Schema.isSchemaError(error))
    return {
      _tag: "error",
      message: isDependencyRequest(request)
        ? "Todo returned an incompatible Dependency response. Reload after updating the server."
        : "Todo returned an incompatible response. Reload after updating the server.",
    };
  const dependency = nestedDependencyError(error);
  if (dependency)
    return {
      _tag: "error",
      message: dependencyRecovery(dependency, "add").message,
      dependency,
      exit_detail: `error ${dependency.exit_code} - ${dependency.exit_meaning}`,
    };
  if (hasDependencyError(error))
    return {
      _tag: "error",
      message:
        "Todo returned an incompatible Dependency response. Reload after updating the server.",
    };
  const message = Schema.decodeUnknownExit(Message)(error);
  const details = taskLookupDetails(error);
  if (details) {
    const detail = exitDetail(error);
    if (isDependencyRequest(request) && !detail)
      return {
        _tag: "error",
        message:
          "Todo returned an incompatible Dependency response. Reload after updating the server.",
      };
    return {
      _tag: "error",
      message: `Task not found in ${details.profile.name}.`,
      details,
      ...(isDependencyRequest(request) && detail
        ? { exit_detail: detail }
        : {}),
    };
  }
  if (isDependencyRequest(request)) {
    if (
      HttpClientError.isHttpClientError(error) &&
      (error.reason._tag === "DecodeError" ||
        error.reason._tag === "StatusCodeError" ||
        error.reason._tag === "EmptyBodyError")
    )
      return {
        _tag: "error",
        message:
          "Todo returned an incompatible Dependency response. Reload after updating the server.",
      };
    const identity = Schema.decodeUnknownExit(
      Schema.Struct({
        _tag: Schema.optionalKey(Schema.String),
        code: Schema.optionalKey(Schema.String),
      }),
    )(error);
    const code =
      identity._tag === "Success"
        ? (identity.value.code ??
          dependencyCodeByTag.get(identity.value._tag ?? ""))
        : undefined;
    const status = Schema.decodeUnknownExit(ExitStatus)(error);
    if (status._tag === "Failure")
      return {
        _tag: "error",
        message: code
          ? "Todo returned an incompatible Dependency response. Reload after updating the server."
          : "Couldn't update Dependencies. Try again.",
      };
    return {
      _tag: "error",
      ...dependencyBatchFailure({ code: code ?? "runtime", ...status.value }),
    };
  }
  return {
    _tag: "error",
    message: [
      message._tag === "Success"
        ? message.value.message
        : "Could not reach the Todo server. Your draft is saved. Retry when connected.",
      exitDetail(error),
    ]
      .filter(Boolean)
      .join("\n"),
  };
}
