import { Database } from "bun:sqlite";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Schema } from "effect";

const Fixture = Schema.Struct({
  id: Schema.String,
  path: Schema.String,
  credential: Schema.String,
  credentials: Schema.optionalKey(Schema.Array(Schema.String)),
  all_tasks: Schema.optionalKey(Schema.Boolean),
});
const [before, after, manifest, output] = process.argv.slice(2);
assert.ok(
  before && after && manifest && output,
  "Expected before after manifest output",
);
const fixtures = Schema.decodeUnknownSync(Schema.Array(Fixture))(
  JSON.parse(readFileSync(manifest, "utf8")),
);
const evidence = resolve(output);
mkdirSync(evidence, { recursive: true });
const results: unknown[] = [];
const pause = (ms: number) => new Promise((done) => setTimeout(done, ms));

async function sample(
  binary: string,
  fixture: typeof Fixture.Type,
  scratch: string,
) {
  const path = join(scratch, "scratch.db");
  for (const suffix of ["-wal", "-shm"]) rmSync(path + suffix, { force: true });
  copyFileSync(fixture.path, path);
  mkdirSync(join(scratch, "home"), { recursive: true });
  const child = spawn(binary, [], {
    env: {
      ...process.env,
      HOME: join(scratch, "home"),
      TODO_DB: path,
      TODO_ATTACHMENT_ROOT: join(scratch, "attachments"),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  child.stdout.on("data", (chunk) => {
    log += chunk;
  });
  child.stderr.on("data", (chunk) => {
    log += chunk;
  });
  try {
    const deadline = performance.now() + 60_000;
    while (!/Listening on http:\/\/127.0.0.1:\d+/.test(log)) {
      assert.equal(child.exitCode, null, log);
      assert.ok(performance.now() < deadline, log);
      await pause(20);
    }
    const base = log.match(/Listening on (http:\/\/127.0.0.1:\d+)/)?.[1];
    assert.ok(base);
    const db = new Database(path, { readonly: true });
    const profiles = db
      .query<{ id: string }, []>("SELECT id FROM profiles ORDER BY id")
      .all();
    const tasks = db
      .query<{ id: string; profile_id: string }, []>(
        "SELECT id,profile_id FROM tasks ORDER BY id",
      )
      .all();
    const routes = [
      "/health",
      "/openapi.json",
      "/profiles",
      "/profiles?include_projects=true",
      "/tasks/lookup?prefix=a",
      "/tasks/lookup?prefix=",
      "/auth/tokens",
      "/snapshots",
      "/snapshots/00000000-0000-4000-8000-000000000000",
    ];
    for (const profile of [...profiles.map((p) => p.id), "missing"]) {
      const prefix = `/profiles/${encodeURIComponent(profile)}`;
      routes.push(`${prefix}/projects`, `${prefix}/tags`);
      for (const query of [
        "",
        "?status=all",
        "?status=closed",
        "?ready=true",
        "?blocked=true",
        "?order=topo",
        "?order=lightest",
        "?text=Scratch",
        "?prefix=a",
        "?unexpected=1",
      ])
        routes.push(`${prefix}/tasks${query}`);
      for (const name of ["inbox", "overdue", "today", "scheduled"])
        routes.push(`${prefix}/views/${name}?now=2026-11-11T12%3A00%3A00Z`);
      const targets = tasks.filter((t) => t.profile_id === profile);
      for (const id of [
        ...(fixture.all_tasks
          ? targets
          : [...targets.slice(0, 2), ...targets.slice(-1)]
        ).map((t) => t.id),
        "missing",
      ])
        routes.push(
          `${prefix}/tasks/${id}`,
          `${prefix}/tasks/${id}/history`,
          `${prefix}/tasks/${id}/graph`,
          `${prefix}/tasks/${id}/attachments/missing/image`,
        );
    }
    db.close();
    const replies = [];
    for (const credential of [
      ...(fixture.credentials ?? [fixture.credential]),
      "invalid",
      undefined,
    ])
      for (const route of routes) {
        const response = await fetch(base + route, {
          headers:
            credential === undefined
              ? {}
              : { Authorization: `Bearer ${credential}` },
        });
        replies.push({
          route,
          credential:
            credential === fixture.credential
              ? "valid"
              : (credential ?? "missing"),
          status: response.status,
          text: await response.text(),
        });
      }
    return replies;
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      const ended = new Promise((done) => child.once("exit", done));
      child.kill("SIGTERM");
      await ended;
    }
  }
}

for (const fixture of fixtures) {
  const scratch = mkdtempSync(join(tmpdir(), "todo-read-control-"));
  let oldReplies: Awaited<ReturnType<typeof sample>>;
  let newReplies: Awaited<ReturnType<typeof sample>>;
  try {
    oldReplies = await sample(resolve(before), fixture, scratch);
    newReplies = await sample(resolve(after), fixture, scratch);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
  writeFileSync(
    join(evidence, `${fixture.id}.json`),
    JSON.stringify({ before: oldReplies, after: newReplies }),
  );
  assert.deepEqual(newReplies, oldReplies, fixture.id);
  results.push({ fixture: fixture.id, responses: oldReplies.length });
  writeFileSync(
    join(evidence, "result.json"),
    JSON.stringify(results, null, 2),
  );
  process.stdout.write(
    `${fixture.id}: ${oldReplies.length} byte-identical replies\n`,
  );
}
