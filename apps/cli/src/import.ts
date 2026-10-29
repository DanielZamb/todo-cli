import { readFileSync } from "node:fs";
import {
  type ImportReport,
  ImportReport as ImportReportSchema,
  parseImportText,
} from "@todo/domain";
import { encodeResponse } from "@todo/domain/presentation";
import "./import-schema.ts";
import { CommandError } from "@todo/domain/commands";
import { Effect } from "effect";
import { Argument, Command, Flag } from "effect/cli";
import { withGuide } from "./help.ts";

export const makeImportCommand = <A, E, R>(
  handle: (input: {
    readonly file: string;
    readonly dryRun: boolean;
    readonly closeMissing: boolean;
  }) => Effect.Effect<A, E, R>,
) =>
  Command.make(
    "import",
    {
      file: Argument.String("file"),
      dryRun: Flag.Boolean("dry-run").pipe(Flag.withDefault(false)),
      closeMissing: Flag.Boolean("close-missing").pipe(Flag.withDefault(false)),
    },
    handle,
  ).pipe(withGuide("import"));

export const readImportFile = (file: string) =>
  Effect.try({
    try: () => parseImportText(readFileSync(file === "-" ? 0 : file, "utf8")),
    catch: (error) =>
      new CommandError(
        2,
        "invalid_args",
        `Cannot read import file: ${String(error)}`,
      ),
  });
export function renderImport(
  report: ImportReport,
  format: "md" | "json" | "table",
) {
  if (format === "json") return encodeResponse(ImportReportSchema, report);
  const rows = report.items
    .map(
      (row) =>
        `${row.external_id}\t${row.outcome}\t${row.changed_fields.join(", ")}${row.error ? `\t${row.error.message}` : ""}`,
    )
    .join("\n");
  return `${format === "md" ? `# Import${report.dry_run ? " preview" : ""}\n\n` : ""}Created ${report.totals.created}, updated ${report.totals.updated}, unchanged ${report.totals.unchanged}, rejected ${report.totals.rejected}\n\nEXTERNAL ID\tOUTCOME\tCHANGED FIELDS\n${rows}\n`;
}
