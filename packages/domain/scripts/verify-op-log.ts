import { Database } from "bun:sqlite";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { openStore } from "@todo/domain/store";
import { Effect, Schema } from "effect";
import { ActorId, Instant, ProfileId, Sequence } from "../src/index.ts";

import { provePurge, proveSharedMetadataPurge } from "./purge-proof.ts";

const directory = process.argv[2];
const evidence = process.argv[3];
if (
  !directory ||
  !evidence ||
  !isAbsolute(directory) ||
  !isAbsolute(evidence) ||
  dirname(directory) !== resolve(tmpdir()) ||
  !basename(directory).startsWith("todo-c02-verify-") ||
  evidence.startsWith(`${directory}/`)
)
  throw new Error(
    "Usage: verify-op-log <mktemp -d -t todo-c02-verify> <absolute evidence directory outside scratch>",
  );
const path = join(directory, "scratch.db");
if (existsSync(path))
  throw new Error("Verification requires a new scratch database");
mkdirSync(evidence, { recursive: true });
const actor = Schema.decodeUnknownSync(ActorId)("verify-actor");
const profile = Schema.decodeUnknownSync(ProfileId)("work");
const occurred_at = Schema.decodeUnknownSync(Instant)("2026-10-27T16:00:00Z");
const sequence = Schema.decodeUnknownSync(Sequence);
const actions: unknown[] = [];
const dump = (stage: string) => {
  writeFileSync(
    join(evidence, `${stage}.sql`),
    execFileSync("sqlite3", [path, ".dump"]),
  );
  actions.push({ stage, command: ["sqlite3", path, ".dump"] });
  writeFileSync(
    join(evidence, "actions.json"),
    `${JSON.stringify(actions, null, 2)}\n`,
  );
};

const legacy = new Database(path, { create: true });
try {
  legacy.exec(
    readFileSync("packages/domain/test/fixtures/0001_init.sql", "utf8"),
  );
  legacy.exec(readFileSync("packages/domain/test/fixtures/legacy.sql", "utf8"));
} finally {
  legacy.close();
}
dump("00-legacy");
const migrationCommand = ["packages/domain/scripts/migrate.ts", path];
const migrated = JSON.parse(
  execFileSync("bun", migrationCommand, { encoding: "utf8" }),
);
assert.deepEqual(migrated, {
  journal_mode: "wal",
  busy_timeout: 5000,
  user_version: 6,
});
actions.push({
  stage: "migration-only-command",
  command: ["bun", ...migrationCommand],
  result: migrated,
});
assert.deepEqual(
  JSON.parse(execFileSync("bun", migrationCommand, { encoding: "utf8" })),
  migrated,
);
actions.push({
  stage: "migration-only-command-repeat",
  command: ["bun", ...migrationCommand],
  result: migrated,
});

