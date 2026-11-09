import { readFileSync, writeFileSync } from "node:fs";
const api = JSON.parse(readFileSync(new URL("../../../packages/api/openapi.json", import.meta.url)));
const rewrite = (value) => JSON.parse(JSON.stringify(value).replaceAll("#/components/schemas/", "#/$defs/"));
const str = { type: "string", minLength: 1 };
const inputId = { ...str, maxLength: 200 };
const version = { type: "integer", minimum: 1, maximum: Number.MAX_SAFE_INTEGER };
const count = { type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER };
const stamp = { type: "string" };
const ref = (name) => ({ $ref: `#/$defs/${name}` });
const arr = (items, extra = {}) => ({ type: "array", items, ...extra });
const obj = (properties, optional = []) => ({ type: "object", properties, required: Object.keys(properties).filter((k) => !optional.includes(k)), additionalProperties: false });
const lit = (value) => ({ const: value });
const nullable = (s) => ({ anyOf: [s, { type: "null" }] });
const defs = rewrite(api.components.schemas);
defs.Task = rewrite(api.paths["/profiles/{profile}/tasks/{task}"].get.responses["200"].content["application/json"].schema);
defs.Edge = obj({ profile_id: str, dependent_id: str, blocker_id: str });
defs.VersionChange = obj({ id: str, from_version: version, to_version: version, updated_at: stamp });
defs.DependencyChanges = obj({ added: arr(ref("Edge")), removed: arr(ref("Edge")), versions: arr(ref("VersionChange")) });
defs.DependRequest = obj({ blocker_id: inputId, from_version: version });
defs.UndependRequest = defs.DependRequest;
defs.DeleteQuery = obj({ from_version: version, with_dependencies: { type: "boolean", default: false }, dry_run: { type: "boolean", default: false }, dependency_fingerprint: { type: "string", pattern: "^[a-f0-9]{64}$" } }, ["with_dependencies", "dry_run", "dependency_fingerprint"]);
defs.CreateExtension = obj({ depends_on: arr(inputId, { maxItems: 13, uniqueItems: true }) }, ["depends_on"]);
defs.ListExtension = obj({ ready: lit(true), blocked: lit(true), order: { enum: ["topo", "lightest"] } }, ["ready", "blocked", "order"]);
defs.DependencyAdvice = {type: "string", pattern: "^This Task depends on [0-9]+ Tasks[.] That's a lot for one Task[.] It might be a whole Project, or it might be clearer split under a few more parent Tasks[.]$"};
defs.Warning = { oneOf: [obj({ code: lit("many_dependencies"), message: ref("DependencyAdvice"), dependent_id: str, count }), obj({ code: lit("redundant_dependency"), message: str, dependent_id: str, blocker_id: str, path: arr(str, { minItems: 3 }) })] };
defs.EdgeReport = obj({ generated_at: stamp, outcome: { enum: ["added", "removed", "unchanged"] }, dependent_id: str, blocker_id: str, from_version: version, to_version: version, seq: nullable(version), warnings: arr(ref("Warning")), dry_run: { type: "boolean" } }, ["dry_run"]);
const error = (code, details) => obj({ generated_at: stamp, code: lit(code), message: code === "too_many_dependencies" ? ref("DependencyAdvice") : str, details });
defs.DependencyError = { oneOf: [
  error("dependency_cycle", obj({ dependent_id: str, blocker_id: str, path: arr(str, { minItems: 2 }) })),
  error("too_many_dependencies", obj({ dependent_id: str, count, limit: lit(13) })),
  error("blocked", obj({ task_id: str, blockers: arr(ref("Task"), { minItems: 1 }) })),
  error("blocks_done_task", obj({ task_id: str, done_dependents: arr(ref("Task"), { minItems: 1 }), follow_up_depends_on: str })),
  error("has_dependencies", obj({ task_id: str, dependencies: arr(ref("Edge"), { minItems: 1 }), flag: lit("--with-dependencies") })),
  error("dependency_profile_mismatch", obj({ dependent_id: str, blocker_id: str, profile_id: str })),
] };
defs.Energy = obj({ energy: count, unweighted: count });
defs.GraphNode = obj({ mermaid_id: str, task: ref("Task"), in_degree: count, out_degree: count, ready: { type: "boolean" }, blocked: { type: "boolean" }, depth: count, remaining_energy: ref("Energy") });
const graphFields = { generated_at: stamp, profile_id: str, task_id: str, nodes: arr(ref("GraphNode"), { minItems: 1 }), edges: arr(ref("Edge")), sources: arr(str), sinks: arr(str), topological_order: arr(str), ancestors: arr(str), descendants: arr(str), lightest_next: { ...arr(str), description: "Ready Tasks in the requested Task's remaining set, including itself, in whole-Profile topological order. A Ready unresolved Task returns itself; terminal Tasks return an empty array." }, mermaid: str };
defs.GraphReport = { oneOf: [obj({ ...graphFields, shape: lit("tree"), orientation: { enum: ["converging", "diverging", "mixed"] } }), ...["single", "chain", "dag"].map(shape => obj({ ...graphFields, shape: lit(shape) }))] };
defs.DeleteReport = obj({ generated_at: stamp, task: ref("Task"), removed_dependencies: arr(ref("Edge")), affected_versions: arr(ref("VersionChange")), dependency_fingerprint: { type: "string", pattern: "^[a-f0-9]{64}$" }, dry_run: { type: "boolean" } });
defs.BatchEdgeItem = obj({ action: { enum: ["depend", "undepend"] }, dependent_id: inputId, blocker_id: inputId, from_version: version });
defs.BatchEdgeRequest = obj({ items: arr(ref("BatchEdgeItem"), { minItems: 1, maxItems: 1000 }), dry_run: { type: "boolean", default: false } }, ["dry_run"]);
defs.BatchEdgeResult = { oneOf: [obj({ index: count, result: ref("EdgeReport") }), obj({ index: count, error: { oneOf: [ref("DependencyError"), obj({ generated_at: stamp, code: { enum: ["conflict", "not_found", "invalid_args", "auth_required", "forbidden", "runtime"] }, message: str, details: {} }, ["details"])] }, exit_code: { enum: [1, 2, 3, 4] } })] };
defs.BatchEdgeReport = obj({ generated_at: stamp, dry_run: { type: "boolean" }, results: arr(ref("BatchEdgeResult")) });
for (const kind of ["DependencyAdded", "DependencyRemoved"]) defs[kind] = obj({ entity_version: lit(1), occurred_at: stamp, kind: lit(kind), dependent_id: str, blocker_id: str, from_version: version, to_version: version });
defs.TaskDeletedV2 = obj({ entity_version: lit(2), occurred_at: stamp, kind: lit("TaskDeleted"), before: ref("Task"), after: ref("Task"), dependencies: ref("DependencyChanges") });
defs.TaskRevertedExtension = obj({ dependencies: ref("DependencyChanges") });
defs.CheckpointExtension = obj({ edges: arr(ref("Edge")) }, ["edges"]);
defs.RedactedReplayExtension = obj({ dependencies: ref("DependencyChanges") }, ["dependencies"]);
defs.ImportExtension = obj({ depends_on: arr({ ...str, maxLength: 1000 }, { maxItems: 13, uniqueItems: true }) }, ["depends_on"]);
defs.TaskReadExtension = obj({ depends_on: arr(str), blocks: arr(str), ready: {type: "boolean"}, blocked: {type: "boolean"}, remaining_energy: ref("Energy") }, ["depends_on", "blocks", "ready", "blocked", "remaining_energy"]);
defs.CreateResponseExtension = obj({ dependency_warnings: arr(ref("Warning")) }, ["dependency_warnings"]);
defs.MoveResponseExtension = obj({ removed_dependencies: arr(ref("Edge")), affected_versions: arr(ref("VersionChange")) }, ["removed_dependencies", "affected_versions"]);
defs.ExportExtension = obj({ depends_on: arr(str, {minItems: 1}) }, ["depends_on"]);
const v1 = rewrite(api.paths["/profiles/{profile}/tasks/{task}/history"].get.responses["200"].content["application/json"].schema);

