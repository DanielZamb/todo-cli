export const uuid = "11111111-1111-4111-8111-111111111111";
export const event = {
  schema_version: 1,
  run_id: uuid,
  process_role: "macos",
  build_id: "a".repeat(40),
  contract_id: "b".repeat(64),
  category: { inventory_id: "I07", subtype: "task.selection.pointer" },
  mode: "full",
  input_kind: "pointer",
  workload: "warm",
  sequence: 1,
  monotonic_ms: 10,
  clock_unit: "ms",
  trace_id: uuid,
  span_id: uuid,
  action_id: uuid,
  name: "ui.action.started",
} as const;
