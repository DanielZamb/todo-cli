import { readFileSync, writeFileSync } from "node:fs";
import { Schema } from "effect";
import { Task } from "../../packages/domain/src/entities.ts";
import { stats } from "./stats.ts";
import { loadavg } from "node:os";
const sample = JSON.parse(
    readFileSync("docs/evidence/sync-experiment/samples.json", "utf8"),
  )[0],
  tasks = Object.values(sample.after.rows).slice(0, 60);
let text = JSON.stringify({ tasks });
const last = tasks.at(-1);
if (!last || typeof last !== "object" || !("description" in last))
  throw Error("fixture");
last.description =
  String(last.description) + "x".repeat(Math.max(0, 132000 - text.length));
text = JSON.stringify({ tasks });
if (text.length !== 132000) throw Error("list size " + text.length);
writeFileSync("docs/evidence/sync-experiment/list-132k.json", text);
const results = [];
for (let pair = 0; pair < 5; pair++) {
  const parse = [],
    validate = [];
  for (let i = 0; i < 110; i++) {
    let t = performance.now();
    const data = JSON.parse(text);
    if (i >= 10) parse.push(performance.now() - t);
    t = performance.now();
    const value = Schema.decodeUnknownSync(
      Schema.Struct({ tasks: Schema.Array(Task) }),
    )(data);
    if (i >= 10) validate.push(performance.now() - t);
    if (value.tasks.length !== 60) throw Error("decode");
  }
  results.push({
    pair,
    load: loadavg(),
    parse: stats(parse),
    validate: stats(validate),
  });
}
writeFileSync(
  "docs/evidence/sync-experiment/list-cost.json",
  JSON.stringify(results, null, 2),
);
