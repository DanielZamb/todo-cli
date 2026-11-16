// A writing command's JSON carries operation_position, the generation and the
// highest seq it committed
// (see committed-operations.ts in the domain). Its published schema says so.
import { committedSoFar, OperationPosition } from "@todo/domain";
import { jsonText } from "@todo/domain/presentation";
import { Schema } from "effect";

/** Commands that can commit History. Read commands never carry the field. */
export const committingCommands: ReadonlySet<string> = new Set([
  "add",
  "edit",
  "done",
  "cancel",
  "reopen",
  "rm",
  "move",
  "copy",
  "revert",
  "depend",
  "undepend",
  "batch-depend",
  "attach",
  "detach",
  "label-attachment",
  "attach-many",
  "batch-edit",
  "import",
  "profile delete",
  "snapshot restore",
  "init",
  "logout",
  "reset-passphrase",
]);

type JsonSchema = {
  properties?: Record<string, unknown>;
  anyOf?: JsonSchema[];
  oneOf?: JsonSchema[];
  $ref?: string;
};
const property = Schema.toJsonSchemaDocument(OperationPosition).schema;

/** Adds the optional operation_position property to every object the response can be. */
export const withOperationPositionProperty = (
  schema: JsonSchema,
  definitions: Record<string, JsonSchema>,
) => {
  const seen = new Set<JsonSchema>();
  const visit = (node: JsonSchema) => {
    if (seen.has(node)) return;
    seen.add(node);
    if (node.$ref) {
      const target = definitions[node.$ref.split("/").at(-1) ?? ""];
      if (target) visit(target);
    }
    if (node.properties) node.properties.operation_position = property;
    for (const member of [...(node.anyOf ?? []), ...(node.oneOf ?? [])])
      visit(member);
  };
  visit(schema);
};

/** The command's JSON object with operation_position when it committed History. */
export const stampOperationPosition = (text: string) => {
  const position = committedSoFar();
  if (position === null || !text.startsWith("{")) return text;
  try {
    const value: unknown = JSON.parse(text);
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? jsonText({ ...value, operation_position: position })
      : text;
  } catch {
    return text;
  }
};
