// A writing command's JSON carries operation_seq, the highest seq it committed
// (see committed-operations.ts in the domain). Its published schema says so.
import { committedSoFar, OperationSeq } from "@todo/domain";
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
const property = Schema.toJsonSchemaDocument(OperationSeq).schema;

/** Adds the optional operation_seq property to every object the response can be. */
export const withOperationSeqProperty = (
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
    if (node.properties) node.properties.operation_seq = property;
    for (const member of [...(node.anyOf ?? []), ...(node.oneOf ?? [])])
      visit(member);
  };
  visit(schema);
};

/** The command's JSON object with operation_seq when it committed History. */
export const stampOperationSeq = (text: string) => {
  const seq = committedSoFar();
  if (seq === null || !text.startsWith("{")) return text;
  try {
    const value: unknown = JSON.parse(text);
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? jsonText({ ...value, operation_seq: seq })
      : text;
  } catch {
    return text;
  }
};
