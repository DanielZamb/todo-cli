import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { Schema } from "effect";
const Obs = Schema.Struct({
  name: Schema.String,
  pass: Schema.String,
  handler: Schema.Number,
  auth: Schema.NullOr(Schema.Number),
  queue: Schema.NullOr(Schema.Number),
  domain: Schema.NullOr(Schema.Number),
  db: Schema.NullOr(Schema.Number),
  encode: Schema.NullOr(Schema.Number),
  client_ms: Schema.Number,
  bytes: Schema.Number,
  status: Schema.Number,
});
const Run = Schema.Struct({
  fixture: Schema.String,
  tasks: Schema.Number,
  profiles: Schema.Number,
  extra: Schema.Number,
  large: Schema.Boolean,
  ops: Schema.Number,
  history_bytes: Schema.Number,
  task_bytes: Schema.Number,
  first: Schema.String,
  pair: Schema.Number,
  pressure: Schema.Boolean,
  held: Schema.Literal(false),
  load_start: Schema.Number,
  load_end: Schema.Number,
  ready_ms: Schema.Number,
  observations: Schema.Array(Obs),
  cpu_before: Schema.String,
  cpu_after: Schema.String,
  generator_cpu_ms: Schema.Number,
  parallel: Schema.optionalKey(Schema.Array(Obs)),
  locked: Schema.optionalKey(Obs),
});
const Input = Schema.Struct({
  results: Schema.Array(
    Schema.Union([
      Run,
      Schema.Struct({ held: Schema.Literal(true) }),
      Schema.Struct({ cell_timeout: Schema.Literal(true) }),
    ]),
  ),
});
const median = (v: readonly number[]) => {
  if (!v.length) return null;
  const a = [...v].sort((x, y) => x - y);
  const middle = Math.floor(a.length / 2);
  return a.length % 2
    ? (a[middle] ?? null)
    : ((a[middle - 1] ?? 0) + (a[middle] ?? 0)) / 2;
};
const stat = (v: readonly number[]) => ({
  n: v.length,
  median: median(v),
  range: v.length ? [Math.min(...v), Math.max(...v)] : null,
});
assert.equal(median([1, 2]), 1.5);
assert.deepEqual(stat([1, 4, 8]), { n: 3, median: 4, range: [1, 8] });
if (process.argv[4] === "micro") {
  const input = Schema.decodeUnknownSync(
    Schema.fromJsonString(
      Schema.Array(
        Schema.Struct({
          fixture: Schema.String,
          ops: Schema.Number,
          output: Schema.Record(Schema.String, Schema.Array(Schema.Number)),
        }),
      ),
    ),
  )(readFileSync(process.argv[2] ?? "", "utf8"));
  const output = input.map((r) => ({
    fixture: r.fixture,
    ops: r.ops,
    metrics: Object.fromEntries(
      Object.entries(r.output).map(([k, v]) => [k, stat(v.slice(2))]),
    ),
  }));
  writeFileSync(
    process.argv[3] ?? "summary.json",
    JSON.stringify(output, null, 2),
  );
  process.exit(0);
}
const data = Schema.decodeUnknownSync(Schema.fromJsonString(Input))(
  readFileSync(process.argv[2] ?? "", "utf8"),
);
const runs = data.results.filter(
  (x): x is typeof Run.Type => "held" in x && x.held === false,
);
if (process.argv[4] === "chart") {
  const groups = [...new Set(runs.map((r) => r.fixture))]
    .map((fixture) => {
      const r = runs.filter(
        (r) => r.fixture === fixture && r.first === "profiles" && !r.pressure,
      );
      const first = r[0];
      if (!first) return null;
      const ms = r.flatMap((x) =>
        x.observations
          .filter((o) => o.pass === "second" && o.name === "profiles")
          .map((o) => o.handler),
      );
      return {
        tasks: first.tasks,
        profiles: first.profiles,
        extra: first.extra,
        large: first.large,
        ...stat(ms),
      };
    })
    .filter((x) => x !== null);
  const html = `<!doctype html><meta charset="utf-8"><style>body{font:14px var(--font-sans,system-ui);color:var(--foreground);margin:0}label{display:inline-flex;gap:8px;align-items:center;margin:0 14px 12px 0}select{font:inherit;background:var(--secondary);color:var(--foreground);border:1px solid var(--border);border-radius:6px;padding:5px}svg{width:100%;height:300px;display:block}text{fill:var(--foreground);font:12px var(--font-sans,system-ui)}.note{color:var(--muted-foreground);font-size:12px;line-height:1.5}p{margin:10px 0}</style><label>Current Tasks per populated Profile<select id="tasks"><option>15</option><option>178</option></select></label><label>Three deleted large descriptions<select id="large"><option value="true">Yes</option><option value="false">No</option></select></label><svg id="chart" viewBox="0 0 700 300" role="img" aria-label="Warm profiles handler cost by history and number of Profiles"></svg><p id="legend"></p><p class="note">Second pass after a fresh server start. Lines show medians; bars show ranges across five process restarts. Busy host, no quiet observations. Each added populated Profile also adds the selected number of Tasks. The report includes a separate control that adds only empty Profiles.</p><script>const rows=${JSON.stringify(groups).replaceAll("<", "\\u003c")};const svg=document.querySelector('#chart');function draw(){const data=rows.filter(r=>r.tasks===Number(document.querySelector('#tasks').value)&&r.large===(document.querySelector('#large').value==='true'));const max=Math.ceil(Math.max(...data.map(r=>r.range[1]))/20)*20;const x=h=>65+[32,256,2048].indexOf(h)*285;const y=v=>250-v/max*215;let out='';for(let i=0;i<5;i++){const v=i*max/4;out+='<path d="M65 '+y(v)+' H660" stroke="var(--border)"/><text x="55" y="'+(y(v)+4)+'" text-anchor="end">'+v.toFixed(0)+'</text>';}out+='<text x="65" y="15">GET /profiles · warm handler (ms)</text>';for(const h of[32,256,2048])out+='<text x="'+x(h)+'" y="275" text-anchor="middle">'+h+' extra edits</text>';for(const [i,p]of[1,3,8].entries()){const r=data.filter(r=>r.profiles===p).sort((a,b)=>a.extra-b.extra);const color='var(--chart-'+(i+1)+')';out+='<polyline points="'+r.map(d=>x(d.extra)+','+y(d.median)).join(' ')+'" fill="none" stroke="'+color+'" stroke-width="2"/>';for(const d of r){out+='<path d="M'+x(d.extra)+' '+y(d.range[0])+' V'+y(d.range[1])+'" stroke="'+color+'"/><circle cx="'+x(d.extra)+'" cy="'+y(d.median)+'" r="4" fill="'+color+'"><title>'+p+' Profiles, '+d.extra+' edits: median '+d.median.toFixed(2)+' ms ['+d.range.map(n=>n.toFixed(2)).join(', ')+']</title></circle>';}}svg.innerHTML=out;document.querySelector('#legend').innerHTML=[1,3,8].map((p,i)=>'<span style="color:var(--chart-'+(i+1)+');margin-right:18px">● '+p+' '+(p===1?'Profile':'Profiles')+'</span>').join('');}document.querySelectorAll('select').forEach(e=>e.onchange=draw);draw();</script>`;
  writeFileSync(process.argv[3] ?? "chart.html", html);
  process.exit(0);
}
if (process.argv[4] === "tables") {
  const format = (v: readonly number[]) => {
    const s = stat(v);
    return s.median === null
      ? "--"
      : `${s.median.toFixed(2)} [${s.range?.[0]?.toFixed(2)}, ${s.range?.[1]?.toFixed(2)}]`;
  };
  const lines = [
    "| Tasks per populated Profile | Profiles | Extra edits | Large deleted text | Total operations | History MiB | First /profiles ms | Second /profiles ms | Second tasks ms | Second eight-handler sum ms |",
    "| ---: | ---: | ---: | :---: | ---: | ---: | --- | --- | --- | --- |",
  ];
  const seeds = [
    ...new Map(
      runs.filter((r) => r.first === "profiles").map((r) => [r.fixture, r]),
    ).values(),
  ].sort(
    (a, b) =>
      a.tasks - b.tasks ||
      a.profiles - b.profiles ||
      a.extra - b.extra ||
      Number(a.large) - Number(b.large),
  );
  for (const f of seeds) {
    const r = runs.filter(
      (r) => r.fixture === f.fixture && r.first === "profiles" && !r.pressure,
    );
    const values = (name: string, pass: string) =>
      r.flatMap((x) =>
        x.observations
          .filter((o) => o.name === name && o.pass === pass)
          .map((o) => o.handler),
      );
    lines.push(
      `| ${f.tasks} | ${f.profiles} | ${f.extra} | ${f.large ? "yes" : "no"} | ${f.ops} | ${(f.history_bytes / 1048576).toFixed(2)} | ${format(values("profiles", "first"))} | ${format(values("profiles", "second"))} | ${format(values("tasks", "second"))} | ${format(r.map((x) => x.observations.filter((o) => o.pass === "second").reduce((s, o) => s + o.handler, 0)))} |`,
    );
  }
  lines.push(
    "",
    "Stage detail. Each stage cell is first / second median ms of five runs; missing spans are --. The lower bound is for the second pass.",
    "",
    "| Fixture / route | Handler | Auth | Writer queue | Domain | DB | Encode | Unattributed lower bound |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
  );
  for (const fixture of ["n15-p1-large1-h256", "n178-p8-large1-h2048"])
    for (const name of [
      "profiles",
      "tags",
      "tasks",
      "overdue",
      "projects",
      "inbox",
      "today",
      "scheduled",
    ]) {
      const r = runs.filter(
        (r) => r.fixture === fixture && r.first === "profiles",
      );
      const obs = r.flatMap((x) =>
        x.observations.filter((o) => o.name === name && o.pass === "second"),
      );
      const m = (
        k: "handler" | "auth" | "queue" | "domain" | "db" | "encode",
        pass: "first" | "second",
      ) => {
        const n = median(
          r
            .flatMap((x) =>
              x.observations.filter((o) => o.name === name && o.pass === pass),
            )
            .flatMap((o) => (typeof o[k] === "number" ? [o[k]] : [])),
        );
        return n === null ? "--" : n.toFixed(3);
      };
      const lower = median(
        obs.map((o) =>
          Math.max(
            0,
            o.handler -
              (o.auth ?? 0) -
              (o.queue ?? 0) -
              (o.domain ?? 0) -
              (o.db ?? 0),
          ),
        ),
      );
      const stages = [
        "handler",
        "auth",
        "queue",
        "domain",
        "db",
        "encode",
      ] as const;
      lines.push(
        `| ${fixture} / ${name} | ${stages.map((k) => `${m(k, "first")} / ${m(k, "second")}`).join(" | ")} | ${lower?.toFixed(3)} |`,
      );
    }
  writeFileSync(process.argv[3] ?? "tables.md", lines.join("\n") + "\n");
  process.exit(0);
}
const keys = [
  "handler",
  "auth",
  "queue",
  "domain",
  "db",
  "encode",
  "client_ms",
] as const;
const rows = [];
for (const fixture of new Set(runs.map((r) => r.fixture)))
  for (const first of new Set(
    runs.filter((r) => r.fixture === fixture).map((r) => r.first),
  ))
    for (const pressure of [false, true]) {
      const selected = runs.filter(
        (r) =>
          r.fixture === fixture && r.first === first && r.pressure === pressure,
      );
      if (!selected.length) continue;
      for (const name of new Set(
        selected.flatMap((r) => r.observations.map((o) => o.name)),
      )) {
        const entry: Record<string, unknown> = {
          fixture,
          first_route: first,
          pressure,
          name,
        };
        for (const pass of ["first", "second", "third"]) {
          const obs = selected.flatMap((r) =>
            r.observations.filter((o) => o.name === name && o.pass === pass),
          );
          entry[pass] = Object.fromEntries(
            keys.map((k) => [
              k,
              stat(
                obs.flatMap((o) => (typeof o[k] === "number" ? [o[k]] : [])),
              ),
            ]),
          );
          entry[pass + "_unattributed_lower_bound"] = stat(
            obs.map((o) =>
              Math.max(
                0,
                o.handler -
                  (o.auth ?? 0) -
                  (o.queue ?? 0) -
                  (o.domain ?? 0) -
                  (o.db ?? 0),
              ),
            ),
          );
        }
        const pairs = selected
          .map((r) => {
            const a = r.observations.find(
                (o) => o.name === name && o.pass === "first",
              ),
              b = r.observations.find(
                (o) => o.name === name && o.pass === "second",
              );
            return a && b
              ? {
                  difference: a.handler - b.handler,
                  ratio: a.handler / b.handler,
                }
              : null;
          })
          .filter((x) => x !== null);
        entry.cold_warm_difference_ms = stat(pairs.map((p) => p.difference));
        entry.cold_warm_ratio = stat(pairs.map((p) => p.ratio));
        entry.bytes = selected[0]?.observations.find(
          (o) => o.name === name,
        )?.bytes;
        rows.push(entry);
      }
    }
