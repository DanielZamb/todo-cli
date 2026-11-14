// todo catalog: the agent primitive for the Catalog read (CONTEXT.md:
// Catalog, ADR-0009). Same data as GET /profiles/:profile/catalog.
import {
  CatalogChanged,
  CatalogQuery,
  type CatalogReply,
  CatalogUnchanged,
} from "@todo/domain";
import { CommandError } from "@todo/domain/commands";
import {
  encodeResponse,
  type Format,
  taskLine,
  taskView,
} from "@todo/domain/presentation";
import { type Effect, Option, Schema } from "effect";
import { Command, type Flag } from "effect/cli";
import { withGuide } from "./help.ts";
import { registerCommandSchema } from "./schema.ts";

export const CatalogResponse = Schema.Union([
  Schema.Struct({ generated_at: Schema.String, ...CatalogChanged.fields }),
  Schema.Struct({ generated_at: Schema.String, ...CatalogUnchanged.fields }),
]);
registerCommandSchema("catalog", CatalogResponse);

type Flags = {
  readonly string: (name: string, fallback?: string) => Flag.Flag<string>;
  readonly optional: (name: string) => Flag.Flag<Option.Option<string>>;
  readonly bool: (name: string) => Flag.Flag<boolean>;
};

const textFlags = [
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
] as const;

export const makeCatalogCommand = <A, E, R>(
  flags: Flags,
  handle: (query: CatalogQuery) => Effect.Effect<A, E, R>,
) =>
  Command.make(
    "catalog",
    {
      ...(Object.fromEntries(
        textFlags.map((name) => [name, flags.string(name)]),
      ) as Record<(typeof textFlags)[number], Flag.Flag<string>>),
      text: flags.optional("text"),
      prefix: flags.optional("prefix"),
      ready: flags.bool("ready"),
      blocked: flags.bool("blocked"),
    },
    (input) => handle(catalogQuery(input)),
  ).pipe(withGuide("catalog"));

/** Flags to the same CatalogQuery the HTTP route decodes; a bad value is exit 2. */
const catalogQuery = (
  input: Record<(typeof textFlags)[number], string> & {
    readonly text: Option.Option<string>;
    readonly prefix: Option.Option<string>;
    readonly ready: boolean;
    readonly blocked: boolean;
  },
): CatalogQuery => {
  const value: Record<string, unknown> = {};
  for (const name of textFlags) {
    const flag = input[name];
    if (flag !== "") value[name.replaceAll("-", "_")] = flag;
  }
  if (value.known_seq !== undefined) {
    const seq = Number(value.known_seq);
    if (!Number.isSafeInteger(seq) || String(seq) !== value.known_seq)
      throw new CommandError(
        2,
        "invalid_args",
        "--known-seq must be a whole number",
      );
    value.known_seq = seq;
  }
  for (const [name, flag] of [
    ["text", input.text],
    ["prefix", input.prefix],
  ] as const)
    if (Option.isSome(flag)) value[name] = flag.value;
  if (input.ready) value.ready = true;
  if (input.blocked) value.blocked = true;
  try {
    return Schema.decodeUnknownSync(CatalogQuery)(value);
  } catch (error) {
    throw new CommandError(
      2,
      "invalid_args",
      `Invalid catalog query: ${String(error)}`,
    );
  }
};

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
