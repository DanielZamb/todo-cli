import { Database } from "bun:sqlite";
import {
  chmodSync,
  closeSync,
  existsSync,
  openSync,
  realpathSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { Effect, Option, Schema } from "effect";
import { eraseTaskAttachments } from "../attachment-store.ts";
import { validAttachmentLocation } from "../attachments.ts";
import { Authentication } from "../auth/auth.ts";
import {
  Profile,
  Project,
  seriesForTask,
  Tag,
  Task,
  type TaskDetails,
} from "../entities.ts";
import {
  Event,
  OpLogEntry,
  TaskAttemptRejected,
  TaskMutationKind,
} from "../events.ts";
import { ActorId, ProfileId, Sequence, TaskId, Version } from "../ids.ts";
import {
  DeleteProfile,
  type ProfileDeletionResult,
} from "../profile-commands.ts";
import {
  FinishTask,
  occurrenceCursor,
  resolveNextTime,
  resolveOccurrence,
  StartSeries,
} from "../recurrence.ts";
import { Instant } from "../time.ts";
import { Diagnostics } from "./diagnostics.ts";
import { StoreError } from "./error.ts";
import { redactTaskHistory } from "./purge.ts";
import { ScheduledWork } from "./scheduled-work.ts";
import { Snapshots } from "./snapshots.ts";

export { StoreError } from "./error.ts";

import { currentSchemaVersion, migrate } from "./migration.ts";
import {
  applyEvent,
  changes,
  createProjection,
  metadata,
  putMetadata,
  putSeries,
  putTask,
  readSeries,
  readTasks,
  Snapshot,
  snapshot,
} from "./projection.ts";

declare module "bun:sqlite" {
  interface Database {
    function(name: string, fn: () => number): this;
  }
}

class Rejection extends Error {
  constructor(readonly reason: string) {
    super(reason);
  }
}
class AttachmentCleanupError extends Error {
  constructor(cause: unknown) {
    super(
      "Purge committed, but copied Attachments could not be erased. Repair the attachment store and reopen Todo to retry.",
      { cause },
    );
  }
}

const attempt = <A>(run: () => A) =>
  Effect.try({ try: run, catch: (cause) => new StoreError(cause) });
const identity = Schema.Struct({ actor: ActorId, profile: ProfileId });
const commandEnvelope = Schema.Struct({
  ...identity.fields,
  occurred_at: Instant,
});
const commandFacts = Schema.Record(Schema.String, Schema.Json);
const attemptTarget = Schema.Union([
  Schema.Struct({ task_id: TaskId }),
  Schema.Struct({ task: Schema.Struct({ id: TaskId }) }),
  Schema.Struct({ before: Schema.Struct({ id: TaskId }) }),
]);
const same = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);
type Append = {
  readonly actor: ActorId;
  readonly profile: ProfileId;
  readonly event: unknown;
};
const json = (value: unknown): string => {
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new Error("An attempt must be a JSON value");
  return encoded;
};

const restrictPermissions = (path: string) => {
  if (path === ":memory:") return;
  for (const file of [path, `${path}-wal`, `${path}-shm`])
    if (existsSync(file)) chmodSync(file, 0o600);
};

const prepareDatabasePath = (path: string, create: boolean) => {
  if (path === ":memory:") return path;
  const file = openSync(path, create ? "a" : "r+", 0o600);
  try {
    const target = realpathSync(path);
    restrictPermissions(target);
    return target;
  } finally {
    closeSync(file);
  }
};

export class OperationStore {
  private writing = false;
  private attachmentCleanupRequested = false;
  private readonly db: Database;

  readonly auth;
  readonly scheduled;
  readonly diagnostics;
  readonly attachmentRoot: string;
  readonly isPreview: boolean;
  readonly snapshots;

