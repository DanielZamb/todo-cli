import { expect, it } from "@effect/vitest";
import { DiagnosticEvent } from "../src/client-diagnostics.ts";
import {
  diagnosticCategoryLabels,
  diagnosticEventLabels,
  diagnosticInputLabels,
  diagnosticModeLabels,
  diagnosticRefreshTriggerLabels,
  diagnosticSubtypeLabels,
  interactionCategories,
} from "../src/interaction-categories.ts";

it("provides plain display text for every category, subtype, event and refresh trigger", () => {
  for (const category of interactionCategories) {
    expect(diagnosticCategoryLabels[category.id].trim().length).toBeGreaterThan(
      0,
    );
    for (const subtype of category.subtypes)
      expect(diagnosticSubtypeLabels[subtype].trim().length).toBeGreaterThan(0);
  }
  for (const event of DiagnosticEvent.members) {
    expect(
      diagnosticEventLabels[event.fields.name.literal].trim().length,
    ).toBeGreaterThan(0);
    if ("trigger" in event.fields)
      for (const trigger of event.fields.trigger.literals)
        expect(
          diagnosticRefreshTriggerLabels[trigger].trim().length,
        ).toBeGreaterThan(0);
  }
  for (const label of [
    ...Object.values(diagnosticCategoryLabels),
    ...Object.values(diagnosticSubtypeLabels),
    ...Object.values(diagnosticEventLabels),
    ...Object.values(diagnosticModeLabels),
    ...Object.values(diagnosticInputLabels),
    ...Object.values(diagnosticRefreshTriggerLabels),
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
  expect(diagnosticRefreshTriggerLabels).toEqual({
    startup: "App started",
    profileSwitch: "Profile switched",
    viewChange: "View changed",
    filterChange: "Filter changed",
    search: "Search",
    ownWrite: "Own change",
    streamOperation: "Change from the server",
    streamReady: "Connection ready",
    reconnect: "Reconnected",
    manual: "Manual",
    dayChange: "Day changed",
    clockChange: "Clock or time zone changed",
    wake: "Woke from sleep",
    activation: "App became active",
    unknown: "Unknown",
  });
});
