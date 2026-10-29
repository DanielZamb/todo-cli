import { Schema } from "effect";
import { CredentialInfo } from "./auth/model.ts";

import { TaskMutationKind } from "./events.ts";
import { ProfileId } from "./ids.ts";
import { SnapshotManifest } from "./snapshots.ts";
import { Instant } from "./time.ts";

const Metric = Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0));

export const DiagnosticOperation = Schema.Struct({
  seq: Metric,
  type: Schema.Union([
    TaskMutationKind,
    Schema.Literals([
      "AuthChanged",
      "AuthAttemptRejected",
      "ReminderFired",
      "DatabaseRestored",
      "ProfileDeleted",
      "ProfileDeletionRejected",
      "Unknown",
    ]),
  ]),
  profile: Schema.NullOr(ProfileId),
  outcome: Schema.Literals(["committed", "rejected"]),
  time: Schema.NullOr(Instant),
});
export const DiagnosticClient = Schema.Struct({
  id: Metric,
  profile: ProfileId,
  kind: Schema.Literals(["electron", "swiftui", "cli", "unknown"]),
  connected_since: Instant,
  last_event_id: Schema.NullOr(Schema.String),
});
export const DiagnosticLatency = Schema.Struct({
  route: Schema.String,
  count: Metric,
  p50_ms: Metric,
  p95_ms: Metric,
  p99_ms: Metric,
});
export const DiagnosticError = Schema.Struct({
  id: Metric,
  time: Instant,
  code: Schema.String,
  route: Schema.String,
});
export const DiagnosticsSnapshot = Schema.Struct({
  generated_at: Instant,
  poll_interval_ms: Schema.Literal(1000),
  runtime: Schema.Struct({
    version: Schema.String,
    started_at: Instant,
    uptime_seconds: Metric,
    memory_bytes: Metric,
  }),
  profiles: Schema.Array(Schema.Struct({ id: ProfileId, name: Schema.String })),
  deleted_profiles: Schema.Array(
    Schema.Struct({ id: ProfileId, name: Schema.String }),
  ),
  storage: Schema.Struct({
    database_bytes: Metric,
    wal_bytes: Metric,
    snapshot_bytes: Metric,
    external_id_tasks: Metric,
    attachments: Metric,
    attachment_store_bytes: Metric,
    last_snapshot: Schema.NullOr(
      Schema.Struct({
        id: SnapshotManifest.fields.id,
        created_at: SnapshotManifest.fields.created_at,
        seq: SnapshotManifest.fields.seq,
        size: SnapshotManifest.fields.size,
        schema_version: SnapshotManifest.fields.schema_version,
      }),
    ),
    restore_generation: Schema.String,
    tables: Schema.Array(Schema.Struct({ name: Schema.String, count: Metric })),
    entities: Schema.Array(
      Schema.Struct({
        profile: ProfileId,
        tasks: Metric,
        projects: Metric,
        tags: Metric,
        series: Metric,
        occurrences: Metric,
      }),
    ),
  }),
  operations: Schema.Struct({
    total: Metric,
    committed: Metric,
    rejected: Metric,
    window_seconds: Schema.Literal(60),
    per_second: Metric,
    samples: Schema.Array(Metric),
    recent: Schema.Array(DiagnosticOperation),
  }),
  clients: Schema.Array(DiagnosticClient),
  credentials: Schema.Array(
    Schema.Struct({
      ...CredentialInfo.fields,
      last_used_at: Schema.NullOr(Instant),
    }),
  ),
  errors: Schema.Array(DiagnosticError),
  latency: Schema.Struct({
    window_seconds: Schema.Literal(300),
    capacity: Schema.Literal(2048),
    routes: Schema.Array(DiagnosticLatency),
    samples: Schema.Array(Metric),
  }),
  scheduler: Schema.Struct({
    next_wake_at: Schema.NullOr(Instant),
    pending_reminders: Metric,
    last_reminder_fired: Schema.NullOr(DiagnosticOperation),
  }),
});
export type DiagnosticsSnapshot = typeof DiagnosticsSnapshot.Type;
export type DiagnosticClient = typeof DiagnosticClient.Type;