const findKind = (v, kind) => {
  if (!v || typeof v !== "object") return undefined;
  if (v.properties?.kind?.enum?.includes(kind)) return v;
  for (const child of Object.values(v)) {
    if (Array.isArray(child)) { for (const item of child) { const r=findKind(item,kind); if(r)return r; } }
    else { const r=findKind(child,kind); if(r)return r; }
  }
};
for (const kind of ["TaskCreated", "TaskMovedOut", "TaskReverted"]) {
  const original = findKind(v1,kind);
  if (!original) throw new Error("Missing existing event " + kind);
  const properties = Object.fromEntries(Object.entries(original.properties).filter(([key]) => key !== "dependencies"));
  defs[kind + "V2"] = obj({...properties, entity_version: lit(2), dependencies: ref("DependencyChanges")}, Object.keys(properties).filter(k=>!original.required.includes(k)));
}
defs.RejectionDetails = {oneOf: [obj({witness: ref("DependencyError"), truncated: lit(false), total: count}), obj({witness: {type: "null"}, truncated: lit(true), total: count})]};
const taskJson = JSON.stringify(defs.Task);
const internTask = (value) => {
  if (!value || typeof value !== "object") return value;
  if (JSON.stringify(value) === taskJson) return ref("Task");
  if (Array.isArray(value)) return value.map(internTask);
  return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,internTask(v)]));
};
for (const [name,def] of Object.entries(defs)) if(name!=="Task") defs[name]=internTask(def);
const document = { $schema: "https://json-schema.org/draft/2020-12/schema", title: "Task DAG Phase 0 contract", $defs: defs };
const references = [];
const visit = (value) => { if (!value || typeof value !== "object") return; if (value.$ref) references.push(value.$ref); for (const child of Object.values(value)) visit(child); };
visit(document);
for (const reference of references) if (!reference.startsWith("#/$defs/") || !defs[reference.slice(8)]) throw new Error(`Unresolved reference ${reference}`);
writeFileSync(new URL("contract.schema.json", import.meta.url), `${JSON.stringify(document, null, 2)}\n`);
console.log(`PASS: ${Object.keys(defs).length} schema definitions; ${references.length} resolved references`);
