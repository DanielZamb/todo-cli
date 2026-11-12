import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { Schema } from "effect";
import { Replica, Patch } from "./model.ts";
import { Subscription } from "./protocol.ts";
import { difference } from "./patch.ts";
const sample = JSON.parse(
  readFileSync("docs/evidence/sync-experiment/bench.json", "utf8"),
).samples.find((s: { kind: string }) => s.kind === "complete");
const before = Schema.decodeUnknownSync(Replica)(sample.before),
  after = Schema.decodeUnknownSync(Replica)(sample.after),
  patch = Schema.decodeUnknownSync(Patch)(sample.whole);
let checks = 0;
for (const order of ["reply-first", "stream-first"]) {
  const s = new Subscription(before),
    token = s.token();
  s.pending.set("accepted", "Complete");
  s.pending.set("refused", "Rename");
  assert.equal(s.caughtUp, false);
  assert.equal(await s.enqueue(token, patch), true);
  assert.equal(await s.enqueue(token, patch), true);
  assert.deepEqual(s.replica, after);
  s.refuse("refused");
  assert.equal(s.pending.get("accepted"), "Complete");
  s.markCaughtUp(token, after.generation, after.cursor);
  assert.equal(s.caughtUp, true);
  checks++;
}
const s = new Subscription(before),
  old = s.token(),
  token = s.replace(before);
assert.equal(await s.enqueue(old, patch), false);
assert.deepEqual(s.replica, before);
s.markCaughtUp(old, before.generation, before.cursor);
assert.equal(s.caughtUp, false);
assert.equal(await s.enqueue(token, { ...patch, from: "missing" }), false);
assert.equal(s.reason, "gap");
checks++;
const tiny = new Subscription(before, 1);
assert.equal(await tiny.enqueue(tiny.token(), patch), false);
assert.equal(tiny.reason, "overflow");
assert.deepEqual(tiny.replica, before);
checks++;
const t = new Subscription(before);
await t.enqueue(t.token(), patch);
const id = "p0-t040",
  renamed = {
    ...after,
    rows: {
      ...after.rows,
      [id]: { ...after.rows[id]!, title: "remote rename" },
    },
    cursor: after.cursor + "-rename",
  };
t.pending.set("draft", "local rename");
await t.enqueue(t.token(), difference(after, renamed, "whole"));
t.refuse("draft");
assert.equal(t.replica.rows[id]?.title, "remote rename");
assert.equal(await t.enqueue(t.token(), patch), true);
assert.equal(t.replica.rows[id]?.title, "remote rename");
const removed = {
  ...renamed,
  rows: { ...renamed.rows },
  computed: { ...renamed.computed },
  cursor: after.cursor + "-remove",
};
Reflect.deleteProperty(removed.rows, id);
Reflect.deleteProperty(removed.computed, id);
await t.enqueue(t.token(), difference(renamed, removed, "whole"));
assert.equal(t.replica.rows[id], undefined);
checks++;
writeFileSync(
  "docs/evidence/sync-experiment/protocol.json",
  JSON.stringify({
    checks,
    replaced_connection: true,
    duplicate_reply_and_stream: true,
    gap: true,
    overflow: true,
    remote_rename_and_remove: true,
    caught_up_marker: true,
  }),
);
console.log("protocol", checks);
