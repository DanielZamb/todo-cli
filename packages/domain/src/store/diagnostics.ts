import type { Database } from "bun:sqlite";
import { lstatSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { Effect, Schema } from "effect";
import type { AuthError } from "../auth/model.ts";
import { CredentialInfo } from "../auth/model.ts";
import {
  type DiagnosticClient,
  DiagnosticOperation,
  DiagnosticsSnapshot,
} from "../diagnostics.ts";
import type { ProfileId } from "../ids.ts";
import type { SnapshotList } from "../snapshots.ts";
import { Instant } from "../time.ts";
import { StoreError } from "./error.ts";
import type { ScheduledWork } from "./scheduled-work.ts";
import type { Snapshots } from "./snapshots.ts";

const instant = (time: number) =>
  Schema.decodeUnknownSync(Instant)(new Date(time).toISOString());
const bytes = (path: string) =>
  statSync(path, { throwIfNoEntry: false })?.size ?? 0;
const directoryBytes = (path: string): number => {
  const entry = lstatSync(path, { throwIfNoEntry: false });
  if (!entry || entry.isSymbolicLink()) return 0;
  if (entry.isFile()) return entry.size;
  return entry.isDirectory()
    ? readdirSync(path).reduce(
        (total, name) => total + directoryBytes(join(path, name)),
        0,
      )
    : 0;
};
const percentile = (values: readonly number[], fraction: number) =>
  values[Math.max(0, Math.ceil(values.length * fraction) - 1)] ?? 0;
class Ring<A> {
  private readonly entries: A[] = [];
  private cursor = 0;
  constructor(private readonly capacity: number) {}
  push(value: A) {
    this.entries[this.cursor] = value;
    this.cursor = (this.cursor + 1) % this.capacity;
  }
  clear() {
    this.entries.length = 0;
    this.cursor = 0;
  }
  values() {
    return [
      ...this.entries.slice(this.cursor),
      ...this.entries.slice(0, this.cursor),
    ];
  }
}
class RequestRing {
  private readonly times: Float64Array;
  private readonly durations: Float64Array;
  private readonly statuses: Uint16Array;
  private readonly ids: Float64Array;
  private readonly routes: string[];
  private cursor = 0;
  private count = 0;
  constructor(private readonly capacity: number) {
    this.times = new Float64Array(capacity);
    this.durations = new Float64Array(capacity);
    this.statuses = new Uint16Array(capacity);
    this.ids = new Float64Array(capacity);
    this.routes = Array.from({ length: capacity }, () => "");
  }
  push(time: number, route: string, duration: number, status: number, id = 0) {
    this.times[this.cursor] = time;
    this.durations[this.cursor] = duration;
    this.statuses[this.cursor] = status;
    this.ids[this.cursor] = id;
    this.routes[this.cursor] = route;
    this.cursor = (this.cursor + 1) % this.capacity;
    this.count = Math.min(this.count + 1, this.capacity);
  }
  values(since: number) {
    return Array.from({ length: this.count }, (_, offset) => {
      const index =
        (this.cursor - this.count + offset + this.capacity) % this.capacity;
      return {
        time: this.times[index] ?? 0,
        route: this.routes[index] ?? "unmatched",
        duration: this.durations[index] ?? 0,
        status: this.statuses[index] ?? 0,
        id: this.ids[index] ?? 0,
      };
    }).filter((value) => value.time > since);
  }
}

export class Diagnostics {
  private readonly started = Date.now();
  private readonly monotonicStart = performance.now();
  private readonly requests = new RequestRing(2048);
  private readonly errors = new RequestRing(100);
  private nextErrorId = 0;
  private restoreGeneration: string;
  private readonly clients = new Map<number, DiagnosticClient>();
  private readonly lastUsed = new Map<string, number>();
  private nextClientId = 0;
  private nextWake: number | null = null;
  private readonly throughput = new Ring<number>(60);
  private previousSeq: number | null = null;
  private previousAt = 0;

  constructor(
    private readonly db: Database,
    private readonly path: string,
    private readonly owner: (input: {
      credential: string;
    }) => Effect.Effect<CredentialInfo, AuthError | StoreError>,
    private readonly snapshots: Snapshots,
    private readonly scheduled: ScheduledWork,
    private readonly attachmentRoot: string,
  ) {
    this.restoreGeneration = snapshots.generationSync().generation;
  }

  request(
    route: string,
    duration: number,
    status: number,
    time = performance.now(),
  ) {
    this.requests.push(time, route, duration, status);
    if (status >= 400)
      this.errors.push(time, route, duration, status, ++this.nextErrorId);
  }
  credentialUsed(id: string, time: number) {
    if (!this.lastUsed.has(id) && this.lastUsed.size >= 512) {
      const first = this.lastUsed.keys().next();
      if (!first.done) this.lastUsed.delete(first.value);
    }
    this.lastUsed.set(id, time);
  }
  connect(
    profile: typeof ProfileId.Type,
    kind: DiagnosticClient["kind"],
    lastEventId: string | undefined,
  ) {
    if (this.clients.size >= 512) return null;
    const id = ++this.nextClientId;
    this.clients.set(id, {
      id,
      profile,
      kind,
      connected_since: instant(Date.now()),
      last_event_id: lastEventId ?? null,
    });
    return id;
  }
  delivered(id: number | null, seq: string) {
    if (id === null) return;
    const client = this.clients.get(id);
    if (client) this.clients.set(id, { ...client, last_event_id: seq });
  }
  disconnect(id: number | null) {
    if (id !== null) this.clients.delete(id);
  }
  schedulerWake(time: number | null) {
    this.nextWake = time;
  }
  private generation(value: string) {
    if (this.restoreGeneration !== value) {
      this.throughput.clear();
      this.previousSeq = null;
      this.previousAt = 0;
      for (const [id, client] of this.clients)
        this.clients.set(id, { ...client, last_event_id: null });
    }
    this.restoreGeneration = value;
  }
  sample() {
    const seq =
      this.db
        .query<{ seq: number }, []>(
          "SELECT coalesce(max(seq),0) AS seq FROM op_log",
        )
        .get()?.seq ?? 0;
    const time = Date.now();
    if (this.previousSeq !== null)
      this.throughput.push(
        Math.max(0, seq - this.previousSeq) /
          Math.max(0.001, (time - this.previousAt) / 1000),
      );
    this.previousAt = time;
    this.previousSeq = seq;
  }
  read(input: { credential: string }) {
    return Effect.gen({ self: this }, function* () {
      yield* this.owner(input);
      const generation = yield* this.snapshots.generation();
      this.generation(generation.generation);
      const snapshots = yield* this.snapshots.list();
      const pending = yield* this.scheduled.pendingReminders();
      return yield* Effect.try({
        try: () => this.snapshot(snapshots, pending),
        catch: (cause) => new StoreError(cause),
      });
    });
  }
  private snapshot(
    snapshots: typeof SnapshotList.Type,
    pending: number,
  ): DiagnosticsSnapshot {
    const now = Date.now();
    const tables = this.db
      .query<{ name: string }, []>(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
      )
      .all()
      .map(({ name }) => ({
        name,
        count:
          this.db
            .query<{ count: number }, []>(
              `SELECT count(*) AS count FROM "${name.replaceAll('"', '""')}"`,
            )
            .get()?.count ?? 0,
      }));
    const profiles = this.db
      .query(
        "SELECT id,name FROM profiles WHERE id NOT IN (SELECT profile FROM profile_deletions) ORDER BY name",
      )
      .all();
    const deletedProfiles = this.db
      .query(
        "SELECT p.id,p.name FROM profiles p JOIN profile_deletions d ON d.profile=p.id ORDER BY p.name",
      )
      .all();
    const operations = Schema.decodeUnknownSync(
      Schema.Array(DiagnosticOperation),
    )(
      this.db
        .query(
          "SELECT seq, CASE WHEN json_extract(event,'$.kind')='TaskHistoryRedacted' THEN coalesce(json_extract(event,'$.attempted_kind'),json_extract(event,'$.original_kind')) WHEN json_extract(event,'$.kind')='TaskAttemptRejected' THEN json_extract(event,'$.attempted_kind') ELSE json_extract(event,'$.kind') END AS type, profile, outcome, json_extract(event,'$.occurred_at') AS time FROM op_log ORDER BY seq DESC LIMIT 100",
        )
        .all(),
    );
    const counts = this.db
      .query<{ total: number; committed: number; rejected: number }, []>(
        "SELECT count(*) AS total, coalesce(sum(outcome='committed'),0) AS committed, coalesce(sum(outcome='rejected'),0) AS rejected FROM op_log",
      )
      .get();
    const snapshotBytes =
      this.db
        .query<{ bytes: number }, []>(
          "SELECT coalesce(sum(length(CAST(payload AS BLOB))),0) AS bytes FROM snapshots",
        )
        .get()?.bytes ?? 0;
    const entities = this.db
      .query(
        "SELECT id AS profile, (SELECT count(*) FROM tasks WHERE profile_id=profiles.id) AS tasks, (SELECT count(*) FROM projects WHERE profile_id=profiles.id) AS projects, (SELECT count(*) FROM tags WHERE profile_id=profiles.id) AS tags, (SELECT count(*) FROM series WHERE json_extract(payload,'$.profile_id')=profiles.id) AS series, (SELECT count(*) FROM tasks WHERE profile_id=profiles.id AND json_extract(payload,'$.occurrence') IS NOT NULL) AS occurrences FROM profiles WHERE id NOT IN (SELECT profile FROM profile_deletions) ORDER BY id",
      )
      .all();
    const credentials = Schema.decodeUnknownSync(Schema.Array(CredentialInfo))(
      this.db
        .query(
          "SELECT id,kind,name,profile,scope,created_at,expires_at,revoked_at FROM credentials WHERE revoked_at IS NULL AND julianday(expires_at)>julianday(?) ORDER BY kind,name,id",
        )
        .all(instant(now)),
    ).map((value) => ({
      ...value,
      last_used_at: this.lastUsed.has(value.id)
        ? instant(this.lastUsed.get(value.id) ?? now)
        : null,
    }));
    for (const id of this.lastUsed.keys())
      if (!credentials.some((value) => value.id === id))
        this.lastUsed.delete(id);
    const since = performance.now() - 300000;
    const samples = this.requests.values(since);
    const routes = [...new Set(samples.map((value) => value.route))]
      .sort()
      .map((route) => {
        const durations = samples
          .filter((value) => value.route === route)
          .map((value) => value.duration)
          .sort((a, b) => a - b);
        return {
          route,
          count: durations.length,
          p50_ms: percentile(durations, 0.5),
          p95_ms: percentile(durations, 0.95),
          p99_ms: percentile(durations, 0.99),
        };
      });
    const lastReminder = Schema.decodeUnknownSync(
      Schema.NullOr(DiagnosticOperation),
    )(
      this.db
        .query(
          "SELECT seq, 'ReminderFired' AS type, profile, outcome, json_extract(event,'$.occurred_at') AS time FROM op_log WHERE outcome='committed' AND (json_extract(event,'$.kind')='ReminderFired' OR (json_extract(event,'$.kind')='TaskHistoryRedacted' AND json_extract(event,'$.original_kind')='ReminderFired')) ORDER BY seq DESC LIMIT 1",
        )
        .get(),
    );
    const rate =
      this.db
        .query<{ count: number }, [string]>(
          "SELECT count(*) AS count FROM op_log WHERE julianday(json_extract(event,'$.occurred_at'))>julianday(?)",
        )
        .get(instant(now - 60000))?.count ?? 0;
    return Schema.decodeUnknownSync(DiagnosticsSnapshot)({
      generated_at: instant(now),
      poll_interval_ms: 1000,
      runtime: {
        version: "0.1.0",
        started_at: instant(this.started),
        uptime_seconds: (now - this.started) / 1000,
        memory_bytes: process.memoryUsage.rss(),
      },
      profiles,
      deleted_profiles: deletedProfiles,
      storage: {
        database_bytes: bytes(this.path),
        wal_bytes: bytes(`${this.path}-wal`),
        snapshot_bytes:
          snapshotBytes +
          snapshots.snapshots.reduce((total, value) => total + value.size, 0),
        last_snapshot: snapshots.snapshots[0] ?? null,
        restore_generation: this.restoreGeneration ?? "initial",
        attachments:
          this.db
            .query<{ count: number }, []>(
              "SELECT count(*) AS count FROM tasks, json_each(tasks.payload, '$.attachments')",
            )
            .get()?.count ?? 0,
        attachment_store_bytes: directoryBytes(this.attachmentRoot),
        external_id_tasks:
          this.db
            .query<{ count: number }, []>(
              "SELECT count(*) AS count FROM tasks WHERE external_id IS NOT NULL",
            )
            .get()?.count ?? 0,
        tables,
        entities,
      },
      operations: {
        total: counts?.total ?? 0,
        committed: counts?.committed ?? 0,
        rejected: counts?.rejected ?? 0,
        window_seconds: 60,
        per_second: rate / 60,
        samples: this.throughput.values(),
        recent: operations,
      },
      clients: [...this.clients.values()],
      credentials,
      errors: this.errors
        .values(since)
        .reverse()
        .map((value) => ({
          id: value.id,
          route: value.route,
          time: instant(this.started + value.time - this.monotonicStart),
          code:
            value.status === 409
              ? "conflict"
              : value.status === 401
                ? "unauthorized"
                : value.status === 403
                  ? "forbidden"
                  : value.status === 404
                    ? "not_found"
                    : value.status < 500
                      ? "invalid_request"
                      : "internal_error",
        })),
      latency: {
        window_seconds: 300,
        capacity: 2048,
        routes,
        samples: samples.slice(-60).map((value) => value.duration),
      },
      scheduler: {
        next_wake_at: this.nextWake === null ? null : instant(this.nextWake),
        pending_reminders: pending,
        last_reminder_fired: lastReminder,
      },
    });
  }
}