  constructor(
    options: {
      readonly path: string;
      readonly create?: boolean;
      readonly attachmentRoot?: string;
    },
    snapshot?: Uint8Array,
  ) {
    this.isPreview = snapshot !== undefined;
    this.attachmentRoot =
      options.attachmentRoot ??
      process.env.TODO_ATTACHMENT_ROOT ??
      join(dirname(resolve(options.path)), "attachments");
    const path = prepareDatabasePath(options.path, options.create ?? true);
    this.db = snapshot
      ? Database.deserialize(snapshot, { strict: true })
      : new Database(path, {
          create: options.create ?? true,
          readwrite: true,
          strict: true,
        });
    try {
      this.db.function("domain_write_allowed", () => (this.writing ? 1 : 0));
      this.db.exec(
        "PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA synchronous=FULL;",
      );
      restrictPermissions(path);
      this.snapshots = new Snapshots(this.db, path, (run) =>
        this.transaction(run),
      );
      this.transaction(() => {
        const version =
          this.db
            .query<{ user_version: number }, []>("PRAGMA user_version")
            .get()?.user_version ?? 0;
        const existing =
          this.db
            .query(
              "SELECT 1 FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' LIMIT 1",
            )
            .get() !== null;
        const beforeMigration =
          path !== ":memory:" && existing && version < currentSchemaVersion;
        if (beforeMigration) this.snapshots.createSync("pre-migration");
        migrate(this.db);
        const purged = this.snapshots.purgedIdsSync();
        for (const id of purged)
          redactTaskHistory(this.db, this.historySync(0), id);
        if (beforeMigration && purged.length)
          this.snapshots.redactAllSync(purged);
      });
      restrictPermissions(path);
      this.cleanupAttachmentsSync();
      this.scheduled = new ScheduledWork(
        this.db,
        (run) => this.transaction(run),
        {
          tasks: () => readTasks(this.db),
          append: (input) => this.appendSync(input),
          remind: (task, event) => {
            this.record(
              {
                actor: Schema.decodeUnknownSync(ActorId)("scheduler"),
                profile: task.profile_id,
              },
              {
                event,
                from_version: null,
                to_version: null,
                outcome: "committed",
                reason: null,
              },
            );
          },
        },
      );
      this.diagnostics = new Diagnostics(
        this.db,
        path,
        (input) => this.auth.requireOwner(input),
        this.snapshots,
        this.scheduled,
        this.attachmentRoot,
      );
      this.auth = new Authentication(this.db, (run) => this.transaction(run), {
        credentialUsed: (id, time) => this.diagnostics.credentialUsed(id, time),
        snapshotBeforeProfileDelete: (reason) => this.snapshots.create(reason),
        deleteProfile: (input) => this.deleteProfileSync(input),
        profiles: () =>
          Schema.decodeUnknownSync(Schema.Array(Profile))(
            this.db
              .query(
                "SELECT * FROM profiles WHERE id NOT IN (SELECT profile FROM profile_deletions) ORDER BY id",
              )
              .all(),
          ),
        read: (profile) => ({
          profiles: Schema.decodeUnknownSync(Schema.Array(Profile))(
            this.db
              .query(
                "SELECT * FROM profiles WHERE id=? AND id NOT IN (SELECT profile FROM profile_deletions)",
              )
              .all(profile),
          ),
          tasks: readTasks(this.db).filter(
            (task) => task.profile_id === profile,
          ),
          series: readSeries(this.db).filter(
            (series) => series.profile_id === profile,
          ),
          projects: Schema.decodeUnknownSync(Schema.Array(Project))(
            this.db
              .query("SELECT * FROM projects WHERE profile_id=? ORDER BY id")
              .all(profile),
          ),
          tags: Schema.decodeUnknownSync(Schema.Array(Tag))(
            this.db
              .query("SELECT * FROM tags WHERE profile_id=? ORDER BY id")
              .all(profile),
          ),
          history: this.historySync(0).filter(
            (entry) => entry.profile === profile,
          ),
        }),
        append: (input) => this.appendSync(input),
        startSeries: (input) => this.startSeriesSync(input),
        finishTask: (input) => this.finishTaskSync(input),
        revert: (input) => this.revertSync(input),
      });
    } catch (error) {
      this.db.close();
      throw error;
    }
  }

  private transaction<A>(run: () => A): A {
    const result = this.db
      .transaction(() => {
        const writing = this.writing;
        this.writing = true;
        try {
          return run();
        } finally {
          this.writing = writing;
        }
      })
      .immediate();
    if (!this.writing && this.attachmentCleanupRequested) {
      this.attachmentCleanupRequested = false;
      this.cleanupAttachmentsSync();
    }
    return result;
  }

  readonly close = () => attempt(() => this.db.close());

  private cleanupAttachmentsSync() {
    for (const row of this.db
      .query<{ profile_id: string; task_id: string }, []>(
        "SELECT profile_id,task_id FROM attachment_cleanup",
      )
      .all()) {
      try {
        eraseTaskAttachments(this.attachmentRoot, row.profile_id, row.task_id);
      } catch (cause) {
        throw new AttachmentCleanupError(cause);
      }
      this.db
        .query(
          "DELETE FROM attachment_cleanup WHERE profile_id=? AND task_id=?",
        )
        .run(row.profile_id, row.task_id);
    }
  }

  private queueAttachmentCleanup(id: TaskId) {
    this.attachmentCleanupRequested = true;
    const tasks = this.historySync(0).flatMap((entry) =>
      Schema.is(Event)(entry.event)
        ? changes(entry.event).tasks.flatMap(({ before, after }) =>
            [before, after].filter((task) => task?.id === id),
          )
        : [],
    );
    for (const task of tasks)
      if (task)
        this.db
          .query(
            "INSERT OR IGNORE INTO attachment_cleanup(profile_id,task_id) VALUES (?,?)",
          )
          .run(task.profile_id, id);
  }

  readonly settings = () =>
    attempt(() => ({
      journal_mode: this.db
        .query<{ journal_mode: string }, []>("PRAGMA journal_mode")
        .get()?.journal_mode,
      busy_timeout: this.db
        .query<{ timeout: number }, []>("PRAGMA busy_timeout")
        .get()?.timeout,
      user_version: this.db
        .query<{ user_version: number }, []>("PRAGMA user_version")
        .get()?.user_version,
    }));

