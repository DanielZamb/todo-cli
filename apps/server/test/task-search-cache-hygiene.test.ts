import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "@effect/vitest";
import { ProfileId, Version } from "@todo/domain";
import { openStore, TaskCommands } from "@todo/domain/store";
import { Effect, Schema } from "effect";
import { runTaskRecordSteps } from "../../../packages/domain/src/task-filters.ts";
import type { TaskRead } from "../../../packages/domain/src/task-read.ts";
import type { TaskSearchCache } from "../../../packages/domain/src/task-search-cache.ts";
import { work } from "../../../packages/domain/test/store-fixtures.ts";
import { taskSearchCacheHygiene } from "../src/task-search-cache-hygiene.ts";

const personal = Schema.decodeUnknownSync(ProfileId)("personal");
const prepare = (
  cache: TaskSearchCache,
  text: string,
  read = cache.read(work.id),
) => {
  function* steps(): Generator<void, TaskRead[]> {
    yield* cache.words(read, text);
    return [];
  }
  return runTaskRecordSteps(steps(), Effect.void);
};

it("tails only new committed metadata and clears on external erasure", async () => {
  const directory = mkdtempSync(join(tmpdir(), "todo-cache-tail-"));
  try {
    await Effect.runPromise(
      Effect.gen(function* () {
        const options = {
          path: join(directory, "scratch.db"),
          attachmentRoot: join(directory, "attachments"),
        };
        const writer = yield* openStore(options);
        const reader = yield* openStore(options);
        try {
          yield* writer.putProfile(work);
          yield* writer.putProfile({ ...work, id: personal, name: "Personal" });
          yield* writer.auth.setupOwner("cache observer literal passphrase");
          const { credential } = yield* writer.auth.signIn(
            "cache observer literal passphrase",
          );
          const commands = new TaskCommands(writer);
          const request = { credential, profile: work.id };
          const created = yield* commands.create(request, {
            title: "Private rent",
          });
          expect(created.outcome).toBe("committed");
          if (created.outcome !== "committed" || !created.task)
            throw new Error("Missing created Task");
          const target = { ...request, task_id: created.task.id };
          yield* commands.delete(target, {
            from_version: Schema.decodeUnknownSync(Version)(1),
          });
          yield* commands.purge(target, {
            from_version: Schema.decodeUnknownSync(Version)(2),
          });
          const observer = yield* taskSearchCacheHygiene(reader);
          yield* prepare(reader.searchWords, "Not historical retention");
          yield* observer.poll;
          expect(reader.searchWords.usage.entries).toBe(1);
          const saved = yield* writer.snapshots.create("manual");
          const before = yield* reader.searchCacheEvents();
          const next = yield* commands.create(request, { title: "Later rent" });
          if (next.outcome !== "committed" || !next.task)
            throw new Error("Missing next Task");
          const nextTarget = { ...request, task_id: next.task.id };
          yield* commands.edit(nextTarget, {
            from_version: Schema.decodeUnknownSync(Version)(100),
            changes: { title: "Rejected" },
          });
          yield* observer.poll;
          expect(reader.searchWords.usage.entries).toBe(1);
          yield* commands.delete(nextTarget, {
            from_version: Schema.decodeUnknownSync(Version)(1),
          });
          yield* commands.purge(nextTarget, {
            from_version: Schema.decodeUnknownSync(Version)(2),
          });
          const changes = yield* reader.searchCacheEvents(before);
          expect(changes.events.map((event) => Object.keys(event))).toEqual([
            ["seq", "kind", "original_kind"],
            ["seq", "kind", "original_kind"],
            ["seq", "kind", "original_kind"],
          ]);
          expect(changes.events.at(-1)?.original_kind).toBe("TaskPurged");
          yield* observer.poll;
          expect([
            reader.searchWords.usage.entries,
            reader.searchWords.usage.pending,
            reader.searchWords.usage.chargedBytes,
          ]).toEqual([0, 0, 0]);
          yield* prepare(reader.searchWords, "Fresh after Purge");
          yield* observer.poll;
          expect(reader.searchWords.usage.entries).toBe(1);
          const oldCursor = yield* reader.searchCacheEvents();
          const staleRead = reader.searchWords.read(work.id);
          yield* writer.snapshots.restore(saved.id);
          const restored = yield* commands.create(request, {
            title: "Restored private",
          });
          if (restored.outcome !== "committed" || !restored.task)
            throw new Error("Missing restored Task");
          const restoredTarget = { ...request, task_id: restored.task.id };
          yield* commands.delete(restoredTarget, {
            from_version: Schema.decodeUnknownSync(Version)(1),
          });
          yield* commands.purge(restoredTarget, {
            from_version: Schema.decodeUnknownSync(Version)(2),
          });
          const reset = yield* reader.searchCacheEvents(oldCursor);
          expect(reset.seq <= oldCursor.seq).toBe(true);
          expect(reset.events).toEqual([]);
          yield* observer.poll;
          expect(reader.searchWords.usage.entries).toBe(0);
          yield* prepare(
            reader.searchWords,
            "Late old read after restore",
            staleRead,
          );
          expect(reader.searchWords.usage.entries).toBe(0);
          yield* prepare(reader.searchWords, "Fresh before Profile deletion");
          yield* writer.auth.deleteProfile({
            ...request,
            options: { dry_run: false, with_tasks: true },
          });
          yield* observer.poll;
          expect(reader.searchWords.usage.entries).toBe(0);
        } finally {
          yield* reader.close();
          yield* writer.close();
        }
      }),
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
