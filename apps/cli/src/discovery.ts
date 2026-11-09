import type { LookupMatch, ProfileSummary } from "@todo/domain";
import type { Format } from "@todo/domain/presentation";

const quote = (value: string) =>
  /^[A-Za-z0-9_./-]+$/u.test(value)
    ? value
    : `'${value.replaceAll("'", "'\\''")}'`;

const shellFlag = (flag: string, value: string) =>
  `${flag}${value.startsWith("-") ? "=" : " "}${quote(value)}`;

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
  credentialProfile: string,
) => {
  if (!matches.length) return "No matches\n";
  const rows = matches.map((match) => {
    const credentialFlag =
      credentialProfile === match.profile.id
        ? ""
        : " " + shellFlag("--credential-profile", credentialProfile);
    const flags = `${shellFlag("--profile", match.profile.id)}${credentialFlag}`;
    const command = match.task_id.startsWith("-")
      ? `todo show ${flags} -- ${quote(match.task_id)}`
      : `todo show ${quote(match.task_id)} ${flags}`;
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
