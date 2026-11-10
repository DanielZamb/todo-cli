import { expect, it } from "@effect/vitest";
import {
  decodeGraphRender,
  decodeGraphReply,
  type GraphHostRender,
  graphNodeAccessibleName,
} from "../graph-browser/protocol.ts";

const graphHostFixture: GraphHostRender = {
  v: 1,
  type: "render",
  root_id: "task-a",
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
it("distinguishes an omitted viewport from a supplied stored viewport", () => {
  const { viewport: _viewport, ...initial } = graphHostFixture;
  expect(decodeGraphRender(initial).viewport).toBeUndefined();
  expect(decodeGraphRender(graphHostFixture).viewport).toEqual({
    x: 30,
    y: 30,
    scale: 1,
  });
});
it("requires a known explicit root without inspecting the opaque identity", () => {
  const { root_id: _root, ...missing } = graphHostFixture;
  expect(() => decodeGraphRender(missing)).toThrow();
  expect(() =>
    decodeGraphRender({ ...graphHostFixture, root_id: "foreign" }),
  ).toThrow();
  expect(
    decodeGraphRender({ ...graphHostFixture, identity: { root: "foreign" } })
      .root_id,
  ).toBe("task-a");
});
it("keeps known node states, ignores unknown states and uses titles only in accessible names", () => {
  for (const state of ["ready", "blocked", "done", "cancelled"] as const) {
    const message = decodeGraphRender({
      ...graphHostFixture,
      nodes: [
        {
          mermaid_id: "n0",
          task_id: "task-a",
          title: "Ship the client",
          state,
        },
        graphHostFixture.nodes[1],
      ],
    });
    const node = message.nodes[0];
    if (!node) throw new Error("Missing decoded node");
    expect(node.state).toBe(state);
    expect(graphNodeAccessibleName(node)).toBe(`Ship the client, ${state}`);
  }
  const unknown = decodeGraphRender({
    ...graphHostFixture,
    nodes: [
      { mermaid_id: "n0", task_id: "task-a", state: "future-state" },
      graphHostFixture.nodes[1],
    ],
  });
  expect(unknown.nodes[0]).toEqual({ mermaid_id: "n0", task_id: "task-a" });
  const node = unknown.nodes[0];
  if (!node) throw new Error("Missing decoded node");
  expect(graphNodeAccessibleName(node)).toBe("task-a");
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
