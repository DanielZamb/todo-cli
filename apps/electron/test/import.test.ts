import { describe, expect, it } from "@effect/vitest";
import { importChangesText } from "../src/import-presentation.ts";

describe("import presentation", () => {
  it("describes new Tasks by the fields they set without the matching id", () => {
    expect(
      importChangesText({
        outcome: "created",
        changed_fields: ["title", "external_id", "project_name", "tag_names"],
      }),
    ).toBe("New Task · Title, Project, Tags");
    expect(
      importChangesText({
        outcome: "updated",
        changed_fields: ["description", "status"],
      }),
    ).toBe("Description, Status");
    expect(
      importChangesText({ outcome: "unchanged", changed_fields: [] }),
    ).toBe("No changes");
  });
});
