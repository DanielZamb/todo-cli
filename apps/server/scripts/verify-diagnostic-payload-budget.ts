import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  DiagnosticsSnapshot,
  diagnosticsBudgetBytes,
  diagnosticsDetailBudgetBytes,
} from "@todo/domain";
import { Schema } from "effect";
import { diagnosticFixture } from "./diagnostic-fixture.ts";

const evidence = resolve(
  process.argv[2] ?? "docs/evidence/ui-speed/diagnostic-budget",
);
mkdirSync(evidence, { recursive: true });
const fixture = await diagnosticFixture(true, 0);
const connections: Array<{
  abort: AbortController;
  response: Awaited<ReturnType<typeof fetch>>;
}> = [];
const results: object[] = [];
const size = (text: string) => new TextEncoder().encode(text).length;
type Reader = ReturnType<
  NonNullable<Awaited<ReturnType<typeof fetch>>["body"]>["getReader"]
>;
type Part = Awaited<ReturnType<Reader["read"]>>;
try {
  for (let i = 0; i < 10000; i++) {
    if (i % 50 === 0) {
      if (connections.length >= 32) connections.shift()?.abort.abort();
      const abort = new AbortController();
      const stream = await fetch(`${fixture.url}/profiles/work/events`, {
        headers: {
          Authorization: `Bearer ${fixture.credential}`,
          "X-Todo-Client": ["cli", "electron", "swiftui"][i % 3] ?? "cli",
        },
        signal: abort.signal,
      });
      assert.equal(stream.status, 200);
      connections.push({ abort, response: stream });
      const reader = stream.body?.getReader();
      assert.ok(reader);
      const ready = await reader.read();
      assert.ok(new TextDecoder().decode(ready.value).includes("event: ready"));
      reader.releaseLock();
    }
    const path = [
      "/profiles/work/tasks",
      "/profiles/work/projects",
      "/profiles/work/tags",
      "/health",
      `/distinct-route-${i}`,
    ][i % 5];
    const response = await fetch(fixture.url + path, {
      headers: {
        Authorization: `Bearer ${fixture.credential}`,
        "X-Todo-Trace": randomUUID(),
        "X-Todo-Request": randomUUID(),
      },
    });
    assert.equal(response.status, i % 5 === 4 ? 404 : 200);
    await response.arrayBuffer();
    if ((i + 1) % 1000 === 0) {
      for (const detail of [false, true]) {
        const poll = await fetch(
          `${fixture.url}/diagnostics${detail ? "?detail=true" : ""}`,
          { headers: { Authorization: `Bearer ${fixture.credential}` } },
        );
        assert.equal(poll.status, 200);
        const text = await poll.text();
        const body = Schema.decodeUnknownSync(
          Schema.fromJsonString(DiagnosticsSnapshot),
        )(text);
        const pretty = JSON.stringify(body, null, 2) + "\n";
        const budget = detail
          ? diagnosticsDetailBudgetBytes
          : diagnosticsBudgetBytes;
        assert.ok(size(text) <= budget);
        assert.ok(size(pretty) <= budget);
        assert.equal(body.profiler?.detail !== undefined, detail);
        assert.ok(!text.includes("distinct-route-"));
        assert.ok((body.profiler?.slow.length ?? 0) <= 8);
        assert.ok(
          body.profiler?.omitted.clients && body.profiler.omitted.clients > 0,
        );
        results.push({
          requests: i + 1,
          clients_created: i / 50 + 1,
          detail,
          body_bytes: size(text),
          pretty_bytes: size(pretty),
          budget,
          omitted: body.profiler?.omitted,
        });
      }
      writeFileSync(
        join(evidence, "actions.json"),
        JSON.stringify(results, null, 2),
      );
    }
  }
  for (const connection of connections) connection.abort.abort();
  connections.length = 0;
  for (let i = 0; i < 306; i++) {
    const response = await fetch(`${fixture.url}/profiles/work/tasks`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${fixture.credential}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ title: `Replay Task ${i}` }),
    });
    assert.equal(response.status, 200);
    await response.arrayBuffer();
  }
  await Promise.all(
    [0, 1, 2].map(async () => {
      const abort = new AbortController();
      const response = await fetch(`${fixture.url}/profiles/work/events`, {
        headers: { Authorization: `Bearer ${fixture.credential}` },
        signal: AbortSignal.any([abort.signal, AbortSignal.timeout(30000)]),
      });
      connections.push({ abort, response });
      assert.equal(response.status, 200);
      const reader = response.body?.getReader();
      assert.ok(reader);
      let buffer = "";
      const ids = new Set<string>();
      while (ids.size < 306) {
        const part: Part = await reader.read();
        assert.equal(part.done, false);
        buffer += new TextDecoder().decode(part.value);
        let end = buffer.indexOf("\n\n");
        while (end >= 0) {
          const block = buffer.slice(0, end);
          if (block.includes("event: operation")) {
            const id = /^id: (\d+)/u.exec(block)?.[1];
            assert.ok(id);
            assert.ok(!ids.has(id));
            ids.add(id);
          }
          assert.ok(!block.includes("event: failure"));
          buffer = buffer.slice(end + 2);
          end = buffer.indexOf("\n\n");
        }
      }
      reader.releaseLock();
    }),
  );
  for (const detail of [false, true]) {
    const response = await fetch(
      `${fixture.url}/diagnostics${detail ? "?detail=true" : ""}`,
      { headers: { Authorization: `Bearer ${fixture.credential}` } },
    );
    assert.equal(response.status, 200);
    const text = await response.text();
    const body = Schema.decodeUnknownSync(
      Schema.fromJsonString(DiagnosticsSnapshot),
    )(text);
    const pretty = JSON.stringify(body, null, 2) + "\n";
    assert.ok(
      size(text) <=
        (detail ? diagnosticsDetailBudgetBytes : diagnosticsBudgetBytes),
    );
    assert.ok(
      size(pretty) <=
        (detail ? diagnosticsDetailBudgetBytes : diagnosticsBudgetBytes),
    );
    assert.equal(body.profiler?.detail !== undefined, detail);
    const sample = body.profiler?.detail;
    if (detail) {
      assert.ok(sample);
      assert.ok(sample.total_deliveries >= 918);
      assert.ok(sample.deliveries.length <= 16);
      assert.equal(sample.run_id, body.profiler?.run_id);
      for (const row of [
        ...sample.active,
        ...sample.recent,
        ...sample.deliveries,
      ]) {
        assert.equal("run_id" in row, false);
        assert.equal("contract_id" in row, false);
        assert.equal("build_id" in row, false);
      }
    }
    results.push({
      replay_operations: 306,
      replay_clients: 3,
      detail,
      bytes: size(text),
      pretty_bytes: size(pretty),
      delivery_rows: sample?.deliveries.length,
      total_deliveries: sample?.total_deliveries,
    });
  }
  for (const detail of [false, true]) {
    const output = fixture.cli([
      "diagnostics",
      "--server",
      fixture.url,
      "--format",
      "json",
      ...(detail ? ["--detail"] : []),
    ]);
    assert.ok(
      size(output) <=
        (detail ? diagnosticsDetailBudgetBytes : diagnosticsBudgetBytes),
    );
    const body = Schema.decodeUnknownSync(
      Schema.fromJsonString(DiagnosticsSnapshot),
    )(output);
    assert.equal(body.profiler?.detail !== undefined, detail);
    results.push({
      surface: "compiled CLI, default spawnSync buffer",
      detail,
      bytes: size(output),
    });
  }
  writeFileSync(
    join(evidence, "result.json"),
    JSON.stringify(
      {
        result: "PASS",
        requests: 10000,
        distinct_unknown_routes: 2000,
        clients_created: 200,
        maximum_live_clients: 32,
        results,
      },
      null,
      2,
    ),
  );
} finally {
  for (const connection of connections) connection.abort.abort();
  await fixture.close();
}