  readonly ensureProfile = (candidate: Profile) =>
    attempt(() =>
      this.transaction(() => {
        const existing = this.db
          .query(
            "SELECT * FROM profiles WHERE (name=? OR id=?) AND id NOT IN (SELECT profile FROM profile_deletions) ORDER BY id LIMIT 1",
          )
          .get(candidate.name, candidate.id);
        if (existing) return Schema.decodeUnknownSync(Profile)(existing);
        const reserved = this.db
          .query("SELECT 1 FROM profiles WHERE id=?")
          .get(candidate.id);
        const value = Schema.decodeUnknownSync(Profile)({
          ...candidate,
          id: reserved ? crypto.randomUUID() : candidate.id,
        });
        this.db
          .query("INSERT INTO profiles VALUES (?,?,?,?)")
          .run(value.id, value.name, value.created_at, value.updated_at);
        return value;
      }),
    );

  private deleteProfileSync(input: {
    preview: boolean;
    actor: ActorId;
    profile: ProfileId;
    options: DeleteProfile;
    occurred_at: Instant;
  }): ProfileDeletionResult {
    const options = Schema.decodeUnknownSync(DeleteProfile)(input.options);
    const profiles = Schema.decodeUnknownSync(Schema.Array(Profile))(
      this.db
        .query(
          "SELECT * FROM profiles WHERE id NOT IN (SELECT profile FROM profile_deletions) ORDER BY id",
        )
        .all(),
    );
    const profile = profiles.find((p) => p.id === input.profile);
    const tasks = readTasks(this.db).filter(
      (t) => t.profile_id === input.profile && t.deleted_at === null,
    );
    const code = !profile
      ? "not_found"
      : profiles.length === 1
        ? "last_profile"
        : tasks.length && !options.with_tasks
          ? "profile_not_empty"
          : null;
    if (code !== null) {
      const message =
        code === "not_found"
          ? "Profile not found; run todo profile list"
          : code === "last_profile"
            ? "The last remaining Profile cannot be deleted; create another Profile first"
            : `Profile has ${tasks.length} visible ${tasks.length === 1 ? "Task" : "Tasks"}; use --with-tasks to delete ${tasks.length === 1 ? "it" : "them"} recoverably first`;
      if (!options.dry_run && profile)
        this.record(input, {
          event: {
            kind: "ProfileDeletionRejected",
            entity_version: 1,
            occurred_at: input.occurred_at,
            code,
            visible_task_count: tasks.length,
          },
          from_version: null,
          to_version: null,
          outcome: "rejected",
          reason: code,
        });
      return {
        outcome: "refused",
        error: {
          generated_at: input.occurred_at,
          code,
          message,
          details: { visible_task_count: tasks.length },
        },
      };
    }
    if (!profile)
      throw new Error("Profile deletion requires an active Profile");
    const tokens = this.db
      .query<{ id: string }, [string]>(
        "SELECT id FROM credentials WHERE profile=? AND revoked_at IS NULL ORDER BY id",
      )
      .all(input.profile);
    const report = {
      generated_at: input.occurred_at,
      profile,
      dry_run: options.dry_run,
      tasks_affected: tasks.length,
      sessions_revoked: 0 as const,
      access_tokens_revoked: tokens.length,
    };
    if (options.dry_run || input.preview) return { outcome: "deleted", report };
    for (const before of tasks) {
      const result = this.appendSync({
        ...input,
        event: {
          kind: "TaskDeleted",
          entity_version: 1,
          occurred_at: input.occurred_at,
          before,
          after: {
            ...before,
            deleted_at: input.occurred_at,
            updated_at: input.occurred_at,
            row_version: before.row_version + 1,
          },
        },
      });
      if (result.outcome !== "committed") throw new Error(result.reason);
    }
    this.record(input, {
      event: {
        kind: "ProfileDeleted",
        entity_version: 1,
        occurred_at: input.occurred_at,
        profile,
        access_token_ids: tokens.map((t) => t.id),
      },
      from_version: null,
      to_version: null,
      outcome: "committed",
      reason: null,
    });
    this.db
      .query("INSERT INTO profile_deletions VALUES (?,?)")
      .run(profile.id, input.occurred_at);
    this.db
      .query(
        "UPDATE credentials SET revoked_at=? WHERE profile=? AND revoked_at IS NULL",
      )
      .run(input.occurred_at, profile.id);
    return { outcome: "deleted", report };
  }

  readonly putProfile = (input: Profile) =>
    attempt(() => {
      const value = Schema.decodeUnknownSync(Profile)(input);
      this.transaction(() =>
        this.db
          .query(
            "INSERT INTO profiles VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,updated_at=excluded.updated_at",
          )
          .run(value.id, value.name, value.created_at, value.updated_at),
      );
    });

  readonly profiles = () =>
    attempt(() =>
      Schema.decodeUnknownSync(Schema.Array(Profile))(
        this.db
          .query(
            "SELECT * FROM profiles WHERE id NOT IN (SELECT profile FROM profile_deletions) ORDER BY id",
          )
          .all(),
      ),
    );
  readonly projects = () =>
    attempt(() =>
      Schema.decodeUnknownSync(Schema.Array(Project))(
        this.db.query("SELECT * FROM projects ORDER BY id").all(),
      ),
    );
  readonly tags = () =>
    attempt(() =>
      Schema.decodeUnknownSync(Schema.Array(Tag))(
        this.db.query("SELECT * FROM tags ORDER BY id").all(),
      ),
    );
  readonly tasks = () => attempt(() => readTasks(this.db));
  readonly series = () => attempt(() => readSeries(this.db));

