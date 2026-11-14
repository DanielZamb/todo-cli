import { GraphReport, Task } from "@todo/domain";
import { Schema } from "effect";
export const dependencyTask = (id: string, version = 1, status = "open") =>
  Schema.decodeUnknownSync(Task)({
    id,
    profile_id: "work",
    title: `Task ${id}`,
    status,
    entity_version: 1,
    row_version: version,
    description: "",
    project_id: null,
    priority: "P2",
    scheduled_at: null,
    due_at: null,
    energy: null,
    estimate_min: null,
    source: "electron",
    tags: [],
    occurrence: null,
    created_at: "2026-11-09T00:00:00Z",
    updated_at: "2026-11-09T00:00:00Z",
    completed_at: null,
    deleted_at: null,
  });
export const dependencyGraph = (version = 1) =>
  Schema.decodeUnknownSync(GraphReport)({
    generated_at: "2026-11-09T00:00:00Z",
    profile_id: "work",
    task_id: "root",
    ancestors: ["linked"],
    descendants: [],
    lightest_next: ["linked"],
    nodes: [
      dependencyTask("root", version),
      dependencyTask("linked"),
      dependencyTask("other", 7),
    ].map((task, index) => ({
      mermaid_id: `n${index}`,
      task,
      in_degree: 0,
      out_degree: 0,
      ready: true,
      blocked: false,
      depth: 0,
      remaining_energy: { energy: 0, unweighted: 1 },
    })),
    edges: [{ profile_id: "work", dependent_id: "root", blocker_id: "linked" }],
    sources: ["linked"],
    sinks: ["root"],
    topological_order: ["linked", "root", "other"],
    mermaid: "flowchart TD\nn0-->n1",
    shape: "chain",
  });
