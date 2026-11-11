import { expect, it } from "@effect/vitest";
import { DiagnosticEvent } from "../src/client-diagnostics.ts";
import {
  diagnosticCategoryLabels,
  diagnosticEventLabels,
  diagnosticInputLabels,
  diagnosticModeLabels,
  diagnosticSubtypeLabels,
  interactionCategories,
} from "../src/interaction-categories.ts";

it("provides plain display text for every category, subtype and event", () => {
  for (const category of interactionCategories) {
    expect(diagnosticCategoryLabels[category.id].trim().length).toBeGreaterThan(
      0,
    );
    for (const subtype of category.subtypes)
      expect(diagnosticSubtypeLabels[subtype].trim().length).toBeGreaterThan(0);
  }
  for (const event of DiagnosticEvent.members)
    expect(
      diagnosticEventLabels[event.fields.name.literal].trim().length,
    ).toBeGreaterThan(0);
  for (const label of [
    ...Object.values(diagnosticCategoryLabels),
    ...Object.values(diagnosticSubtypeLabels),
    ...Object.values(diagnosticEventLabels),
    ...Object.values(diagnosticModeLabels),
    ...Object.values(diagnosticInputLabels),
  ]) {
    expect(label).not.toMatch(/\b[IC]\d{2}\b|[a-z]\.[a-z]|[a-z][A-Z]|_/u);
  }
  expect(diagnosticSubtypeLabels["task.selection.pointer"]).toBe(
    "Select a Task",
  );
  expect(diagnosticSubtypeLabels.openInspector).toBe("Open a Task");
  expect(diagnosticSubtypeLabels.editDescription).toBe(
    "Type in the description",
  );
  expect(diagnosticSubtypeLabels.complete).toBe("Complete a Task");
  expect(diagnosticModeLabels).toMatchObject({
    full: "full window",
    compact: "Compact",
  });
  expect(diagnosticEventLabels["ui.layout.committed"]).toBe("Layout committed");
});
