import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { BunHttpServer } from "@effect/platform-bun";
import { ChangeEvent } from "@todo/api";
import {
  ActorId,
  DiagnosticRecorder,
  Profile,
  ProfileId,
  Task,
} from "@todo/domain";
import { TaskResponse } from "@todo/domain/presentation";
import { openStore } from "@todo/domain/store";
import { Context, Effect, Fiber, Layer, Schema } from "effect";
import { HttpRouter, HttpServer } from "effect/http";
import { scheduler } from "../src/scheduler.ts";
import { diagnosticsMiddleware, serverLayer } from "../src/server.ts";
import {
  type DiagnosticFaultPoint,
  installDiagnosticFault,
} from "./diagnostic-fault-recorder.ts";

const evidence = resolve(
  process.argv[2] ?? "docs/evidence/ui-speed/diag-core-s1/faults",
);
assert.ok(!existsSync(evidence), "Choose a new evidence directory");
mkdirSync(evidence, { recursive: true });
const results: object[] = [];
const mark = (result: object) => {
  results.push(result);
  writeFileSync(
    join(evidence, "actions.json"),
    JSON.stringify(results, null, 2),
  );
};
const fixture = Effect.gen(function* () {
  const directory = yield* Effect.acquireRelease(
    Effect.sync(() => mkdtempSync(join(tmpdir(), "todo-diag-fault-"))),
    (path) => Effect.sync(() => rmSync(path, { recursive: true, force: true })),
  );
  const store = yield* Effect.acquireRelease(
    openStore({
      path: join(directory, "scratch.db"),
      attachmentRoot: join(directory, "attachments"),
    }),
    (store) => Effect.orDie(store.close()),
  );
  yield* store.auth.setupOwner("isolated fault fixture");
  const profile = Schema.decodeUnknownSync(ProfileId)("work");
  yield* store.putProfile(
    Schema.decodeUnknownSync(Profile)({
      id: profile,
      name: "Work",
      created_at: "2026-11-11T00:00:00Z",
      updated_at: "2026-11-11T00:00:00Z",
    }),
  );
  const session = yield* store.auth.signIn("isolated fault fixture");
  return { directory, store, profile, session };
});
const json = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Json));
type StreamReader = ReturnType<
  NonNullable<Awaited<ReturnType<typeof fetch>>["body"]>["getReader"]
>;
type StreamPart = Awaited<ReturnType<StreamReader["read"]>>;
function withoutClock(value: Schema.Json): Schema.Json {
  if (Array.isArray(value)) return value.map(withoutClock);
  if (value !== null && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, value]) => [
        key,
        key === "generated_at" ? "<clock>" : withoutClock(value),
      ]),
    );
  return value;
}
function checkedLoss(
  fault: ReturnType<typeof installDiagnosticFault>,
  recorder: DiagnosticRecorder,
  point: DiagnosticFaultPoint,
) {
  const snapshot = fault.inspect(recorder);
  if (point !== "none") {
    assert.ok(fault.hits() > 0, `Fault did not execute: ${point}`);
    assert.ok(
      snapshot.recording_failures > 0,
      `Fault was not counted: ${point}`,
    );
    assert.ok(
      snapshot.lost_starts > 0 ||
        snapshot.dropped_events > 0 ||
        snapshot.active.length > 0,
      `Loss was not explicit: ${point}`,
    );
  }
  return {
    hits: fault.hits(),
    recording_failures: snapshot.recording_failures,
    lost_starts: snapshot.lost_starts,
    dropped_events: snapshot.dropped_events,
    active: snapshot.active.length,
  };
}

