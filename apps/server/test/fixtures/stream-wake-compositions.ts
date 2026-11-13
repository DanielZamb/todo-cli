import {
  ActorId,
  type AuthError,
  Instant,
  OccurrenceId,
  type Profile,
  ProfileId,
  Sequence,
  type Task,
  TaskId,
} from "@todo/domain";
import type { OperationStore } from "@todo/domain/store";
import { Effect, Schema } from "effect";
import type { StoreError } from "../../../../packages/domain/src/store/error.ts";
import { weekly } from "../../../../packages/domain/test/recurrence-fixtures.ts";

type Fixture = {
  credential: string;
  profile: Profile;
  task: Task;
};
type Leaf = (
  store: OperationStore,
  fixture: Fixture,
) => Effect.Effect<unknown, unknown>;
type Members<T> = Record<keyof T, Leaf | "property" | "boundary" | "lifetime">;
const sync = (run: () => unknown) => Effect.sync(run);
const actor = Schema.decodeUnknownSync(ActorId)("composition");
const time = Schema.decodeUnknownSync(Instant)("2026-11-01T00:00:00Z");
const seq = Schema.decodeUnknownSync(Sequence)(1);
const absent = Schema.decodeUnknownSync(ProfileId)("absent");
const occurrence = Schema.decodeUnknownSync(OccurrenceId)("unused");
const missingTask = Schema.decodeUnknownSync(TaskId)("absent");
const request = (fixture: Fixture) => ({
  credential: fixture.credential,
  profile: fixture.profile.id,
});

const members = {
  store: {
    searchWords: "property",
    auth: "property",
    scheduled: "property",
    diagnostics: "property",
    attachmentRoot: "property",
    isPreview: "property",
    snapshots: "property",
    close: "lifetime",
    settings: (s) => s.settings(),
    ensureProfile: (s, f) => s.ensureProfile(f.profile),
    putProfile: (s, f) => s.putProfile(f.profile),
    profiles: (s) => s.profiles(),
    projects: (s) => s.projects(),
    tags: (s) => s.tags(),
    tasks: (s) => s.tasks(),
    series: (s) => s.series(),
    dependencies: (s) => s.dependencies(),
    graph: (s, f) => s.graph(f.profile.id),
    fork: (s) => s.fork().pipe(Effect.flatMap((fork) => fork.close())),
    history: (s) => s.history(),
    searchCacheEvents: (s) => s.searchCacheEvents(),
    append: (s, f) => s.append({ actor, profile: f.profile.id, event: {} }),
    move: (s, f) =>
      s.move({ actor, before: f.task, after: f.task, original_seq: null }),
    startSeries: (s) => s.startSeries({}),
    finishTask: (s) => s.finishTask({}),
    reject: (s, f) =>
      s.reject({
        actor,
        profile: f.profile.id,
        event: {},
        reason: "composition",
      }),
    takeSnapshot: (s) => s.takeSnapshot(),
    rebuild: (s) => s.rebuild(),
    revert: (s, f) =>
      s.revert({ actor, profile: f.profile.id, seq, occurred_at: time }),
  } satisfies Members<OperationStore>,
  auth: {
    setupOwner: (s) => s.auth.setupOwner(""),
    resetPassphrase: (s) => s.auth.resetPassphrase(""),
    signIn: (s) => s.auth.signIn("x".repeat(5000)),
    authenticate: (s, f) =>
      s.auth.authenticate({ ...request(f), access: "read" }),
    resolveProfile: (s, f) =>
      s.auth.resolveProfile({ ...request(f), action: "read" }),
    requireOwner: (s, f) => s.auth.requireOwner(f),
    issueToken: (s, f) =>
      s.auth.issueToken({
        credential: f.credential,
        token: { name: "composition", profile: null, scope: "read-only" },
      }),
    nextExpiry: (s) => s.auth.nextExpiry(),
    cleanupExpired: (s) => s.auth.cleanupExpired(),
    listTokens: (s, f) => s.auth.listTokens(f),
    revokeToken: (s, f) =>
      s.auth.revokeToken({ credential: f.credential, name: "absent" }),
    signOut: (s) => s.auth.signOut({ credential: "invalid" }),
    deleteProfile: (s, f) =>
      s.auth.deleteProfile({
        ...request(f),
        profile: absent,
        options: { dry_run: true, with_tasks: false },
      }),
    readSnapshot: "boundary",
    mutate: "boundary",
    profiles: (s, f) => s.auth.profiles(f),
    read: (s, f) => s.auth.read(request(f)),
    append: (s, f) => s.auth.append({ ...request(f), event: {} }),
    startSeries: (s, f) =>
      s.auth.startSeries({
        ...request(f),
        series: { ...weekly, profile_id: absent },
        attachments: [],
        external_id: null,
        task_id: f.task.id,
        occurrence_id: occurrence,
      }),
    finishTask: (s, f) =>
      s.auth.finishTask({
        ...request(f),
        task_id: missingTask,
        from_version: f.task.row_version,
        action: "complete",
        next_task_id: f.task.id,
        next_occurrence_id: occurrence,
      }),
    revert: (s, f) => s.auth.revert({ ...request(f), seq }),
  } satisfies Members<OperationStore["auth"]>,
  scheduled: {
    pendingReminders: (s) => s.scheduled.pendingReminders(),
    nextAt: (s) => s.scheduled.nextAt(),
    runDue: (s) => s.scheduled.runDue(),
  } satisfies Members<OperationStore["scheduled"]>,
  snapshots: {
    directory: "property",
    persistent: "property",
    listSync: (s) => sync(() => s.snapshots.listSync()),
    createSync: (s) => sync(() => s.snapshots.createSync("composition")),
    create: (s) => s.snapshots.create("composition"),
    list: (s) => s.snapshots.list(),
    show: (s) => s.snapshots.show("absent"),
    discardSync: (s) => sync(() => s.snapshots.discardSync("absent")),
    generationSync: (s) => sync(() => s.snapshots.generationSync()),
    generation: (s) => s.snapshots.generation(),
    purgedIdsSync: (s) => sync(() => s.snapshots.purgedIdsSync()),
    redactAllSync: (s) => sync(() => s.snapshots.redactAllSync([])),
    restore: (s) => s.snapshots.restore("absent", { dryRun: true }),
    prune: (s) => s.snapshots.prune(),
    runDaily: (s) => s.snapshots.runDaily(),
  } satisfies Members<OperationStore["snapshots"]>,
};

const leaves = (group: string, values: Record<string, Leaf | string>) =>
  Object.entries(values).flatMap(([member, run]) =>
    typeof run === "function" ? [{ name: `${group}.${member}`, run }] : [],
  );
export const compositionLeaves = Object.entries(members).flatMap(
  ([group, values]) => leaves(group, values),
);
export const compositionScopes = ["mutate", "readSnapshot"] as const;
export const compositionPaths = compositionScopes.flatMap((outer) => [
  [outer],
  ...compositionScopes.map((inner) => [outer, inner]),
]);
export type CompositionScope = (typeof compositionScopes)[number];
export const compose = (
  store: OperationStore,
  fixture: Fixture,
  path: readonly CompositionScope[],
  operation: Effect.Effect<void, AuthError | StoreError>,
  ended: () => void,
): Effect.Effect<void, AuthError | StoreError> => {
  const [scope, ...rest] = path;
  if (!scope) return operation;
  const nested = () =>
    compose(store, fixture, rest, operation, ended).pipe(
      Effect.onExit(() => sync(ended)),
    );
  return scope === "mutate"
    ? store.auth.mutate(request(fixture), nested)
    : store.auth.readSnapshot(nested);
};
