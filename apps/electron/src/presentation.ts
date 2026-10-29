import type { TaskTime } from "@todo/domain";

export function countTasks(count: number, capitalized = false): string {
  const noun = capitalized ? "Task" : "task";
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

export function rowDateText(
  value: typeof TaskTime.Type | null,
  {
    now = new Date(),
    currentZone = Intl.DateTimeFormat().resolvedOptions().timeZone,
  }: { now?: Date; currentZone?: string } = {},
): string {
  if (!value) return "";
  const timeZone = value.kind === "instant" ? value.time_zone : currentZone;
  const parts = (date: Date) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  const day = value.kind === "date" ? value.date : parts(new Date(value.utc));
  const distance = Math.round(
    (Date.parse(`${day}T12:00:00Z`) - Date.parse(`${parts(now)}T12:00:00Z`)) /
      86400000,
  );
  const date = new Date(`${day}T12:00:00Z`);
  const relative =
    distance === 0
      ? "Today"
      : distance === 1
        ? "Tomorrow"
        : distance === -1
          ? "Yesterday"
          : Math.abs(distance) < 7
            ? date.toLocaleDateString("en-US", {
                weekday: "short",
                timeZone: "UTC",
              })
            : date.toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                timeZone: "UTC",
                ...(day.slice(0, 4) === parts(now).slice(0, 4)
                  ? {}
                  : { year: "numeric" }),
              });
  if (value.kind === "date") return relative;
  const time = new Date(value.utc).toLocaleTimeString("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  });
  return `${relative} ${time}${timeZone === currentZone ? "" : ` · ${timeZone}`}`;
}
