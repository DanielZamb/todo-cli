import { Schema } from "effect";

export const isPreChangeSnapshot = (reason: string) =>
  reason.startsWith("pre-") ||
  reason.startsWith("before Profile delete ") ||
  reason.startsWith("before import ");

export const SnapshotId = Schema.String.check(
  Schema.isPattern(/^[a-f0-9-]{36}$/),
);
const Count = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));
export const SnapshotTaskCount = Schema.Struct({
  profile: Schema.String,
  name: Schema.String,
  count: Count,
});
export const SnapshotManifest = Schema.Struct({
  id: SnapshotId,
  created_at: Schema.String,
  schema_version: Count,
  seq: Count,
  size: Count,
  reason: Schema.NonEmptyString,
  sha256: Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/)),
  path: Schema.String,
  task_counts: Schema.Array(SnapshotTaskCount),
});
export type SnapshotManifest = typeof SnapshotManifest.Type;
export const SnapshotList = Schema.Struct({
  snapshots: Schema.Array(SnapshotManifest),
  last_snapshot_at: Schema.NullOr(Schema.String),
});
export const SnapshotRestoreReport = Schema.Struct({
  id: SnapshotId,
  dry_run: Schema.Boolean,
  seq_before: Count,
  seq_after: Count,
  seq_delta: Schema.Int,
  task_counts: Schema.Array(
    Schema.Struct({
      profile: Schema.String,
      name: Schema.String,
      before: Count,
      after: Count,
    }),
  ),
  safety_snapshot: Schema.NullOr(SnapshotManifest),
  generation: Schema.String,
});
export type SnapshotRestoreReport = typeof SnapshotRestoreReport.Type;
export const SnapshotPruneReport = Schema.Struct({
  dry_run: Schema.Boolean,
  removed: Schema.Array(SnapshotManifest),
  retained: Count,
});
export const SnapshotRetention = Schema.Struct({
  daily: Count,
  weekly: Count,
  pre_change_days: Count,
});
export const SnapshotGeneration = Schema.Struct({
  generation: Schema.String,
  seq: Count,
});
export class SnapshotError extends Error {
  constructor(
    readonly code:
      | "not_found"
      | "invalid_snapshot"
      | "newer_schema"
      | "invalid_args",
    message: string,
  ) {
    super(message);
  }
}
