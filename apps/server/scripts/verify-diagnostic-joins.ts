import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { DiagnosticsSnapshot } from "@todo/domain";
import { Schema } from "effect";
import { diagnosticFixture } from "./diagnostic-fixture.ts";

const evidence = resolve(process.argv[2] ?? "docs/evidence/ui-speed/joins");
mkdirSync(evidence, { recursive: true });
const fixture = await diagnosticFixture(true, 1);
try {
  const ids = {
    "X-Todo-Trace": "11111111-1111-4111-8111-111111111111",
    "X-Todo-Request": "22222222-2222-4222-8222-222222222222",
    "X-Todo-Action": "33333333-3333-4333-8333-333333333333",
  };
  const response = await fetch(`${fixture.url}/profiles/work/tasks`, {
    headers: { ...ids, Authorization: `Bearer ${fixture.credential}` },
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-todo-request"), ids["X-Todo-Request"]);
  assert.match(
    response.headers.get("server-timing") ?? "",
    /^todo-handler;dur=\d+(?:\.\d{1,3})?(?:, todo-(?:auth|queue|domain|db|encode);dur=\d+(?:\.\d{1,3})?)*$/u,
  );
  const tasks = Schema.decodeUnknownSync(
    Schema.Array(Schema.Struct({ title: Schema.String })),
  )(await response.json());
  assert.deepEqual(
    tasks.map((x) => x.title),
    ["Benchmark Task 000"],
  );
  const snapshot = await fetch(`${fixture.url}/diagnostics?detail=true`, {
    headers: { Authorization: `Bearer ${fixture.credential}` },
  });
  const body = Schema.decodeUnknownSync(DiagnosticsSnapshot)(
    await snapshot.json(),
  );
  assert.ok(body.profiler);
  const spans = (body.profiler.detail?.recent ?? []).filter(
    (x) => x.request_id === ids["X-Todo-Request"],
  );
  assert.ok(spans.length >= 8);
  assert.ok(
    spans.every(
      (x) =>
        x.trace_id === ids["X-Todo-Trace"] &&
        x.action_id === ids["X-Todo-Action"],
    ),
  );
  assert.ok(spans.some((x) => x.metadata?.statement === "auth.credential"));
  assert.ok(spans.some((x) => x.metadata?.statement === "store.read"));
  const handler = spans.find((x) => x.stage === "entry");
  assert.ok(handler);
  const reported = /^todo-handler;dur=([\d.]+)/u.exec(
    response.headers.get("server-timing") ?? "",
  )?.[1];
  assert.equal(Number(reported), Number(handler.duration_ms.toFixed(3)));
  const malformed = await fetch(`${fixture.url}/health`, {
    headers: { "X-Todo-Request": "private-token" },
  });
  assert.match(
    malformed.headers.get("x-todo-request") ?? "",
    /^[a-f0-9-]{36}$/u,
  );
  assert.equal(malformed.headers.get("server-timing"), null);
  const denied = await fetch(`${fixture.url}/diagnostics`, { headers: ids });
  assert.equal(denied.status, 401);
  assert.equal(denied.headers.get("server-timing"), null);
  assert.ok(!(await denied.text()).includes("profiler"));
  const output = fixture.cli([
    "diagnostics",
    "--server",
    fixture.url,
    "--format",
    "json",
  ]);
  const cli = Schema.decodeUnknownSync(DiagnosticsSnapshot)(JSON.parse(output));
  assert.equal(cli.profiler?.schema_version, 2);
  assert.ok(!JSON.stringify(body.profiler).includes("Benchmark Task"));
  writeFileSync(join(evidence, "snapshot.json"), JSON.stringify(body, null, 2));
  writeFileSync(
    join(evidence, "result.json"),
    JSON.stringify(
      {
        result: "PASS",
        matched_spans: spans.length,
        server_timing: response.headers.get("server-timing"),
        cli_schema_version: cli.profiler?.schema_version,
      },
      null,
      2,
    ),
  );
} finally {
  writeFileSync(join(evidence, "server.log"), fixture.log());
  await fixture.close();
}
