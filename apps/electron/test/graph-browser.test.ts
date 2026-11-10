import { expect, it } from "@effect/vitest";
import {
  decodeGraphRender,
  decodeGraphReply,
  type GraphHostRender,
} from "../graph-browser/protocol.ts";

const graphHostFixture: GraphHostRender = {
  v: 1,
  type: "render",
  identity: {
    profile: "work",
    root: "task-a",
    credentialGeneration: 9,
    request: "opaque-request",
    arbitrary: { nested: [true, null, "kept"] },
  },
  nodes: [
    { mermaid_id: "n0", task_id: "task-a" },
    { mermaid_id: "n1", task_id: "task-b" },
  ],
  mermaid: 'flowchart TD\nn0["A"]-->n1["B"]',
  visible_ids: ["task-a", "task-b"],
  viewport: { x: 30, y: 30, scale: 1 },
  selected_id: "task-a",
  focused_id: "task-a",
  theme: { mode: "light", tokens: {} },
  reduced_motion: true,
};
it("retains opaque identity and validates every host reply against the current known map", () => {
  const command = decodeGraphRender(graphHostFixture);
  expect(JSON.stringify(command.identity)).toBe(
    '{"profile":"work","root":"task-a","credentialGeneration":9,"request":"opaque-request","arbitrary":{"nested":[true,null,"kept"]}}',
  );
  const messages = [
    { type: "ready" },
    { type: "rendered", node_count: 2 },
    { type: "renderError", message: "failed" },
    { type: "activate", task_id: "task-a" },
    { type: "context", task_id: "task-a" },
    { type: "focus", task_id: null },
    { type: "expand", task_id: "task-b" },
    { type: "viewport", x: 7, y: 8, scale: 2 },
  ].map((message) => ({ v: 1, identity: command.identity, ...message }));
  expect(
    messages.map((message) => decodeGraphReply(message, command).type),
  ).toEqual([
    "ready",
    "rendered",
    "renderError",
    "activate",
    "context",
    "focus",
    "expand",
    "viewport",
  ]);
  expect(() => decodeGraphReply({ ...messages[0], v: 2 }, command)).toThrow();
  expect(() =>
    decodeGraphReply({ ...messages[0], type: "select" }, command),
  ).toThrow();
  expect(() =>
    decodeGraphReply({ ...messages[0], type: "addDependency" }, command),
  ).toThrow();
  expect(() =>
    decodeGraphReply(
      { ...messages[0], type: "activate", task_id: "foreign" },
      command,
    ),
  ).toThrow();
  expect(() =>
    decodeGraphReply(
      { ...messages[0], identity: { request: "obsolete" } },
      command,
    ),
  ).toThrow();
});
it("refuses malformed viewport, unknown visible ids and duplicate node mappings", () => {
  expect(() =>
    decodeGraphRender({
      ...graphHostFixture,
      viewport: { x: 0, y: 0, scale: 0 },
    }),
  ).toThrow();
  expect(() =>
    decodeGraphRender({ ...graphHostFixture, visible_ids: ["foreign"] }),
  ).toThrow();
  expect(() =>
    decodeGraphRender({
      ...graphHostFixture,
      nodes: [graphHostFixture.nodes[0], graphHostFixture.nodes[0]],
    }),
  ).toThrow();
});
