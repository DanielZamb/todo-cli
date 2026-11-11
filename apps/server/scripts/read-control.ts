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
import { DiagnosticsSnapshot } from "@todo/domain";
import { Schema } from "effect";

const Fixture = Schema.Struct({
  id: Schema.String,
  path: Schema.String,
  credential: Schema.String,
  credentials: Schema.optionalKey(Schema.Array(Schema.String)),
  all_tasks: Schema.optionalKey(Schema.Boolean),
  attachment_root: Schema.optionalKey(Schema.String),
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
      TODO_ATTACHMENT_ROOT:
        fixture.attachment_root ?? join(scratch, "attachments"),
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
    const streamProfile =
      profiles.find((p) => p.id === "work")?.id ??
      profiles.find((p) => p.id === "p0")?.id ??
      profiles[0]?.id;
    assert.ok(streamProfile);
    const cursor = Math.max(
      0,
      (db
        .query<{ seq: number }, []>(
          "SELECT coalesce(max(seq),0) AS seq FROM op_log",
        )
        .get()?.seq ?? 0) - 3,
    );
    const streamOperations =
      db
        .query<{ count: number }, [string, number]>(
          "SELECT count(*) AS count FROM op_log WHERE profile=? AND outcome='committed' AND seq>?",
        )
        .get(streamProfile, cursor)?.count ?? 0;
    routes.push(`/profiles/${streamProfile}/events`);
    for (const image of db
      .query<
        { profile: string; task: string; attachment: string },
        []
      >(`SELECT t.profile_id AS profile,t.id AS task,json_extract(a.value,'$.id') AS attachment
      FROM tasks t,json_each(t.payload,'$.attachments') a WHERE json_extract(a.value,'$.kind')='image'`)
      .all())
      routes.push(
        `/profiles/${image.profile}/tasks/${image.task}/attachments/${image.attachment}/image`,
      );
    for (const profile of [...profiles.map((p) => p.id), "missing"]) {
      const prefix = `/profiles/${encodeURIComponent(profile)}`;
      routes.push(
        `${prefix}/projects`,
        `${prefix}/tags`,
        `${prefix}/quick-add/parse`,
      );
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
    for (const [credentialIndex, credential] of [
      ...(fixture.credentials ?? [fixture.credential]),
      "invalid",
      undefined,
    ].entries())
      for (const route of routes) {
        const response: Response = await fetch(base + route, {
          signal: AbortSignal.timeout(30_000),
          ...(route.endsWith("/quick-add/parse")
            ? {
                method: "POST",
                body: JSON.stringify({
                  text: "Prepare #focus p1",
                  now: "2026-11-11T12:00:00Z",
                  time_zone: "UTC",
                }),
              }
            : {}),
          headers:
            credential === undefined
              ? {}
              : {
                  Authorization: `Bearer ${credential}`,
                  "Content-Type": "application/json",
                  ...(route.endsWith("/events")
                    ? { "Last-Event-ID": String(cursor) }
                    : {}),
                },
        });
        let bytes: Buffer;
        if (route.endsWith("/events") && response.status === 200) {
          const reader: ReadableStreamDefaultReader<Uint8Array> | undefined =
            response.body?.getReader();
          assert.ok(reader);
          bytes = Buffer.alloc(0);
          try {
            while (
              !bytes.toString("utf8").includes("event: ready") ||
              (bytes.toString("utf8").match(/event: operation/g)?.length ?? 0) <
                streamOperations
            ) {
              const chunk: Awaited<
                ReturnType<ReadableStreamDefaultReader<Uint8Array>["read"]>
              > = await reader.read();
              assert.equal(
                chunk.done,
                false,
                route + JSON.stringify(bytes.toString("utf8").slice(0, 2000)),
              );
              bytes = Buffer.concat([bytes, Buffer.from(chunk.value ?? [])]);
            }
          } finally {
            await reader.cancel();
          }
        } else bytes = Buffer.from(await response.arrayBuffer());
        if (
          route === "/snapshots" &&
          credentialIndex === 0 &&
          response.status === 200
        ) {
          const snapshots = Schema.decodeUnknownSync(
            Schema.Struct({
              snapshots: Schema.Array(Schema.Struct({ id: Schema.String })),
            }),
          )(JSON.parse(bytes.toString("utf8"))).snapshots;
          for (const snapshot of snapshots)
            routes.push(`/snapshots/${snapshot.id}`);
        }
        replies.push({
          route,
          credential:
            credential === undefined
              ? "missing"
              : `credential-${credentialIndex}`,
          status: response.status,
          bytes: bytes.toString("base64"),
        });
      }
    const diagnostics = await fetch(base + "/diagnostics", {
      headers: { Authorization: `Bearer ${fixture.credential}` },
    });
    assert.equal(diagnostics.status, 200);
    const credentialUses = Schema.decodeUnknownSync(
      Schema.Struct({ credentials: DiagnosticsSnapshot.fields.credentials }),
    )(await diagnostics.json()).credentials;
    const audit = new Database(path, { readonly: true });
    try {
      const authentication = audit
        .query(`SELECT seq,actor,profile,entity_version,event,from_version,to_version,outcome,reason
        FROM op_log WHERE json_extract(event,'$.kind') IN ('AuthChanged','AuthAttemptRejected') ORDER BY seq`)
        .all();
      return { replies, authentication, credentialUses };
    } finally {
      audit.close();
    }
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
  results.push({ fixture: fixture.id, responses: oldReplies.replies.length });
  writeFileSync(
    join(evidence, "result.json"),
    JSON.stringify(results, null, 2),
  );
  process.stdout.write(
    `${fixture.id}: ${oldReplies.replies.length} byte-identical replies and equal auth History/last-use\n`,
  );
}