await Effect.runPromise(
  Effect.acquireUseRelease(
    openStore({ path, create: false }),
    (store) =>
      Effect.gen(function* () {
        assert.deepEqual(yield* store.settings(), {
          journal_mode: "wal",
          busy_timeout: 5000,
          user_version: 6,
        });
        assert.deepEqual(
          (yield* store.tasks()).map((task) => [
            task.id,
            task.title,
            task.row_version,
          ]),
          [
            ["legacy-1", "Ship the port", 7],
            ["legacy-2", "Buy tea", 2],
          ],
        );
        dump("01-migration");
        const task = (yield* store.tasks()).find(
          (value) => value.id === "legacy-1",
        );
        assert.ok(task);
        const event = {
          kind: "TaskEdited",
          entity_version: 1,
          occurred_at,
          before: task,
          after: {
            ...task,
            row_version: 8,
            title: "Ship the transactional store",
            updated_at: occurred_at,
          },
          series_before: null,
          series_after: null,
          project_before:
            (yield* store.projects()).find(
              (value) => value.id === task.project_id,
            ) ?? null,
          project_after:
            (yield* store.projects()).find(
              (value) => value.id === task.project_id,
            ) ?? null,
          tags_before: (yield* store.tags()).filter((value) =>
            task.tags.includes(value.id),
          ),
          tags_after: (yield* store.tags()).filter((value) =>
            task.tags.includes(value.id),
          ),
        };
        const accepted = yield* store.append({ actor, profile, event });
        assert.deepEqual(
          [
            accepted.seq,
            accepted.outcome,
            accepted.from_version,
            accepted.to_version,
          ],
          [3, "committed", 7, 8],
        );
        dump("02-append");
        const conflict = yield* store.append({ actor, profile, event });
        assert.deepEqual(
          [conflict.seq, conflict.outcome, conflict.reason],
          [4, "rejected", "conflict"],
        );
        dump("03-conflict");
        const invalid = yield* store.append({
          actor,
          profile,
          event: { ...event, after: { ...event.after, title: "" } },
        });
        assert.deepEqual(
          [invalid.seq, invalid.outcome, invalid.reason, invalid.event.kind],
          [5, "rejected", "validation", "TaskAttemptRejected"],
        );
        dump("03-validation");
        assert.equal(yield* store.takeSnapshot(), 5);
        const expected = yield* store.tasks();
        assert.deepEqual(yield* store.rebuild(), expected);
        assert.deepEqual(yield* store.rebuild({ useSnapshot: true }), expected);
        assert.deepEqual(
          (yield* store.projects()).map((value) => [
            value.profile_id,
            value.name,
          ]),
          [["work", "Port"]],
        );
        assert.deepEqual(
          (yield* store.tags()).map((value) => [value.profile_id, value.name]),
          [
            ["personal", "home"],
            ["work", "focus"],
            ["work", "port"],
          ],
        );
        assert.deepEqual(
          (yield* store.series()).map((value) => [
            value.id,
            value.recurrence.rrule,
          ]),
          [["legacy-series:legacy-1", "FREQ=DAILY"]],
        );
        const relations = new Database(path);
        try {
          assert.deepEqual(
            relations
              .query(
                "SELECT task_id,tag_id FROM task_tags ORDER BY task_id,tag_id",
              )
              .all(),
            [
              { task_id: "legacy-1", tag_id: '["work","tag","focus"]' },
              { task_id: "legacy-1", tag_id: '["work","tag","port"]' },
              { task_id: "legacy-2", tag_id: '["personal","tag","home"]' },
            ],
          );
        } finally {
          relations.close();
        }
        assert.deepEqual(
          (yield* store.tasks()).map((value) => [
            value.id,
            value.title,
            value.row_version,
          ]),
          [
            ["legacy-1", "Ship the transactional store", 8],
            ["legacy-2", "Buy tea", 2],
          ],
        );
        dump("04-rebuild");
        const reverted = yield* store.revert({
          actor,
          profile,
          seq: sequence(3),
          occurred_at,
        });
        assert.deepEqual(
          [
            reverted.seq,
            reverted.outcome,
            reverted.from_version,
            reverted.to_version,
          ],
          [6, "committed", 8, 9],
        );
        assert.deepEqual(
          (yield* store.rebuild()).map((value) => [
            value.id,
            value.title,
            value.row_version,
          ]),
          [
            ["legacy-1", "Ship the port", 9],
            ["legacy-2", "Buy tea", 2],
          ],
        );
        dump("05-revert");
        assert.deepEqual(
          (yield* store.history()).map((entry) => [entry.seq, entry.outcome]),
          [
            [1, "committed"],
            [2, "committed"],
            [3, "committed"],
            [4, "rejected"],
            [5, "rejected"],
            [6, "committed"],
          ],
        );
        const sql = new Database(path);
        try {
          assert.throws(() => sql.exec("DELETE FROM tasks"));
        } finally {
          sql.close();
        }
        writeFileSync(
          join(evidence, "result.json"),
          `${JSON.stringify({ status: "passed", settings: yield* store.settings(), tasks: yield* store.tasks(), history: yield* store.history() }, null, 2)}\n`,
        );
        process.stdout.write(
          "PASS migration-only command, migration, append, conflict, validation, metadata, snapshot, rebuild, revert, guards\n",
        );
      }),
    (store) => Effect.orDie(store.close()),
  ),
);

const purgeProof = await Effect.runPromise(
  provePurge(join(directory, "purge.db")),
);
writeFileSync(
  join(evidence, "purge.json"),
  `${JSON.stringify(purgeProof, null, 2)}\n`,
);
process.stdout.write(
  "PASS Purge redaction, replay, Revert refusal, transaction rollback, checkpoint and VACUUM raw bytes\n",
);

const sharedPurgeProof = await Effect.runPromise(
  proveSharedMetadataPurge(join(directory, "shared-purge.db")),
);
writeFileSync(
  join(evidence, "shared-purge.json"),
  `${JSON.stringify(sharedPurgeProof, null, 2)}\n`,
);
