import type { Database } from "bun:sqlite";
import { createHash, randomBytes } from "node:crypto";
import { Cause, Clock, Effect, Exit, Schema } from "effect";
import type { Profile } from "../entities.ts";
import { type AppendResult, type AuthAction, Event } from "../events.ts";
import { ActorId, ProfileId, Sequence, TaskId } from "../ids.ts";
import type {
  DeleteProfile,
  ProfileDeletionResult,
} from "../profile-commands.ts";
import type { FinishTask, StartSeries } from "../recurrence.ts";
import { ClientProjection } from "../store/client-projection.ts";
import { StoreError } from "../store/error.ts";
import { taskHistory } from "../store/history-reads.ts";
import { changes, metadata } from "../store/projection.ts";
import { Instant } from "../time.ts";

import {
  AccessRequest,
  type AccessScope,
  AuthError,
  CredentialInfo,
  FinishTaskRequest,
  OwnerRequest,
  ProfileResolutionError,
  type ResolveProfileRequest,
  StartSeriesRequest,
  TokenOptions,
} from "./model.ts";

import { repeatedAuthRejection } from "./rejection-history.ts";

type AuthorityKind = "read" | "profiles" | "owner" | "terminal";
type AuthorityValue<Kind extends AuthorityKind, P, Fields> = Readonly<{
  kind: Kind;
  profile: P;
  scope: AccessScope;
  credential: string;
  fields: Readonly<Fields>;
  profiles: readonly Profile[];
  profileInfo: Readonly<Pick<Profile, "id" | "name">> | null;
}>;
const authorityCreation = Symbol("credential-checked read authority");
type ReadLease = {
  active: boolean;
  checkedSerial: number | null;
  frame: LeaseFrame;
  readonly clock: Clock.Clock;
  readonly credentials: Map<string, { value: CredentialInfo; changes: number }>;
};
export type AbsentRead<Fields = unknown> = Readonly<{
  kind: "absent";
  requested: string;
  credential: string;
  scope: AccessScope;
  fields: Readonly<Fields>;
  profileInfo: null;
  snapshot: {
    readonly generation: string;
    readonly seq: number;
    readonly restore_seq: number;
  };
}>;
type ProfileClass =
  | {
      kind: "present";
      profile: Readonly<Pick<Profile, "id" | "name">>;
      snapshot: AbsentRead["snapshot"];
    }
  | { kind: "tombstoned"; snapshot: AbsentRead["snapshot"] }
  | { kind: "absent"; snapshot: AbsentRead["snapshot"] };
const emptyState = () => ({
  profiles: [],
  tasks: [],
  series: [],
  projects: [],
  tags: [],
  history: [],
});
type LeaseFrame = { failed: boolean; readonly parent: LeaseFrame | null };
const leases = new WeakMap<Database, ReadLease>();
const mutationSerial = (db: Database) =>
  db.query<{ serial: number }, []>("SELECT total_changes() AS serial").get()
    ?.serial ?? 0;
const restoreGeneration = (db: Database) =>
  db
    .query<{ generation: string }, []>(
      "SELECT json_extract(event,'$.generation') AS generation FROM op_log WHERE profile IS NULL AND actor='snapshot-restore' AND outcome='committed' AND json_extract(event,'$.kind')='DatabaseRestored' ORDER BY seq DESC LIMIT 1",
    )
    .get()?.generation ?? "initial";
const withinLease = <A>(
  db: Database,
  clock: Clock.Clock,
  transaction: <B>(run: () => B) => B,
  run: () => A,
): A => {
  const outer = leases.get(db);
  const nested = outer?.active && db.inTransaction ? outer : undefined;
  const frame: LeaseFrame = { failed: false, parent: nested?.frame ?? null };
  const lease: ReadLease = nested ?? {
    active: true,
    checkedSerial: null,
    frame,
    clock,
    credentials: new Map(),
  };
  lease.frame = frame;
  if (!nested) leases.set(db, lease);
  try {
    return transaction(() => {
      try {
        return run();
      } finally {
        if (!nested) {
          lease.active = false;
          lease.credentials.clear();
          if (leases.get(db) === lease) leases.delete(db);
        }
      }
    });
  } catch (error) {
    frame.failed = true;
    throw error;
  } finally {
    if (nested && frame.parent) lease.frame = frame.parent;
    else {
      lease.active = false;
      lease.credentials.clear();
      if (leases.get(db) === lease) leases.delete(db);
    }
  }
};
const failedFrame = (frame: LeaseFrame): boolean =>
  frame.failed || (frame.parent !== null && failedFrame(frame.parent));

export const freezeRead = <A>(value: A): Readonly<A> => {
  if (value !== null && typeof value === "object")
    for (const child of Object.values(value)) freezeRead(child);
  return Object.freeze(value);
};

