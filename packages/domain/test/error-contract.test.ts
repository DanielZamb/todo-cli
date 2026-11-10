import { expect, it } from "@effect/vitest";
import { Schema } from "effect";
import {
  ErrorResponse,
  renderError,
  renderExport,
  renderList,
  renderReview,
} from "../src/presentation.ts";
import { shellFlag } from "../src/task-lookup-error.ts";

it("maps actual exit codes independently of error names and rejects mismatched meanings", () => {
  for (const [exit, meaning] of [
    [1, "runtime failure"],
    [2, "validation or usage"],
    [3, "not found or auth missing"],
    [4, "Conflict"],
  ] as const) {
    const result = JSON.parse(
      renderError(
        exit,
        "future_code",
        "failed",
        "json",
        "2030-01-01T00:00:00Z",
      ),
    );
    expect(result).toEqual({
      generated_at: "2030-01-01T00:00:00Z",
      code: "future_code",
      message: "failed",
      exit_code: exit,
      exit_meaning: meaning,
    });
    expect(
      Schema.is(ErrorResponse)({ ...result, exit_meaning: "success" }),
    ).toBe(false);
    expect(
      renderError(exit, "future_code", "failed", "md", "2030-01-01T00:00:00Z"),
    ).toContain(`error ${exit} - ${meaning}`);
  }
});
it("requires list tasks without changing empty export or review JSON", () => {
  expect(JSON.parse(renderList([], "json", "2030-01-01T00:00:00Z"))).toEqual({
    generated_at: "2030-01-01T00:00:00Z",
    tasks: [],
  });
  expect(
    JSON.parse(
      renderExport([], "json", "2030-01-01T00:00:00Z", "all", "default"),
    ),
  ).toEqual({
    generated_at: "2030-01-01T00:00:00Z",
    filters: { scope: "all", template: "default" },
  });
  expect(
    JSON.parse(renderReview([], "daily", "json", "2030-01-01T00:00:00Z")),
  ).toEqual({
    generated_at: "2030-01-01T00:00:00Z",
    filters: { review: "daily" },
  });
});

it("quotes recovery flags and preserves dash-leading values as flag values", () => {
  expect(shellFlag("--prefix", "--")).toBe("--prefix=--");
  expect(shellFlag("--prefix", "-a")).toBe("--prefix=-a");
  expect(shellFlag("--profile", "work:private")).toBe("--profile work:private");
  expect(shellFlag("--profile", "Team: It's Work")).toBe(
    "--profile 'Team: It'\\''s Work'",
  );
  expect(shellFlag("--profile", "owner's tasks")).toBe(
    "--profile 'owner'\\''s tasks'",
  );
});

it("keeps old Dependency rejection History readable while new errors require an exit pair", async () => {
  const { DependencyError } = await import("../src/dependencies.ts");
  const { TaskAttemptRejected } = await import("../src/events.ts");
  const witness = {
    generated_at: "2030-01-01T00:00:00Z",
    code: "dependency_cycle",
    message: "Remove a Dependency in this loop, then try again.",
    details: { dependent_id: "B", blocker_id: "A", path: ["A", "B", "A"] },
  };
  expect(Schema.is(DependencyError)(witness)).toBe(false);
  const event = Schema.decodeUnknownSync(TaskAttemptRejected)({
    kind: "TaskAttemptRejected",
    entity_version: 1,
    occurred_at: "2030-01-01T00:00:00Z",
    attempted_kind: "DependencyAdded",
    task_id: "B",
    violations: [],
    details: { witness, truncated: false, total: 2 },
  });
  expect(event.kind).toBe("TaskAttemptRejected");
  if (event.kind !== "TaskAttemptRejected") throw new Error("wrong event");
  expect(event.details?.witness).toEqual({
    ...witness,
    exit_code: 2,
    exit_meaning: "validation or usage",
  });
  expect(
    Schema.is(DependencyError)({
      ...witness,
      exit_code: 2,
      exit_meaning: "validation or usage",
    }),
  ).toBe(true);
  expect(
    Schema.is(DependencyError)({
      ...witness,
      exit_code: 2,
      exit_meaning: "success",
    }),
  ).toBe(false);
});