  private historySync(after: number): OpLogEntry[] {
    return this.db
      .query<
        {
          seq: number;
          actor: string;
          profile: string;
          event: string;
          from_version: number | null;
          to_version: number | null;
          outcome: string;
          reason: string | null;
        },
        [number]
      >("SELECT * FROM op_log WHERE seq>? ORDER BY seq")
      .all(after)
      .map((row) =>
        Schema.decodeUnknownSync(OpLogEntry)({
          ...row,
          event: JSON.parse(row.event),
        }),
      );
  }

  readonly fork = () =>
    attempt(() => {
      const snapshot = this.db.serialize();
      snapshot[18] = 1;
      snapshot[19] = 1;
      return new OperationStore(
        { path: ":memory:", attachmentRoot: this.attachmentRoot },
        snapshot,
      );
    });

  readonly history = (after = 0) => attempt(() => this.historySync(after));

  private record(
    input: Pick<Append, "actor" | "profile">,
    entry: Omit<OpLogEntry, "seq" | "actor" | "profile">,
  ): OpLogEntry {
    const result = this.db
      .query(
        "INSERT INTO op_log(actor,profile,entity_version,event,from_version,to_version,outcome,reason) VALUES (?,?,1,?,?,?,?,?)",
      )
      .run(
        input.actor,
        input.profile,
        json(entry.event),
        entry.from_version,
        entry.to_version,
        entry.outcome,
        entry.reason,
      );
    return Schema.decodeUnknownSync(OpLogEntry)({
      ...entry,
      seq: Number(result.lastInsertRowid),
      actor: input.actor,
      profile: input.profile,
    });
  }

  private recordRejection(
    input: Append,
    reason: string,
    fromVersion: Version | null = null,
  ): OpLogEntry {
    const payload: unknown = JSON.parse(json(input.event));
    const envelope = Schema.decodeUnknownSync(
      Schema.Struct({ kind: TaskMutationKind, occurred_at: Instant }),
    )(payload);
    const primary = Schema.is(Event)(payload)
      ? changes(payload).tasks[0]
      : undefined;
    const target = Schema.decodeUnknownOption(attemptTarget)(payload);
    const taskId = Option.isNone(target)
      ? null
      : "task_id" in target.value
        ? target.value.task_id
        : "task" in target.value
          ? target.value.task.id
          : target.value.before.id;
    const event = Schema.decodeUnknownSync(TaskAttemptRejected)({
      kind: "TaskAttemptRejected",
      entity_version: 1,
      occurred_at: envelope.occurred_at,
      attempted_kind: envelope.kind,
      task_id: (primary?.after ?? primary?.before)?.id ?? taskId,
      violations: [{ field: "event", received: payload, code: reason }],
    });
    return this.transaction(() => {
      const entry = this.record(input, {
        event,
        from_version: primary?.before?.row_version ?? fromVersion,
        to_version: null,
        outcome: "rejected",
        reason,
      });
      for (const id of this.snapshots.purgedIdsSync())
        redactTaskHistory(this.db, this.historySync(0), id);
      return this.historySync(entry.seq - 1)[0] ?? entry;
    });
  }

