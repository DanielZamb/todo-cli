import type { ImportRow } from "@todo/domain";

const names: Readonly<Record<string, string>> = {
  project_name: "Project",
  project_id: "Project",
  tag_names: "Tags",
  tags: "Tags",
  external_id: "External id",
  due_at: "Due",
  scheduled_at: "Scheduled",
  estimate_min: "Estimate",
  title: "Title",
  description: "Description",
  priority: "Priority",
  energy: "Energy",
  source: "Source",
  status: "Status",
};
export const importChangesText = (
  row: Pick<ImportRow, "outcome" | "changed_fields">,
) => {
  const fields = row.changed_fields
    .filter((field) => row.outcome !== "created" || field !== "external_id")
    .map((field) => names[field] ?? field.replaceAll("_", " "));
  return row.outcome === "created"
    ? `New Task${fields.length ? ` · ${fields.join(", ")}` : ""}`
    : fields.join(", ") || "No changes";
};
