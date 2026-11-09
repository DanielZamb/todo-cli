import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect, Schema } from "effect";
import { TaskCommands } from "./packages/domain/src/commands.ts";
import { ProfileId, Version } from "./packages/domain/src/ids.ts";
import { openStore } from "./packages/domain/src/store/store.ts";
import { runTaskRecordSteps } from "./packages/domain/src/task-filters.ts";
import type { TaskRead } from "./packages/domain/src/task-read.ts";
import { work } from "./packages/domain/test/store-fixtures.ts";
import { taskSearchCacheHygiene } from "./apps/server/src/task-search-cache-hygiene.ts";

const scratch = mkdtempSync(join(tmpdir(), "todo-cache-hygiene-"));
try {
  await Effect.runPromise(
    Effect.gen(function* () {
      const options = {
        path: join(scratch, "scratch.db"),
        attachmentRoot: join(scratch, "attachments"),
      };
      const writer = yield* openStore(options);
      const reader = yield* openStore(options);
      try {
        yield* writer.putProfile(work);
        yield* writer.putProfile({
          ...work,
          id: Schema.decodeUnknownSync(ProfileId)("personal"),
          name: "Personal",
        });
        yield* writer.auth.setupOwner("hygiene proof passphrase");
        const { credential } = yield* writer.auth.signIn(
          "hygiene proof passphrase",
        );
        const commands = new TaskCommands(writer);
        const request = { credential, profile: work.id };
        const added = yield* commands.create(request, {
          title: "Private rent",
          description: "Private description",
        });
        if (added.outcome !== "committed" || !added.task)
          throw new Error("Task fixture missing");
        const target = { ...request, task_id: added.task.id };
        const saved = yield* writer.snapshots.create("manual");
        for (let version = 1; version <= 10; version++)
          yield* commands.edit(target, {
            from_version: Schema.decodeUnknownSync(Version)(version),
            changes: { title: "Private rent" },
          });
        const initial = yield* reader.searchCacheEvents();
        const observer = yield* taskSearchCacheHygiene(reader);
        yield* new TaskCommands(reader).list(request, { text: "rent" });
        assert.equal(
          reader.searchWords.usage.entries,
          2,
          "warm cache stores literal two fields",
        );
        yield* observer.poll;
        assert.equal(
          reader.searchWords.usage.entries,
          2,
          "startup max cursor excludes prior operations",
        );
        yield* commands.edit(target, {
          from_version: Schema.decodeUnknownSync(Version)(100),
          changes: { title: "Rejected" },
        });
        assert.deepEqual(
          (yield* reader.searchCacheEvents(initial)).events,
          [],
          "committed-only narrow tail",
        );
        yield* observer.poll;
        assert.equal(
          reader.searchWords.usage.entries,
          2,
          "rejected attempt does not evict",
        );
        yield* commands.delete(target, {
          from_version: Schema.decodeUnknownSync(Version)(11),
        });
        yield* commands.purge(target, {
          from_version: Schema.decodeUnknownSync(Version)(12),
        });
        yield* observer.poll;
        assert.deepEqual(
          [
            reader.searchWords.usage.entries,
            reader.searchWords.usage.pending,
            reader.searchWords.usage.chargedBytes,
          ],
          [0, 0, 0],
          "external Purge hook clears retained and pending",
        );
        const read = reader.searchWords.read(work.id);
        function* warm(): Generator<void, TaskRead[]> {
          yield* reader.searchWords.words(read, "Fresh before restore");
          return [];
        }
        yield* runTaskRecordSteps(warm(), Effect.void);
        const oldCursor = yield* reader.searchCacheEvents();
        yield* writer.snapshots.restore(saved.id);
        const restored = yield* commands.create(request, {
          title: "Restored rent",
        });
        if (restored.outcome !== "committed" || !restored.task)
          throw new Error("Restored fixture missing");
        const restoredTarget = { ...request, task_id: restored.task.id };
        yield* commands.delete(restoredTarget, {
          from_version: Schema.decodeUnknownSync(Version)(1),
        });
        yield* commands.purge(restoredTarget, {
          from_version: Schema.decodeUnknownSync(Version)(2),
        });
        assert.ok(
          (yield* reader.searchCacheEvents()).seq <= oldCursor.seq,
          "restored Purge seq is below old cursor",
        );
        yield* observer.poll;
        assert.equal(
          reader.searchWords.usage.entries,
          0,
          "restore generation clears even Purge below old cursor",
        );
        yield* runTaskRecordSteps(warm(), Effect.void);
        assert.equal(
          reader.searchWords.usage.entries,
          0,
          "restored epoch fences slotless old read",
        );
        const fresh = reader.searchWords.read(work.id);
        function* warmFresh(): Generator<void, TaskRead[]> {
          yield* reader.searchWords.words(fresh, "Before Profile delete");
          return [];
        }
        yield* runTaskRecordSteps(warmFresh(), Effect.void);
        yield* writer.auth.deleteProfile({
          ...request,
          options: { dry_run: false, with_tasks: true },
        });
        yield* observer.poll;
        assert.equal(
          reader.searchWords.usage.entries,
          0,
          "external Profile deletion clears cache",
        );
      } finally {
        yield* reader.close();
        yield* writer.close();
      }
    }),
  );
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
