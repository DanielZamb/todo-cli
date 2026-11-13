import { Database } from "bun:sqlite";
import {
  chmodSync,
  closeSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "@effect/vitest";
import { DiagnosticRecorder, Profile } from "@todo/domain";
import { endpointPath, routeMac } from "@todo/domain/database-route";
import { openStore } from "@todo/domain/store";
import { Context, Effect, Layer, Schema } from "effect";
import { HttpServer } from "effect/http";
import {
  RecordingOpenRefusal,
  recordingInspectionPolicy,
  recordingRefusalGuidance,
} from "../../../packages/domain/src/recording-database.ts";
import { tryRecordingExclusion } from "../../../packages/domain/src/recording-exclusion.ts";
import { DiagnosticRecordings } from "../../../packages/domain/src/recordings.ts";
import { RecordingDatabase } from "../../../packages/domain/src/recordings-sqlite.ts";
import { modelBatch } from "../../../packages/domain/test/fixtures/recording-authority.ts";
import {
  DatabaseHeldError,
  databaseEndpoint,
} from "../src/database-endpoint.ts";
import { serverLayer } from "../src/server.ts";
import { StreamWake } from "../src/stream-wake.ts";

// INTEG-CONTRACT: recordings and CLI routing share one server process and one
// database directory. Routing decides identity from the process's descriptors
// and holds a guard beside the database; recordings opens its own SQLite file
// from a worker and takes its own exclusion. Neither may confuse the other.

const passphrase = "recordings routing passphrase";
const work = () =>
  Schema.decodeUnknownSync(Profile)({
    id: "work",
    name: "work",
    created_at: "2026-11-01T00:00:00Z",
    updated_at: "2026-11-01T00:00:00Z",
  });
const seeded = (path: string) =>
  Effect.gen(function* () {
    const store = yield* openStore({ path });
    yield* store.auth.setupOwner(passphrase);
    yield* store.putProfile(work());
    const { credential } = yield* store.auth.signIn(passphrase);
    yield* store.close();
    return credential;
  });
const record = (path: string) =>
  JSON.parse(readFileSync(endpointPath(realpathSync(path)), "utf8")) as {
    incarnation: string;
    secret: string;
    binding: { identity: { device: string; inode: string; birth: string } };
  };
const localHeaders = (path: string, purpose: string) => {
  const { incarnation, secret } = record(path);
  return {
    "content-type": "application/json",
    "x-todo-incarnation": incarnation,
    "x-todo-proof": routeMac(secret, purpose, incarnation),
  };
};
const serve = (
  path: string,
  options: { wake?: StreamWake; profiler?: DiagnosticRecorder } = {},
) =>
  Effect.gen(function* () {
    const context = yield* Layer.build(
      serverLayer({ path, port: 0, ...options }),
    );
    return HttpServer.formatAddress(
      Context.get(context, HttpServer.HttpServer).address,
    );
  });
const post = (url: string, headers: Record<string, string>, body?: unknown) =>
  Effect.promise(async () => {
    const response = await fetch(url, {
      method: "POST",
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, text: await response.text() };
  });
const nonce = "ab".repeat(32);
const identityOf = (path: string) => {
  const stat = statSync(path, { bigint: true });
  return {
    device: String(stat.dev),
    inode: String(stat.ino),
    birth: String(stat.birthtimeNs),
  };
};

it.live(
  "verifyStore accepts the store with another recordings store already open in the process",
  () =>
    Effect.gen(function* () {
      const directory = yield* Effect.acquireRelease(
        Effect.sync(() => mkdtempSync(join(tmpdir(), "todo-rr-open-"))),
        (path) =>
          Effect.sync(() => rmSync(path, { recursive: true, force: true })),
      );
      const other = yield* Effect.acquireRelease(
        Effect.promise(() =>
          DiagnosticRecordings.open(
            join(directory, "elsewhere", "diagnostic-recordings"),
          ),
        ),
        (recordings) => Effect.promise(() => recordings.close()),
      );
      expect(other.health().condition).toBe("available");
      const path = join(directory, "db", "scratch.db");
      mkdirSync(join(directory, "db"), { mode: 0o700 });
      yield* seeded(path);
      const base = yield* serve(path);
      const proof = yield* post(
        `${base}/local/database-proof`,
        { "content-type": "application/json" },
        { nonce },
      );
      expect(proof.status).toBe(200);
      expect(JSON.parse(proof.text).binding.identity).toEqual(identityOf(path));
      expect(record(path).binding.identity).toEqual(identityOf(path));
    }),
);

it.live(
  "the guard stays held and routing stays current while the server's recordings store initializes and works; one wake",
  () =>
    Effect.gen(function* () {
      const directory = yield* Effect.acquireRelease(
        Effect.sync(() => mkdtempSync(join(tmpdir(), "todo-rr-later-"))),
        (path) =>
          Effect.sync(() => rmSync(path, { recursive: true, force: true })),
      );
      const path = join(directory, "scratch.db");
      const credential = yield* seeded(path);
      const wake = new StreamWake();
      const base = yield* serve(path, { wake });
      const owner = {
        authorization: `Bearer ${credential}`,
        "content-type": "application/json",
      };
      // The recordings store opens after start-up, beside the guard and record.
      const ingest = yield* post(
        `${base}/diagnostics/profiler/ingest`,
        owner,
        modelBatch(),
      );
      expect(ingest.status).toBe(200);
      expect(JSON.parse(ingest.text).accepted).toBe(true);
      expect(
        readdirSync(join(directory, "diagnostic-recordings")).sort(),
      ).toEqual(["recordings.db", "recordings.db-shm", "recordings.db-wal"]);
      // The guard is still held: a second participant is refused.
      expect(() => databaseEndpoint(path)).toThrow(DatabaseHeldError);
      // Routing is still current: proof and an authorized nudge succeed.
      const proof = yield* post(
        `${base}/local/database-proof`,
        { "content-type": "application/json" },
        { nonce },
      );
      expect(proof.status).toBe(200);
      // One wake: the nudge signals it once, a recordings ingest does not, a
      // Task write advances it by exactly one.
      const v0 = wake.version;
      const nudge = yield* post(
        `${base}/local/nudge`,
        localHeaders(path, "nudge"),
      );
      expect(nudge.status).toBe(200);
      expect(wake.version).toBe(v0 + 1);
      const again = yield* post(
        `${base}/diagnostics/profiler/ingest`,
        owner,
        modelBatch(),
      );
      expect(again.status).toBe(200);
      expect(wake.version).toBe(v0 + 1);
      const created = yield* post(`${base}/profiles/work/tasks`, owner, {
        title: "One write",
      });
      expect(created.status).toBe(200);
      expect(wake.version).toBe(v0 + 2);
    }),
);

// The recordings store's refusals, each in the real layout: the Task database,
// its live routing record and held guard, and diagnostic-recordings beside
// them. Each must equal the same case in a tree with no routing files, and
// leave the routing files and proof untouched.
const refusalOf = (dir: string) => {
  try {
    new RecordingDatabase(dir).close();
  } catch (error) {
    if (error instanceof RecordingOpenRefusal)
      return {
        reason: error.reason,
        detail: error.detail,
        guidance: recordingRefusalGuidance(
          "<dir>",
          error.reason,
          [],
          error.detail,
        ),
      };
    throw error;
  }
  return { reason: "opened" };
};
const withTmpdir = <A>(value: string, run: () => A) => {
  const previous = process.env.TMPDIR;
  process.env.TMPDIR = value;
  try {
    return run();
  } finally {
    if (previous === undefined) delete process.env.TMPDIR;
    else process.env.TMPDIR = previous;
  }
};
const cases: Array<[string, (dir: string, root: string) => () => unknown]> = [
  [
    "check_unavailable",
    (dir, root) => {
      // The domain test's recovering store: a genuine main file and a WAL
      // with one committed transaction, which needs the temporary image check.
      new RecordingDatabase(dir).close();
      const work = join(root, "work");
      mkdirSync(work);
      for (const name of readdirSync(dir))
        copyFileSync(join(dir, name), join(work, name));
      const peer = new Database(join(work, "recordings.db"));
      peer.query("PRAGMA wal_autocheckpoint=0").get();
      peer.exec(
        "UPDATE counters SET value=value+1 WHERE name='dropped_batches'",
      );
      copyFileSync(
        join(work, "recordings.db-wal"),
        join(dir, "recordings.db-wal"),
      );
      peer.close();
      rmSync(join(dir, "recordings.db-shm"), { force: true });
      chmodSync(join(dir, "recordings.db-wal"), 0o600);
      return () =>
        withTmpdir(`${join(root, "missing-temp")}/`, () => refusalOf(dir));
    },
  ],
  [
    "store_busy",
    (dir) => {
      // A refusal the inspection cannot confirm by a second stable reading
      // before its bound is store_busy. With the bound at zero the first
      // reading is never confirmed, so a foreign catalog answers store_busy
      // without a concurrent writer.
      new RecordingDatabase(dir).close();
      const setup = new Database(join(dir, "recordings.db"));
      setup.exec("DROP TRIGGER sequence_conflict");
      setup.close();
      return () => {
        const bound = recordingInspectionPolicy.boundMs;
        Reflect.set(recordingInspectionPolicy, "boundMs", 0);
        try {
          return refusalOf(dir);
        } finally {
          Reflect.set(recordingInspectionPolicy, "boundMs", bound);
        }
      };
    },
  ],
  [
    "initialization_busy",
    (dir) => {
      new RecordingDatabase(dir).close();
      const holder = openSync(join(dir, "recordings.db"), "r");
      expect(tryRecordingExclusion(holder)).toBe(true);
      return () => {
        try {
          return refusalOf(dir);
        } finally {
          closeSync(holder);
        }
      };
    },
  ],
  [
    "directory_not_private",
    (dir) => {
      chmodSync(dir, 0o500);
      return () => {
        try {
          return refusalOf(dir);
        } finally {
          chmodSync(dir, 0o700);
        }
      };
    },
  ],
];
for (const [reason, prepare] of cases)
  it.live(
    `recordings refuse ${reason} the same with the routing record and guard beside them`,
    () =>
      Effect.gen(function* () {
        const outcome = (withRouting: boolean) =>
          Effect.gen(function* () {
            const root = mkdtempSync(join(tmpdir(), `todo-rr-${reason}-`));
            try {
              const path = join(root, "scratch.db");
              yield* seeded(path);
              const endpoint = withRouting ? databaseEndpoint(path) : undefined;
              if (withRouting) {
                if (!endpoint) throw new Error("Missing endpoint");
                const before = endpoint.beforeStore();
                const store = yield* openStore({ path });
                endpoint.verifyStore(before);
                endpoint.publish(1);
                yield* store.close();
              }
              const routingFiles = () =>
                withRouting
                  ? readdirSync(join(root, ".todo-routing"), {
                      recursive: true,
                    })
                      .map(String)
                      .sort()
                  : [];
              const recordBytes = withRouting
                ? readFileSync(endpointPath(realpathSync(path)), "utf8")
                : "";
              const dir = join(root, "diagnostic-recordings");
              mkdirSync(dir, { mode: 0o700 });
              const filesBefore = routingFiles();
              const result = prepare(dir, root)();
              if (withRouting) {
                expect(routingFiles()).toEqual(filesBefore);
                expect(
                  readFileSync(endpointPath(realpathSync(path)), "utf8"),
                ).toBe(recordBytes);
                expect(endpoint?.proof(nonce)).toBeDefined();
              }
              endpoint?.close();
              return result;
            } finally {
              rmSync(root, { recursive: true, force: true });
            }
          });
        const without = yield* outcome(false);
        const beside = yield* outcome(true);
        expect((without as { reason: string }).reason).toBe(reason);
        expect(beside).toEqual(without);
      }),
  );

it.live(
  "each side's privacy check judges only its own files, with the other side's files beside them",
  () =>
    Effect.gen(function* () {
      const root = yield* Effect.acquireRelease(
        Effect.sync(() => mkdtempSync(join(tmpdir(), "todo-rr-private-"))),
        (path) =>
          Effect.sync(() => rmSync(path, { recursive: true, force: true })),
      );
      const path = join(root, "scratch.db");
      yield* seeded(path);
      // A recordings directory that fails its own privacy rule does not stop routing.
      const recordings = join(root, "diagnostic-recordings");
      mkdirSync(recordings, { mode: 0o700 });
      // The recordings rule (R7-1): an empty directory where the store cannot
      // be created for want of owner write permission is a directory fact.
      chmodSync(recordings, 0o500);
      const endpoint = databaseEndpoint(path);
      if (!endpoint) throw new Error("Missing endpoint");
      const before = endpoint.beforeStore();
      const store = yield* openStore({ path });
      endpoint.verifyStore(before);
      endpoint.publish(1);
      expect(endpoint.proof(nonce)).toBeDefined();
      // The routing directory beside it does not stop recordings, and the
      // recordings directory's own privacy is still judged.
      expect(refusalOf(recordings)).toMatchObject({
        reason: "directory_not_private",
      });
      chmodSync(recordings, 0o700);
      expect(refusalOf(recordings)).toEqual({ reason: "opened" });
      // Routing still judges its own directory: with it non-private, a fresh
      // participant refuses whatever the recordings directory holds.
      yield* store.close();
      endpoint.close();
      chmodSync(join(root, ".todo-routing"), 0o755);
      expect(() => databaseEndpoint(path)).toThrow(
        "Server database binding or singleton guard unavailable",
      );
      chmodSync(join(root, ".todo-routing"), 0o700);
    }),
);

// Diagnostics around routing: the routing routes pass through the Diagnostics
// middleware; a span records them but never changes a status or a body.
it.live(
  "routing routes are recorded by route and outcome, and recording changes no status or body",
  () =>
    Effect.gen(function* () {
      const run = (recording: boolean) =>
        Effect.gen(function* () {
          const root = mkdtempSync(
            join(tmpdir(), `todo-rr-diag-${recording}-`),
          );
          const path = join(root, "scratch.db");
          yield* seeded(path);
          const profiler = new DiagnosticRecorder();
          const previous = process.env.TODO_DIAGNOSTICS_RECORDING;
          if (!recording) process.env.TODO_DIAGNOSTICS_RECORDING = "0";
          const base = yield* serve(path, { profiler }).pipe(
            Effect.ensuring(
              Effect.sync(() => {
                if (previous === undefined)
                  delete process.env.TODO_DIAGNOSTICS_RECORDING;
                else process.env.TODO_DIAGNOSTICS_RECORDING = previous;
              }),
            ),
          );
          const json = { "content-type": "application/json" };
          const replies = {
            proofInvalid: yield* post(`${base}/local/database-proof`, json, {
              nonce: "x",
            }),
            nudgeUnproved: yield* post(`${base}/local/nudge`, {
              ...json,
              "x-todo-incarnation": "0".repeat(64),
              "x-todo-proof": "0".repeat(64),
            }),
            nudge: yield* post(
              `${base}/local/nudge`,
              localHeaders(path, "nudge"),
            ),
            commandUnproved: yield* post(
              `${base}/local/commands`,
              {
                ...json,
                "x-todo-incarnation": "0".repeat(64),
                "x-todo-proof": "0".repeat(64),
              },
              { kind: "add", profile: "work", flags: { title: "never" } },
            ),
          };
          const proof = yield* post(`${base}/local/database-proof`, json, {
            nonce,
          });
          const spans = profiler
            .details()
            .recent.filter((span) => span.stage === "entry");
          rmSync(root, { recursive: true, force: true });
          return {
            replies,
            proofStatus: proof.status,
            profiler,
            spans,
            enabled: profiler.enabled,
          };
        });
      const on = yield* run(true);
      const off = yield* run(false);
      expect(on.enabled).toBe(true);
      expect(off.enabled).toBe(false);
      expect(on.replies).toEqual(off.replies);
      expect(on.proofStatus).toBe(200);
      expect(off.proofStatus).toBe(200);
      expect(on.replies.proofInvalid.status).toBe(400);
      expect(on.replies.nudgeUnproved).toEqual({
        status: 400,
        text: JSON.stringify({
          _tag: "BadRequest",
          message: "Local proof required",
          exit_code: 2,
          exit_meaning: "validation or usage",
        }),
      });
      expect(on.replies.nudge).toEqual({ status: 200, text: "null" });
      expect(on.replies.commandUnproved.status).toBe(200);
      expect(JSON.parse(on.replies.commandUnproved.text)).toMatchObject({
        outcome: "not_run",
        code: "local_proof_required",
        exit_code: 1,
      });
      // Recording on: one entry span per request; refusals end "refused", the
      // typed not-run reply and the nudge end "completed", none "failed".
      expect(on.spans.map((span) => span.outcome)).toEqual([
        "refused",
        "refused",
        "completed",
        "completed",
        "completed",
      ]);
      expect(off.spans).toEqual([]);
    }),
);
