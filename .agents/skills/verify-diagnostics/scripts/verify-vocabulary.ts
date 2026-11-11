import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Schema } from "effect";
import { DiagnosticObservation, decodeDiagnosticEvent, decodeDiagnosticCapability, decodeRenderStage, summarizeInteractions } from "../../../../packages/domain/src/client-diagnostics.ts";
import { interactionCategories } from "../../../../packages/domain/src/interaction-categories.ts";

const evidence = resolve(process.argv[2] ?? "docs/evidence/ui-speed/vocabulary");
mkdirSync(evidence, { recursive: true });
for (const name of ["diagnostics event", "diagnostics observation"]) {
  const process = Bun.spawnSync([resolve(".scratch/bin/todo"), "schema", name, "--format", "json"], { env: { ...Bun.env, HOME: resolve(".scratch/vocabulary-home") } });
  assert.equal(process.exitCode, 0, process.stderr.toString());
  const document = JSON.parse(process.stdout.toString());
  assert.equal(document.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.ok(JSON.stringify(document).includes("inventory_id"));
  writeFileSync(resolve(evidence, `${name.replaceAll(" ", "-")}.json`), JSON.stringify(document, null, 2));
}
const scope = { run_id: "11111111-1111-4111-8111-111111111111", process_role: "cli", build_id: "a".repeat(40), contract_id: "b".repeat(64), category: { inventory_id: "C03", subtype: "done" }, mode: "terminal", input_kind: "command", workload: "warm" };
const decode = Schema.decodeUnknownSync(DiagnosticObservation, { onExcessProperty: "error" });
const summary = summarizeInteractions([
  ...[10,20,300,900].map(duration_ms => decode({ ...scope, kind: "rendered", outcome: "completed", correct: true, duration_ms, render_stage: "stdout_drain" })),
  decode({ ...scope, kind: "unfinished", outcome: "lost", count: 2, age_ms: null }),
  decode({ ...scope, kind: "unfinished", outcome: "crashed", count: 1, age_ms: 400 }),
]);
assert.equal(summary[0]?.starts, 7);
assert.equal(summary[0]?.p50_ms, 20);
assert.equal(summary[0]?.p90_ms, 900);
assert.equal(summary[0]?.p99_ms, 900);
assert.equal(summary[0]?.fraction_by_300_ms, 3/7);
assert.equal(summary[0]?.evidence, "incomplete");
assert.equal(decodeRenderStage("new-private-stage"), "unknown");
assert.equal(decodeDiagnosticCapability("new-private-capability"), "unknown");
assert.deepEqual(decodeDiagnosticEvent({ schema_version: 2, name: "private-event" }), { kind: "unknown", reason: "unknown_version" });
writeFileSync(resolve(evidence, "result.json"), JSON.stringify({ result: "PASS", categories: interactionCategories.length, summary }, null, 2));
