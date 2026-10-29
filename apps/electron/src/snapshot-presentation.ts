import { countTasks } from "./presentation.ts";
export const snapshotProfileName = (name: string) =>
  name.charAt(0).toUpperCase() + name.slice(1);
export const snapshotTaskCount = (count: number) => countTasks(count, true);
export function snapshotReason(reason: string) {
  switch (reason) {
    case "manual":
      return "Manual";
    case "daily":
      return "Daily";
    case "pre-restore":
      return "Before restore";
    case "pre-migration":
      return "Before update";
    case "pre-purge":
      return "Before Purge";
  }
  const deletion = "before Profile delete ";
  if (reason.startsWith(deletion))
    return `Before deleting Profile "${snapshotProfileName(reason.slice(deletion.length))}"`;
  const imported = "before import ";
  if (reason.startsWith(imported))
    return `Before import of ${reason.slice(imported.length)}`;
  return reason.charAt(0).toUpperCase() + reason.slice(1);
}
