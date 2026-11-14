// todo catalog: the agent primitive for the Catalog read (CONTEXT.md:
// Catalog, ADR-0009). Same data as GET /profiles/:profile/catalog.
import {
  CatalogChanged,
  CatalogQuery,
  type CatalogReply,
  CatalogUnchanged,
  catalogQueryError,
} from "@todo/domain";
import { CommandError } from "@todo/domain/commands";
import {
  encodeResponse,
  type Format,
  taskLine,
  taskView,
} from "@todo/domain/presentation";
import { Effect, Option, Schema } from "effect";
import { Command, type Flag } from "effect/cli";
import { withGuide } from "./help.ts";
import { registerCommandSchema } from "./schema.ts";

export const CatalogResponse = Schema.Union([
  Schema.Struct({ generated_at: Schema.String, ...CatalogChanged.fields }),
  Schema.Struct({ generated_at: Schema.String, ...CatalogUnchanged.fields }),
]);
registerCommandSchema("catalog", CatalogResponse);

type Flags = {
  readonly optional: (name: string) => Flag.Flag<Option.Option<string>>;
  readonly bool: (name: string) => Flag.Flag<boolean>;
};

// Every value flag is optional, so an explicit empty value is seen and refused.
const valueFlags = [
  "view",
  "tasks",
  "project-id",
  "tag-id",
  "order",
  "status",
  "project",
  "tag",
  "priority",
  "due",
  "scheduled",
  "attachment",
  "energy",
  "estimate",
  "now",
  "time-zone",
  "known-generation",
  "known-seq",
  "known-day",
  "known-stamp",
  "text",
  "prefix",
] as const;
type ValueFlag = (typeof valueFlags)[number];
type Input = Record<ValueFlag, Option.Option<string>> & {
  readonly ready: boolean;
  readonly blocked: boolean;
};

export const makeCatalogCommand = <A, E, R>(
  flags: Flags,
  handle: (query: CatalogQuery) => Effect.Effect<A, E, R>,
) =>
  Command.make(
    "catalog",
    {
      ...(Object.fromEntries(
        valueFlags.map((name) => [name, flags.optional(name)]),
      ) as Record<ValueFlag, Flag.Flag<Option.Option<string>>>),
      ready: flags.bool("ready"),
      blocked: flags.bool("blocked"),
    },
    (input) => Effect.flatMap(parseCatalogQuery(input), handle),
  ).pipe(withGuide("catalog"));

const usage = (message: string) => new CommandError(2, "invalid_args", message);

/**
 * Flags to the same CatalogQuery the HTTP route decodes, checked by the same
 * catalogQueryError, before any store is opened. Every refusal is a failure
 * with invalid_args and exit 2, never a thrown defect.
 */
export const parseCatalogQuery = (input: Input) =>
  Effect.try({
    try: (): CatalogQuery => {
      const value: Record<string, unknown> = {};
      for (const name of valueFlags) {
        const flag = input[name];
        if (Option.isNone(flag)) continue;
        // Blank text is a documented search (empty search_matches).
        if (flag.value === "" && name !== "text")
          throw usage(`--${name} needs a value`);
        value[name.replaceAll("-", "_")] = flag.value;
      }
      if (value.known_seq !== undefined) {
        const seq = Number(value.known_seq);
        if (!Number.isSafeInteger(seq) || String(seq) !== value.known_seq)
          throw usage("--known-seq must be a whole number");
        value.known_seq = seq;
      }
      if (input.ready) value.ready = true;
      if (input.blocked) value.blocked = true;
      let decoded: CatalogQuery;
      try {
        decoded = Schema.decodeUnknownSync(CatalogQuery)(value);
      } catch (error) {
        throw usage(`Invalid catalog flags: ${String(error)}`);
      }
      const invalid = catalogQueryError(decoded);
      if (invalid) throw usage(invalid.message);
      return decoded;
    },
    catch: (error) =>
      error instanceof CommandError
        ? error
        : usage(`Invalid catalog flags: ${String(error)}`),
  });

const viewTitles = {
  all: "All",
  today: "Today",
  overdue: "Overdue",
  scheduled: "Scheduled",
  inbox: "Inbox",
} as const;

export function renderCatalog(
  reply: CatalogReply,
  format: Format,
  generatedAt: string,
) {
  if (format === "json")
    return encodeResponse(CatalogResponse, {
      generated_at: generatedAt,
      ...reply,
    });
  const position = `seq ${reply.position.seq}, generation ${reply.position.generation}, day ${reply.day}`;
  if (reply.unchanged) return `# Catalog\n\nUnchanged since ${position}.\n`;
  const tasks = new Map<string, (typeof reply.tasks)[number]>(
    reply.tasks.map((task) => [task.id, task]),
  );
  const line = (id: string) => {
    const task = tasks.get(id);
    return task
      ? taskLine(taskView(task, reply.projects, reply.tags))
      : `- ${id}`;
  };
  const counts = (Object.keys(viewTitles) as (keyof typeof viewTitles)[]).map(
    (name) => `- ${viewTitles[name]}: ${reply.counts[name]}`,
  );
  const named = (rows: readonly { name: string; open_task_count: number }[]) =>
    rows.length
      ? rows.map((row) => `- ${row.name} (${row.open_task_count} open)`)
      : ["- none"];
  const groups = reply.view.groups.flatMap((group) => [
    `### ${group.name}`,
    "",
    ...(group.task_ids.length ? group.task_ids.map(line) : ["- none"]),
    "",
  ]);
  return [
    "# Catalog",
    "",
    `As of ${position}.`,
    "",
    "## Open Tasks per view",
    "",
    ...counts,
    "",
    "## Projects",
    "",
    ...named(reply.projects),
    "",
    "## Tags",
    "",
    ...named(reply.tags),
    "",
    `## ${viewTitles[reply.view.name]}`,
    "",
    ...groups,
  ].join("\n");
}
