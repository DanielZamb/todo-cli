import { expect, it } from "@effect/vitest";
import { Schema } from "effect";
import {
  restoreStreamState,
  StreamState,
  streamHeaders,
} from "../src/stream-cursor.ts";

it("resumes inactive Profiles at the persisted restore boundary", () => {
  const restored = restoreStreamState("work", {
    generation: "restored",
    seq: 6,
  });
  const saved = Schema.decodeUnknownSync(StreamState)(
    JSON.parse(JSON.stringify(restored)),
  );
  expect(streamHeaders(saved, "personal")).toEqual({
    "last-event-id": "6",
    "x-todo-generation": "restored",
  });
  expect(streamHeaders({ ...saved, cursors: { work: "8" } }, "work")).toEqual({
    "last-event-id": "8",
    "x-todo-generation": "restored",
  });
  expect(
    streamHeaders({ ...saved, cursors: { work: "8" } }, "personal"),
  ).toEqual({ "last-event-id": "6", "x-todo-generation": "restored" });
});

it("requests a generation reload for saved state without a restore boundary", () => {
  const legacy = Schema.decodeUnknownSync(StreamState)({
    cursors: { work: "999" },
    restoreGeneration: "old",
  });
  expect(streamHeaders(legacy, "personal")).toEqual({
    "last-event-id": "0",
    "x-todo-generation": "initial",
  });
  expect(streamHeaders({ cursors: {} }, "work")).toEqual({
    "last-event-id": "0",
    "x-todo-generation": "initial",
  });
});