  private validate(event: Event, profile: ProfileId) {
    const resolved = changes(event);
    if (resolved.tasks.length === 0) throw new Rejection("validation");
    const definitions = metadata(event);
    const checkDefinitions = (
      task: Task,
      project: Project | null,
      tags: readonly Tag[],
    ) => {
      if (
        task.project_id !== (project?.id ?? null) ||
        !same([...task.tags].sort(), tags.map((tag) => tag.id).sort())
      )
        throw new Rejection("validation");
    };
    if (event.kind === "TaskCreated")
      checkDefinitions(event.task, event.project, event.tags);
    if (event.kind === "TaskEdited") {
      checkDefinitions(event.before, event.project_before, event.tags_before);
      checkDefinitions(event.after, event.project_after, event.tags_after);
    }
    const proposedProjects = new Map<string, Project>();
    const proposedTags = new Map<string, Tag>();
    for (const project of definitions.projects) {
      if (project.profile_id !== profile)
        throw new Rejection("profile_mismatch");
      const existing = this.db
        .query("SELECT * FROM projects WHERE id=?")
        .get(project.id);
      const prior =
        proposedProjects.get(project.id) ??
        (existing === null
          ? undefined
          : Schema.decodeUnknownSync(Project)(existing));
      if (prior && !same(prior, project)) throw new Rejection("conflict");
      const named = this.db
        .query<{ id: string }, [string, string]>(
          "SELECT id FROM projects WHERE profile_id=? AND name=?",
        )
        .get(profile, project.name);
      if (named && named.id !== project.id) throw new Rejection("validation");
      if (
        [...proposedProjects.values()].some(
          (value) => value.name === project.name && value.id !== project.id,
        )
      )
        throw new Rejection("validation");
      proposedProjects.set(project.id, project);
    }
    for (const tag of definitions.tags) {
      if (tag.profile_id !== profile) throw new Rejection("profile_mismatch");
      const existing = this.db
        .query("SELECT * FROM tags WHERE id=?")
        .get(tag.id);
      const prior =
        proposedTags.get(tag.id) ??
        (existing === null
          ? undefined
          : Schema.decodeUnknownSync(Tag)(existing));
      if (prior && !same(prior, tag)) throw new Rejection("conflict");
      const named = this.db
        .query<{ id: string }, [string, string]>(
          "SELECT id FROM tags WHERE profile_id=? AND name=?",
        )
        .get(profile, tag.name);
      if (named && named.id !== tag.id) throw new Rejection("validation");
      if (
        [...proposedTags.values()].some(
          (value) => value.name === tag.name && value.id !== tag.id,
        )
      )
        throw new Rejection("validation");
      proposedTags.set(tag.id, tag);
    }
    const validateMetadata = (details: TaskDetails) => {
      if (
        details.project_id !== null &&
        !proposedProjects.has(details.project_id) &&
        !this.db
          .query("SELECT 1 FROM projects WHERE id=? AND profile_id=?")
          .get(details.project_id, profile)
      )
        throw new Rejection("validation");
      if (new Set(details.tags).size !== details.tags.length)
        throw new Rejection("validation");
      for (const tag of details.tags) {
        if (
          !proposedTags.has(tag) &&
          !this.db
            .query("SELECT 1 FROM tags WHERE id=? AND profile_id=?")
            .get(tag, profile)
        )
          throw new Rejection("validation");
      }
    };
    const purged = new Set(this.snapshots.purgedIdsSync());
    const seen = new Set<string>();
    for (const change of resolved.tasks) {
      const task = change.after ?? change.before;
      if (!task || seen.has(task.id)) throw new Rejection("validation");
      seen.add(task.id);
      if (
        task.profile_id !== profile ||
        (change.before && change.before.profile_id !== profile)
      )
        throw new Rejection("profile_mismatch");
      if (purged.has(task.id)) throw new Rejection("task_purged");
      const row = this.db
        .query<{ payload: string }, [string]>(
          "SELECT payload FROM tasks WHERE id=?",
        )
        .get(task.id);
      const current = row
        ? Schema.decodeUnknownSync(Task)(JSON.parse(row.payload))
        : null;
      if (!same(current, change.before)) throw new Rejection("conflict");
      const previous = this.db
        .query<{ version: number }, [string]>(
          "SELECT version FROM task_versions WHERE id=?",
        )
        .get(task.id)?.version;
      if (change.after) {
        if (
          change.after.attachments?.some(
            (attachment) => !validAttachmentLocation(attachment),
          )
        )
          throw new Rejection("validation");
        if (
          change.before &&
          (change.after.id !== change.before.id ||
            change.after.created_at !== change.before.created_at)
        )
          throw new Rejection("validation");
        if (
          change.before === null &&
          previous !== undefined &&
          event.kind !== "TaskReverted" &&
          event.kind !== "TaskMovedIn"
        )
          throw new Rejection("conflict");
        if (change.after.row_version !== (previous ?? 0) + 1)
          throw new Rejection("validation");
        if (change.after.external_id != null) {
          const duplicate = this.db
            .query<{ id: string }, [string, string, string]>(
              "SELECT id FROM tasks WHERE profile_id=? AND external_id=? AND id<>?",
            )
            .get(profile, change.after.external_id, change.after.id);
          if (
            duplicate ||
            resolved.tasks.some(
              (other) =>
                other.after &&
                other.after.id !== change.after?.id &&
                other.after.external_id === change.after?.external_id,
            )
          )
            throw new Rejection("external_id_conflict");
        }
        validateMetadata(change.after);
        if (change.after.occurrence !== null) {
          const seriesId = change.after.occurrence.series_id;
          const proposed = resolved.series.find(
            (value) => value.after?.id === seriesId,
          )?.after;
          const existing = readSeries(this.db).find(
            (value) => value.id === seriesId,
          );
          if ((proposed ?? existing)?.profile_id !== profile)
            throw new Rejection("validation");
        }
      }
    }
    const seriesIds = new Set<string>();
    for (const change of resolved.series) {
      const series = change.after ?? change.before;
      if (!series || seriesIds.has(series.id) || series.profile_id !== profile)
        throw new Rejection("validation");
      seriesIds.add(series.id);
      const current =
        readSeries(this.db).find((value) => value.id === series.id) ?? null;
      if (!same(current, change.before)) throw new Rejection("conflict");
      const previous = this.db
        .query<{ version: number }, [string]>(
          "SELECT version FROM series_versions WHERE id=?",
        )
        .get(series.id)?.version;
      if (
        change.before === null &&
        previous !== undefined &&
        event.kind !== "TaskReverted"
      )
        throw new Rejection("conflict");
      if (
        change.after &&
        (change.after.row_version !== (previous ?? 0) + 1 ||
          change.after.id !== series.id ||
          change.after.profile_id !== profile)
      )
        throw new Rejection("validation");
      if (change.after) validateMetadata(change.after.task);
    }
    switch (event.kind) {
      case "TaskMovedOut":
      case "TaskMovedIn":
        break;
      case "TaskCreated":
        if (event.task.row_version !== 1) throw new Rejection("validation");
        break;
      case "TaskCompleted":
        if (
          event.after.status !== "done" ||
          event.after.completed_at !== event.occurred_at
        )
          throw new Rejection("validation");
        break;
      case "TaskCancelled":
        if (event.after.status !== "cancelled")
          throw new Rejection("validation");
        break;
      case "TaskReopened":
        if (event.after.status !== "open" || event.after.completed_at !== null)
          throw new Rejection("validation");
        break;
      case "TaskDeleted":
        if (event.after.deleted_at !== event.occurred_at)
          throw new Rejection("validation");
        break;
      case "TaskPurged":
        if (
          event.task_id !== event.before.id ||
          event.before.deleted_at === null
        )
          throw new Rejection("validation");
        break;
      case "TaskEdited":
        break;
      case "AttachmentAdded":
      case "AttachmentRemoved": {
        const before = event.before.attachments ?? [];
        const after = event.after.attachments ?? [];
        const added = event.kind === "AttachmentAdded";
        const smaller = added ? before : after;
        const larger = added ? after : before;
        const details = (task: Task) => {
          const {
            attachments: _attachments,
            row_version: _version,
            updated_at: _time,
            ...rest
          } = task;
          return rest;
        };
        if (
          larger.length !== smaller.length + 1 ||
          new Set(larger.map((value) => value.id)).size !== larger.length ||
          !smaller.every((value) =>
            larger.some((other) => same(value, other)),
          ) ||
          !same(details(event.before), details(event.after))
        )
          throw new Rejection("validation");
        break;
      }
      case "TaskReverted":
        break;
    }
  }

