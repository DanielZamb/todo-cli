import { Database } from "bun:sqlite";
import { createHash, randomUUID } from "node:crypto";
import {
  chmodSync,
  closeSync,
  copyFileSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { Effect, Schema } from "effect";
import { DatabaseRestored, OpLogEntry } from "../events.ts";
import { TaskId } from "../ids.ts";
import {
  isPreChangeSnapshot,
  SnapshotError,
  SnapshotId,
  SnapshotManifest,
  type SnapshotRestoreReport,
  SnapshotRetention,
} from "../snapshots.ts";
import { StoreError } from "./error.ts";
import { currentSchemaVersion, migrate } from "./migration.ts";
import { redactTaskHistory } from "./purge.ts";

const attempt = <A>(run: () => A) =>
  Effect.try({ try: run, catch: (cause) => new StoreError(cause) });
const quote = (value: string) => `"${value.replaceAll('"', '""')}"`;
const hash = (path: string) =>
  createHash("sha256").update(readFileSync(path)).digest("hex");
const version = (db: Database) =>
  db.query<{ user_version: number }, []>("PRAGMA user_version").get()
    ?.user_version ?? 0;
const tables = (db: Database) =>
  db
    .query<{ name: string }, []>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .all();
const seq = (db: Database) =>
  tables(db).some((row) => row.name === "op_log")
    ? (db
        .query<{ seq: number }, []>(
          "SELECT coalesce(max(seq),0) AS seq FROM op_log",
        )
        .get()?.seq ?? 0)
    : 0;
const counts = (db: Database) =>
  tables(db).some((row) => row.name === "profiles")
    ? db
        .query<{ profile: string; name: string; count: number }, []>(
          "SELECT p.id AS profile,p.name,count(t.id) AS count FROM profiles p LEFT JOIN tasks t ON t.profile_id=p.id GROUP BY p.id ORDER BY p.id",
        )
        .all()
    : [];
const history = (db: Database) =>
  Schema.decodeUnknownSync(Schema.Array(OpLogEntry))(
    db
      .query<{ event: string }, []>("SELECT * FROM op_log ORDER BY seq")
      .all()
      .map((row) => ({ ...row, event: JSON.parse(row.event) })),
  );
const purges = (db: Database) =>
  history(db).flatMap((row) =>
    row.event.kind === "TaskPurged"
      ? [row.event.task_id]
      : row.event.kind === "TaskHistoryRedacted" &&
          row.event.original_kind === "TaskPurged"
        ? row.event.task_ids
        : [],
  );
const durable = (path: string, value: unknown) => {
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, JSON.stringify(value, null, 2), {
      mode: 0o600,
      flag: "wx",
    });
    const fd = openSync(temporary, "r");
    try {
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    renameSync(temporary, path);
    const directory = openSync(dirname(path), "r");
    try {
      fsyncSync(directory);
    } finally {
      closeSync(directory);
    }
  } finally {
    rmSync(temporary, { force: true });
  }
};
const compact = (db: Database) =>
  db.exec(
    "PRAGMA wal_checkpoint(TRUNCATE); PRAGMA journal_mode=DELETE; VACUUM;",
  );

export class Snapshots {
  readonly directory: string;
  readonly persistent: boolean;
  private readonly temporary = new Set<string>();
  constructor(
    private readonly db: Database,
    path: string,
    private readonly transaction: <A>(run: () => A) => A,
  ) {
    this.directory = join(dirname(path), "snapshots");
    this.persistent = path !== ":memory:";
  }

