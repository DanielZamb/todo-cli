import { ExitStatus, TaskLookupDetails } from "@todo/domain";
import { Schema } from "effect";
import type { Reply } from "./protocol.ts";

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
export function errorReply(error: unknown): Extract<Reply, { _tag: "error" }> {
  const message = Schema.decodeUnknownExit(Message)(error);
  const details = taskLookupDetails(error);
  if (details)
    return {
      _tag: "error",
      message: `Task not found in ${details.profile.name}.`,
      details,
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