  private appendSync(
    input: Append,
    allowRevert = false,
    allowMove = false,
  ): OpLogEntry {
    Schema.decodeUnknownSync(identity)(input);
    const payload: unknown = JSON.parse(json(input.event));
    let purgeSnapshot: string | undefined;
    try {
      return this.transaction(() => {
        if (!Schema.is(Event)(payload)) throw new Rejection("validation");
        const event = Schema.decodeUnknownSync(Event)(payload);
        if (event.kind === "TaskReverted" && !allowRevert)
          throw new Rejection("invalid_revert");
        if (
          (event.kind === "TaskMovedOut" || event.kind === "TaskMovedIn") &&
          !allowMove
        )
          throw new Rejection("validation");
        this.validate(event, input.profile);
        if (event.kind === "TaskPurged" && this.snapshots.persistent) {
          purgeSnapshot = this.snapshots.createSync("pre-purge").id;
          this.snapshots.redactAllSync([event.task_id]);
        }
        const primary = changes(event).tasks[0];
        const entry = this.record(input, {
          event,
          from_version: primary?.before?.row_version ?? null,
          to_version: primary?.after?.row_version ?? null,
          outcome: "committed",
          reason: null,
        });
        applyEvent(this.db, event);
        if (event.kind === "TaskPurged") {
          this.queueAttachmentCleanup(event.task_id);
          redactTaskHistory(this.db, this.historySync(0), event.task_id);
          return this.historySync(entry.seq - 1)[0] ?? entry;
        }
        return entry;
      });
    } catch (error) {
      if (purgeSnapshot && !(error instanceof AttachmentCleanupError))
        this.snapshots.discardSync(purgeSnapshot);
      if (!(error instanceof Rejection)) throw error;
      return this.recordRejection(input, error.reason);
    }
  }

  readonly append = (input: Append) => attempt(() => this.appendSync(input));

  readonly move = (input: {
    readonly actor: ActorId;
    readonly before: Task;
    readonly after: Task;
    readonly original_seq: Sequence | null;
    readonly definitions?: {
      readonly project: Project | null;
      readonly tags: readonly Tag[];
    };
  }) =>
    attempt(() => {
      const { before, after } = input;
      const move_id = crypto.randomUUID();
      const event = {
        kind: "TaskMovedOut" as const,
        entity_version: 1 as const,
        occurred_at: after.updated_at,
        move_id,
        original_seq: input.original_seq,
        task: before,
      };
      try {
        return this.transaction(() => {
          if (
            before.id !== after.id ||
            before.profile_id === after.profile_id ||
            before.created_at !== after.created_at ||
            before.deleted_at !== null ||
            after.deleted_at !== null ||
            after.row_version !== before.row_version + 1 ||
            !this.db
              .query(
                "SELECT 1 FROM profiles WHERE id=? AND id NOT IN (SELECT profile FROM profile_deletions)",
              )
              .get(after.profile_id)
          )
            throw new Rejection("validation");
          const departure = this.appendSync(
            { actor: input.actor, profile: before.profile_id, event },
            false,
            true,
          );
          if (departure.outcome === "rejected")
            throw new Rejection(departure.reason);
          const arrival = this.appendSync(
            {
              actor: input.actor,
              profile: after.profile_id,
              event: {
                ...event,
                kind: "TaskMovedIn",
                task: after,
                ...input.definitions,
              },
            },
            false,
            true,
          );
          if (arrival.outcome === "rejected")
            throw new Rejection(arrival.reason);
          return arrival;
        });
      } catch (error) {
        if (!(error instanceof Rejection)) throw error;
        return this.recordRejection(
          { actor: input.actor, profile: before.profile_id, event },
          error.reason,
        );
      }
    });