const totals = runs.map((r) => ({
  fixture: r.fixture,
  first: r.first,
  pressure: r.pressure,
  pair: r.pair,
  first_ms: r.observations
    .filter((o) => o.pass === "first")
    .reduce((s, o) => s + o.handler, 0),
  second_ms: r.observations
    .filter((o) => o.pass === "second")
    .reduce((s, o) => s + o.handler, 0),
  parallel_handler_sum: r.parallel?.reduce((s, o) => s + o.handler, 0),
  parallel_wall_ms: r.parallel
    ? Math.max(...r.parallel.map((o) => o.client_ms))
    : null,
  parallel_queue_sum: r.parallel?.reduce((s, o) => s + (o.queue ?? 0), 0),
  locked: r.locked,
  ready_ms: r.ready_ms,
  cpu_before: r.cpu_before,
  cpu_after: r.cpu_after,
  generator_cpu_ms: r.generator_cpu_ms,
}));
const paired = [];
for (const fixture of new Set(runs.map((r) => r.fixture)))
  for (const first of new Set(
    runs.filter((r) => r.fixture === fixture).map((r) => r.first),
  ))
    for (const name of [
      ...new Set(runs.flatMap((r) => r.observations.map((o) => o.name))),
      "refresh_sum",
    ])
      for (const pass of ["first", "second", "third"]) {
        const selected = runs.filter(
          (r) => r.fixture === fixture && r.first === first,
        );
        const pairs = [];
        const value = (r: typeof Run.Type) =>
          name === "refresh_sum"
            ? r.observations
                .filter((o) => o.pass === pass)
                .reduce((s, o) => s + o.handler, 0)
            : r.observations.find((o) => o.name === name && o.pass === pass)
                ?.handler;
        for (const pair of new Set(selected.map((r) => r.pair))) {
          const a = selected.find((r) => r.pair === pair && !r.pressure),
            b = selected.find((r) => r.pair === pair && r.pressure);
          if (!a || !b) continue;
          const A = value(a),
            B = value(b);
          if (A === undefined || B === undefined) continue;
          pairs.push({
            pair,
            baseline_ms: A,
            pressure_ms: B,
            difference_ms: B - A,
            ratio: B / A,
          });
        }
        if (!pairs.length) continue;
        const differences = pairs.map((p) => p.difference_ms),
          m = median(differences) ?? 0,
          variation = Math.max(...differences) - Math.min(...differences);
        paired.push({
          fixture,
          first,
          name,
          pass,
          pairs,
          baseline: stat(pairs.map((p) => p.baseline_ms)),
          pressure: stat(pairs.map((p) => p.pressure_ms)),
          difference: stat(differences),
          ratio: stat(pairs.map((p) => p.ratio)),
          pair_variation_ms: variation,
          verdict:
            pairs.length < 5
              ? "insufficient pairs"
              : Math.abs(m) <= variation
                ? "inconclusive"
                : "difference exceeds paired variation in this cohort",
        });
      }
const result = {
  runs: runs.length,
  requests: runs.reduce(
    (s, r) =>
      s +
      r.observations.length +
      (r.parallel?.length ?? 0) +
      (r.locked ? 1 : 0),
    0,
  ),
  held: data.results.filter((r) => "held" in r && r.held).length,
  timeouts: data.results.filter((r) => "cell_timeout" in r).length,
  statuses: [
    ...new Set(runs.flatMap((r) => r.observations.map((o) => o.status))),
  ],
  quiet_runs: runs.filter((r) => r.load_start <= 4 && r.load_end <= 4).length,
  load_range: runs.length
    ? [
        Math.min(...runs.map((r) => Math.min(r.load_start, r.load_end))),
        Math.max(...runs.map((r) => Math.max(r.load_start, r.load_end))),
      ]
    : null,
  rows,
  totals,
  paired,
};
writeFileSync(
  process.argv[3] ?? "summary.json",
  JSON.stringify(result, null, 2),
);
console.log(
  JSON.stringify({
    runs: result.runs,
    requests: result.requests,
    held: result.held,
    timeouts: result.timeouts,
    quiet_runs: result.quiet_runs,
    load_range: result.load_range,
  }),
);
