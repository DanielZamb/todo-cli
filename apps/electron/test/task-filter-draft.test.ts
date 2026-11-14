import { expect, it } from "@effect/vitest";
import {
  applyTaskFilterDraft,
  taskFilterDraft,
} from "../src/task-filter-draft.ts";

it("round-trips true-or-absent graph filters through the production draft boundary", () => {
  const filters = {
    ready: true,
    blocked: true,
    order: "lightest",
    text: '"pay rent"',
    prefix: "aB-",
    project: "Client Project",
    tag: "deep focus",
    status: "closed",
    priority: "P1",
    due: "none",
    scheduled: "2026-11-09",
    attachment: "Design docs",
    energy: "none",
    estimate: "45",
  } as const;
  const draft = taskFilterDraft(filters);
  expect(
    applyTaskFilterDraft(draft, { due: "none", scheduled: "2026-11-09" }),
  ).toEqual(filters);
  expect(
    applyTaskFilterDraft(
      { ...draft, readiness: {} },
      { due: "none", scheduled: "2026-11-09" },
    ),
  ).toEqual({ ...filters, ready: undefined, blocked: undefined });
  expect(applyTaskFilterDraft(taskFilterDraft({}), {})).toEqual({});
  const cleared = applyTaskFilterDraft({ ...draft, readiness: {} }, {});
  expect(Object.hasOwn(cleared, "ready")).toBe(false);
  expect(Object.hasOwn(cleared, "blocked")).toBe(false);
  expect(draft.readiness).toEqual({ ready: true, blocked: true });
  expect(() => taskFilterDraft({ ready: false })).toThrow();
  expect(() => taskFilterDraft({ blocked: false })).toThrow();
  expect(() =>
    applyTaskFilterDraft({ ...draft, readiness: { ready: false } }, {}),
  ).toThrow();
  expect(() =>
    applyTaskFilterDraft({ ...draft, readiness: { blocked: false } }, {}),
  ).toThrow();
  expect(
    applyTaskFilterDraft(
      { ...draft, fields: { ...draft.fields, attachment: "" } },
      {},
    ).attachment,
  ).toBeUndefined();
});
