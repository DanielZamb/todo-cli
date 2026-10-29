import {
  SnapshotList,
  SnapshotManifest,
  SnapshotPruneReport,
  SnapshotRestoreReport,
} from "@todo/domain";
import {
  ErrorResponse,
  HistoryResponse,
  TaskResponse,
  TasksResponse,
} from "@todo/domain/presentation";
import { Schema } from "effect";

const registry = new Map<
  string,
  {
    readonly kind: "command" | "input";
    readonly document: () => ReturnType<typeof Schema.toJsonSchemaDocument>;
  }
>();

export function registerCommandSchema(
  name: string,
  schema: Schema.Constraint,
  kind: "command" | "input" = "command",
) {
  if (registry.has(name)) throw new Error(`duplicate command schema: ${name}`);
  registry.set(name, {
    kind,
    document: () => Schema.toJsonSchemaDocument(schema),
  });
}

export type StatusResponse = typeof StatusResponse.Type;
export const StatusResponse = Schema.Struct({
  generated_at: Schema.String,
  status: Schema.String,
});
export type IdentityResponse = typeof IdentityResponse.Type;
export const IdentityResponse = Schema.Struct({
  generated_at: Schema.String,
  owner: Schema.Literal("owner"),
  profile: Schema.String,
  expires_at: Schema.String,
});
export type PathResponse = typeof PathResponse.Type;
export const PathResponse = Schema.Struct({
  generated_at: Schema.String,
  path: Schema.String,
});
export type TextResponse = typeof TextResponse.Type;
export const TextResponse = Schema.Struct({
  generated_at: Schema.String,
  text: Schema.String,
});
export type ConfigResponse = typeof ConfigResponse.Type;
export const ConfigResponse = Schema.Struct({
  generated_at: Schema.String,
  config: Schema.Struct({ db_path: Schema.NullOr(Schema.String) }),
});
export type SchemaListResponse = typeof SchemaListResponse.Type;
export const SchemaListResponse = Schema.Struct({
  generated_at: Schema.String,
  commands: Schema.Array(Schema.String),
  inputs: Schema.Array(Schema.String),
});
export type SchemaResponse = typeof SchemaResponse.Type;
export const SchemaResponse = Schema.StructWithRest(
  Schema.Struct({ generated_at: Schema.String, $schema: Schema.String }),
  [Schema.Record(Schema.String, Schema.Json)],
);

export const commandNames = () =>
  [...registry]
    .filter(([, schema]) => schema.kind === "command")
    .map(([name]) => name)
    .sort();
export const inputNames = () =>
  [...registry]
    .filter(([, schema]) => schema.kind === "input")
    .map(([name]) => name)
    .sort();

export function commandSchema(name: string) {
  const document = registry.get(name)?.document();
  return document
    ? {
        generated_at: new Date().toISOString(),
        $schema: "https://json-schema.org/draft/2020-12/schema",
        ...document.schema,
        ...(Object.keys(document.definitions).length
          ? { $defs: document.definitions }
          : {}),
      }
    : undefined;
}

for (const name of ["add", "show", "edit", "done", "cancel", "reopen"])
  registerCommandSchema(name, TaskResponse);
for (const name of ["list", "review daily", "review weekly", "export"])
  registerCommandSchema(name, TasksResponse);
registerCommandSchema("history", HistoryResponse);
registerCommandSchema("error", ErrorResponse);
export const SnapshotResponse = Schema.Struct({
  generated_at: Schema.String,
  snapshot: SnapshotManifest,
});
export const SnapshotListResponse = Schema.Struct({
  generated_at: Schema.String,
  ...SnapshotList.fields,
});
export const SnapshotRestoreResponse = Schema.Struct({
  generated_at: Schema.String,
  restore: SnapshotRestoreReport,
});
export const SnapshotPruneResponse = Schema.Struct({
  generated_at: Schema.String,
  prune: SnapshotPruneReport,
});
registerCommandSchema("snapshot create", SnapshotResponse);
registerCommandSchema("snapshot show", SnapshotResponse);
registerCommandSchema("snapshot list", SnapshotListResponse);
registerCommandSchema("snapshot restore", SnapshotRestoreResponse);
registerCommandSchema("snapshot prune", SnapshotPruneResponse);
registerCommandSchema("help", TextResponse);

for (const name of ["init", "logout", "rm", "config set"])
  registerCommandSchema(name, StatusResponse);
for (const name of ["login", "whoami"])
  registerCommandSchema(name, IdentityResponse);
for (const name of ["config get", "config show"])
  registerCommandSchema(name, ConfigResponse);
for (const name of ["man", "review", "sync", "config", "snapshot"])
  registerCommandSchema(name, TextResponse);
registerCommandSchema("sync obsidian", PathResponse);
registerCommandSchema(
  "schema",
  Schema.Union([SchemaResponse, SchemaListResponse]),
);
