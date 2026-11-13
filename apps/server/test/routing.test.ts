import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "@effect/vitest";
import { ensureProfile } from "@todo/domain/commands";
import {
  databaseBinding,
  endpointPath,
  routeMac,
} from "@todo/domain/database-route";
import { openStore, TaskCommands } from "@todo/domain/store";
import { Effect, Fiber, Layer } from "effect";
import { OutsideCommit } from "../src/outside-commit.ts";
import { serverLayer } from "../src/server.ts";

it.live(
  "a proved data-free nudge wakes every stream with timer fallback disabled",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        const directory = yield* Effect.acquireRelease(
          Effect.sync(() => mkdtempSync(join(tmpdir(), "todo-route-test-"))),
          (directory) =>
            Effect.sync(() => rmSync(directory, { recursive: true })),
        );
        const path = join(directory, "scratch.db");
        const store = yield* Effect.acquireRelease(
          openStore({ path }),
          (store) => Effect.orDie(store.close()),
        );
        yield* store.auth.setupOwner("routing test passphrase");
        const profile = yield* ensureProfile(store, "work");
        const session = yield* store.auth.signIn("routing test passphrase");
        yield* Layer.build(
          serverLayer({
            path,
            port: 0,
            outsideCommit: new OutsideCommit(Effect.never),
          }),
        );
        const binding = databaseBinding(path);
        expect(binding).toBeDefined();
        if (!binding) return;
        expect(statSync(endpointPath(binding.path)).mode & 0o777).toBe(0o600);
        const record = JSON.parse(
          readFileSync(endpointPath(binding.path), "utf8"),
        );
        const initial = yield* store.snapshots.generation();
        const connections = yield* Effect.forEach([0, 1], () =>
          Effect.acquireRelease(
            Effect.tryPromise(async () => {
              const controller = new AbortController();
              const response = await fetch(
                `http://127.0.0.1:${record.port}/profiles/work/events`,
                {
                  headers: {
                    Authorization: `Bearer ${session.credential}`,
                    "last-event-id": String(initial.seq),
                  },
                  signal: controller.signal,
                },
              );
              const reader = response.body?.getReader();
              if (!reader) throw new Error("No stream");
              const ready = await reader.read();
              expect(new TextDecoder().decode(ready.value)).toContain(
                "event: ready",
              );
              return { controller, reader };
            }),
            (connection) => Effect.sync(() => connection.controller.abort()),
          ),
        );
        const reads = yield* Effect.forEach(connections, (connection) =>
          Effect.tryPromise(async () => {
            const frame = await connection.reader.read();
            return new TextDecoder().decode(frame.value);
          }).pipe(Effect.forkScoped),
        );
        const result = yield* new TaskCommands(store).create(
          { credential: session.credential, profile: profile.id },
          { title: "Outside commit wakes both" },
        );
        expect(result.outcome).toBe("committed");
        const beforeNudge = yield* store.snapshots.generation();
        yield* Effect.tryPromise(async () => {
          const nonce = "a".repeat(64);
          const proof = await fetch(
            `http://127.0.0.1:${record.port}/local/database-proof`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ nonce }),
            },
          );
          expect(proof.status).toBe(200);
          const value = await proof.json();
          expect(value.nonce).toBe(nonce);
          const response = await fetch(
            `http://127.0.0.1:${record.port}/local/nudge`,
            {
              method: "POST",
              headers: {
                "x-todo-incarnation": record.incarnation,
                "x-todo-proof": routeMac(
                  record.secret,
                  "nudge",
                  record.incarnation,
                ),
              },
            },
          );
          expect(response.status).toBe(200);
          const denied = await fetch(
            `http://127.0.0.1:${record.port}/local/nudge`,
            {
              method: "POST",
              headers: {
                "x-todo-incarnation": record.incarnation,
                "x-todo-proof": "0".repeat(64),
              },
            },
          );
          expect(denied.status).toBe(400);
        });
        for (const read of reads)
          expect(yield* Fiber.join(read)).toContain(
            "Outside commit wakes both",
          );
        expect(yield* store.snapshots.generation()).toEqual(beforeNudge);
      }),
    ),
  10000,
);
