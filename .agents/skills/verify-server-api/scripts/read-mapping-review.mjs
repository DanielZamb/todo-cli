import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const before = "ade8f941f3d15c61cffdb58d45114b4ababbcc5e";
const candidate = process.argv[2];
assert.match(candidate, /^[0-9a-f]{40}$/);
const source = (commit, path) =>
  execFileSync("git", ["show", `${commit}:${path}`], { encoding: "utf8" });
const hash = (value) => createHash("sha256").update(value).digest("hex");
const bodies = [];
const compare = (path, name, pick = (text) => text) => {
  const a = pick(source(before, path)), b = pick(source(candidate, path));
  assert.ok(a.length > 0, `${name}: empty body`);
  assert.equal(b, a, `${name}: covered body changed`);
  assert.equal(readFileSync(path, "utf8"), source(candidate, path), path);
  bodies.push({ path, name, before: hash(a), after: hash(b), byteIdentical: true });
};
const between = (start, end) => (text) => {
  const first = text.indexOf(start), last = text.indexOf(end, first + start.length);
  assert.ok(first >= 0 && last > first, start);
  assert.equal(text.indexOf(start, first + start.length), -1, start);
  return text.slice(first, last);
};
const members = (text, name) => {
  const first = text.indexOf(`export class ${name} {`);
  assert.ok(first >= 0);
  const last = text.indexOf("\n}", first);
  assert.ok(last > first);
  const body = text.slice(first, last);
  const rows = [...body.matchAll(/^  (?:(?:private|public|readonly|static|async|get) )*\*?(\w+)\b/gm)];
  return new Map(rows.map((row, i) => [row[1], body.slice(row.index, rows[i + 1]?.index ?? body.length)]));
};
const member = (className, name) => (text) => {
  const value = members(text, className).get(name);
  assert.ok(value, `${className}.${name}`);
  return value;
};
for (const path of [
  "packages/domain/src/task-search-cache.ts",
  "packages/domain/src/task-search.ts",
  "packages/domain/src/task-search-case-fold.ts",
  "packages/domain/src/task-filters.ts",
  "packages/domain/src/store/snapshots.ts",
  "packages/domain/src/store/search-cache-events.ts",
  "apps/server/src/task-search-cache-hygiene.ts",
  ".agents/skills/verify-task-search-cache/admission/TaskSearchCacheAdmission.tla",
  ".agents/skills/verify-task-search-cache/admission/MAPPING.md",
]) compare(path, path);
const cache = "packages/domain/src/task-search-cache.ts";
for (const name of members(source(before, cache), "TaskSearchCache").keys())
  compare(cache, `TaskSearchCache.${name}`, member("TaskSearchCache", name));
const matcher = "packages/domain/src/task-search.ts";
const matcherSource = source(before, matcher);
const declarations = [...matcherSource.matchAll(/^(?:export )?(?:function\*? |class |const )(\w+)/gm)];
for (const [i, row] of declarations.entries()) {
  const next = declarations[i + 1];
  const start = matcherSource.slice(row.index, row.index + row[0].length + 1);
  const end = next && matcherSource.slice(next.index, next.index + next[0].length + 1);
  compare(matcher, row[1], end ? between(start, end) : (text) => text.slice(text.indexOf(start)));
}
const filters = "packages/domain/src/task-filters.ts";
for (const [start, end] of [
  ["function* filterTaskRecordSteps(", "export function filterTaskRecords("],
  ["export function filterTaskRecords(", "export function runTaskRecordSteps"],
  ["export function runTaskRecordSteps", "export function filterTaskRecordsEffect("],
]) compare(filters, start, between(start, end));
compare(filters, "filterTaskRecordsEffect", (text) => text.slice(text.indexOf("export function filterTaskRecordsEffect(")));
const store = "packages/domain/src/store/store.ts";
for (const name of ["close", "deleteProfileSync", "searchCacheEvents", "appendSync"])
  compare(store, `OperationStore.${name}`, member("OperationStore", name));
for (const name of ["generationSync", "restore"])
  compare("packages/domain/src/store/snapshots.ts", `Snapshots.${name}`, member("Snapshots", name));
const commands = "packages/domain/src/commands.ts";
for (const statement of [
  "const search = store.searchWords.read(selected.profile);",
  "const search = this.store.searchWords.read(selected.profile);",
  "prepare: (text) => store.searchWords.words(search, text),",
  "prepare: (text) => this.store.searchWords.words(search, text),",
]) compare(commands, statement, (text) => {
  assert.equal(text.split(statement).length, 2);
  return statement;
});
compare(commands, "readTasks matching and preparation", between("  const ordered = graph.tasks", "\n  return {"));
compare(commands, "TaskCommands.list matching and preparation", between("        const tasks = graph.tasks", "        return tasksRead;"));
compare("apps/server/src/server.ts", "external erasure observer startup", between("      const cacheHygiene = yield*", "      yield* scheduler(store)"));
compare("apps/cli/src/main.ts", "Task search CLI defect classification", between("            Effect.catchDefect((error) =>", "          yield* write("));
writeFileSync("docs/evidence/ui-speed/server-reads/final-cache-body-review.json", JSON.stringify({ before, candidate, bodies }, null, 2));
console.log(JSON.stringify({ before, candidate, bodies: bodies.length, byteIdentical: true }));
