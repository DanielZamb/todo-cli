import { expect, it } from "@effect/vitest";
import { Effect, Fiber } from "effect";
import {
  DiagnosticRecorder,
  diagnosticSpan,
  diagnosticSync,
  withDiagnosticRoot,
} from "../src/diagnostic-context.ts";

it.effect(
  "joins children to the caller ids and records failures, interruptions and bounded losses",
  () =>
    Effect.gen(function* () {
      const recorder = new DiagnosticRecorder({
        capacity: 3,
        active_capacity: 4,
      });
      const root = recorder.root({
        trace: "11111111-1111-4111-8111-111111111111",
        request: "22222222-2222-4222-8222-222222222222",
        action: "33333333-3333-4333-8333-333333333333",
      });
      yield* recorder.withRoot(
        root,
        diagnosticSpan(
          "handler",
          Effect.sync(() =>
            diagnosticSync("database", () => 7, { statement: "store.read" }),
          ),
        ),
      );
      const snapshot = recorder.details();
      expect(snapshot.started).toBe(3);
      expect(snapshot.finished).toBe(3);
      expect(snapshot.active).toEqual([]);
      expect(snapshot.dropped_events).toBe(0);
      expect(snapshot.recent.map((x) => x.trace_id)).toEqual([
        root.trace_id,
        root.trace_id,
        root.trace_id,
      ]);
      expect(
        snapshot.recent.every(
          (x) =>
            x.request_id === root.request_id && x.action_id === root.action_id,
        ),
      ).toBe(true);
      const fiber = yield* recorder
        .withRoot(recorder.root({}), diagnosticSpan("handler", Effect.never))
        .pipe(Effect.forkChild);
      yield* Effect.yieldNow;
      yield* Fiber.interrupt(fiber);
      expect(recorder.details().recent.at(-1)?.outcome).toBe("cancelled");
      const malformed = recorder.root({
        trace: "private",
        request: "private",
        action: "private",
      });
      expect(malformed.trace_id).toMatch(/^[a-f0-9-]{36}$/);
      expect(JSON.stringify(recorder.details())).not.toContain("private");
    }),
);

it.effect("isolates concurrently yielding trace contexts", () =>
  Effect.gen(function* () {
    const recorder = new DiagnosticRecorder();
    const first = recorder.root({});
    const second = recorder.root({});
    yield* Effect.all(
      [first, second].map((root) =>
        recorder.withRoot(
          root,
          Effect.gen(function* () {
            yield* Effect.yieldNow;
            diagnosticSync("authentication", () => 1);
          }),
        ),
      ),
      { concurrency: "unbounded" },
    );
    const records = recorder
      .details()
      .recent.filter((x) => x.stage === "authentication");
    expect(records.map((x) => x.trace_id).sort()).toEqual(
      [first.trace_id, second.trace_id].sort(),
    );
  }),
);

it.effect(
  "counts active-start loss and ring eviction without claiming zero-duration work",
  () =>
    Effect.gen(function* () {
      const recorder = new DiagnosticRecorder({
        capacity: 1,
        active_capacity: 1,
      });
      yield* recorder.withRoot(
        recorder.root({}),
        diagnosticSpan("handler", Effect.void),
      );
      const snapshot = recorder.details();
      expect(snapshot.started).toBe(2);
      expect(snapshot.finished).toBe(1);
      expect(snapshot.lost_starts).toBe(1);
      yield* recorder
        .withRoot(recorder.root({}), Effect.fail("private failure"))
        .pipe(Effect.exit);
      expect(recorder.details().recent.at(-1)?.outcome).toBe("failed");
      expect(recorder.details().dropped_events).toBe(1);
      expect(recorder.commitReceipt(1, "epoch-a")).not.toBe(
        recorder.commitReceipt(1, "epoch-b"),
      );
    }),
);

it.effect(
  "keeps recorder failures from failing or rolling back an accepted Task write",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        const { mkdtempSync, rmSync } = yield* Effect.promise(
          () => import("node:fs"),
        );
        const { tmpdir } = yield* Effect.promise(() => import("node:os"));
        const { join } = yield* Effect.promise(() => import("node:path"));
        const { openStore, TaskCommands } = yield* Effect.promise(
          () => import("../src/store/store.ts"),
        );
        const { Profile } = yield* Effect.promise(
          () => import("../src/entities.ts"),
        );
        const { CreateTask } = yield* Effect.promise(
          () => import("../src/task-commands.ts"),
        );
        const { ProfileId } = yield* Effect.promise(
          () => import("../src/ids.ts"),
        );
        const { Schema } = yield* Effect.promise(() => import("effect"));
        const directory = yield* Effect.acquireRelease(
          Effect.sync(() => mkdtempSync(join(tmpdir(), "todo-diag-failure-"))),
          (path) =>
            Effect.sync(() => rmSync(path, { recursive: true, force: true })),
        );
        const store = yield* Effect.acquireRelease(
          openStore({ path: join(directory, "scratch.db") }),
          (store) => Effect.orDie(store.close()),
        );
        yield* store.auth.setupOwner("recorder failure fixture");
        const session = yield* store.auth.signIn("recorder failure fixture");
        const profile = Schema.decodeUnknownSync(ProfileId)("work");
        yield* store.putProfile(
          Schema.decodeUnknownSync(Profile)({
            id: profile,
            name: "Work",
            created_at: "2026-11-11T00:00:00Z",
            updated_at: "2026-11-11T00:00:00Z",
          }),
        );
        class BrokenRecorder extends DiagnosticRecorder {
          constructor(private readonly failure: "start" | "end") {
            super();
          }
          override start(...args: Parameters<DiagnosticRecorder["start"]>) {
            if (this.failure === "start")
              throw new Error("private recorder failure");
            return super.start(...args);
          }
          override end(...args: Parameters<DiagnosticRecorder["end"]>) {
            if (this.failure === "end")
              throw new Error("private recorder failure");
            return super.end(...args);
          }
        }
        for (const failure of ["start", "end"] as const) {
          const recorder = new BrokenRecorder(failure);
          const result = yield* recorder.withRoot(
            recorder.root({}),
            new TaskCommands(store).create(
              { credential: session.credential, profile },
              Schema.decodeUnknownSync(CreateTask)({
                title: `Kept after ${failure} failure`,
              }),
            ),
            "command",
          );
          expect(result.outcome).toBe("committed");
          expect(recorder.details().recording_failures).toBeGreaterThan(0);
        }
        expect((yield* store.tasks()).map((x) => x.title).sort()).toEqual([
          "Kept after end failure",
          "Kept after start failure",
        ]);
      }),
    ),
);

it.effect(
  "counts lost observations while preserving the original effect when root creation throws",
  () =>
    Effect.gen(function* () {
      class BrokenRoot extends DiagnosticRecorder {
        override root(): ReturnType<DiagnosticRecorder["root"]> {
          throw new Error("private root failure");
        }
      }
      const recorder = new BrokenRoot();
      const result = yield* withDiagnosticRoot(
        { recorder, role: "cli", stage: "command" },
        Effect.succeed(37),
      );
      expect(result).toBe(37);
      expect(recorder.details().recording_failures).toBe(1);
      expect(recorder.details().lost_starts).toBe(1);
      expect(recorder.details().started).toBe(1);
    }),
);