  private prepare() {
    mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    if (
      !lstatSync(this.directory).isDirectory() ||
      lstatSync(this.directory).isSymbolicLink()
    )
      throw new SnapshotError(
        "invalid_snapshot",
        "Snapshot directory must be a private directory",
      );
    chmodSync(this.directory, 0o700);
    for (const name of readdirSync(this.directory)) {
      const path = join(this.directory, name);
      if (
        /^(?:[a-f0-9-]{36}\.sqlite\.tmp|\.restore-[a-f0-9-]{36}\.sqlite)(?:-(?:wal|shm)|-journal)?$/.test(
          name,
        ) &&
        ![...this.temporary].some((active) => path.startsWith(active))
      )
        rmSync(path, { force: true });
      if (!/^[a-f0-9-]{36}\.sqlite$/.test(name)) continue;
      const id = name.slice(0, -7);
      if (existsSync(this.file(id, "json"))) continue;
      const createdAt = statSync(path).mtime.toISOString();
      const copy = new Database(this.file(id, "sqlite"), { strict: true });
      try {
        compact(copy);
        durable(this.file(id, "json"), {
          id,
          created_at: createdAt,
          schema_version: version(copy),
          seq: seq(copy),
          size: statSync(path).size,
          reason: "interrupted Snapshot",
          sha256: hash(path),
          path,
          task_counts: counts(copy),
        });
      } finally {
        copy.close();
      }
    }
  }
  private file(id: string, extension: string) {
    if (!Schema.is(SnapshotId)(id))
      throw new SnapshotError(
        "invalid_args",
        "Snapshot ID must be a UUID from snapshot list",
      );
    const path = join(this.directory, `${id}.${extension}`);
    const info = lstatSync(path, { throwIfNoEntry: false });
    if (info && (!info.isFile() || info.isSymbolicLink()))
      throw new SnapshotError(
        "invalid_snapshot",
        "Snapshot must be a regular file",
      );
    return path;
  }
  private manifest(id: string) {
    const path = this.file(id, "json");
    if (!existsSync(path))
      throw new SnapshotError(
        "not_found",
        "Snapshot not found; run todo snapshot list",
      );
    const result = Schema.decodeUnknownSync(SnapshotManifest)(
      JSON.parse(readFileSync(path, "utf8")),
    );
    if (result.id !== id)
      throw new SnapshotError(
        "invalid_snapshot",
        "Snapshot manifest ID does not match",
      );
    return { ...result, path: this.file(id, "sqlite") };
  }
  listSync() {
    if (!existsSync(this.directory))
      return { snapshots: [], last_snapshot_at: null };
    this.prepare();
    const snapshots = readdirSync(this.directory)
      .filter((name) => /^[a-f0-9-]{36}\.json$/.test(name))
      .map((name) => this.manifest(name.slice(0, -5)))
      .sort(
        (a, b) =>
          b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id),
      );
    return { snapshots, last_snapshot_at: snapshots[0]?.created_at ?? null };
  }
  createSync(reason: string): SnapshotManifest {
    if (!this.persistent)
      throw new SnapshotError(
        "invalid_args",
        "Snapshots require a file-backed database",
      );
    if (!reason.trim() || reason.length > 500)
      throw new SnapshotError(
        "invalid_args",
        "Snapshot reason must contain 1 to 500 characters",
      );
    this.prepare();
    const id = randomUUID();
    const path = this.file(id, "sqlite");
    const temporary = `${path}.tmp`;
    try {
      writeFileSync(temporary, this.db.serialize(), {
        mode: 0o600,
        flag: "wx",
      });
      const copy = new Database(temporary, { strict: true });
      let manifest: SnapshotManifest;
      try {
        compact(copy);
        manifest = {
          id,
          created_at: new Date().toISOString(),
          schema_version: version(copy),
          seq: seq(copy),
          size: statSync(temporary).size,
          reason,
          sha256: hash(temporary),
          path,
          task_counts: counts(copy),
        };
      } finally {
        copy.close();
      }
      const fd = openSync(temporary, "r");
      try {
        fsyncSync(fd);
      } finally {
        closeSync(fd);
      }
      renameSync(temporary, path);
      durable(this.file(id, "json"), manifest);
      return manifest;
    } catch (error) {
      rmSync(path, { force: true });
      throw error;
    } finally {
      for (const file of [temporary, `${temporary}-wal`, `${temporary}-shm`])
        rmSync(file, { force: true });
    }
  }
  readonly create = (reason: string) =>
    attempt(() => this.transaction(() => this.createSync(reason)));
  readonly list = () => attempt(() => this.transaction(() => this.listSync()));
  readonly show = (id: string) =>
    attempt(() => this.transaction(() => this.manifest(id)));
  discardSync(id: string) {
    rmSync(this.file(id, "json"), { force: true });
    rmSync(this.file(id, "sqlite"), { force: true });
  }
  generationSync() {
    if (!tables(this.db).some((row) => row.name === "op_log"))
      return { generation: "initial", seq: 0, restore_seq: 0 };
    const row = this.db
      .query<{ generation: string; seq: number }, []>(
        "SELECT seq,json_extract(event,'$.generation') AS generation FROM op_log WHERE json_extract(event,'$.kind')='DatabaseRestored' ORDER BY seq DESC LIMIT 1",
      )
      .get();
    const current = seq(this.db);
    return {
      generation: row?.generation ?? "initial",
      seq: current,
      restore_seq: row?.seq ?? current,
    };
  }
  readonly generation = () => attempt(() => this.generationSync());
  purgedIdsSync() {
    const journal = join(this.directory, "purged.json");
    return [
      ...new Set([
        ...purges(this.db),
        ...(this.persistent && existsSync(journal)
          ? Schema.decodeUnknownSync(Schema.Array(TaskId))(
              JSON.parse(readFileSync(journal, "utf8")),
            )
          : []),
      ]),
    ];
  }

  redactAllSync(ids: readonly TaskId[]) {
    for (const manifest of this.listSync().snapshots) {
      if (hash(manifest.path) !== manifest.sha256)
        throw new SnapshotError(
          "invalid_snapshot",
          `Snapshot ${manifest.id} checksum mismatch; Purge stopped`,
        );
      const copy = new Database(manifest.path, { strict: true });
      try {
        copy.function("domain_write_allowed", () => 1);
        copy
          .transaction(() => {
            migrate(copy);
            for (const id of ids) redactTaskHistory(copy, history(copy), id);
          })
          .immediate();
        compact(copy);
        durable(this.file(manifest.id, "json"), {
          ...manifest,
          schema_version: version(copy),
          task_counts: counts(copy),
          size: statSync(manifest.path).size,
          sha256: hash(manifest.path),
        });
      } finally {
        copy.close();
      }
    }
  }

  readonly restore = (
    id: string,
    options: { readonly dryRun?: boolean } = {},
  ) =>
    attempt(() => {
      const stage = join(this.directory, `.restore-${randomUUID()}.sqlite`);
      let attached = false;
      let target: Database | undefined;
      try {
        return this.transaction((): SnapshotRestoreReport => {
          if (!options.dryRun) this.prepare();
          const manifest = this.manifest(id);
          if (hash(manifest.path) !== manifest.sha256)
            throw new SnapshotError(
              "invalid_snapshot",
              "Snapshot checksum mismatch; choose another Snapshot",
            );
          const original = new Database(manifest.path, {
            readonly: true,
            strict: true,
          });
          try {
            if (
              original
                .query<{ integrity_check: string }, []>(
                  "PRAGMA integrity_check",
                )
                .get()?.integrity_check !== "ok"
            )
              throw new SnapshotError(
                "invalid_snapshot",
                "Snapshot integrity_check failed",
              );
            if (version(original) !== manifest.schema_version)
              throw new SnapshotError(
                "invalid_snapshot",
                "Snapshot schema version does not match its manifest",
              );
            if (version(original) > currentSchemaVersion)
              throw new SnapshotError(
                "newer_schema",
                "Snapshot uses a newer schema; upgrade Todo before restoring",
              );
          } finally {
            original.close();
          }

          this.temporary.add(stage);
          copyFileSync(manifest.path, stage);
          chmodSync(stage, 0o600);
          const copy = new Database(stage, { strict: true });
          target = copy;
          copy.function("domain_write_allowed", () => 1);
          copy.transaction(() => migrate(copy)).immediate();
          const journal = join(this.directory, "purged.json");
          const ids = this.purgedIdsSync();
          copy
            .transaction(() => {
              for (const id of ids) redactTaskHistory(copy, history(copy), id);
            })
            .immediate();
          this.db.query("ATTACH DATABASE ? AS restore_source").run(stage);
          attached = true;
          const before = counts(this.db);
          const after = counts(copy);
          const seqBefore = seq(this.db);
          const seqAfter = seq(copy);
          const report = {
            id,
            dry_run: options.dryRun ?? false,
            seq_before: seqBefore,
            seq_after: seqAfter,
            seq_delta: seqAfter - seqBefore,
            task_counts: [
              ...new Set([...before, ...after].map((row) => row.profile)),
            ]
              .sort()
              .map((profile) => ({
                profile,
                name:
                  after.find((row) => row.profile === profile)?.name ??
                  before.find((row) => row.profile === profile)?.name ??
                  profile,
                before:
                  before.find((row) => row.profile === profile)?.count ?? 0,
                after: after.find((row) => row.profile === profile)?.count ?? 0,
              })),
            safety_snapshot: null,
            generation: this.generationSync().generation,
          };
          if (options.dryRun) return report;
          const safety = this.createSync("pre-restore");
          durable(journal, ids);
          if (ids.length) this.redactAllSync(ids);
          const triggers = this.db
            .query<{ name: string; sql: string }, []>(
              "SELECT name,sql FROM sqlite_master WHERE type='trigger'",
            )
            .all();
          this.db.exec("PRAGMA defer_foreign_keys=ON");
          for (const trigger of triggers)
            this.db.exec(`DROP TRIGGER ${quote(trigger.name)}`);
          for (const table of tables(this.db))
            this.db.exec(`DELETE FROM ${quote(table.name)}`);
          for (const table of tables(this.db)) {
            const columns = this.db
              .query<{ name: string; hidden: number }, []>(
                `PRAGMA table_xinfo(${quote(table.name)})`,
              )
              .all()
              .filter((column) => column.hidden === 0)
              .map((column) => quote(column.name))
              .join(",");
            this.db.exec(
              `INSERT INTO ${quote(table.name)} (${columns}) SELECT ${columns} FROM restore_source.${quote(table.name)}`,
            );
          }
          this.db.exec(
            "DELETE FROM sqlite_sequence; INSERT INTO sqlite_sequence SELECT * FROM restore_source.sqlite_sequence;",
          );
          const generation = randomUUID();
          const event = Schema.decodeUnknownSync(DatabaseRestored)({
            kind: "DatabaseRestored",
            entity_version: 1,
            occurred_at: new Date().toISOString(),
            generation,
            snapshot_id: id,
          });
          this.db
            .query(
              "INSERT INTO op_log(actor,profile,entity_version,event,from_version,to_version,outcome,reason) VALUES ('snapshot-restore',NULL,1,?,NULL,NULL,'committed',NULL)",
            )
            .run(JSON.stringify(event));
          for (const trigger of triggers) this.db.exec(trigger.sql);
          if (this.db.query("PRAGMA foreign_key_check").all().length)
            throw new SnapshotError(
              "invalid_snapshot",
              "Restored Snapshot violates foreign keys",
            );
          return {
            ...report,
            safety_snapshot: this.manifest(safety.id),
            generation,
          };
        });
      } finally {
        target?.close();
        if (attached) this.db.exec("DETACH DATABASE restore_source");
        for (const file of [stage, `${stage}-wal`, `${stage}-shm`])
          rmSync(file, { force: true });
        this.temporary.delete(stage);
      }
    });

  readonly prune = (options: { readonly dryRun?: boolean } = {}) =>
    attempt(() =>
      this.transaction(() => {
        const values = this.listSync().snapshots;
        const path = join(this.directory, "retention.json");
        const policy = existsSync(path)
          ? Schema.decodeUnknownSync(SnapshotRetention)(
              JSON.parse(readFileSync(path, "utf8")),
            )
          : { daily: 7, weekly: 4, pre_change_days: 30 };
        const days = new Set<string>();
        const weeks = new Set<number>();
        const keep = new Set([values[0]?.id]);
        const now = Date.now();
        for (const value of values) {
          const day = value.created_at.slice(0, 10);
          const week = Math.floor(
            Date.parse(value.created_at) / (7 * 86400000),
          );
          if (
            (!days.has(day) && days.size < policy.daily) ||
            (!weeks.has(week) && weeks.size < policy.weekly) ||
            (isPreChangeSnapshot(value.reason) &&
              now - Date.parse(value.created_at) <
                policy.pre_change_days * 86400000)
          )
            keep.add(value.id);
          days.add(day);
          weeks.add(week);
        }
        const removed = values.filter((value) => !keep.has(value.id));
        if (!options.dryRun)
          for (const value of removed) {
            rmSync(this.file(value.id, "json"));
            rmSync(value.path);
          }
        return {
          dry_run: options.dryRun ?? false,
          removed,
          retained: values.length - removed.length,
        };
      }),
    );
  readonly runDaily = () =>
    attempt(() =>
      this.transaction(() => {
        const today = new Date().toISOString().slice(0, 10);
        return this.listSync().snapshots.some(
          (value) =>
            value.reason === "daily" && value.created_at.startsWith(today),
        )
          ? null
          : this.createSync("daily");
      }),
    );
}
