import { readFileSync } from "node:fs";
import { expect, it } from "@effect/vitest";
import { ChangeEvent } from "@todo/api";
import { Schema } from "effect";
import { historyLabel } from "../src/history.ts";
import { Reply } from "../src/protocol.ts";

it("decodes existing and DAG operations through the production SSE and IPC schemas", () => {
  const operations: unknown = JSON.parse(
    readFileSync(
      new URL("../../macos/API/Fixtures/dag-operations.json", import.meta.url),
      "utf8",
    ),
  );
  const reply = Schema.decodeUnknownSync(Reply)({
    _tag: "history",
    entries: operations,
  });
  if (reply._tag !== "history") throw new Error("Expected History reply");
  expect(reply.entries.map(historyLabel)).toEqual([
    "Access changed",
    "Dependency added",
    "Created",
    "Deleted",
    "Moved",
    "Reverted",
  ]);
  const received = reply.entries.map((entry) =>
    Schema.decodeUnknownSync(ChangeEvent)({
      event: "operation",
      id: String(entry.seq),
      data: JSON.stringify(entry),
    }),
  );
  expect(
    received.map((frame) =>
      frame.event === "operation" ? [frame.id, frame.data.event.kind] : null,
    ),
  ).toEqual([
    ["40", "AuthChanged"],
    ["41", "DependencyAdded"],
    ["15", "TaskCreated"],
    ["6", "TaskDeleted"],
    ["6", "TaskMovedOut"],
    ["7", "TaskReverted"],
  ]);
});
