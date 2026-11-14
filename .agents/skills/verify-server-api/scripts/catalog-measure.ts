// Catalog measurement (C10-S5): today's eight refresh reads against one Catalog read,
// on a fresh owner-shaped scratch fixture (about 1.9 KB of payload per Task).
// Handler work in process, paired and alternating; also the time each refresh
// holds SQLite's write lock (every Profile read lease is BEGIN IMMEDIATE).
import { mkdirSync, rmSync } from "node:fs";
import { loadavg } from "node:os";
import { join, resolve } from "node:path";
import { Effect, Schema } from "effect";
import {
  CatalogReads,
  ClientReads,
  Instant,
  Profile,
  ProfileId,
} from "../../../../packages/domain/src/index.ts";
import { openStore, TaskCommands } from "../../../../packages/domain/src/store/store.ts";

const run = Effect.runPromise;
const N = Number(process.argv[2]);
const root = resolve(`.scratch/catalog-measure/n${N}`);
rmSync(root, { recursive: true, force: true });
mkdirSync(root, { recursive: true });
const store = await run(openStore({ path: join(root, "scratch.db") }));
const db: any = Reflect.get(store, "db");
const nowIso = "2026-11-13T15:00:00.000Z";
const now = Schema.decodeUnknownSync(Instant)("2026-11-13T15:00:00Z");
for (const [id, name] of [["work", "Work"], ["personal", "Personal"]])
  await run(store.putProfile(Schema.decodeUnknownSync(Profile)({ id, name, created_at: nowIso, updated_at: nowIso })));
await run(store.auth.setupOwner("measure scratch only"));
const { credential } = await run(store.auth.signIn("measure scratch only"));
const request = { credential, profile: Schema.decodeUnknownSync(ProfileId)("work") };
const commands = new TaskCommands(store);
const day = (offset: number) => new Date(Date.parse(nowIso) + offset * 86400000).toISOString().slice(0, 10);
let seed = 7;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648), seed / 2147483648);
const words = "plan write review call pay send draft check fix ship read note budget invoice trip meeting report garden".split(" ");
const description = () =>
  Array.from({ length: 230 }, () => words[Math.floor(rand() * words.length)]).join(" ");
const ids: string[] = [];
const t0 = performance.now();
for (let i = 0; i < N; i++) {
  const input: Record<string, unknown> = {
    title: `Task ${i} ${words[i % words.length]} ${words[(i * 7) % words.length]}`,
    description: description(),
    priority: ["P1", "P2", "P3", "P4"][i % 4],
    source: "agent",
    project_name: i % 9 === 0 ? "" : `Project ${(i % 8) + 1}`,
    tag_names: [`tag${i % 12}`, `area${i % 5}`],
  };
  if (rand() < 0.35) input.due_at = { kind: "date", date: day(Math.floor(rand() * 40) - 20) };
  if (rand() < 0.3) input.scheduled_at = { kind: "date", date: day(Math.floor(rand() * 20) - 5) };
  if (i % 10 === 9 && ids.length) input.depends_on = [ids[ids.length - 1]];
  const created: any = await run(commands.create(request, input as never));
  if (created.outcome !== "committed") throw new Error(JSON.stringify(created).slice(0, 300));
  ids.push(created.task.id);
  if (i % 4 === 3 && i % 10 !== 9) {
    const done: any = await run(commands.transition({ ...request, task_id: created.task.id } as never, { from_version: created.task.row_version, action: "complete" } as never));
    if (done.outcome !== "committed") throw new Error(`transition ${i} ${JSON.stringify(done).slice(0, 400)}`);
  }
}
const build = performance.now() - t0;
const bytes = db.query("SELECT count(*) AS n, sum(length(CAST(payload AS BLOB))) AS b FROM tasks WHERE profile_id='work'").get();

// Write-lock hold: every BEGIN IMMEDIATE runs through OperationStore.transaction.
let held = 0;
const original = (store as any).transaction.bind(store);
(store as any).transaction = (body: () => unknown) => {
  const start = performance.now();
  try {
    return original(body);
  } finally {
    held += performance.now() - start;
  }
};
const reads = new ClientReads(store);
const catalogs = new CatalogReads(store);
const timed = async (body: () => Promise<unknown>) => {
  held = 0;
  const start = performance.now();
  await body();
  return { ms: performance.now() - start, held };
};
const todaysFull = () =>
  timed(async () => {
    await run(commands.list(request));
    await run(reads.profiles(credential));
    await run(reads.projects(request));
    await run(reads.tags(request));
    for (const v of ["today", "overdue", "scheduled", "inbox"] as const) await run(reads.view(request, v, now));
  });
const todaysQuery = () =>
  timed(async () => {
    await run(commands.list(request, { text: "invoice" }));
    await run(reads.view(request, "today", now));
  });
const catalogAll = () => timed(() => run(catalogs.read(request, { view: "today", now })));
const catalogMatching = () => timed(() => run(catalogs.read(request, { view: "today", now, tasks: "matching", text: "invoice" })));
const cells = { todaysFull, catalogAll, todaysQuery, catalogMatching } as const;
for (let i = 0; i < 3; i++) for (const cell of Object.values(cells)) await cell();
const samples: Record<string, { ms: number[]; held: number[] }> = {};
for (const name of Object.keys(cells)) samples[name] = { ms: [], held: [] };
const load = [loadavg()[0]];
const names = Object.keys(cells) as (keyof typeof cells)[];
for (let round = 0; round < 15; round++) {
  const order = round % 2 === 0 ? names : [...names].reverse();
  for (const name of order) {
    const value = await cells[name]();
    samples[name]?.ms.push(value.ms);
    samples[name]?.held.push(value.held);
  }
}
load.push(loadavg()[0]);
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;
const summary = (xs: number[]) => `${median(xs).toFixed(2)} [${Math.min(...xs).toFixed(2)}, ${Math.max(...xs).toFixed(2)}]`;
console.log(
  JSON.stringify({
    N,
    tasks: bytes.n,
    bytesPerTask: Math.round(bytes.b / bytes.n),
    buildSeconds: Math.round(build / 1000),
    load: load.map((x) => +x.toFixed(2)),
    cells: Object.fromEntries(
      Object.entries(samples).map(([name, value]) => [name, { ms: summary(value.ms), writeLockHeld: summary(value.held) }]),
    ),
  }),
);
await run(store.close());