  private startSeriesSync(input: unknown): OpLogEntry {
    const facts = Schema.decodeUnknownSync(commandFacts)(
      JSON.parse(json(input)),
    );
    const envelope = Schema.decodeUnknownSync(commandEnvelope)(facts);
    const rejected = { ...envelope, event: { ...facts, kind: "TaskCreated" } };
    try {
      const decoded = Schema.decodeUnknownOption(StartSeries)(facts);
      if (Option.isNone(decoded)) throw new Rejection("validation");
      const value = decoded.value;
      return this.transaction(() => {
        if (value.series.deleted_at !== null || value.series.row_version !== 1)
          throw new Rejection("validation");
        let task: ReturnType<typeof resolveOccurrence>;
        try {
          const time = resolveNextTime(value.series.recurrence, null);
          if (time === null) throw new Error("Series has no Occurrence");
          task = resolveOccurrence({ ...value, time });
        } catch {
          throw new Rejection("validation");
        }
        return this.appendSync({
          ...value,
          event: {
            kind: "TaskCreated",
            entity_version: 1,
            occurred_at: value.occurred_at,
            task,
            series: value.series,
            project:
              value.project ??
              (task.project_id === null
                ? null
                : this.db
                    .query("SELECT * FROM projects WHERE id=? AND profile_id=?")
                    .get(task.project_id, value.profile)),
            tags: task.tags.flatMap((id) => {
              const row =
                value.tags?.find((tag) => tag.id === id) ??
                this.db
                  .query("SELECT * FROM tags WHERE id=? AND profile_id=?")
                  .get(id, value.profile);
              return row === null ? [] : [row];
            }),
          },
        });
      });
    } catch (error) {
      if (!(error instanceof Rejection)) throw error;
      return this.recordRejection(rejected, error.reason);
    }
  }

  readonly startSeries = (input: unknown) =>
    attempt(() => this.startSeriesSync(input));

  private finishTaskSync(input: unknown): OpLogEntry {
    const facts = Schema.decodeUnknownSync(commandFacts)(
      JSON.parse(json(input)),
    );
    const envelope = Schema.decodeUnknownSync(commandEnvelope)(facts);
    const kind = facts.action === "cancel" ? "TaskCancelled" : "TaskCompleted";
    const rejected = { ...envelope, event: { ...facts, kind } };
    const fromVersion = Option.getOrNull(
      Schema.decodeUnknownOption(Version)(facts.from_version),
    );
    try {
      const decoded = Schema.decodeUnknownOption(FinishTask)(facts);
      if (Option.isNone(decoded)) throw new Rejection("validation");
      const value = decoded.value;
      return this.transaction(() => {
        const tasks = readTasks(this.db);
        const before = tasks.find((task) => task.id === value.task_id);
        if (!before || before.profile_id !== value.profile)
          throw new Rejection("profile_mismatch");
        if (before.row_version !== value.from_version)
          throw new Rejection("conflict");
        if (
          before.deleted_at !== null ||
          (before.status !== "open" && before.status !== "snoozed")
        )
          throw new Rejection("validation");
        const next = [];
        const series = seriesForTask(before, readSeries(this.db));
        if (before.occurrence !== null && !series)
          throw new Rejection("validation");
        if (series) {
          if (series.profile_id !== value.profile)
            throw new Rejection("validation");
          if (series.deleted_at === null) {
            try {
              const cursor =
                before.occurrence === null
                  ? series.recurrence.dtstart
                  : occurrenceCursor(series, before.occurrence);
              const time = resolveNextTime(series.recurrence, cursor);
              if (
                time !== null &&
                !tasks.some(
                  (task) =>
                    task.deleted_at === null &&
                    task.occurrence?.series_id === series.id &&
                    same(occurrenceCursor(series, task.occurrence), time),
                )
              )
                next.push(
                  resolveOccurrence({
                    series,
                    time,
                    task_id: value.next_task_id,
                    occurrence_id: value.next_occurrence_id,
                    occurred_at: value.occurred_at,
                  }),
                );
            } catch {
              throw new Rejection("validation");
            }
          }
        }
        return this.appendSync({
          ...value,
          event: {
            kind,
            entity_version: 1,
            occurred_at: value.occurred_at,
            before,
            after: {
              ...before,
              status: value.action === "complete" ? "done" : "cancelled",
              row_version: before.row_version + 1,
              updated_at: value.occurred_at,
              completed_at:
                value.action === "complete" ? value.occurred_at : null,
            },
            next_occurrences: next,
          },
        });
      });
    } catch (error) {
      if (!(error instanceof Rejection)) throw error;
      return this.recordRejection(rejected, error.reason, fromVersion);
    }
  }

  readonly finishTask = (input: unknown) =>
    attempt(() => this.finishTaskSync(input));

  readonly reject = (
    input: Append & {
      readonly reason: string;
      readonly from_version?: Version;
    },
  ) =>
    attempt(() => {
      Schema.decodeUnknownSync(identity)(input);
      Schema.decodeUnknownSync(Schema.NonEmptyString)(input.reason);
      return this.recordRejection(
        input,
        input.reason,
        input.from_version === undefined
          ? null
          : Schema.decodeUnknownSync(Version)(input.from_version),
      );
    });

  readonly takeSnapshot = () =>
    attempt(() =>
      this.transaction(() => {
        const seq = this.db
          .query<{ seq: number | null }, []>(
            "SELECT max(seq) AS seq FROM op_log",
          )
          .get()?.seq;
        if (seq === null || seq === undefined) return null;
        this.db
          .query(
            "INSERT INTO snapshots VALUES (?,1,?) ON CONFLICT(seq) DO NOTHING",
          )
          .run(seq, JSON.stringify(snapshot(this.db)));
        return seq;
      }),
    );

