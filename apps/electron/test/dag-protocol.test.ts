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

it("selects typed lifecycle versions and refuses contradictory or malformed variants", () => {
  const jsonObject = Schema.Record(Schema.String, Schema.Json);
  const entries = Schema.decodeUnknownSync(Schema.Array(jsonObject))(
    JSON.parse(
      readFileSync(
        new URL(
          "../../macos/API/Fixtures/dag-operations.json",
          import.meta.url,
        ),
        "utf8",
      ),
    ),
  );
  const expected = {
    TaskCreated: {
      added: [{ profile_id: "dag", dependent_id: "T", blocker_id: "B00" }],
      removed: [],
      versions: [],
    },
    TaskDeleted: {
      added: [],
      removed: [
        { profile_id: "dag", dependent_id: "B", blocker_id: "A" },
        { profile_id: "dag", dependent_id: "C", blocker_id: "B" },
      ],
      versions: [
        {
          id: "C",
          from_version: 2,
          to_version: 3,
          updated_at: "2026-11-09T06:00:00Z",
        },
      ],
    },
    TaskMovedOut: {
      added: [],
      removed: [
        { profile_id: "dag", dependent_id: "B", blocker_id: "A" },
        { profile_id: "dag", dependent_id: "C", blocker_id: "B" },
      ],
      versions: [
        {
          id: "C",
          from_version: 2,
          to_version: 3,
          updated_at: "2026-11-09T06:00:00Z",
        },
      ],
    },
    TaskReverted: {
      added: [
        { profile_id: "dag", dependent_id: "B", blocker_id: "A" },
        { profile_id: "dag", dependent_id: "C", blocker_id: "B" },
      ],
      removed: [],
      versions: [
        {
          id: "C",
          from_version: 3,
          to_version: 4,
          updated_at: "2026-11-09T06:00:00Z",
        },
      ],
    },
  };
  const decode = (entry: typeof jsonObject.Type) =>
    Schema.decodeUnknownSync(ChangeEvent)({
      event: "operation",
      id: String(entry.seq),
      data: JSON.stringify(entry),
    });
  let checked = 0;
  for (const entry of entries) {
    const event = Schema.decodeUnknownSync(jsonObject)(entry.event);
    if (event.entity_version !== 2) continue;
    const frame = decode(entry);
    if (frame.event !== "operation") throw new Error("Expected operation");
    const actual = frame.data.event;
    if (
      (actual.kind !== "TaskCreated" &&
        actual.kind !== "TaskDeleted" &&
        actual.kind !== "TaskMovedOut" &&
        actual.kind !== "TaskReverted") ||
      actual.entity_version !== 2
    )
      throw new Error("Expected typed lifecycle v2");
    expect(actual.dependencies).toEqual(expected[actual.kind]);
    const { dependencies: _dependencies, ...legacy } = event;
    const legacyFrame = decode({
      ...entry,
      event: { ...legacy, entity_version: 1 },
    });
    expect(
      legacyFrame.event === "operation"
        ? legacyFrame.data.event.entity_version
        : null,
    ).toBe(1);
    for (const version of [3, "2", true, 2.5, null])
      expect(() =>
        decode({ ...entry, event: { ...event, entity_version: version } }),
      ).toThrow();
    const { entity_version: _version, ...missingVersion } = event;
    expect(() => decode({ ...entry, event: missingVersion })).toThrow();
    expect(() =>
      decode({ ...entry, event: { ...legacy, entity_version: 2 } }),
    ).toThrow();
    for (const dependencies of [
      null,
      [],
      "invalid",
      { added: [], removed: [] },
    ])
      expect(() =>
        decode({ ...entry, event: { ...event, dependencies } }),
      ).toThrow();
    expect(() =>
      decode({ ...entry, event: { ...event, entity_version: 1 } }),
    ).toThrow();
    expect(() =>
      decode({
        ...entry,
        event: { ...legacy, entity_version: 1, dependencies: null },
      }),
    ).toThrow();
    checked++;
  }
  expect(checked).toBe(4);
});
