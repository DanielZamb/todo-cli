import type { LookupMatch, ProfileSummary } from "@todo/domain";
import type { Format } from "@todo/domain/presentation";

const quote = (value: string) =>
  /^[A-Za-z0-9_./-]+$/u.test(value)
    ? value
    : `'${value.replaceAll("'", "'\\''")}'`;

export const directoryOutput = (
  profiles: readonly (typeof ProfileSummary.Type)[],
) =>
  profiles
    .map(
      (profile) =>
        `## ${profile.name} (${profile.id})\n\n${
          profile.projects?.length
            ? profile.projects
                .map((project) => `- ${project.name} (${project.id})`)
                .join("\n")
            : "No Projects"
        }`,
    )
    .join("\n\n") + "\n";

export const lookupOutput = (
  matches: readonly (typeof LookupMatch.Type)[],
  format: Format,
) => {
  if (!matches.length) return "No matches\n";
  const rows = matches.map((match) => {
    const profileFlag = match.profile.id.startsWith("--")
      ? `--profile=${quote(match.profile.id)}`
      : `--profile ${quote(match.profile.id)}`;
    const command = `todo show ${quote(match.task_id)} ${profileFlag}`;
    const values = [
      match.profile.name,
      match.profile.id,
      match.task_id,
      match.title,
      match.project ?? "No Project",
      command,
    ];
    return format === "table" ? values.join("\t") : values.join(" | ");
  });
  return (
    (format === "table"
      ? "Profile\tProfile id\tTask id\tTitle\tProject\tShow\n"
      : "") +
    rows.join("\n") +
    "\n"
  );
};
