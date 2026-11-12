import { Database } from "bun:sqlite";
import { setSystemTime } from "bun:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Profile, Task } from "@todo/domain";
import { openStore } from "@todo/domain/store";
import { Effect, Schema } from "effect";

setSystemTime(new Date("2026-11-11T18:00:00Z"));
const [binary, manifest, output] = process.argv.slice(2);
assert.ok(binary && manifest && output);
const evidence = resolve(output);
mkdirSync(evidence, { recursive: true });
const fixture = JSON.parse(readFileSync(manifest, "utf8"))[0];
const templateDb = new Database(fixture.path, { readonly: true });
const row = templateDb
  .query<{ payload: string }, []>("SELECT payload FROM tasks LIMIT 1")
  .get();
assert.ok(row);
const template = Schema.decodeUnknownSync(Task)(JSON.parse(row.payload));
templateDb.close();
const scratch = mkdtempSync(join(tmpdir(), "todo-read-concurrent-"));
const run = Effect.runPromise,
  at = "2026-11-11T18:00:00Z";
const store = await run(openStore({ path: join(scratch, "scratch.db") }));
const credentials: Record<string, string> = {};
let provisioned = false;
try {
  await run(store.auth.setupOwner("interleaved read scratch only"));
  const owner = await run(store.auth.signIn("interleaved read scratch only"));
  for (const id of ["work", "personal"]) {
    const profile = Schema.decodeUnknownSync(Profile)({
      id,
      name: id,
      created_at: at,
      updated_at: at,
    });
    await run(store.putProfile(profile));
    const task = Schema.decodeUnknownSync(Task)({
      ...template,
      id: "aa-" + id,
      profile_id: id,
      title: id + " literal",
      project_id: null,
      tags: [],
      attachments: [],
      occurrence: null,
      row_version: 1,
      created_at: at,
      updated_at: at,
      completed_at: null,
      external_id: null,
      status: "open",
      deleted_at: null,
      due_at: null,
      scheduled_at: null,
    });
    const appended = await run(
      store.append({
        actor: Schema.decodeUnknownSync(
          Schema.NonEmptyString.pipe(Schema.brand("ActorId")),
        )("owner"),
        profile: profile.id,
        event: {
          kind: "TaskCreated",
          entity_version: 1,
          occurred_at: at,
          task,
          series: null,
          project: null,
          tags: [],
        },
      }),
    );
    assert.equal(appended.outcome, "committed");
    credentials[id] = (
      await run(
        store.auth.issueToken({
          credential: owner.credential,
          token: { name: id, profile: profile.id, scope: "read-only" },
        }),
      )
    ).credential;
  }
  provisioned = true;
} finally {
  await run(store.close());
  if (!provisioned) rmSync(scratch, { recursive: true, force: true });
}
const results = [];
try {
  for (const mode of ["off", "credential", "port"]) {
    const home = join(scratch, "home");
    mkdirSync(home, { recursive: true });
    const child: ReturnType<typeof spawn> = spawn(resolve(binary), [], {
      env: {
        ...process.env,
        HOME: home,
        TODO_DB: join(scratch, "scratch.db"),
        TODO_ATTACHMENT_ROOT: join(scratch, "attachments"),
        READ_BOUNDARY_MODE: mode,
        READ_BOUNDARY_INTERLEAVE: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let log = "";
    child.stdout?.on("data", (b: Buffer) => (log += b));
    child.stderr?.on("data", (b: Buffer) => (log += b));
    try {
      const deadline = performance.now() + 60000;
      while (!/Listening on (http:\/\/127.0.0.1:\d+)/.test(log)) {
        assert.equal(child.exitCode, null, log);
        assert.ok(performance.now() < deadline, log);
        await new Promise((r) => setTimeout(r, 10));
      }
      const base = log.match(/Listening on (http:\/\/127.0.0.1:\d+)/)?.[1];
      assert.ok(base);
      for (let pair = 0; pair < 10; pair++) {
        const actual: string[][][] = await Promise.all(
          ["work", "personal"].map(async (profile): Promise<string[][]> => {
            const response: Response = await fetch(
              base + "/profiles/" + profile + "/tasks?status=open",
              { headers: { Authorization: "Bearer " + credentials[profile] } },
            );
            assert.equal(response.status, 200);
            const body: readonly { id: string; profile_id: string }[] =
              Schema.decodeUnknownSync(
                Schema.Array(
                  Schema.Struct({
                    id: Schema.String,
                    profile_id: Schema.String,
                  }),
                ),
              )(await response.json());
            return body.map((t) => [t.id, t.profile_id]);
          }),
        );
        assert.deepEqual(actual, [
          [["aa-work", "work"]],
          [["aa-personal", "personal"]],
        ]);
      }
    } finally {
      if (child.exitCode === null && child.signalCode === null) {
        const done = new Promise((r) => child.once("exit", r));
        child.kill("SIGTERM");
        await done;
      }
      writeFileSync(join(evidence, mode + ".log"), log);
    }
    const counters = JSON.parse(
      log.match(/BOUNDARY_COUNTERS (\{[^\n]+\})/)?.[1] ?? "null",
    );
    assert.ok(
      counters && counters.overlap > 0,
      "Two requests must overlap on this server",
    );
    if (mode !== "off") assert.ok(counters.mutations > 0);
    results.push({ mode, pairs: 10, responses: 20, counters });
    writeFileSync(
      join(evidence, "result.json"),
      JSON.stringify(results, null, 2),
    );
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
  writeFileSync(
    join(evidence, "cleanup.json"),
    JSON.stringify({ scratchRemoved: true }),
  );
}
