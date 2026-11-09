import { Database } from "bun:sqlite";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { cpus, loadavg, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Effect, Schema } from "effect";
import { TaskResponse } from "../src/presentation.ts";
import { openStore } from "../src/store/store.ts";
import { actor, profile, work } from "../test/store-fixtures.ts";
import {
  linkCreated,
  linkEdited,
  linkedTask,
  tagCases,
} from "../test/tag-link-fixtures.ts";

const [output, cli, source] = process.argv.slice(2);
assert.ok(
  output && cli && source,
  "Usage: measure-tag-links <evidence.json> <compiled-cli> <source-hash>",
);
const directory = mkdtempSync(join(tmpdir(), "todo-tag-measure-"));
const home = join(directory, "home");
mkdirSync(home);
const samples: unknown[] = [];
const commands: unknown[] = [];
const startedLoad = loadavg();
const run = (args: string[], input = "") => {
  const start = performance.now();
  const result = spawnSync(cli, args, {
    cwd: home,
    env: {
      ...process.env,
      HOME: home,
      TODO_DB: "",
      TODO_ATTACHMENT_ROOT: join(directory, "attachments"),
    },
    encoding: "utf8",
    timeout: 60000,
    input,
  });
  const ms = performance.now() - start;
  commands.push({
    args,
    exit: result.status,
    signal: result.signal,
    stdout: args[0] === "login" ? "<session response omitted>" : result.stdout,
    stderr: result.stderr,
  });
  assert.equal(result.status, 0, result.stderr);
  return { ms, value: JSON.parse(result.stdout) };
};
let errors = 0;
try {
  run(
    ["init", "--password-stdin", "--profile", "work", "--format", "json"],
    "scratch measurement passphrase\n",
  );
  run(
    ["login", "--password-stdin", "--profile", "work", "--format", "json"],
    "scratch measurement passphrase\n",
  );
  const path = join(home, ".todo-cli/todo.db");
  await Effect.runPromise(
    Effect.gen(function* () {
      const store = yield* openStore({
        path,
        attachmentRoot: join(directory, "attachments"),
      });
      const connection: unknown = Reflect.get(store, "db");
      assert.ok(connection instanceof Database);
      connection.exec("PRAGMA wal_autocheckpoint=0");
      const settings = Object.fromEntries(
        [
          "journal_mode",
          "synchronous",
          "busy_timeout",
          "foreign_keys",
          "wal_autocheckpoint",
          "page_size",
        ].map((name) => [name, connection.query(`PRAGMA ${name}`).get()]),
      );
      assert.deepEqual(settings.journal_mode, { journal_mode: "wal" });
      assert.deepEqual(settings.synchronous, { synchronous: 2 });
      assert.deepEqual(settings.busy_timeout, { timeout: 5000 });
      assert.deepEqual(settings.foreign_keys, { foreign_keys: 1 });
      assert.deepEqual(settings.wal_autocheckpoint, { wal_autocheckpoint: 0 });
      try {
        yield* store.putProfile(work);
        for (let index = 0; index < 1000; index++) {
          const result = yield* store.append({
            actor,
            profile,
            event: linkCreated(linkedTask(`seed-${index}`)),
          });
          assert.equal(result.outcome, "committed");
        }
        const check = (task: ReturnType<typeof linkedTask>) => {
          assert.deepEqual(
            connection
              .query("SELECT payload FROM tasks WHERE id=?")
              .get(task.id),
            { payload: JSON.stringify(task) },
          );
          assert.deepEqual(
            connection
              .query(
                "SELECT tag_id FROM task_tags WHERE task_id=? ORDER BY tag_id",
              )
              .all(task.id),
            [...new Set(task.tags)].sort().map((tag_id) => ({ tag_id })),
          );
          assert.deepEqual(
            connection
              .query("SELECT version FROM task_versions WHERE id=?")
              .get(task.id),
            { version: task.row_version },
          );
        };
        let offset = 0;
        for (const entry of [
          ...tagCases,
          { name: "new", tags: ["tag-a", "tag-b", "tag-c"] },
        ]) {
          for (let index = 0; index < 30; index++) {
            const before = linkedTask(`seed-${offset + index}`);
            const event =
              entry.name === "new"
                ? linkCreated(linkedTask(`new-${index}`))
                : linkEdited(before, entry.tags);
            const expected = "after" in event ? event.after : event.task;
            connection.exec("PRAGMA wal_checkpoint(TRUNCATE)");
            assert.equal(statSync(`${path}-wal`).size, 0);
            const start = performance.now();
            const result = yield* store.append({ actor, profile, event });
            const ms = performance.now() - start;
            assert.equal(result.outcome, "committed");
            assert.deepEqual(result.event, event);
            check(expected);
            const wal = readFileSync(`${path}-wal`);
            const pageSize = wal.readUInt32BE(8);
            assert.deepEqual(settings.page_size, { page_size: pageSize });
            const frames = (wal.length - 32) / (pageSize + 24);
            assert.ok(Number.isInteger(frames));
            if (index >= 5)
              samples.push({
                kind: "append",
                case: entry.name,
                ms,
                frames,
                pageSize,
                pagePayloadBytes: frames * pageSize,
                physicalWalBytes: wal.length,
                outcome: result.outcome,
                payloadSha256: createHash("sha256")
                  .update(JSON.stringify(expected))
                  .digest("hex"),
              });
          }
          offset += 30;
        }
        for (let index = 0; index < 30; index++) {
          const id = `seed-${800 + index}`;
          const result = run([
            "edit",
            id,
            "--title",
            "CLI edited Task",
            "--expected-version",
            "1",
            "--profile",
            "work",
            "--format",
            "json",
          ]);
          const response = Schema.decodeUnknownSync(TaskResponse)(result.value);
          const normalized = JSON.parse(
            JSON.stringify(response).replace(
              /"(generated_at|updated_at)":"[^"]+"/g,
              '"$1":"<clock>"',
            ),
          );
          assert.deepEqual(normalized, {
            generated_at: "<clock>",
            task: {
              id,
              user_id: "work",
              entity_version: 1,
              row_version: 2,
              title: "CLI edited Task",
              status: "open",
              priority: "P2",
              source: "agent",
              created_at: "2026-10-27T14:00:00Z",
              updated_at: "<clock>",
              tags: ["alpha", "beta", "gamma"],
            },
          });
          const expected = linkEdited(
            linkedTask(id),
            ["tag-a", "tag-b", "tag-c"],
            "CLI edited Task",
          ).after;
          const stored = connection
            .query<{ payload: string }, [string]>(
              "SELECT payload FROM tasks WHERE id=?",
            )
            .get(id);
          assert.ok(stored);
          assert.deepEqual(JSON.parse(stored.payload), {
            ...expected,
            updated_at: response.task.updated_at,
          });
          if (index >= 5)
            samples.push({
              kind: "cli-edit",
              case: "unchanged",
              ms: result.ms,
              exit: 0,
            });
        }
        commands.push({
          settings,
          seeded: 1000,
          warmupPerCase: 5,
          measuredPerCase: 25,
        });
      } finally {
        yield* store.close();
      }
    }),
  );
} catch (error) {
  errors++;
  throw error;
} finally {
  mkdirSync(resolve(output, ".."), { recursive: true });
  writeFileSync(
    output,
    `${JSON.stringify({ source, runtime: Bun.version, machine: { cpus: cpus().length, model: cpus()[0]?.model, startedLoad, endedLoad: loadavg() }, samples, successfulMeasuredOperations: samples.length, errors, commands }, null, 2)}\n`,
  );
  rmSync(directory, { recursive: true, force: true });
}
