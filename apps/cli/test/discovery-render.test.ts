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
  expect(lookupOutput([row], "md", row.profile.id)).toBe(
    "Owner | owner's tasks | ab000000-0000-4000-8000-000000000001 | Read the report | No Project | todo show ab000000-0000-4000-8000-000000000001 --profile 'owner'\\''s tasks'\n",
  );
  expect(Object.keys(row)).toEqual(["profile", "task_id", "title", "project"]);
});

it("uses flag=value for Profile ids starting with a long-flag marker", () => {
  const row = Schema.decodeUnknownSync(LookupMatch)({
    profile: { id: "--owner's tasks", name: "Owner" },
    task_id: "ab000000-0000-4000-8000-000000000001",
    title: "Read",
    project: null,
  });
  for (const format of ["md", "table"] as const)
    expect(lookupOutput([row], format, row.profile.id)).toContain(
      "todo show ab000000-0000-4000-8000-000000000001 --profile='--owner'\\''s tasks'",
    );
});

it("carries the credential file used by discovery when it differs from the result Profile", () => {
  const row = Schema.decodeUnknownSync(LookupMatch)({
    profile: { id: "--dest", name: "Destination" },
    task_id: "ab000000-0000-4000-8000-000000000001",
    title: "Read",
    project: null,
  });
  for (const format of ["md", "table"] as const)
    expect(lookupOutput([row], format, "--source key")).toContain(
      "todo show ab000000-0000-4000-8000-000000000001 --profile=--dest --credential-profile='--source key'",
    );
});

it("puts every flag before the delimiter for a dash-leading full Task id", () => {
  const row = Schema.decodeUnknownSync(LookupMatch)({
    profile: { id: "work", name: "Work" },
    task_id: "-ab",
    title: "Dash",
    project: null,
  });
  for (const format of ["md", "table"] as const)
    expect(lookupOutput([row], format, "work")).toContain(
      "todo show --profile work -- -ab",
    );
});

it("quotes a colon and apostrophe and renders any dash-leading flag value inline", () => {
  const row = Schema.decodeUnknownSync(LookupMatch)({
    profile: { id: "Team: It's Work", name: "Work" },
    task_id: "ab",
    title: "Plain",
    project: null,
  });
  for (const format of ["md", "table"] as const)
    expect(lookupOutput([row], format, "-key")).toContain(
      "todo show ab --profile 'Team: It'\\''s Work' --credential-profile=-key",
    );
});

it("uses the shared shell spelling for a colon-only Profile id", () => {
  const row = Schema.decodeUnknownSync(LookupMatch)({
    profile: { id: "work:private", name: "Work" },
    task_id: "ab",
    title: "Plain",
    project: null,
  });
  expect(lookupOutput([row], "md", "work:private")).toBe(
    "Work | work:private | ab | Plain | No Project | todo show ab --profile work:private\n",
  );
});