class ReadAuthority<Kind extends AuthorityKind, P, Fields> {
  readonly #origin: Database;
  readonly #value: AuthorityValue<Kind, P, Fields>;
  readonly #lease: ReadLease;
  readonly #frame: LeaseFrame;
  readonly #serial: number;
  readonly #generation: string;
  readonly #expires: number;
  #terminalUsed = false;
  constructor(
    key: typeof authorityCreation,
    origin: Database,
    value: AuthorityValue<Kind, P, Fields>,
    info: CredentialInfo,
  ) {
    if (key !== authorityCreation || new.target !== ReadAuthority)
      throw new StoreError(new Error("Invalid read authority"));
    this.#origin = origin;
    this.#value = value;
    const lease = leases.get(origin);
    if (!lease?.active || !origin.inTransaction)
      throw new StoreError(new Error("Invalid read authority"));
    this.#lease = lease;
    this.#frame = lease.frame;
    if (lease.checkedSerial === null)
      throw new StoreError(new Error("Invalid read authority"));
    this.#serial = lease.checkedSerial;
    this.#generation = restoreGeneration(origin);
    this.#expires = Date.parse(info.expires_at);
    if (lease.clock.currentTimeMillisUnsafe() >= this.#expires)
      throw new AuthError("expired", info.id);
    Object.freeze(this);
  }
  static inspect<K extends AuthorityKind, P, F>(
    value: ReadAuthority<K, P, F>,
    kind?: K,
    origin?: object,
    retained?: typeof authorityCreation,
  ): AuthorityValue<K, P, F> {
    if (
      value === null ||
      typeof value !== "object" ||
      !(#value in value) ||
      Object.getPrototypeOf(value) !== ReadAuthority.prototype ||
      (kind !== undefined && value.#value.kind !== kind) ||
      (origin !== undefined && value.#origin !== origin)
    )
      throw new StoreError(new Error("Invalid read authority"));
    if (
      retained !== authorityCreation &&
      (!value.#lease.active ||
        failedFrame(value.#frame) ||
        leases.get(value.#origin) !== value.#lease ||
        !value.#origin.inTransaction ||
        value.#lease.clock.currentTimeMillisUnsafe() >= value.#expires ||
        mutationSerial(value.#origin) !== value.#serial)
    )
      throw new StoreError(new Error("Invalid read authority"));
    return value.#value;
  }
  static retained<K extends AuthorityKind, P, F>(
    key: typeof authorityCreation,
    value: ReadAuthority<K, P, F>,
    origin: Database,
  ) {
    if (key !== authorityCreation)
      throw new StoreError(new Error("Invalid read authority"));
    const selected = ReadAuthority.inspect(value, undefined, origin, key);
    if (value.#generation !== restoreGeneration(origin))
      throw new StoreError(new Error("Invalid read authority"));
    return selected;
  }
  static consumeTerminal(read: AuthorizedTerminalRead, origin: Database) {
    const value = ReadAuthority.inspect(read, "terminal", origin);
    if (read.#terminalUsed)
      throw new StoreError(new Error("Invalid read authority"));
    read.#terminalUsed = true;
    return value;
  }
  get kind() {
    return ReadAuthority.inspect(this).kind;
  }
  get profile() {
    return ReadAuthority.inspect(this).profile;
  }
  get scope() {
    return ReadAuthority.inspect(this).scope;
  }
  get fields() {
    return ReadAuthority.inspect(this).fields;
  }
  get credential() {
    return ReadAuthority.inspect(this).credential;
  }
}
Object.freeze(ReadAuthority.prototype);
Object.freeze(ReadAuthority);

export type AuthorizedRead<Fields = unknown> = ReadAuthority<
  "read",
  ProfileId,
  Fields
>;
export type AuthorizedProfiles<Fields = unknown> = ReadAuthority<
  "profiles",
  null,
  Fields
>;
export type AuthorizedOwnerRead<Fields = unknown> = ReadAuthority<
  "owner",
  null,
  Fields
>;
export type AuthorizedTerminalRead = ReadAuthority<
  "terminal",
  ProfileId,
  {
    readonly after: number;
    readonly through: number;
    readonly generation: string;
  }
>;
export const consumeTerminalRead = (
  read: AuthorizedTerminalRead,
  db: Database,
) => ReadAuthority.consumeTerminal(read, db);
export const readAuthority = <K extends AuthorityKind, P, F>(
  read: ReadAuthority<K, P, F>,
  kind: K,
  origin: Database,
) => ReadAuthority.inspect(read, kind, origin);
export const checkedRead = <K extends AuthorityKind, P, F>(
  read: ReadAuthority<K, P, F>,
  kind: K,
  origin: Database,
) =>
  Effect.try({
    try: () => readAuthority(read, kind, origin),
    catch: (cause) =>
      cause instanceof StoreError ? cause : new StoreError(cause),
  });
const createAuthority = <K extends AuthorityKind, P, F>(
  kind: K,
  origin: Database,
  profile: P,
  credential: string,
  fields: F,
  info: CredentialInfo,
  profiles: readonly Profile[] = [],
  profileInfo: Readonly<Pick<Profile, "id" | "name">> | null = null,
): ReadAuthority<K, P, F> =>
  new ReadAuthority(
    authorityCreation,
    origin,
    Object.freeze({
      kind,
      profile,
      credential,
      fields: freezeRead(fields),
      scope: info.scope,
      profiles: freezeRead(profiles),
      profileInfo,
    }),
    info,
  );
const bindRead = <F>(
  db: Database,
  profile: ProfileId,
  credential: string,
  fields: F,
  info: CredentialInfo,
  profileInfo: Readonly<Pick<Profile, "id" | "name">>,
) =>
  createAuthority(
    "read",
    db,
    profile,
    credential,
    fields,
    info,
    [],
    profileInfo,
  );
const bindProfiles = <F>(
  db: Database,
  credential: string,
  fields: F,
  info: CredentialInfo,
  profiles: readonly Profile[],
) => createAuthority("profiles", db, null, credential, fields, info, profiles);
const bindOwnerRead = <F>(
  db: Database,
  credential: string,
  fields: F,
  info: CredentialInfo,
) => createAuthority("owner", db, null, credential, fields, info);

const EmptyRead = Schema.Struct({});
const TaskReadFields = Schema.Struct({ task_id: TaskId });
const credentialColumns =
  "id,kind,name,profile,scope,created_at,expires_at,revoked_at";
const sha256 = (secret: string) =>
  createHash("sha256").update(secret).digest("hex");
const instant = (time: number) =>
  Schema.decodeUnknownSync(Instant)(new Date(time).toISOString());
// Setup requires a passphrase worth guessing against; both paths cap its length
// so a request cannot choose the cost of Argon2 before verification.
const maximumPassphraseLength = 1024;
const OwnerPassphrase = Schema.String.check(
  Schema.isMinLength(12),
  Schema.isMaxLength(maximumPassphraseLength),
);
const SignInPassphrase = Schema.NonEmptyString.check(
  Schema.isMaxLength(maximumPassphraseLength),
);
// Sign-in verifies one passphrase at a time and refuses a full queue, so
// guesses cannot pile up Argon2 memory. After 10 wrong passphrases in a row it
// refuses every attempt, the correct one too, for an hour. A correct sign-in or
// `todo reset-passphrase` (which proves the macOS account password) ends the
// run. The count is read from History, so it holds across processes and
// restarts.
const maximumWaitingSignIns = 4;
export const signInLockout = { attempts: 10, durationMs: 3_600_000 } as const;
type Verification =
  | { readonly kind: "invalid" | "busy" }
  | {
      readonly kind: "valid";
      readonly issued: ReturnType<Authentication<unknown>["issueSession"]>;
    }
  | { readonly kind: "locked"; readonly until: number };

const parse = <S extends Schema.ConstraintDecoder<unknown>>(
  schema: S,
  input: unknown,
): S["Type"] => {
  try {
    return Schema.decodeUnknownSync(schema)(input);
  } catch {
    throw new AuthError("invalid_request");
  }
};

type Ports<Read> = {
  readonly snapshotBeforeProfileDelete: (
    reason: string,
  ) => Effect.Effect<unknown, StoreError>;
  readonly deleteProfile: (input: {
    preview: boolean;
    actor: ActorId;
    profile: ProfileId;
    options: DeleteProfile;
    occurred_at: Instant;
  }) => ProfileDeletionResult;
  readonly read: (profile: ProfileId) => Read;
  readonly profiles: () => readonly Profile[];
  readonly startSeries: (input: StartSeries) => AppendResult;
  readonly finishTask: (input: FinishTask) => AppendResult;
  readonly append: (input: {
    actor: ActorId;
    profile: ProfileId;
    event: unknown;
  }) => AppendResult;
  readonly credentialUsed?: (id: string, time: number) => void;
  readonly revert: (input: {
    actor: ActorId;
    profile: ProfileId;
    seq: Sequence;
    occurred_at: Instant;
  }) => AppendResult;
};

class ResolvedProfileRejection {
  constructor(readonly profile: () => ProfileId | null) {}
}

type ReadBoundary = {
  readonly transaction: <A>(run: () => A) => A;
  readonly recordRejection: boolean;
};

export class Authentication<Read> {
  private readonly projection: ClientProjection;
  constructor(
    private readonly db: Database,
    private readonly transaction: <A>(run: () => A) => A,
    private readonly ports: Ports<Read>,
  ) {
    this.projection = new ClientProjection(db);
  }

  private signInQueue: Promise<unknown> = Promise.resolve();
  private waitingSignIns = 0;

  // Replays the wrong-passphrase rows since the last owner sign-in, setup or
  // reset. The 10th wrong passphrase starts an hour-long lock; once it ends,
  // the next 10 attempts start a new run.
  private signInLockedUntil(time: number): number | null {
    const since =
      this.db
        .query<{ seq: number | null }, []>(
          "SELECT max(seq) AS seq FROM op_log WHERE outcome='committed' AND json_extract(event,'$.kind')='AuthChanged' AND json_extract(event,'$.action') IN ('setupOwner','signIn','resetPassphrase')",
        )
        .get()?.seq ?? 0;
    const failures = this.db
      .query<{ occurred_at: string }, [number]>(
        "SELECT json_extract(event,'$.occurred_at') AS occurred_at FROM op_log WHERE seq>? AND outcome='rejected' AND reason='auth' AND json_extract(event,'$.action')='signIn' AND json_extract(event,'$.detail')='invalid_passphrase' ORDER BY seq",
      )
      .all(since);
    let count = 0;
    let until: number | null = null;
    for (const failure of failures) {
      const at = Date.parse(failure.occurred_at);
      if (until !== null && at >= until) {
        count = 0;
        until = null;
      }
      count++;
      if (count === signInLockout.attempts)
        until = at + signInLockout.durationMs;
    }
    return until !== null && time < until ? until : null;
  }

  private verifyPassphrase(
    value: string,
    hash: string | null,
    time: number,
  ): Promise<Verification> {
    if (this.waitingSignIns >= maximumWaitingSignIns)
      return Promise.resolve({ kind: "busy" });
    this.waitingSignIns++;
    // The queue keeps one verification at a time per process. Other
    // processes (the CLI, another server) share only the database, so the
    // outcome is decided in one write transaction that re-checks the lock:
    // past the 10th recorded failure, every result reads as locked, a valid
    // guess too, so concurrent processes learn nothing beyond 10 guesses.
    // The same transaction re-reads the hash (a reset may have replaced it)
    // and issues the Session, so no lock or reset can land in between.
    const attempt = this.signInQueue.then(async (): Promise<Verification> => {
      const until = this.signInLockedUntil(time);
      if (until !== null) return { kind: "locked", until };
      // Without an owner nothing can match, but the attempt still counts
      // toward the lock, so an unprovisioned server cannot be flooded.
      const valid = hash !== null && (await Bun.password.verify(value, hash));
      return this.transaction((): Verification => {
        const lockedUntil = this.signInLockedUntil(time);
        if (lockedUntil !== null) return { kind: "locked", until: lockedUntil };
        const current =
          this.db
            .query<{ passphrase_hash: string }, []>(
              "SELECT passphrase_hash FROM owner WHERE singleton=1",
            )
            .get()?.passphrase_hash ?? null;
        if (valid && current === hash)
          return { kind: "valid", issued: this.issueSession(time) };
        this.record({
          action: "signIn",
          time,
          actor: "anonymous",
          error: new AuthError("invalid_passphrase"),
        });
        return { kind: "invalid" };
      });
    });
    this.signInQueue = attempt.then(
      () => undefined,
      () => undefined,
    );
    return attempt.finally(() => {
      this.waitingSignIns--;
    });
  }

  private record(input: {
    action: AuthAction;
    time: number;
    actor: string;
    profile?: ProfileId | null;
    credential_id?: string;
    error?: AuthError;
  }) {
    if (
      input.error &&
      input.error.detail !== "invalid_passphrase" &&
      repeatedAuthRejection(this.db, {
        actor: input.actor,
        profile: input.profile ?? null,
        action: input.action,
        detail: input.error.detail,
        time: input.time,
      })
    )
      return;
    const event = input.error
      ? {
          kind: "AuthAttemptRejected",
          code: "auth",
          detail: input.error.detail,
          action: input.action,
          entity_version: 1,
          occurred_at: instant(input.time),
        }
      : {
          kind: "AuthChanged",
          action: input.action,
          credential_id: input.credential_id ?? null,
          entity_version: 1,
          occurred_at: instant(input.time),
        };
    this.db
      .query(
        "INSERT INTO op_log(actor,profile,entity_version,event,from_version,to_version,outcome,reason) VALUES (?,?,1,?,NULL,NULL,?,?)",
      )
      .run(
        input.actor,
        input.profile ?? null,
        JSON.stringify(event),
        input.error ? "rejected" : "committed",
        input.error ? "auth" : null,
      );
  }

  private perform<A>(
    action: AuthAction,
    profile: unknown,
    run: (time: number) => A,
    boundary?: ReadBoundary,
  ) {
    return Effect.gen({ self: this }, function* () {
      const time = yield* Clock.currentTimeMillis;
      const clock = yield* Clock.Clock;
      return yield* Effect.try({
        try: () => {
          try {
            return withinLease(
              this.db,
              clock,
              boundary?.transaction ?? this.transaction,
              () => run(time),
            );
          } catch (error) {
            if (
              !(error instanceof AuthError) ||
              boundary?.recordRejection === false
            )
              throw error;
            const target =
              profile instanceof ResolvedProfileRejection
                ? profile.profile()
                : Schema.is(ProfileId)(profile) &&
                    this.db
                      .query("SELECT 1 FROM profiles WHERE id=?")
                      .get(profile)
                  ? profile
                  : null;
            // ADR-0007: a repeat is decided first in a read. One SELECT is one
            // read snapshot and holds nothing open afterwards; a match there
            // appends nothing and takes no write lock. Absence takes the lock,
            // and record() decides again inside it with the same walk.
            // Wrong passphrases never merge, so they never take this exit.
            const repeat =
              error.detail !== "invalid_passphrase" &&
              !this.db.inTransaction &&
              repeatedAuthRejection(this.db, {
                actor: error.actor,
                profile: target,
                action,
                detail: error.detail,
                time,
              });
            if (!repeat)
              this.transaction(() =>
                this.record({
                  action,
                  time,
                  actor: error.actor,
                  profile: target,
                  error,
                }),
              );
            throw error;
          }
        },
        catch: (cause) =>
          cause instanceof AuthError || cause instanceof StoreError
            ? cause
            : new StoreError(cause),
      });
    });
  }

  private resolvedProfileForHistory(value: string): ProfileId | null {
    const row = this.db
      .query<{ id: string }, [string, string, string]>(
        "SELECT id FROM profiles WHERE id NOT IN (SELECT profile FROM profile_deletions) AND (id=? OR name=?) ORDER BY CASE WHEN id=? THEN 0 ELSE 1 END,id LIMIT 1",
      )
      .get(value, value, value);
    if (row) return Schema.decodeUnknownSync(ProfileId)(row.id);
    return Schema.is(ProfileId)(value) &&
      this.db.query("SELECT 1 FROM profiles WHERE id=?").get(value)
      ? value
      : null;
  }

  private authorizedProfiles(credential: CredentialInfo) {
    return this.ports
      .profiles()
      .filter(
        (profile) =>
          credential.profile === null || profile.id === credential.profile,
      );
  }

  private classifyProfile(profile: ProfileId): ProfileClass {
    const row = this.db
      .query<
        {
          id: string | null;
          name: string | null;
          deleted: string | null;
          seq: number;
          generation: string;
          restore_seq: number;
        },
        [string]
      >(
        "WITH current AS (SELECT coalesce(max(seq),0) AS seq FROM op_log), restored AS (SELECT seq,json_extract(event,'$.generation') AS generation FROM op_log WHERE profile IS NULL AND actor='snapshot-restore' AND outcome='committed' AND json_extract(event,'$.kind')='DatabaseRestored' ORDER BY seq DESC LIMIT 1) SELECT p.id,p.name,d.profile AS deleted,current.seq,coalesce(restored.generation,'initial') AS generation,coalesce(restored.seq,current.seq) AS restore_seq FROM (SELECT ? AS requested) r CROSS JOIN current LEFT JOIN restored ON 1 LEFT JOIN profiles p ON p.id=r.requested LEFT JOIN profile_deletions d ON d.profile=p.id",
      )
      .get(profile);
    if (!row) throw new StoreError(new Error("Missing Profile classification"));
    const snapshot = freezeRead({
      seq: row.seq,
      generation: row.generation,
      restore_seq: row.restore_seq,
    });
    const value: ProfileClass =
      row.deleted !== null
        ? { kind: "tombstoned", snapshot }
        : row.id === null
          ? { kind: "absent", snapshot }
          : {
              kind: "present",
              profile: freezeRead(
                Schema.decodeUnknownSync(
                  Schema.Struct({ id: ProfileId, name: Schema.String }),
                )({ id: row.id, name: row.name }),
              ),
              snapshot,
            };
    return value;
  }

  private presentProfile(profile: ProfileId) {
    const value = this.classifyProfile(profile);
    if (value.kind !== "present")
      throw new StoreError(new Error("Invalid read authority"));
    return value.profile;
  }

  private credentialCheck(
    input: { credential: string },
    time: number,
    access: "owner" | "read" | "write" | "profiles",
    profile: ProfileId | null = null,
  ) {
    const { credential } = parse(OwnerRequest, input);
    if (!/^(ses|tok)_[a-f0-9]{64}$/.test(credential))
      throw new AuthError("invalid_credential");
    const lease = leases.get(this.db);
    const cached = lease?.credentials.get(credential);
    const serial = cached ? mutationSerial(this.db) : undefined;
    const row =
      cached !== undefined && cached.changes === serial
        ? cached.value
        : this.db
            .query(
              "SELECT " +
                credentialColumns +
                ",total_changes() AS checked_changes FROM credentials WHERE secret_hash=?",
            )
            .get(sha256(credential));
    if (row === null || row === undefined)
      throw new AuthError("invalid_credential");
    const value = freezeRead(Schema.decodeUnknownSync(CredentialInfo)(row));
    const changes = Reflect.get(row, "checked_changes");
    lease?.credentials.set(credential, {
      value,
      changes: typeof changes === "number" ? changes : (serial ?? 0),
    });
    if ((value.kind === "session") !== credential.startsWith("ses_"))
      throw new AuthError("invalid_credential");
    if (value.revoked_at !== null) throw new AuthError("revoked", value.id);
    if (Date.parse(value.expires_at) <= time)
      throw new AuthError("expired", value.id);
    if (access === "owner" && value.kind !== "session")
      throw new AuthError("owner_required", value.id);
    if (
      access !== "profiles" &&
      value.profile !== null &&
      value.profile !== profile
    )
      throw new AuthError("profile_scope", value.id);
    if (access === "write" && value.scope !== "read-write")
      throw new AuthError("write_scope", value.id);
    const checkedSerial = typeof changes === "number" ? changes : (serial ?? 0);
    if (lease) lease.checkedSerial = checkedSerial;
    const classification =
      profile === null ? undefined : this.classifyProfile(profile);
    if (classification?.kind === "tombstoned")
      throw new AuthError("profile_deleted", value.id);
    try {
      this.ports.credentialUsed?.(value.id, time);
    } finally {
      if (lease) lease.checkedSerial = checkedSerial;
    }
    return { info: value, classification };
  }

  private requireCredential(
    input: { credential: string },
    time: number,
    access: "owner" | "read" | "write" | "profiles",
    profile: ProfileId | null = null,
  ) {
    return this.credentialCheck(input, time, access, profile).info;
  }

  private issue(
    time: number,
    options: {
      kind: CredentialInfo["kind"];
      name: string | null;
      profile: ProfileId | null;
      scope: AccessScope;
      expires_at: Instant;
    },
  ) {
    const credential = `${options.kind === "session" ? "ses_" : "tok_"}${randomBytes(32).toString("hex")}`;
    const info: CredentialInfo = {
      ...options,
      id: randomBytes(16).toString("hex"),
      created_at: instant(time),
      revoked_at: null,
    };
    this.db
      .query(
        "INSERT INTO credentials(id,kind,secret_hash,name,profile,scope,created_at,expires_at,revoked_at) VALUES (?,?,?,?,?,?,?,?,NULL)",
      )
      .run(
        info.id,
        info.kind,
        sha256(credential),
        info.name,
        info.profile,
        info.scope,
        info.created_at,
        info.expires_at,
      );
    return { ...info, credential };
  }

  readonly setupOwner = (passphrase: string) =>
    Effect.gen({ self: this }, function* () {
      const value = yield* this.perform("setupOwner", null, () => {
        const value = parse(OwnerPassphrase, passphrase);
        if (this.db.query("SELECT 1 FROM owner").get())
          throw new AuthError("owner_exists");
        return value;
      });
      const hash = yield* Effect.tryPromise({
        try: () =>
          Bun.password.hash(value, {
            algorithm: "argon2id",
            memoryCost: 65536,
            timeCost: 3,
          }),
        catch: (cause) => new StoreError(cause),
      });
      yield* this.perform("setupOwner", null, (time) => {
        if (this.db.query("SELECT 1 FROM owner").get())
          throw new AuthError("owner_exists");
        this.db.query("INSERT INTO owner VALUES (1,?)").run(hash);
        this.record({ action: "setupOwner", actor: "owner", time });
      });
    });

  // Local recovery for a forgotten passphrase or a locked sign-in. Only code
  // that already opens the database can call it; the CLI first proves the
  // macOS account password. It ends any lock and revokes every Session.
  readonly resetPassphrase = (passphrase: string) =>
    Effect.gen({ self: this }, function* () {
      const value = yield* this.perform("resetPassphrase", null, () => {
        const value = parse(OwnerPassphrase, passphrase);
        if (!this.db.query("SELECT 1 FROM owner").get())
          throw new AuthError("invalid_request");
        return value;
      });
      const hash = yield* Effect.tryPromise({
        try: () =>
          Bun.password.hash(value, {
            algorithm: "argon2id",
            memoryCost: 65536,
            timeCost: 3,
          }),
        catch: (cause) => new StoreError(cause),
      });
      return yield* this.perform("resetPassphrase", null, (time) => {
        if (!this.db.query("SELECT 1 FROM owner").get())
          throw new AuthError("invalid_request");
        this.db
          .query("UPDATE owner SET passphrase_hash=? WHERE singleton=1")
          .run(hash);
        const revoked = this.db
          .query(
            "UPDATE credentials SET revoked_at=? WHERE kind='session' AND revoked_at IS NULL",
          )
          .run(instant(time)).changes;
        this.record({ action: "resetPassphrase", actor: "owner", time });
        return { sessions_revoked: revoked };
      });
    });

  readonly signIn = (passphrase: string) =>
    Effect.gen({ self: this }, function* () {
      const input = yield* this.perform("signIn", null, () => {
        const value = parse(SignInPassphrase, passphrase);
        const row = this.db
          .query<{ passphrase_hash: string }, []>(
            "SELECT passphrase_hash FROM owner WHERE singleton=1",
          )
          .get();
        return { value, hash: row?.passphrase_hash ?? null };
      });
      const time = yield* Clock.currentTimeMillis;
      const outcome = yield* Effect.tryPromise({
        try: () => this.verifyPassphrase(input.value, input.hash, time),
        catch: (cause) => new StoreError(cause),
      });
      // A wrong passphrase was already recorded inside the queue.
      if (outcome.kind === "invalid")
        return yield* Effect.fail(new AuthError("invalid_passphrase"));
      if (outcome.kind === "valid") return outcome.issued;
      return yield* this.perform("signIn", null, () => {
        if (outcome.kind === "locked")
          throw new AuthError(
            "sign_in_locked",
            "anonymous",
            instant(outcome.until),
          );
        throw new AuthError("sign_in_busy");
      });
    });

  // Runs inside the sign-in decision transaction.
  private issueSession(time: number) {
    const issued = this.issue(time, {
      kind: "session",
      name: null,
      profile: null,
      scope: "read-write",
      expires_at: instant(time + 7 * 86400000),
    });
    this.record({
      action: "signIn",
      actor: "owner",
      time,
      credential_id: issued.id,
    });
    return issued;
  }

  readonly authenticate = (
    input: AccessRequest & { readonly access: "read" | "write" },
  ) =>
    this.perform("authenticate", input.profile, (time) => {
      const request = parse(
        Schema.Struct({
          ...AccessRequest.fields,
          access: Schema.Literals(["read", "write"]),
        }),
        input,
      );
      return this.requireCredential(
        request,
        time,
        request.access,
        request.profile,
      );
    });

  readonly resolveProfile = (input: ResolveProfileRequest) =>
    this.resolveProfileRead(input, EmptyRead, {}).pipe(
      Effect.map((result) => result.profile),
    );

  readonly resolveProfileRead = <S extends Schema.ConstraintDecoder<unknown>>(
    input: ResolveProfileRequest,
    schema: S,
    fields: S["Type"],
  ) =>
    Effect.suspend(() => {
      const parsed = freezeRead(parse(schema, structuredClone(fields)));
      const { credential, profile, action } = input;
      const request = Object.freeze({ credential, profile, action });
      let selected: ProfileId | null = null;
      const rejection = new ResolvedProfileRejection(() => selected);
      return this.perform(request.action, rejection, (time) => {
        selected = this.resolvedProfileForHistory(request.profile);
        const credential = this.requireCredential(request, time, "profiles");
        const profiles = this.authorizedProfiles(credential);
        const profile =
          profiles.find((row) => row.id === request.profile) ??
          profiles.find((row) => row.name === request.profile);
        if (profile) selected = profile.id;
        const info = this.requireCredential(
          request,
          time,
          "read",
          selected ?? parse(ProfileId, request.profile),
        );
        return profile
          ? {
              profile: freezeRead({ id: profile.id, name: profile.name }),
              selection: readAuthority(
                bindRead(
                  this.db,
                  profile.id,
                  request.credential,
                  parsed,
                  info,
                  { id: profile.id, name: profile.name },
                ),
                "read",
                this.db,
              ),
            }
          : null;
      }).pipe(
        Effect.catchTag("AuthError", (error) =>
          error.detail === "profile_scope" || error.detail === "profile_deleted"
            ? Effect.succeed(null)
            : Effect.fail(error),
        ),
        Effect.flatMap((profile) =>
          profile === null
            ? Effect.fail(new ProfileResolutionError())
            : Effect.succeed(profile),
        ),
      );
    });

  readonly requireOwner = (input: { readonly credential: string }) =>
    this.perform("authenticate", null, (time) =>
      this.requireCredential(input, time, "owner"),
    );

  readonly issueToken = (input: {
    readonly credential: string;
    readonly token: TokenOptions;
  }) =>
    this.perform("issueToken", null, (time) => {
      const owner = this.requireCredential(input, time, "owner");
      const token = parse(TokenOptions, input.token);
      if (
        token.profile !== null &&
        !this.ports.profiles().some((p) => p.id === token.profile)
      )
        throw new AuthError("invalid_request", owner.id);
      if (
        this.db.query("SELECT 1 FROM credentials WHERE name=?").get(token.name)
      )
        throw new AuthError("invalid_request", owner.id);
      const expires_at = token.expires_at ?? instant(time + 90 * 86400000);
      if (Date.parse(expires_at) <= time)
        throw new AuthError("invalid_request", owner.id);
      const issued = this.issue(time, { ...token, kind: "token", expires_at });
      this.record({
        action: "issueToken",
        actor: owner.id,
        time,
        profile: token.profile,
        credential_id: issued.id,
      });
      return issued;
    });

  readonly nextExpiry = () =>
    Effect.try({
      try: () => {
        const rows = Schema.decodeUnknownSync(
          Schema.Array(Schema.Struct({ expires_at: Instant })),
        )(this.db.query("SELECT expires_at FROM credentials").all());
        return rows.reduce<number | null>(
          (next, row) =>
            next === null
              ? Date.parse(row.expires_at)
              : Math.min(next, Date.parse(row.expires_at)),
          null,
        );
      },
      catch: (cause) => new StoreError(cause),
    });

  readonly cleanupExpired = () =>
    this.perform("cleanupExpired", null, (time) => {
      const expired = this.db
        .query<{ id: string; expires_at: string }, []>(
          "SELECT id,expires_at FROM credentials",
        )
        .all()
        .filter((row) => Date.parse(row.expires_at) <= time);
      for (const row of expired)
        this.db.query("DELETE FROM credentials WHERE id=?").run(row.id);
      if (expired.length > 0)
        this.record({ action: "cleanupExpired", time, actor: "scheduler" });
      return expired.length;
    });

  readonly listTokens = (input: { readonly credential: string }) =>
    this.perform("listTokens", null, (time) => {
      this.requireCredential(input, time, "owner");
      return Schema.decodeUnknownSync(Schema.Array(CredentialInfo))(
        this.db
          .query(
            `SELECT ${credentialColumns} FROM credentials WHERE kind='token' ORDER BY name`,
          )
          .all(),
      );
    });

  readonly revokeToken = (input: {
    readonly credential: string;
    readonly name: string;
  }) =>
    this.perform("revokeToken", null, (time) => {
      const owner = this.requireCredential(input, time, "owner");
      const name = parse(Schema.NonEmptyString, input.name);
      const row = this.db
        .query<{ id: string; revoked_at: string | null }, [string]>(
          "SELECT id,revoked_at FROM credentials WHERE kind='token' AND name=?",
        )
        .get(name);
      if (!row) throw new AuthError("invalid_request", owner.id);
      if (row.revoked_at === null) {
        this.db
          .query("UPDATE credentials SET revoked_at=? WHERE id=?")
          .run(instant(time), row.id);
        this.record({
          action: "revokeToken",
          actor: owner.id,
          time,
          credential_id: row.id,
        });
      }
    });

  readonly signOut = (input: { readonly credential: string }) =>
    this.perform("signOut", null, (time) => {
      const session = this.requireCredential(input, time, "owner");
      this.db
        .query("UPDATE credentials SET revoked_at=? WHERE id=?")
        .run(instant(time), session.id);
      this.record({
        action: "signOut",
        actor: session.id,
        time,
        credential_id: session.id,
      });
    });

  private profileDeletion = (
    input: AccessRequest & { readonly options: DeleteProfile },
    preview: boolean,
  ) =>
    this.perform("deleteProfile", input.profile, (time) => {
      const request = parse(AccessRequest, input);
      const owner = this.requireCredential(request, time, "owner");
      return this.ports.deleteProfile({
        preview,
        actor: Schema.decodeUnknownSync(ActorId)(owner.id),
        profile: request.profile,
        options: input.options,
        occurred_at: instant(time),
      });
    });

  readonly deleteProfile = (
    input: AccessRequest & { readonly options: DeleteProfile },
  ) =>
    Effect.gen({ self: this }, function* () {
      const preview = yield* this.profileDeletion(input, true);
      if (preview.outcome === "refused" || input.options.dry_run)
        return preview;
      yield* this.ports.snapshotBeforeProfileDelete(
        `before Profile delete ${preview.report.profile.name}`,
      );
      return yield* this.profileDeletion(input, false);
    });

  readonly readSnapshot = <A>(
    operation: (
      reads: Pick<
        Authentication<Read>,
        | "profiles"
        | "catalog"
        | "profileSummaries"
        | "metadata"
        | "profilesRead"
      >,
    ) => Effect.Effect<A, AuthError | StoreError>,
  ) =>
    Effect.contextWith<never, A, AuthError | StoreError, never>((context) =>
      this.perform(
        "read",
        null,
        () => {
          const boundary: ReadBoundary = {
            transaction: (run) => run(),
            recordRejection: false,
          };
          const result = Effect.runSyncExitWith(context)(
            operation({
              profiles: (input) => this.profilesWithin(input, boundary),
              profilesRead: (input, schema, fields) =>
                this.profilesReadWithin(input, schema, fields, boundary),
              catalog: (input) =>
                this.projectionWithin(
                  input,
                  (read) => this.projection.catalog(read),
                  boundary,
                ),
              metadata: (input) =>
                this.projectionWithin(
                  input,
                  (read) => this.projection.metadata(read),
                  boundary,
                ),
              profileSummaries: (input) =>
                this.profileSummariesWithin(input, boundary, false),
            }),
          );
          if (Exit.isFailure(result)) throw Cause.squash(result.cause);
          return result.value;
        },
        {
          transaction: (run) => this.db.transaction(run).deferred(),
          recordRejection: true,
        },
      ),
    );

  readonly profiles = (input: { readonly credential: string }) =>
    this.profilesWithin(input);

  readonly profilesRead = <S extends Schema.ConstraintDecoder<unknown>>(
    input: { credential: string },
    schema: S,
    fields: S["Type"],
  ) => this.profilesReadWithin(input, schema, fields);
  private profilesReadWithin = <S extends Schema.ConstraintDecoder<unknown>>(
    input: { credential: string },
    schema: S,
    fields: S["Type"],
    boundary?: ReadBoundary,
  ) =>
    this.perform(
      "read",
      null,
      (time) => {
        const request = freezeRead(
            parse(OwnerRequest, { credential: input.credential }),
          ),
          parsed = freezeRead(parse(schema, structuredClone(fields)));
        const info = this.requireCredential(request, time, "profiles");
        const profiles = freezeRead(this.authorizedProfiles(info));
        return {
          read: bindProfiles(
            this.db,
            request.credential,
            parsed,
            info,
            profiles,
          ),
          profiles,
        };
      },
      boundary,
    );

  private profilesWithin = (
    input: { readonly credential: string },
    boundary?: ReadBoundary,
  ) =>
    this.perform(
      "read",
      null,
      (time) => {
        const credential = this.requireCredential(input, time, "profiles");
        return this.authorizedProfiles(credential);
      },
      boundary,
    );

  readonly read = (input: AccessRequest) => this.readWithin(input);

  readonly catalog = (input: AccessRequest) =>
    this.projectionWithin(
      input,
      (read) => this.projection.catalog(read),
      undefined,
      () => ({ projects: [], tags: [], tasks: [] }),
    );

  readonly metadata = (input: AccessRequest) =>
    this.projectionWithin(
      input,
      (read) => this.projection.metadata(read),
      undefined,
      () => ({ projects: [], tags: [] }),
    );

  readonly authorizeRead = <S extends Schema.ConstraintDecoder<unknown>>(
    input: AccessRequest,
    schema: S,
    fields: S["Type"],
  ) =>
    this.queryWithin(input, schema, fields, (read) => {
      readAuthority(read, "read", this.db);
      return read;
    });

  readonly withRead = <
    S extends Schema.ConstraintDecoder<unknown>,
    A,
    B = never,
  >(
    input: AccessRequest,
    schema: S,
    fields: S["Type"],
    operation: (
      read: AuthorizedRead<Readonly<S["Type"]>>,
    ) => Effect.Effect<A, StoreError | AuthError>,
    action: "read" | "authenticate" = "read",
    absent?: (
      selection: AbsentRead<S["Type"]>,
    ) => Effect.Effect<B, StoreError | AuthError>,
  ) =>
    Effect.contextWith<never, A | B, StoreError | AuthError, never>(
      (context) => {
        const run = <C>(effect: Effect.Effect<C, StoreError | AuthError>) => {
          const result = Effect.runSyncExitWith(context)(effect);
          if (Exit.isFailure(result)) throw Cause.squash(result.cause);
          return result.value;
        };
        return this.queryWithin(
          input,
          schema,
          fields,
          (read) => run(operation(read)),
          undefined,
          action,
          absent === undefined
            ? undefined
            : (selection) => run(absent(selection)),
        );
      },
    );

  readonly withMetadata = <
    S extends Schema.ConstraintDecoder<unknown>,
    A,
    B = never,
  >(
    input: AccessRequest,
    schema: S,
    fields: S["Type"],
    operation: (
      read: AuthorizedRead<Readonly<S["Type"]>>,
      data: ReturnType<ClientProjection["metadata"]>,
    ) => Effect.Effect<A, StoreError | AuthError>,
    absent?: (
      selection: AbsentRead<S["Type"]>,
    ) => Effect.Effect<B, StoreError | AuthError>,
  ) =>
    this.withRead(
      input,
      schema,
      fields,
      (read) => operation(read, this.projection.metadata(read)),
      "read",
      absent,
    );

  readonly withState = <
    S extends Schema.ConstraintDecoder<unknown>,
    A,
    B = never,
  >(
    input: AccessRequest,
    schema: S,
    fields: S["Type"],
    operation: (
      read: AuthorizedRead<Readonly<S["Type"]>>,
      data: Read,
    ) => Effect.Effect<A, StoreError | AuthError>,
    absent?: (
      selection: AbsentRead<S["Type"]>,
    ) => Effect.Effect<B, StoreError | AuthError>,
  ) =>
    this.withRead(
      input,
      schema,
      fields,
      (read) =>
        operation(
          read,
          this.ports.read(readAuthority(read, "read", this.db).profile),
        ),
      "read",
      absent,
    );

  readonly readMetadata = <S extends Schema.ConstraintDecoder<unknown>>(
    input: AccessRequest,
    schema: S,
    fields: S["Type"],
  ) =>
    this.queryWithin(
      input,
      schema,
      fields,
      (read) => ({
        selection: readAuthority(read, "read", this.db),
        data: this.projection.metadata(read),
      }),
      undefined,
      "read",
      (selection) => ({ selection, data: { projects: [], tags: [] } }),
    );

  readonly readState = <S extends Schema.ConstraintDecoder<unknown>>(
    input: AccessRequest,
    schema: S,
    fields: S["Type"],
  ) =>
    this.queryWithin(
      input,
      schema,
      fields,
      (read) => ({
        selection: readAuthority(read, "read", this.db),
        data: this.ports.read(readAuthority(read, "read", this.db).profile),
      }),
      undefined,
      "read",
      (selection) => ({ selection, data: emptyState() }),
    );

  readonly readCatalog = <S extends Schema.ConstraintDecoder<unknown>>(
    input: AccessRequest,
    schema: S,
    fields: S["Type"],
  ) =>
    this.queryWithin(
      input,
      schema,
      fields,
      (read) => ({
        selection: readAuthority(read, "read", this.db),
        data: this.projection.catalog(read),
      }),
      undefined,
      "read",
      (selection) => ({
        selection,
        data: { projects: [], tags: [], tasks: [] },
      }),
    );

  readonly subscribe = <S extends Schema.ConstraintDecoder<unknown>>(
    input: AccessRequest,
    schema: S,
    fields: S["Type"],
  ) =>
    this.queryWithin(
      input,
      schema,
      fields,
      (read) => {
        readAuthority(read, "read", this.db);
        return read;
      },
      undefined,
      "authenticate",
    );

  readonly checkRead = <K extends AuthorityKind, P, F>(
    read: ReadAuthority<K, P, F>,
    kind: K,
  ) => checkedRead(read, kind, this.db);
  readonly recheckRead = <F, A>(
    read: AuthorizedRead<F>,
    operation: (
      read: AuthorizedRead<Readonly<F>>,
    ) => Effect.Effect<A, StoreError | AuthError>,
  ) =>
    Effect.contextWith<never, A, StoreError | AuthError, never>((context) =>
      this.perform("authenticate", null, (time) => {
        const value = ReadAuthority.retained(authorityCreation, read, this.db);
        const info = this.requireCredential(value, time, "read", value.profile);
        const renewed = bindRead(
          this.db,
          value.profile,
          value.credential,
          value.fields,
          info,
          this.presentProfile(value.profile),
        );
        const result = Effect.runSyncExitWith(context)(operation(renewed));
        if (Exit.isFailure(result)) throw Cause.squash(result.cause);
        return result.value;
      }),
    );

  readonly ownerRead = <S extends Schema.ConstraintDecoder<unknown>>(
    input: { credential: string },
    schema: S,
    fields: S["Type"],
  ) =>
    this.perform("authenticate", null, (time) => {
      const request = freezeRead(
          parse(OwnerRequest, { credential: input.credential }),
        ),
        parsed = freezeRead(parse(schema, structuredClone(fields)));
      const info = this.requireCredential(request, time, "owner");
      return bindOwnerRead(this.db, request.credential, parsed, info);
    });

  readonly withOwnerRead = <S extends Schema.ConstraintDecoder<unknown>, A>(
    input: { credential: string },
    schema: S,
    fields: S["Type"],
    operation: (
      read: AuthorizedOwnerRead<Readonly<S["Type"]>>,
    ) => Effect.Effect<A, StoreError | AuthError>,
  ) =>
    Effect.contextWith<never, A, StoreError | AuthError, never>((context) =>
      this.perform("authenticate", null, (time) => {
        const request = freezeRead(
          parse(OwnerRequest, { credential: input.credential }),
        );
        const parsed = freezeRead(parse(schema, structuredClone(fields)));
        const info = this.requireCredential(request, time, "owner");
        const result = Effect.runSyncExitWith(context)(
          operation(bindOwnerRead(this.db, request.credential, parsed, info)),
        );
        if (Exit.isFailure(result)) throw Cause.squash(result.cause);
        return result.value;
      }),
    );

  readonly withStreamRead = <S extends Schema.ConstraintDecoder<unknown>, A>(
    input: AccessRequest,
    schema: S,
    fields: S["Type"],
    state: { readonly after: number; readonly generation: string },
    operation: (
      result:
        | {
            readonly kind: "active";
            readonly read: AuthorizedRead<Readonly<S["Type"]>>;
          }
        | { readonly kind: "absent"; readonly selection: AbsentRead<S["Type"]> }
        | { readonly kind: "reload"; readonly snapshot: AbsentRead["snapshot"] }
        | { readonly kind: "terminal"; readonly read: AuthorizedTerminalRead },
    ) => Effect.Effect<A, StoreError | AuthError>,
  ) =>
    Effect.contextWith<never, A, StoreError | AuthError, never>((context) =>
      this.perform("authenticate", input.profile, (time) => {
        const request = freezeRead(
          parse(AccessRequest, {
            credential: input.credential,
            profile: input.profile,
          }),
        );
        const parsed = freezeRead(parse(schema, structuredClone(fields)));
        const cursor = freezeRead(
          parse(
            Schema.Struct({ after: Schema.Number, generation: Schema.String }),
            { ...state },
          ),
        );
        let result: Parameters<typeof operation>[0];
        try {
          const { info, classification } = this.credentialCheck(
            request,
            time,
            "read",
            request.profile,
          );
          if (!classification)
            throw new StoreError(new Error("Missing Profile classification"));
          result =
            classification.kind === "absent"
              ? {
                  kind: "absent",
                  selection: freezeRead({
                    kind: "absent",
                    requested: String(request.profile),
                    credential: request.credential,
                    scope: info.scope,
                    fields: parsed,
                    profileInfo: null,
                    snapshot: classification.snapshot,
                  }),
                }
              : {
                  kind: "active",
                  read: bindRead(
                    this.db,
                    request.profile,
                    request.credential,
                    parsed,
                    info,
                    classification.kind === "present"
                      ? classification.profile
                      : this.presentProfile(request.profile),
                  ),
                };
        } catch (error) {
          const info = leases
            .get(this.db)
            ?.credentials.get(request.credential)?.value;
          if (
            !(error instanceof AuthError) ||
            error.detail !== "profile_deleted" ||
            info === undefined ||
            info.profile !== null
          )
            throw error;
          const snapshot = this.classifyProfile(request.profile).snapshot;
          if (cursor.generation !== snapshot.generation) {
            result = { kind: "reload", snapshot };
          } else {
            const deletion = this.db
              .query<{ seq: number }, [string]>(
                "SELECT seq FROM op_log WHERE profile=? AND outcome='committed' AND json_extract(event,'$.kind')='ProfileDeleted' ORDER BY seq DESC LIMIT 1",
              )
              .get(request.profile);
            if (!deletion || deletion.seq <= cursor.after) throw error;
            result = {
              kind: "terminal",
              read: createAuthority(
                "terminal",
                this.db,
                request.profile,
                request.credential,
                { ...cursor, through: deletion.seq },
                info,
              ),
            };
          }
        }
        const exit = Effect.runSyncExitWith(context)(operation(result));
        if (Exit.isFailure(exit)) throw Cause.squash(exit.cause);
        return exit.value;
      }),
    );

  readonly taskHistory = (
    input: AccessRequest & { readonly task_id: TaskId },
  ) =>
    this.queryWithin(
      input,
      TaskReadFields,
      { task_id: input.task_id },
      (read) => taskHistory(this.db, read),
      undefined,
      "read",
      () => [],
    );

  readonly projects = (input: AccessRequest) =>
    this.projectionWithin(
      input,
      (read) => this.projection.projects(read),
      undefined,
      () => [],
    );

  readonly tags = (input: AccessRequest) =>
    this.projectionWithin(
      input,
      (read) => this.projection.tags(read),
      undefined,
      () => [],
    );

  readonly profileSummaries = (input: { readonly credential: string }) =>
    this.profileSummariesWithin(input);

  private profileSummariesWithin = (
    input: { readonly credential: string },
    boundary?: ReadBoundary,
    checkProfiles = true,
  ) =>
    Effect.gen({ self: this }, function* () {
      const clock = yield* Clock.Clock;
      let selected: ProfileId | null = null;
      return yield* this.perform(
        "read",
        new ResolvedProfileRejection(() => selected),
        (time) => {
          const request = freezeRead(
            parse(OwnerRequest, { credential: input.credential }),
          );
          const credential = this.requireCredential(request, time, "profiles");
          const profiles = freezeRead(this.authorizedProfiles(credential));
          for (const profile of checkProfiles ? profiles : []) {
            selected = profile.id;
            this.requireCredential(
              request,
              clock.currentTimeMillisUnsafe(),
              "read",
              profile.id,
            );
          }
          return this.projection.profiles(
            bindProfiles(this.db, request.credential, {}, credential, profiles),
          );
        },
        boundary,
      );
    });

  private projectionWithin = <A, B = never>(
    input: AccessRequest,
    read: (read: AuthorizedRead) => A,
    boundary?: ReadBoundary,
    absent?: (selection: AbsentRead) => B,
  ) => this.queryWithin(input, EmptyRead, {}, read, boundary, "read", absent);

  private queryWithin = <
    S extends Schema.ConstraintDecoder<unknown>,
    A,
    B = never,
  >(
    input: AccessRequest,
    schema: S,
    fields: S["Type"],
    operation: (read: AuthorizedRead<Readonly<S["Type"]>>) => A,
    boundary?: ReadBoundary,
    action: "read" | "authenticate" = "read",
    absent?: (selection: AbsentRead<S["Type"]>) => B,
  ) =>
    this.perform(
      action,
      input.profile,
      (time) => {
        const request = freezeRead(
          parse(AccessRequest, {
            credential: input.credential,
            profile: input.profile,
          }),
        );
        const parsed = freezeRead(parse(schema, structuredClone(fields)));
        const { info: credential, classification } = this.credentialCheck(
          request,
          time,
          "read",
          request.profile,
        );
        if (!classification)
          throw new StoreError(new Error("Missing Profile classification"));
        if (classification.kind === "absent") {
          if (!absent)
            throw new StoreError(new Error("Invalid read authority"));
          return absent(
            freezeRead({
              kind: "absent",
              requested: String(request.profile),
              credential: request.credential,
              scope: credential.scope,
              fields: parsed,
              profileInfo: null,
              snapshot: classification.snapshot,
            }),
          );
        }
        return operation(
          bindRead(
            this.db,
            request.profile,
            request.credential,
            parsed,
            credential,
            classification.kind === "present"
              ? classification.profile
              : this.presentProfile(request.profile),
          ),
        );
      },
      boundary,
    );

  private readWithin = (input: AccessRequest, boundary?: ReadBoundary) =>
    this.queryWithin(
      input,
      EmptyRead,
      {},
      (read) => this.ports.read(readAuthority(read, "read", this.db).profile),
      boundary,
      "read",
      emptyState,
    );

  readonly append = (input: AccessRequest & { readonly event: unknown }) =>
    this.perform("append", input.profile, (time) => {
      const request = parse(AccessRequest, input);
      const credential = this.requireCredential(
        request,
        time,
        "write",
        request.profile,
      );
      if (Schema.is(Event)(input.event)) {
        const targets = changes(input.event, request.profile);
        const definitions = metadata(input.event);
        const profiles = [
          ...targets.tasks.flatMap(({ before, after }) => [
            before?.profile_id,
            after?.profile_id,
          ]),
          ...targets.series.flatMap(({ before, after }) => [
            before?.profile_id,
            after?.profile_id,
          ]),
          ...definitions.projects.map((value) => value.profile_id),
          ...definitions.tags.map((value) => value.profile_id),
        ];
        if (
          profiles.some(
            (profile) => profile !== undefined && profile !== request.profile,
          )
        )
          throw new AuthError("profile_scope", credential.id);
      }
      return this.ports.append({
        actor: Schema.decodeUnknownSync(ActorId)(credential.id),
        profile: request.profile,
        event: input.event,
      });
    });

  readonly startSeries = (input: StartSeriesRequest) =>
    this.perform("startSeries", input.profile, (time) => {
      const request = parse(StartSeriesRequest, input);
      const credential = this.requireCredential(
        request,
        time,
        "write",
        request.profile,
      );
      if (request.series.profile_id !== request.profile)
        throw new AuthError("profile_scope", credential.id);
      const { credential: _credential, ...facts } = request;
      return this.ports.startSeries({
        ...facts,
        actor: Schema.decodeUnknownSync(ActorId)(credential.id),
        occurred_at: instant(time),
      });
    });

  readonly finishTask = (input: FinishTaskRequest) =>
    this.perform("finishTask", input.profile, (time) => {
      const request = parse(FinishTaskRequest, input);
      const credential = this.requireCredential(
        request,
        time,
        "write",
        request.profile,
      );
      const target = this.db
        .query<{ profile_id: string }, [string]>(
          "SELECT profile_id FROM tasks WHERE id=?",
        )
        .get(request.task_id);
      if (target && target.profile_id !== request.profile)
        throw new AuthError("profile_scope", credential.id);
      return this.ports.finishTask({
        actor: Schema.decodeUnknownSync(ActorId)(credential.id),
        profile: request.profile,
        task_id: request.task_id,
        from_version: request.from_version,
        action: request.action,
        next_task_id: request.next_task_id,
        next_occurrence_id: request.next_occurrence_id,
        occurred_at: instant(time),
      });
    });

  readonly mutate = <A>(
    input: AccessRequest,
    operation: (identity: {
      readonly actor: ActorId;
      readonly profile: ProfileId;
    }) => Effect.Effect<A, StoreError | AuthError>,
  ) =>
    Effect.contextWith<never, A, AuthError | StoreError, never>((context) =>
      this.perform("mutate", input.profile, (time) => {
        const request = parse(AccessRequest, input);
        const credential = this.requireCredential(
          request,
          time,
          "write",
          request.profile,
        );
        const result = Effect.runSyncExitWith(context)(
          operation({
            actor: Schema.decodeUnknownSync(ActorId)(credential.id),
            profile: request.profile,
          }),
        );
        if (Exit.isFailure(result)) throw Cause.squash(result.cause);
        return result.value;
      }),
    );

  readonly revert = (input: AccessRequest & { readonly seq: Sequence }) =>
    this.perform("revert", input.profile, (time) => {
      const request = parse(AccessRequest, input);
      const credential = this.requireCredential(
        request,
        time,
        "write",
        request.profile,
      );
      return this.ports.revert({
        actor: Schema.decodeUnknownSync(ActorId)(credential.id),
        profile: request.profile,
        seq: parse(Sequence, input.seq),
        occurred_at: instant(time),
      });
    });
}
