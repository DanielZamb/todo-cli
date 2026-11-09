import { ExitStatus, TaskLookupDetails } from "@todo/domain";
import { Schema } from "effect";
import type { Reply } from "./protocol.ts";

export function exitDetail(error: unknown): string | undefined {
  const status = Schema.decodeUnknownExit(ExitStatus)(error);
  return status._tag === "Success"
    ? `error ${status.value.exit_code} - ${status.value.exit_meaning}`
    : undefined;
}

const Message = Schema.Struct({ message: Schema.String });
export function errorReply(error: unknown): Extract<Reply, { _tag: "error" }> {
  const message = Schema.decodeUnknownExit(Message)(error);
  const details = Schema.decodeUnknownExit(
    Schema.Struct({ details: TaskLookupDetails }),
  )(error);
  if (details._tag === "Success")
    return {
      _tag: "error",
      message: `Task not found in ${details.value.details.profile.name}.`,
      details: details.value.details,
    };
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
