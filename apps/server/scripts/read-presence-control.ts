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
import { dirname, join, resolve } from "node:path";
import { setTimeout as pause } from "node:timers/promises";
import { Schema } from "effect";

const Fixture = Schema.Struct({
  path: Schema.String,
  credentials: Schema.Struct({
    none: Schema.Null,
    invalid: Schema.String,
    expiredSession: Schema.String,
    revokedSession: Schema.String,
    owner: Schema.String,
    expiredToken: Schema.String,
    unscoped: Schema.String,
    other: Schema.String,
    work: Schema.String,
    revokedToken: Schema.String,
  }),
  profiles: Schema.Struct({
    present: Schema.String,
    never: Schema.String,
    tombstoned: Schema.String,
    reusedId: Schema.String,
    reusedName: Schema.String,
    oldReusedId: Schema.String,
  }),
});
const Replies = Schema.Array(
  Schema.Struct({
    credentialClass: Schema.String,
    profileClass: Schema.String,
    route: Schema.String,
    status: Schema.Number,
    bytes: Schema.String,
  }),
);
const [binary, fixtureFile, output, baseline] = process.argv.slice(2);
assert.ok(binary && fixtureFile && output);
const fixture = Schema.decodeUnknownSync(Fixture)(
  JSON.parse(readFileSync(fixtureFile, "utf8")),
);
assert.ok(fixture.path.startsWith(`${resolve(".scratch")}/`));
const directory = mkdtempSync(join(tmpdir(), "todo-presence-"));
copyFileSync(fixture.path, join(directory, "scratch.db"));
const db = new Database(join(directory, "scratch.db"));
const cursor =
  db
    .query<{ seq: number }, []>(
      "SELECT coalesce(max(seq),0) AS seq FROM op_log",
    )
    .get()?.seq ?? 0;
db.close();
const child = spawn(resolve(binary), [], {
  env: {
    ...process.env,
    HOME: directory,
    TODO_DB: join(directory, "scratch.db"),
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let log = "";
child.stdout.on("data", (chunk: Buffer) => {
  log += chunk.toString();
});
child.stderr.on("data", (chunk: Buffer) => {
  log += chunk.toString();
});
const replies: Array<(typeof Replies.Type)[number]> = [];
const probes: Array<{
  route: string;
  statements: readonly string[];
  decodes: number;
}> = [];
const suffixes = [
  "projects",
  "tags",
  "tasks",
  "tasks?text=sentinel",
  "views/inbox?now=2026-11-11T12%3A00%3A00Z",
  "views/today?now=2026-11-11T12%3A00%3A00Z",
  "views/overdue?now=2026-11-11T12%3A00%3A00Z",
  "views/scheduled?now=2026-11-11T12%3A00%3A00Z",
  "tasks/ab-present",
  "tasks/ab-present/history",
  "tasks/ab-present/graph",
  "tasks/ab-present/attachments/missing/image",
  "quick-add/parse",
  "events",
];
try {
  const deadline = performance.now() + 30000;
  while (!/Listening on http:\/\/127.0.0.1:\d+/.test(log)) {
    assert.equal(child.exitCode, null, log);
    assert.ok(performance.now() < deadline, log);
    await pause(20);
  }
  const base = log.match(/Listening on (http:\/\/127.0.0.1:\d+)/)?.[1];
  assert.ok(base);
  for (const [credentialClass, credential] of Object.entries(
    fixture.credentials,
  )) {
    for (const [profileClass, profile] of Object.entries(fixture.profiles)) {
      if (
        process.env.READ_PRESENCE_PROBE_ONLY === "1" &&
        (credentialClass !== "owner" || profileClass !== "never")
      )
        continue;
      for (const suffix of suffixes) {
        const route = `/profiles/${encodeURIComponent(profile)}/${suffix}`;
        const quick = suffix === "quick-add/parse",
          stream = suffix === "events";
        const controller = new AbortController();
        const response: Response = await fetch(base + route, {
          signal: controller.signal,
          method: quick ? "POST" : "GET",
          headers: {
            ...(credential === null
              ? {}
              : { Authorization: `Bearer ${credential}` }),
            "Content-Type": "application/json",
            ...(stream
              ? {
                  "Last-Event-ID": String(cursor),
                  "X-Todo-Generation": "initial",
                }
              : {}),
          },
          ...(quick
            ? {
                body: JSON.stringify({
                  text: "Prepare @Absent #focus p1",
                  now: "2026-11-11T12:00:00Z",
                  time_zone: "UTC",
                }),
              }
            : {}),
        });
        let bytes: Buffer;
        if (stream && response.ok) {
          const reader: ReadableStreamDefaultReader<Uint8Array> | undefined =
            response.body?.getReader();
          assert.ok(reader);
          let text = "";
          while (!text.includes("\n\n")) {
            const row = await reader.read();
            if (row.done) break;
            text += new TextDecoder().decode(row.value);
          }
          bytes = Buffer.from(text);
          await reader.cancel();
          controller.abort();
        } else bytes = Buffer.from(await response.arrayBuffer());
        replies.push({
          credentialClass,
          profileClass,
          route,
          status: response.status,
          bytes: bytes.toString("base64"),
        });
        if (
          process.env.READ_PRESENCE_STATEMENTS === "1" &&
          credentialClass === "owner" &&
          profileClass === "never"
        ) {
          const statements = Schema.decodeUnknownSync(
            Schema.Array(Schema.String),
          )(JSON.parse(response.headers.get("x-control-statements") ?? "null"));
          const decodes = Number(
            response.headers.get("x-control-history-decodes"),
          );
          probes.push({ route, statements, decodes });
          assert.equal(
            response.status,
            suffix.includes("tasks/ab-present") && !suffix.endsWith("history")
              ? 404
              : 200,
            route,
          );
          assert.equal(statements.length, 2, route);
          assert.ok(
            statements[0]?.includes("FROM credentials WHERE secret_hash=?"),
            route,
          );
          assert.ok(statements[1]?.includes("AS requested"), route);
          assert.equal(decodes, 0, route);
        }
      }
    }
  }
  mkdirSync(dirname(resolve(output)), { recursive: true });
  writeFileSync(output, JSON.stringify(replies, null, 2));
  writeFileSync(`${output}.statements.json`, JSON.stringify(probes, null, 2));
  const byRoute = (
    a: (typeof Replies.Type)[number],
    b: (typeof Replies.Type)[number],
  ) =>
    a.credentialClass.localeCompare(b.credentialClass) ||
    a.profileClass.localeCompare(b.profileClass) ||
    a.route.localeCompare(b.route);
  const expectedAbsent = JSON.parse(
    readFileSync(
      new URL(
        "../../../packages/domain/test/fixtures/read-presence/owner-never-created.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  assert.deepEqual(
    replies
      .filter(
        (row) =>
          row.credentialClass === "owner" && row.profileClass === "never",
      )
      .map(({ route, status, bytes }) => ({ route, status, bytes })),
    expectedAbsent,
  );
  if (baseline)
    assert.deepEqual(
      [...replies].sort(byRoute),
      Schema.decodeUnknownSync(Replies)(
        JSON.parse(readFileSync(baseline, "utf8")),
      )
        .slice()
        .sort(byRoute),
    );
  console.log(
    JSON.stringify({
      replies: replies.length,
      statementProbes: probes.length,
      parity: baseline !== undefined,
    }),
  );
} finally {
  if (child.exitCode === null && child.signalCode === null) {
    const done = new Promise<void>((resolve) =>
      child.once("exit", () => resolve()),
    );
    child.kill("SIGTERM");
    await done;
  }
  rmSync(directory, { recursive: true, force: true });
}