  readonly rebuild = (options: { readonly useSnapshot?: boolean } = {}) =>
    attempt(() =>
      this.transaction(() => {
        const saved = options.useSnapshot
          ? this.db
              .query<{ seq: number; payload: string }, []>(
                "SELECT seq,payload FROM snapshots ORDER BY seq DESC LIMIT 1",
              )
              .get()
          : null;
        this.db.exec(
          "DROP TABLE IF EXISTS task_tags; DROP TABLE IF EXISTS tasks; DROP TABLE IF EXISTS series; DROP TABLE IF EXISTS task_versions; DROP TABLE IF EXISTS series_versions; DROP TABLE IF EXISTS projects; DROP TABLE IF EXISTS tags;",
        );
        createProjection(this.db);
        this.db.exec("DELETE FROM profile_deletions");
        for (const entry of this.historySync(0))
          if (
            entry.outcome === "committed" &&
            entry.event.kind === "ProfileDeleted"
          ) {
            this.db
              .query("INSERT INTO profile_deletions VALUES (?,?)")
              .run(entry.event.profile.id, entry.event.occurred_at);
            for (const id of entry.event.access_token_ids)
              this.db
                .query(
                  "UPDATE credentials SET revoked_at=COALESCE(revoked_at,?) WHERE id=?",
                )
                .run(entry.event.occurred_at, id);
          }
        if (saved) {
          const decoded = Schema.decodeUnknownSync(Snapshot)(
            JSON.parse(saved.payload),
          );
          putMetadata(this.db, decoded);
          for (const series of decoded.series) putSeries(this.db, series);
          for (const version of decoded.series_versions)
            this.db
              .query(
                "INSERT INTO series_versions VALUES (?,?) ON CONFLICT(id) DO UPDATE SET version=excluded.version",
              )
              .run(version.id, version.version);
          for (const task of decoded.tasks) putTask(this.db, task);
          for (const version of decoded.versions)
            this.db
              .query(
                "INSERT INTO task_versions VALUES (?,?) ON CONFLICT(id) DO UPDATE SET version=excluded.version",
              )
              .run(version.id, version.version);
        }
        for (const entry of this.historySync(saved?.seq ?? 0))
          if (
            entry.outcome === "committed" &&
            (Schema.is(Event)(entry.event) ||
              entry.event.kind === "TaskHistoryRedacted")
          )
            applyEvent(this.db, entry.event);
        return readTasks(this.db);
      }),
    );

  private revertSync(input: {
    readonly actor: ActorId;
    readonly profile: ProfileId;
    readonly seq: Sequence;
    readonly occurred_at: Instant;
  }) {
    Schema.decodeUnknownSync(Sequence)(input.seq);
    const occurredAt = Schema.decodeUnknownSync(Instant)(input.occurred_at);
    const entry = this.historySync(input.seq - 1).find(
      (value) => value.seq === input.seq,
    );
    if (
      entry?.outcome !== "committed" ||
      entry.profile !== input.profile ||
      !Schema.is(Event)(entry.event)
    )
      return this.recordRejection(
        {
          ...input,
          event: {
            kind: "TaskReverted",
            entity_version: 1,
            occurred_at: occurredAt,
            original_seq: input.seq,
            tasks: [],
            series: [],
          },
        },
        entry?.profile === input.profile &&
          entry.event.kind === "TaskHistoryRedacted"
          ? "task_purged"
          : "invalid_revert",
      );
    const original = changes(entry.event);
    const tasks = original.tasks.map((change) => {
      const before = change.after;
      if (!change.before) {
        return {
          before,
          after:
            before === null
              ? null
              : {
                  ...before,
                  row_version: before.row_version + 1,
                  updated_at: occurredAt,
                  deleted_at: occurredAt,
                },
        };
      }
      return {
        before,
        after: {
          ...change.before,
          row_version: (before?.row_version ?? change.before.row_version) + 1,
          updated_at: occurredAt,
        },
      };
    });
    const series = original.series.map((change) => ({
      before: change.after,
      after:
        change.before === null
          ? change.after === null
            ? null
            : {
                ...change.after,
                row_version: change.after.row_version + 1,
                updated_at: occurredAt,
                deleted_at: occurredAt,
              }
          : {
              ...change.before,
              row_version:
                (change.after?.row_version ?? change.before.row_version) + 1,
              updated_at: occurredAt,
            },
    }));
    return this.appendSync(
      {
        ...input,
        event: {
          kind: "TaskReverted",
          entity_version: 1,
          occurred_at: occurredAt,
          original_seq: input.seq,
          tasks,
          series,
        },
      },
      true,
    );
  }

  readonly revert = (input: Parameters<OperationStore["revertSync"]>[0]) =>
    attempt(() => this.revertSync(input));
}

export const openStore = (options: {
  readonly path: string;
  readonly create?: boolean;
  readonly attachmentRoot?: string;
}) => attempt(() => new OperationStore(options));

export { type TaskCommandResult, TaskCommands } from "../commands.ts";
