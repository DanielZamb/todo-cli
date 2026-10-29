import type { ChangeEvent } from "@todo/api";
import { Schema } from "effect";

export const StreamState = Schema.Struct({
  cursors: Schema.Record(Schema.String, Schema.String),
  restoreGeneration: Schema.optionalKey(Schema.String),
  restoreCursor: Schema.optionalKey(Schema.String),
});
export const streamHeaders = (
  state: typeof StreamState.Type,
  profile: string,
) => ({
  "last-event-id": state.cursors[profile] ?? state.restoreCursor ?? "0",
  "x-todo-generation":
    state.restoreCursor === undefined
      ? "initial"
      : (state.restoreGeneration ?? "initial"),
});
export const restoreStreamState = (
  profile: string,
  reload: Extract<typeof ChangeEvent.Type, { event: "reload" }>["data"],
): typeof StreamState.Type => ({
  restoreGeneration: reload.generation,
  restoreCursor: String(reload.seq),
  cursors: { [profile]: String(reload.seq) },
});
