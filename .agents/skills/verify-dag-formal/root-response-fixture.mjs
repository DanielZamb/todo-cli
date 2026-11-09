import assert from "node:assert/strict";
export const rootResponsePlan = {
  status: "pending explicit amended B source SHA; no response proof claimed",
  nodes: 1000,
  requestedIndex: 500,
  allowedNodeKeys: [
    "mermaid_id",
    "task",
    "in_degree",
    "out_degree",
    "ready",
    "blocked",
    "depth",
    "remaining_energy",
  ].sort(),
  rootAncestors: Array.from({ length: 500 }, (_, index) => index),
  rootDescendants: Array.from({ length: 499 }, (_, index) => index + 501),
  rootLightestNext: [0],
  bytes:
    "Record Buffer.byteLength of actual serialized before/after responses against the same issued scratch chain and root. Keep both candidate Git objects. No latency claim.",
};
export const rootResponseRows = () =>
  Array.from({ length: 1000 }, (_, index) => ({
    external_id: `f-root-chain-${index}`,
    title: `F root chain ${index}`,
    energy: 1,
    ...(index ? { depends_on: [`f-root-chain-${index - 1}`] } : {}),
  }));
export const rootSetOrderRows = () => [
  {
    external_id: "f-root-first",
    title: "F root first",
    priority: "P1",
    energy: 5,
  },
  {
    external_id: "f-root-second",
    title: "F root second",
    priority: "P4",
    energy: 1,
  },
  {
    external_id: "f-root-goal",
    title: "F root goal",
    energy: 3,
    depends_on: ["f-root-first", "f-root-second"],
  },
];
export function assertRootSetOrder(response, [first, second, goal]) {
  assert.ok(first && second && goal);
  assert.equal(response.task_id, goal);
  assert.deepEqual(response.topological_order, [first, second, goal]);
  assert.deepEqual(response.ancestors, [first, second]);
  assert.deepEqual(response.descendants, []);
  assert.deepEqual(response.lightest_next, [first, second]);
}
export function assertRootOnlyResponse(response, issuedIds) {
  assert.equal(issuedIds.length, 1000);
  assert.equal(new Set(issuedIds).size, 1000);
  assert.equal(response.task_id, issuedIds[500]);
  assert.equal(response.nodes.length, 1000);
  assert.deepEqual(response.topological_order, issuedIds);
  assert.equal(response.edges.length, 999);
  for (const node of response.nodes)
    assert.deepEqual(
      Object.keys(node).sort(),
      rootResponsePlan.allowedNodeKeys,
    );
  for (const [field, expected] of [
    ["ancestors", rootResponsePlan.rootAncestors],
    ["descendants", rootResponsePlan.rootDescendants],
    ["lightest_next", rootResponsePlan.rootLightestNext],
  ])
    assert.deepEqual(
      response[field],
      expected.map((index) => issuedIds[index]),
    );
  return {
    serializedBytes: Buffer.byteLength(JSON.stringify(response)),
    root: issuedIds[500],
    nodes: 1000,
    edges: 999,
  };
}
