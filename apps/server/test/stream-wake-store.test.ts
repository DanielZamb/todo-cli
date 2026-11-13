import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "@effect/vitest";
import { Profile } from "@todo/domain";
import { openStore, TaskCommands } from "@todo/domain/store";
import { Effect, Schema } from "effect";
import { StreamWake } from "../src/stream-wake.ts";
import { streamWakeStore } from "../src/stream-wake-store.ts";

it.effect(
  "signals only after the enclosing write completes and skips idle work",
  () =>
    Effect.gen(function* () {
      const directory = yield* Effect.acquireRelease(
        Effect.sync(() => mkdtempSync(join(tmpdir(), "todo-wake-store-"))),
        (path) =>
          Effect.sync(() => rmSync(path, { recursive: true, force: true })),
      );
      const raw = yield* Effect.acquireRelease(
        openStore({ path: join(directory, "scratch.db") }),
        (store) => Effect.orDie(store.close()),
      );
      yield* raw.auth.setupOwner("wake test passphrase");
      const profile = Schema.decodeUnknownSync(Profile)({
        id: "work",
        name: "work",
        created_at: "2026-11-01T00:00:00Z",
        updated_at: "2026-11-01T00:00:00Z",
      });
      yield* raw.putProfile(profile);
      const session = yield* raw.auth.signIn("wake test passphrase");
      const wake = new StreamWake();
      const store = streamWakeStore(raw, wake);
      yield* store.auth.mutate(
        { credential: session.credential, profile: profile.id },
        () =>
          Effect.gen(function* () {
            yield* store.putProfile({ ...profile, name: "Renamed" });
            expect(wake.version).toBe(0);
          }),
      );
      expect(wake.version).toBe(1);
      const result = yield* new TaskCommands(store).create(
        { credential: session.credential, profile: profile.id },
        { title: "Committed once" },
      );
      expect(result.outcome).toBe("committed");
      expect(wake.version).toBe(2);
      yield* store.tasks();
      yield* store.scheduled.runDue();
      yield* store.auth.cleanupExpired();
      expect(wake.version).toBe(2);
      yield* store.snapshots.runDaily();
      const version = wake.version;
      yield* store.snapshots.runDaily();
      expect(wake.version).toBe(version);
      expect(
        (yield* raw.tasks()).map((task) => [task.title, task.row_version]),
      ).toEqual([["Committed once", 1]]);
    }),
);
