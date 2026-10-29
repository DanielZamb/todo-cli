import { expect, it } from "@effect/vitest";
import {
  snapshotProfileName,
  snapshotReason,
  snapshotTaskCount,
} from "../src/snapshot-presentation.ts";

it("shows human Snapshot reasons while preserving Profile and file names", () => {
  expect(
    [
      "manual",
      "daily",
      "pre-restore",
      "pre-migration",
      "pre-purge",
      "before Profile delete personal",
      "before import Tasks.csv",
      "before a planning session",
    ].map(snapshotReason),
  ).toEqual([
    "Manual",
    "Daily",
    "Before restore",
    "Before update",
    "Before Purge",
    'Before deleting Profile "Personal"',
    "Before import of Tasks.csv",
    "Before a planning session",
  ]);
  expect([0, 1, 2].map(snapshotTaskCount)).toEqual([
    "0 Tasks",
    "1 Task",
    "2 Tasks",
  ]);
  expect(["work", "Personal", "own-work"].map(snapshotProfileName)).toEqual([
    "Work",
    "Personal",
    "Own-work",
  ]);
});