for (const point of [
  "none",
  "configure",
  "root",
  "start-entry",
  "start-response_handoff",
  "end-entry",
  "end-response_handoff",
  "start-handler",
  "end-handler",
  "serverTiming",
  "authorize",
  "snapshot",
] as const) {
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const { directory, store, session } = yield* fixture;
        const fault = installDiagnosticFault(point);
        yield* Effect.addFinalizer(() => Effect.sync(() => fault.restore()));
        const profiler = new DiagnosticRecorder();
        if (point === "configure") fault.arm();
        const context = yield* Layer.build(
          serverLayer({
            path: join(directory, "scratch.db"),
            port: 0,
            profiler,
          }),
        );
        const url = HttpServer.formatAddress(
          Context.get(context, HttpServer.HttpServer).address,
        );
        fault.arm();
        const response = yield* Effect.promise(() =>
          fetch(`${url}/profiles/work/tasks`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${session.credential}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ title: "Retained HTTP write" }),
          }),
        );
        const body = yield* Effect.promise(() => response.text());
        fault.disarm();
        assert.equal(response.status, 200, point);
        const tasks = yield* store.tasks();
        assert.equal(tasks.length, 1);
        assert.equal(tasks[0]?.title, "Retained HTTP write");
        assert.equal(tasks[0]?.row_version, 1);
        assert.equal(tasks[0]?.status, "open");
        assert.deepEqual(json(body), tasks[0]);
        const task = tasks[0];
        assert.ok(task);
        const scenarios = [
          {
            name: "conflict",
            status: 409,
            path: `/profiles/work/tasks/${task.id}`,
            init: {
              method: "PATCH",
              headers: {
                Authorization: `Bearer ${session.credential}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                from_version: 99,
                changes: { title: "Rejected edit" },
              }),
            },
          },
          {
            name: "unauthorized",
            status: 401,
            path: "/profiles/work/tasks",
            init: {},
          },
          {
            name: "invalid-query",
            status: 400,
            path: "/health?private=content",
            init: {},
          },
          {
            name: "not-found",
            status: 404,
            path: "/missing-fault-route",
            init: {},
          },
        ];
        for (const scenario of scenarios) {
          const control = yield* Effect.promise(() =>
            fetch(url + scenario.path, scenario.init),
          );
          const expected = yield* Effect.promise(() => control.text());
          fault.arm();
          const failed = yield* Effect.promise(() =>
            fetch(url + scenario.path, scenario.init),
          );
          const actual = yield* Effect.promise(() => failed.text());
          fault.disarm();
          assert.equal(control.status, scenario.status);
          assert.equal(
            failed.status,
            scenario.status,
            `${point}:${scenario.name}`,
          );
          if (expected)
            assert.deepEqual(
              withoutClock(json(actual)),
              withoutClock(json(expected)),
              `${point}:${scenario.name}`,
            );
          else assert.equal(actual, expected);
        }
        if (point === "snapshot") {
          fault.arm();
          const response = yield* Effect.promise(() =>
            fetch(`${url}/diagnostics`, {
              headers: { Authorization: `Bearer ${session.credential}` },
            }),
          );
          const body = yield* Effect.promise(() => response.json());
          fault.disarm();
          assert.equal(response.status, 200);
          const snapshot = Schema.decodeUnknownSync(
            Schema.Struct({
              profiler: Schema.optionalKey(Schema.Json),
              operations: Schema.Struct({ committed: Schema.Number }),
            }),
          )(body);
          assert.equal(snapshot.profiler, undefined);
          assert.ok(snapshot.operations.committed >= 1);
        }
        assert.deepEqual(
          (yield* store.tasks()).map((x) => [x.title, x.row_version]),
          [["Retained HTTP write", 1]],
        );
        assert.equal(
          (yield* store.history()).filter(
            (x) => x.outcome === "committed" && x.event.kind === "TaskCreated",
          ).length,
          1,
        );
        mark({
          surface: "http",
          point,
          status: 200,
          body_equals_durable_task: true,
          committed_creates: 1,
          other_statuses: [409, 401, 400, 404],
          ...checkedLoss(fault, profiler, point),
        });
      }),
    ),
  );
}

for (const point of [
  "none",
  "root",
  "start-entry",
  "end-entry",
  "start-response_handoff",
  "end-response_handoff",
  "start-handler",
  "end-handler",
  "serverTiming",
] as const) {
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const { store } = yield* fixture;
        const profiler = store.diagnostics.profiler;
        const fault = installDiagnosticFault(point);
        yield* Effect.addFinalizer(() => Effect.sync(() => fault.restore()));
        const context = yield* Layer.build(
          HttpRouter.serve(
            HttpRouter.add(
              "GET",
              "/fixture-defect",
              Effect.die(new Error("private application defect")),
            ),
            { middleware: diagnosticsMiddleware(store.diagnostics) },
          ).pipe(
            Layer.provideMerge(
              BunHttpServer.layer({ hostname: "127.0.0.1", port: 0 }),
            ),
          ),
        );
        const url = HttpServer.formatAddress(
          Context.get(context, HttpServer.HttpServer).address,
        );
        const control = yield* Effect.promise(() =>
          fetch(`${url}/fixture-defect`),
        );
        const expected = yield* Effect.promise(() => control.text());
        assert.equal(control.status, 500);
        assert.equal(expected, "");
        fault.arm();
        const response = yield* Effect.promise(() =>
          fetch(`${url}/fixture-defect`),
        );
        const body = yield* Effect.promise(() => response.text());
        fault.disarm();
        assert.equal(response.status, 500);
        assert.equal(body, expected);
        assert.deepEqual(yield* store.tasks(), []);
        assert.equal(
          (yield* store.history()).filter((x) => x.event.kind === "TaskCreated")
            .length,
          0,
        );
        mark({
          surface: "http-defect",
          point,
          status: 500,
          body: "",
          committed_creates: 0,
          ...checkedLoss(fault, profiler, point),
        });
      }),
    ),
  );
}

for (const point of [
  "none",
  "root",
  "commitReceipt",
  "delivery",
  "awaitTransport",
  "transport",
  "releaseStream",
] as const) {
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const { directory, store, session, profile } = yield* fixture;
        const fault = installDiagnosticFault(point);
        yield* Effect.addFinalizer(() => Effect.sync(() => fault.restore()));
        const profiler = new DiagnosticRecorder();
        const context = yield* Layer.build(
          serverLayer({
            path: join(directory, "scratch.db"),
            port: 0,
            profiler,
          }),
        );
        const url = HttpServer.formatAddress(
          Context.get(context, HttpServer.HttpServer).address,
        );
        for (let index = 0; index < 3; index++) {
          const response = yield* Effect.promise(() =>
            fetch(`${url}/profiles/work/tasks`, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${session.credential}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ title: `Stream Task ${index}` }),
            }),
          );
          assert.equal(response.status, 200);
          yield* Effect.promise(() => response.arrayBuffer());
        }
        const expected = (yield* store.history())
          .filter((x) => x.outcome === "committed" && x.profile === profile)
          .map((x) => x.seq);
        assert.equal(expected.length, 3);
        const controller = new AbortController();
        yield* Effect.addFinalizer(() => Effect.sync(() => controller.abort()));
        fault.arm();
        const response = yield* Effect.promise(() =>
          fetch(`${url}/profiles/work/events`, {
            headers: { Authorization: `Bearer ${session.credential}` },
            signal: AbortSignal.any([
              controller.signal,
              AbortSignal.timeout(5000),
            ]),
          }),
        );
        assert.equal(response.status, 200);
        const reader = response.body?.getReader();
        assert.ok(reader);
        let buffered = "";
        const received: number[] = [];
        let ready = 0;
        while (received.length < 3) {
          const part: StreamPart = yield* Effect.promise(
            (): Promise<StreamPart> => reader.read(),
          );
          assert.equal(part.done, false);
          buffered += new TextDecoder().decode(part.value);
          let end = buffered.indexOf("\n\n");
          while (end >= 0) {
            const block = buffered.slice(0, end);
            buffered = buffered.slice(end + 2);
            const fields = Object.fromEntries(
              block
                .split("\n")
                .filter((x) => x.includes(": "))
                .map((x) => {
                  const at = x.indexOf(": ");
                  return [x.slice(0, at), x.slice(at + 2)];
                }),
            );
            const event = Schema.decodeUnknownSync(ChangeEvent)(fields);
            if (event.event === "ready") ready++;
            else if (event.event === "operation") received.push(event.data.seq);
            else throw new Error("Unexpected stream frame");
            end = buffered.indexOf("\n\n");
          }
        }
        controller.abort();
        for (let attempt = 0; attempt < 500; attempt++) {
          const snapshot = yield* store.diagnostics.read({
            credential: session.credential,
          });
          if (
            snapshot.clients.length === 0 &&
            (point === "root" || fault.releases() > 0)
          )
            break;
          yield* Effect.sleep("10 millis");
        }
        if (point !== "root") assert.equal(fault.releases(), 1);
        fault.disarm();
        assert.equal(ready, 1);
        assert.deepEqual(received, expected);
        assert.equal(new Set(received).size, 3);
        mark({
          surface: "stream",
          point,
          ready,
          received,
          expected,
          ...checkedLoss(fault, profiler, point),
        });
      }),
    ),
  );
}

for (const point of ["none", "root", "start-job", "end-job"] as const) {
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const { store, profile } = yield* fixture;
        const at = new Date(Date.now() - 5000).toISOString();
        const task = Schema.decodeUnknownSync(Task)({
          id: "wake",
          profile_id: profile,
          title: "Wake once",
          description: null,
          project_id: null,
          priority: "P3",
          status: "snoozed",
          scheduled_at: { kind: "instant", utc: at, time_zone: "UTC" },
          due_at: { kind: "instant", utc: at, time_zone: "UTC" },
          energy: null,
          estimate_min: null,
          source: "verification",
          tags: [],
          occurrence: null,
          completed_at: null,
          deleted_at: null,
          created_at: at,
          updated_at: at,
          entity_version: 1,
          row_version: 1,
        });
        const appended = yield* store.append({
          actor: Schema.decodeUnknownSync(ActorId)("verification"),
          profile,
          event: {
            kind: "TaskCreated",
            entity_version: 1,
            occurred_at: at,
            task,
            series: null,
            project: null,
            tags: [],
          },
        });
        assert.equal(appended.outcome, "committed");
        const counts = {
          runDue: 0,
          cleanupExpired: 0,
          runDaily: 0,
          nextAt: 0,
          nextExpiry: 0,
        };
        const runDue = store.scheduled.runDue,
          cleanup = store.auth.cleanupExpired,
          daily = store.snapshots.runDaily,
          nextAt = store.scheduled.nextAt,
          expiry = store.auth.nextExpiry;
        Object.defineProperty(store.scheduled, "runDue", {
          value: () =>
            Effect.suspend(() => {
              counts.runDue++;
              return runDue();
            }),
        });
        Object.defineProperty(store.auth, "cleanupExpired", {
          value: () =>
            Effect.suspend(() => {
              counts.cleanupExpired++;
              return cleanup();
            }),
        });
        Object.defineProperty(store.snapshots, "runDaily", {
          value: () =>
            Effect.suspend(() => {
              counts.runDaily++;
              return daily();
            }),
        });
        Object.defineProperty(store.scheduled, "nextAt", {
          value: () =>
            Effect.suspend(() => {
              counts.nextAt++;
              return nextAt();
            }),
        });
        Object.defineProperty(store.auth, "nextExpiry", {
          value: () =>
            Effect.suspend(() => {
              counts.nextExpiry++;
              return expiry();
            }),
        });
        let sampled = false;
        const sample = store.diagnostics.sample.bind(store.diagnostics);
        Object.defineProperty(store.diagnostics, "sample", {
          value: () => {
            sample();
            sampled = true;
          },
        });
        const fault = installDiagnosticFault(point);
        yield* Effect.addFinalizer(() => Effect.sync(() => fault.restore()));
        fault.arm();
        const fiber = yield* Effect.forkChild(scheduler(store));
        for (let attempt = 0; attempt < 100 && !sampled; attempt++)
          yield* Effect.sleep("10 millis");
        yield* Fiber.interrupt(fiber);
        fault.disarm();
        assert.equal(sampled, true, point);
        assert.deepEqual(counts, {
          runDue: 1,
          cleanupExpired: 1,
          runDaily: 1,
          nextAt: 1,
          nextExpiry: 1,
        });
        assert.deepEqual(
          (yield* store.tasks()).map((x) => [
            x.id,
            x.title,
            x.status,
            x.row_version,
          ]),
          [["wake", "Wake once", "open", 2]],
        );
        const reminders = (yield* store.history()).filter(
          (x) => x.outcome === "committed" && x.event.kind === "ReminderFired",
        );
        assert.equal(reminders.length, 1);
        mark({
          surface: "scheduler",
          point,
          counts,
          reminders: 1,
          task_status: "open",
          version: 2,
          ...checkedLoss(fault, store.diagnostics.profiler, point),
        });
      }),
    ),
  );
}

const cliBinary = resolve(".scratch/bin/todo"),
  faultBinary = resolve(".scratch/bin/diagnostic-fault-cli");
const directory = mkdtempSync(join(tmpdir(), "todo-diag-cli-fault-"));
try {
  const env = {
    ...process.env,
    HOME: directory,
    TODO_DB: join(directory, "scratch.db"),
  };
  const cli = (
    binary: string,
    args: string[],
    point: DiagnosticFaultPoint = "none",
    input?: string,
  ) =>
    spawnSync(binary, ["--profile", "work", ...args], {
      env: {
        ...env,
        DIAG_PROBE_POINT: point,
        DIAG_PROBE_EVIDENCE: join(evidence, `cli-${point}-${args[0]}.json`),
      },
      input,
      encoding: "utf8",
      timeout: 15000,
    });
  for (const command of ["init", "login"])
    assert.equal(
      cli(
        cliBinary,
        [command, "--password-stdin"],
        "none",
        "isolated CLI fault fixture\n",
      ).status,
      0,
    );
  const created = cli(cliBinary, ["add", "CLI anchor", "--format", "json"]);
  assert.equal(created.status, 0);
  const anchor = Schema.decodeUnknownSync(TaskResponse)(
    JSON.parse(created.stdout),
  ).task;
  for (const point of [
    "configure",
    "root",
    "start-command",
    "end-command",
    "authorize",
  ] as const) {
    for (const args of [
      ["show", anchor.id, "--format", "json"],
      [
        "edit",
        anchor.id,
        "--title",
        "Rejected",
        "--expected-version",
        "99",
        "--format",
        "json",
      ],
    ]) {
      const control = cli(cliBinary, args),
        failed = cli(faultBinary, args, point);
      assert.equal(
        failed.status,
        args[0] === "show" ? 0 : 4,
        `${point}:${args[0]}`,
      );
      assert.equal(failed.status, control.status);
      assert.equal(failed.stderr, control.stderr);
      assert.deepEqual(
        withoutClock(json(failed.stdout)),
        withoutClock(json(control.stdout)),
      );
      const observations = Schema.decodeUnknownSync(
        Schema.Struct({
          hits: Schema.Number,
          observations: Schema.Array(
            Schema.Struct({ recording_failures: Schema.Number }),
          ),
        }),
      )(
        JSON.parse(
          readFileSync(join(evidence, `cli-${point}-${args[0]}.json`), "utf8"),
        ),
      );
      assert.ok(observations.hits > 0);
      assert.ok(
        observations.observations.some((x) => x.recording_failures > 0),
      );
      mark({
        surface: "cli",
        point,
        command: args[0],
        status: failed.status,
        stdout_equals_control: true,
        stderr_equals_control: true,
        hits: observations.hits,
      });
    }
    const added = cli(
      faultBinary,
      ["add", `Retained CLI ${point}`, "--format", "json"],
      point,
    );
    assert.equal(added.status, 0);
    const result = Schema.decodeUnknownSync(TaskResponse)(
      JSON.parse(added.stdout),
    );
    assert.equal(result.task.title, `Retained CLI ${point}`);
    assert.equal(result.task.row_version, 1);
    const observed = cli(cliBinary, [
      "show",
      result.task.id,
      "--format",
      "json",
    ]);
    assert.equal(observed.status, 0);
    assert.deepEqual(
      Schema.decodeUnknownSync(TaskResponse)(JSON.parse(observed.stdout)).task,
      result.task,
    );
    mark({
      surface: "cli",
      point,
      command: "add",
      status: 0,
      durable_title: result.task.title,
      version: 1,
    });
  }
} finally {
  rmSync(directory, { recursive: true, force: true });
}
writeFileSync(
  join(evidence, "result.json"),
  JSON.stringify({ result: "PASS", cases: results.length, results }, null, 2),
);
