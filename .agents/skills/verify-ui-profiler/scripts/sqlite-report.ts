import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { Schema } from "effect";
const Row = Schema.Struct({
  scenario: Schema.String,
  pair: Schema.Number,
  enabled: Schema.Boolean,
  read_ms: Schema.Array(Schema.Number),
  write_ms: Schema.Array(Schema.Number),
  load_start: Schema.Array(Schema.Number),
  load_end: Schema.Array(Schema.Number),
  server_cpu_ms: Schema.Number,
  driver_cpu_ms: Schema.Number,
  seed_transaction_max_ms: Schema.Number,
  producer_results: Schema.Array(
    Schema.Struct({ status: Schema.Number, accepted: Schema.Boolean }),
  ),
});
const root = resolve(
    process.argv[2] ?? "docs/evidence/ui-speed/recordings-sqlite/cost-frozen",
  ),
  rows = Schema.decodeUnknownSync(Schema.Array(Row))(
    JSON.parse(readFileSync(join(root, "raw.json"), "utf8")),
  );
assert.equal(rows.length, 100);
const names = ["16", "128", "flood32", "expiry", "eviction"],
  labels = ["16 events", "128 events", "32 producers", "Expiry", "Eviction"];
const median = (a: readonly number[]) => {
  assert.ok(a.length);
  const b = [...a].sort((x, y) => x - y),
    lo = b[Math.floor((b.length - 1) / 2)],
    hi = b[Math.floor(b.length / 2)];
  assert.ok(lo !== undefined && hi !== undefined);
  return (lo + hi) / 2;
};
const p50 = (a: readonly number[]) => {
  assert.equal(a.length, 20);
  const b = [...a].sort((x, y) => x - y),
    v = b[9];
  assert.notEqual(v, undefined);
  return v ?? 0;
};
const stats = (a: readonly number[]) => ({
    median: median(a),
    min: Math.min(...a),
    max: Math.max(...a),
  }),
  fmt = (n: number) => n.toFixed(3),
  cell = (s: ReturnType<typeof stats>) =>
    `${fmt(s.median)} [${fmt(s.min)}, ${fmt(s.max)}]`;
const summary = names.map((scenario, i) => {
  const group = rows.filter((r) => r.scenario === scenario);
  assert.equal(group.length, 20);
  const off = group.filter((r) => !r.enabled),
    on = group.filter((r) => r.enabled);
  const pairs = Array.from({ length: 10 }, (_, pair) => {
    const a = off.find((r) => r.pair === pair),
      b = on.find((r) => r.pair === pair);
    assert.ok(a && b);
    return {
      pair,
      read: p50(b.read_ms) - p50(a.read_ms),
      write: p50(b.write_ms) - p50(a.write_ms),
    };
  });
  return {
    scenario,
    label: labels[i] ?? scenario,
    read_off: stats(off.map((r) => p50(r.read_ms))),
    read_on: stats(on.map((r) => p50(r.read_ms))),
    write_off: stats(off.map((r) => p50(r.write_ms))),
    write_on: stats(on.map((r) => p50(r.write_ms))),
    read_difference: stats(pairs.map((r) => r.read)),
    write_difference: stats(pairs.map((r) => r.write)),
    pairs,
    dropped: on.flatMap((r) => r.producer_results).filter((r) => !r.accepted)
      .length,
    accepted: on.flatMap((r) => r.producer_results).filter((r) => r.accepted)
      .length,
    server_cpu_off: stats(off.map((r) => r.server_cpu_ms)),
    server_cpu_on: stats(on.map((r) => r.server_cpu_ms)),
    driver_cpu_on: stats(on.map((r) => r.driver_cpu_ms)),
    load: stats(
      group.flatMap((r) => [r.load_start[0] ?? 0, r.load_end[0] ?? 0]),
    ),
    max_seed_transaction_ms: Math.max(
      ...group.map((r) => r.seed_transaction_max_ms),
    ),
  };
});
writeFileSync(join(root, "summary.json"), JSON.stringify(summary, null, 2));
let md =
  "| Challenge | Read p50 without / with | Write p50 without / with | Accepted / dropped batches |\n| --- | --- | --- | --- |\n";
for (const r of summary)
  md += `| ${r.label} | ${cell(r.read_off)} / ${cell(r.read_on)} | ${cell(r.write_off)} / ${cell(r.write_on)} | ${r.accepted} / ${r.dropped} |\n`;
md +=
  "\n| Challenge | Read paired differences, pairs 1 through 10, ms | Write paired differences, ms |\n| --- | --- | --- |\n";
for (const r of summary)
  md += `| ${r.label} | ${r.pairs.map((p) => fmt(p.read)).join(", ")} | ${r.pairs.map((p) => fmt(p.write)).join(", ")} |\n`;
md +=
  "\n| Challenge | Server CPU without / with, ms | Driver CPU with, ms | Boundary one-minute load range |\n| --- | --- | --- | --- |\n";
for (const r of summary)
  md += `| ${r.label} | ${cell(r.server_cpu_off)} / ${cell(r.server_cpu_on)} | ${cell(r.driver_cpu_on)} | ${fmt(r.load.min)} to ${fmt(r.load.max)} |\n`;
writeFileSync(join(root, "tables.md"), md);
const panel = (
  key: "read_difference" | "write_difference",
  title: string,
  color: string,
) => {
  const lo = Math.min(0, ...summary.map((r) => r[key].min)),
    hi = Math.max(0.01, ...summary.map((r) => r[key].max)),
    pad = (hi - lo) * 0.08,
    min = lo - pad,
    max = hi + pad,
    x = (v: number) => 140 + ((v - min) / (max - min)) * 520;
  return `<section><h3>${title}</h3><svg viewBox="0 0 710 230" role="img" aria-label="${title}: median and range of paired p50 differences in milliseconds"><line x1="${x(0)}" x2="${x(0)}" y1="8" y2="188" stroke="var(--muted-foreground)" stroke-dasharray="3 4"/>${summary
    .map((r, i) => {
      const y = 24 + i * 36,
        s = r[key];
      return `<text x="0" y="${y + 5}" fill="var(--foreground)">${r.label}</text><line x1="${x(s.min)}" x2="${x(s.max)}" y1="${y}" y2="${y}" stroke="var(${color})" stroke-width="3"/><circle cx="${x(s.median)}" cy="${y}" r="4" fill="var(${color})"/><text x="${Math.min(662, x(s.max) + 7)}" y="${y + 5}" fill="var(--foreground)" font-size="11">${fmt(s.median)}</text>`;
    })
    .join(
      "",
    )}<text x="140" y="218" fill="var(--muted-foreground)">${fmt(min)} ms</text><text x="660" y="218" text-anchor="end" fill="var(--muted-foreground)">${fmt(max)} ms</text></svg></section>`;
};
writeFileSync(
  join(root, "comparison.html"),
  `<!doctype html><html><meta charset="utf-8"><style>:root{color-scheme:light dark}body{margin:0;font-family:var(--font-sans)}h3{margin:12px 0 2px;font-size:15px}p{color:var(--muted-foreground);font-size:13px}svg{width:100%;height:230px;font-family:var(--font-sans);font-size:13px}</style><p>Paired change in Task p50. Dots are medians of ten pairs; lines span the full range. Each panel has its own scale. Positive values mean longer responses with ingestion.</p>${panel("read_difference", "Task reads", "--chart-1")}${panel("write_difference", "Task writes", "--chart-2")}<p>Ambient host, 20 checked reads and writes per cell, same binary. Small changes must be judged against the pair-to-pair spread, as detailed in the report. Queue drops are reported separately in the report.</p></html>`,
);
