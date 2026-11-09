import assert from "node:assert/strict";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
  symlinkSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
const root = resolve(import.meta.dirname, "../../..");
const evidence = mkdtempSync(join(root, "docs/evidence/perf-cache/counts-"));
cpSync(
  join(root, "packages/domain/src"),
  join(evidence, "packages/domain/src"),
  { recursive: true },
);
symlinkSync(join(root, "node_modules"), join(evidence, "node_modules"));
symlinkSync(
  join(root, "packages/domain/node_modules"),
  join(evidence, "packages/domain/node_modules"),
);
const path = join(evidence, "packages/domain/src/task-search-cache.ts");
const original = readFileSync(path, "utf8");
let instrumented =
  "export const counts = { hits: 0, misses: 0, folds: 0 };\n" + original;
instrumented = instrumented.replace(
  "if (entry) {",
  "if (entry) { counts.hits++;",
);
instrumented = instrumented.replace(
  "const prepared = yield* fieldWords(text);",
  "counts.misses++; counts.folds++; const prepared = yield* fieldWords(text);",
);
writeFileSync(path, instrumented);
writeFileSync(
  join(evidence, "drive.ts"),
  `
import assert from 'node:assert/strict';
import { Effect, Schema } from 'effect';
import { ProfileId } from './packages/domain/src/ids.ts';
import { TaskSearchCache, counts } from './packages/domain/src/task-search-cache.ts';
import { matchTaskSearchSteps, parseTaskSearch, taskSearchExecution } from './packages/domain/src/task-search.ts';
import { runTaskRecordSteps } from './packages/domain/src/task-filters.ts';
import type { TaskRead } from './packages/domain/src/task-read.ts';
const cache = new TaskSearchCache();
const profile = Schema.decodeUnknownSync(ProfileId)('work');
const read=cache.read(profile);
for (const query of ['rent', 'cafe', '-absent']) {
 for(let i=0;i<1000;i++) {
  const task={title:'Rent café '+i,description:'Pay invoice tomorrow '+i};
  const clauses=parseTaskSearch(query);
  const outcomes=[];
  for(const memo of [true,false]){
   function* steps():Generator<void,TaskRead[]>{outcomes.push(yield* matchTaskSearchSteps(task,clauses,memo?{...taskSearchExecution(),prepare:text=>cache.words(read,text)}:taskSearchExecution()));return [];}
   await Effect.runPromise(runTaskRecordSteps(steps(),Effect.void));
  }
  assert.deepEqual(outcomes[0],outcomes[1]);
 }
}
assert.deepEqual(counts,{hits:4000,misses:2000,folds:2000});
console.log(JSON.stringify({counts,usage:cache.usage,work:{tasks:1000,queries:3,fields:6000},instrumentation:'isolated real source; no shipped counters'}));
`,
);
const r = spawnSync("bun", [join(evidence, "drive.ts")], {
  encoding: "utf8",
  cwd: evidence,
  timeout: 120000,
});
writeFileSync(join(evidence, "stdout"), r.stdout ?? "");
writeFileSync(join(evidence, "stderr"), r.stderr ?? "");
writeFileSync(
  join(evidence, "result.json"),
  JSON.stringify({ exit: r.status, observed: r.stdout, sourceRestored: true }),
);
assert.equal(r.status, 0, evidence);
console.log(evidence);
