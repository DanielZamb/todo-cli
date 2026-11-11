import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { loadavg } from "node:os";
import { join, resolve } from "node:path";
import { Schema } from "effect";
import { diagnosticFixture } from "./diagnostic-fixture.ts";

const evidence = resolve(
  process.argv[2] ?? "docs/evidence/ui-speed/diagnostics-payload",
);
mkdirSync(evidence, { recursive: true });
const bytes = (value: unknown) =>
  new TextEncoder().encode(JSON.stringify(value)).length;
const measurements: object[] = [];
const readJson = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Json));
type Reader = ReturnType<
  NonNullable<Awaited<ReturnType<typeof fetch>>["body"]>["getReader"]
>;
type Part = Awaited<ReturnType<Reader["read"]>>;
const object = Schema.decodeUnknownSync(
  Schema.Record(Schema.String, Schema.Json),
);
const measure = async (
  fixture: Awaited<ReturnType<typeof diagnosticFixture>>,
  label: string,
) => {
  const polls = [];
  const load_start = loadavg()[0];
  for (let i = 0; i < 5; i++) {
    const response = await fetch(`${fixture.url}/diagnostics`, {
      headers: { Authorization: `Bearer ${fixture.credential}` },
    });
    assert.equal(response.status, 200);
    const text = await response.text();
    const value = object(readJson(text));
    const profiler = object(value.profiler);
    const row = {
      body_bytes: new TextEncoder().encode(text).length,
      pretty_bytes:
        new TextEncoder().encode(JSON.stringify(value, null, 2)).length + 1,
      profiler_bytes: bytes(profiler),
      handler_ms: Number(
        /todo-handler;dur=([\d.]+)/u.exec(
          response.headers.get("server-timing") ?? "",
        )?.[1],
      ),
      fields: Object.fromEntries(
        Object.entries(value).map(([key, value]) => [key, bytes(value)]),
      ),
      profiler_fields: Object.fromEntries(
        Object.entries(profiler).map(([key, value]) => [
          key,
          {
            bytes: bytes(value),
            items: Array.isArray(value) ? value.length : null,
          },
        ]),
      ),
    };
    assert.ok(Number.isFinite(row.handler_ms));
    polls.push(row);
  }
  const sorted = polls.map((x) => x.handler_ms).sort((a, b) => a - b);
  measurements.push({
    label,
    load_start,
    load_end: loadavg()[0],
    handler_median_ms: sorted[2],
    handler_range_ms: [sorted[0], sorted[4]],
    polls,
  });
  writeFileSync(
    join(evidence, "measurements.json"),
    JSON.stringify(measurements, null, 2),
  );
};

const fixture = await diagnosticFixture(true, 0);
try {
  let completed = 0;
  for (const target of [0, 100, 1000, 10000]) {
    while (completed < target) {
      const response = await fetch(`${fixture.url}/profiles/work/tasks`, {
        headers: {
          Authorization: `Bearer ${fixture.credential}`,
          "X-Todo-Trace": randomUUID(),
          "X-Todo-Request": randomUUID(),
        },
      });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), []);
      completed++;
    }
    await measure(fixture, `${target} list requests`);
  }
} finally {
  await fixture.close();
}

const replay = await diagnosticFixture(true, 0);
const abort = new AbortController();
try {
  for (let i = 0; i < 306; i++) {
    const response = await fetch(`${replay.url}/profiles/work/tasks`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${replay.credential}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ title: `Replay Task ${i}` }),
    });
    assert.equal(response.status, 200);
    await response.arrayBuffer();
  }
  const response = await fetch(`${replay.url}/profiles/work/events`, {
    headers: { Authorization: `Bearer ${replay.credential}` },
    signal: AbortSignal.any([abort.signal, AbortSignal.timeout(30000)]),
  });
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
  await measure(replay, "306-operation replay, one stream client");
} finally {
  abort.abort();
  await replay.close();
}
const violations: object[] = [];
if (process.argv.includes("--assert-budget")) {
  for (const entry of measurements) {
    const value = Schema.decodeUnknownSync(
      Schema.Struct({
        polls: Schema.Array(
          Schema.Struct({
            body_bytes: Schema.Number,
            pretty_bytes: Schema.Number,
          }),
        ),
      }),
    )(entry);
    for (const poll of value.polls)
      if (poll.body_bytes > 49152 || poll.pretty_bytes > 49152)
        violations.push(poll);
  }
}
writeFileSync(
  join(evidence, "result.json"),
  JSON.stringify(
    {
      result: violations.length ? "FAIL" : "PASS",
      samples_per_checkpoint: 5,
      measurements,
      violations,
    },
    null,
    2,
  ),
);
assert.equal(
  violations.length,
  0,
  "Diagnostics exceeds the 48 KiB body/CLI budget",
);
