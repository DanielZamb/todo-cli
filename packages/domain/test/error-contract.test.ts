import { expect, it } from "@effect/vitest";
import { Schema } from "effect";
import {
  ErrorResponse,
  renderError,
  renderExport,
  renderList,
  renderReview,
} from "../src/presentation.ts";

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
