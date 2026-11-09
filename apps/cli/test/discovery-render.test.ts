import { expect, it } from "@effect/vitest";
import { LookupMatch } from "@todo/domain";
import { Schema } from "effect";
import { lookupOutput } from "../src/discovery.ts";

it("prints a shell-quoted full-id next command without adding JSON row fields", () => {
  const row = Schema.decodeUnknownSync(LookupMatch)({
    profile: { id: "owner's tasks", name: "Owner" },
    task_id: "ab000000-0000-4000-8000-000000000001",
    title: "Read the report",
    project: null,
  });
  expect(lookupOutput([row], "md")).toBe(
    "Owner | owner's tasks | ab000000-0000-4000-8000-000000000001 | Read the report | No Project | todo show ab000000-0000-4000-8000-000000000001 --profile 'owner'\\''s tasks'\n",
  );
  expect(Object.keys(row)).toEqual(["profile", "task_id", "title", "project"]);
});
