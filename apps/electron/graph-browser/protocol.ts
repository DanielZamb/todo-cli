import { Schema } from "effect";

export const GraphHostIdentity = Schema.Record(Schema.String, Schema.Json);
const TaskId = Schema.NonEmptyString;
export const GraphViewport = Schema.Struct({
  x: Schema.Finite,
  y: Schema.Finite,
  scale: Schema.Finite.check(Schema.isGreaterThan(0)),
});
const Color = Schema.String.check(Schema.isMaxLength(200));
export const GraphTheme = Schema.Struct({
  mode: Schema.Literals(["light", "dark"]),
  tokens: Schema.Struct({
    ink: Schema.optionalKey(Color),
    paper: Schema.optionalKey(Color),
    card: Schema.optionalKey(Color),
    border: Schema.optionalKey(Color),
    "muted-text": Schema.optionalKey(Color),
    primary: Schema.optionalKey(Color),
    "on-primary": Schema.optionalKey(Color),
    accent: Schema.optionalKey(Color),
    warning: Schema.optionalKey(Color),
    danger: Schema.optionalKey(Color),
  }),
});
export const GraphHostRender = Schema.Struct({
  v: Schema.Literal(1),
  type: Schema.Literal("render"),
  identity: GraphHostIdentity,
  nodes: Schema.Array(
    Schema.Struct({
      mermaid_id: Schema.String.check(Schema.isPattern(/^n[0-9]+$/u)),
      task_id: TaskId,
    }),
  ),
  mermaid: Schema.NonEmptyString,
  visible_ids: Schema.Array(TaskId),
  viewport: GraphViewport,
  selected_id: Schema.NullOr(TaskId),
  focused_id: Schema.NullOr(TaskId),
  theme: GraphTheme,
  reduced_motion: Schema.Boolean,
});
export type GraphHostRender = typeof GraphHostRender.Type;
export type GraphHostIdentity = typeof GraphHostIdentity.Type;
export type GraphViewport = typeof GraphViewport.Type;
export type GraphTheme = typeof GraphTheme.Type;
const header = { v: Schema.Literal(1), identity: GraphHostIdentity };
export const GraphHostReply = Schema.Union([
  Schema.Struct({ ...header, type: Schema.Literal("ready") }),
  Schema.Struct({
    ...header,
    type: Schema.Literal("rendered"),
    node_count: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  }),
  Schema.Struct({
    ...header,
    type: Schema.Literal("renderError"),
    message: Schema.String,
  }),
  ...(["activate", "context", "expand"] as const).map((type) =>
    Schema.Struct({ ...header, type: Schema.Literal(type), task_id: TaskId }),
  ),
  Schema.Struct({
    ...header,
    type: Schema.Literal("focus"),
    task_id: Schema.NullOr(TaskId),
  }),
  Schema.Struct({
    ...header,
    type: Schema.Literal("viewport"),
    ...GraphViewport.fields,
  }),
]);
export type GraphHostReply = typeof GraphHostReply.Type;
export function decodeGraphRender(input: unknown): GraphHostRender {
  const message = Schema.decodeUnknownSync(GraphHostRender)(input);
  const ids = new Set(message.nodes.map((node) => node.task_id));
  const mermaid = new Set(message.nodes.map((node) => node.mermaid_id));
  if (
    ids.size !== message.nodes.length ||
    mermaid.size !== message.nodes.length ||
    message.visible_ids.some((id) => !ids.has(id)) ||
    (message.selected_id !== null && !ids.has(message.selected_id)) ||
    (message.focused_id !== null && !ids.has(message.focused_id))
  )
    throw new Error("Graph host received unknown or duplicate Task identity");
  return message;
}
export function decodeGraphReply(
  input: unknown,
  current: GraphHostRender,
): GraphHostReply {
  const message = Schema.decodeUnknownSync(GraphHostReply)(input);
  if (JSON.stringify(message.identity) !== JSON.stringify(current.identity))
    throw new Error("Obsolete graph host identity");
  if (
    "task_id" in message &&
    message.task_id !== null &&
    !current.nodes.some((node) => node.task_id === message.task_id)
  )
    throw new Error("Unknown graph Task identity");
  return message;
}
