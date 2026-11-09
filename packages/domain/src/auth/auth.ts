import type { Database } from "bun:sqlite";
import { createHash, randomBytes } from "node:crypto";
import { Cause, Clock, Effect, Exit, Schema } from "effect";
import type { Profile } from "../entities.ts";
import { type AuthAction, Event, type OpLogEntry } from "../events.ts";
import { ActorId, ProfileId, Sequence } from "../ids.ts";
import type {
  DeleteProfile,
  ProfileDeletionResult,
} from "../profile-commands.ts";
import type { FinishTask, StartSeries } from "../recurrence.ts";
import { StoreError } from "../store/error.ts";
import { changes, metadata } from "../store/projection.ts";
import { Instant } from "../time.ts";

import {
  AccessRequest,
  type AccessScope,
  AuthError,
  CredentialInfo,
  FinishTaskRequest,
  OwnerRequest,
  StartSeriesRequest,
  TokenOptions,
} from "./model.ts";

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
  readonly startSeries: (input: StartSeries) => OpLogEntry;
  readonly finishTask: (input: FinishTask) => OpLogEntry;
  readonly append: (input: {
    actor: ActorId;
    profile: ProfileId;
    event: unknown;
  }) => OpLogEntry;
  readonly credentialUsed?: (id: string, time: number) => void;
  readonly revert: (input: {
    actor: ActorId;
    profile: ProfileId;
    seq: Sequence;
    occurred_at: Instant;
  }) => OpLogEntry;
};

type ReadBoundary = {
  readonly transaction: <A>(run: () => A) => A;
  readonly recordRejection: boolean;
};

export class Authentication<Read> {
  constructor(
    private readonly db: Database,
    private readonly transaction: <A>(run: () => A) => A,
    private readonly ports: Ports<Read>,
  ) {}

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

  // ADR-0007 amendment: a repeated rejection (same actor, Profile, action and
  // detail) is recorded once per minute, so a local process retrying forever
  // adds at most one History row per kind per minute instead of one per try.
  private rejectionMinute = -1;
  private readonly rejectionsThisMinute = new Set<string>();

  private record(input: {
    action: AuthAction;
    time: number;
    actor: string;
    profile?: ProfileId | null;
    credential_id?: string;
    error?: AuthError;
  }) {
    const kind = input.error
      ? JSON.stringify([
          input.actor,
          input.profile ?? null,
          input.action,
          input.error.detail,
        ])
      : undefined;
    if (kind !== undefined) {
      const minute = Math.floor(input.time / 60_000);
      if (minute !== this.rejectionMinute) {
        this.rejectionMinute = minute;
        this.rejectionsThisMinute.clear();
      }
      // Wrong passphrases are never merged: the lockout counts each one,
      // and it already caps them at 10 an hour.
      if (
        input.error?.detail !== "invalid_passphrase" &&
        this.rejectionsThisMinute.has(kind)
      )
        return;
    }
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
    if (kind !== undefined) this.rejectionsThisMinute.add(kind);
  }

  private perform<A>(
    action: AuthAction,
    profile: unknown,
    run: (time: number) => A,
    boundary?: ReadBoundary,
  ) {
    return Effect.gen({ self: this }, function* () {
      const time = yield* Clock.currentTimeMillis;
      return yield* Effect.try({
        try: () => {
          try {
            return (boundary?.transaction ?? this.transaction)(() => run(time));
          } catch (error) {
            if (
              !(error instanceof AuthError) ||
              boundary?.recordRejection === false
            )
              throw error;
            const target =
              Schema.is(ProfileId)(profile) &&
              this.db.query("SELECT 1 FROM profiles WHERE id=?").get(profile)
                ? profile
                : null;
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
          cause instanceof AuthError ? cause : new StoreError(cause),
      });
    });
  }

  private requireCredential(
    input: { credential: string },
    time: number,
    access: "owner" | "read" | "write" | "profiles",
    profile: ProfileId | null = null,
  ) {
    const { credential } = parse(OwnerRequest, input);
    if (!/^(ses|tok)_[a-f0-9]{64}$/.test(credential))
      throw new AuthError("invalid_credential");
    const row = this.db
      .query(`SELECT ${credentialColumns} FROM credentials WHERE secret_hash=?`)
      .get(sha256(credential));
    if (row === null) throw new AuthError("invalid_credential");
    const value = Schema.decodeUnknownSync(CredentialInfo)(row);
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
    if (
      profile !== null &&
      this.db
        .query("SELECT 1 FROM profile_deletions WHERE profile=?")
        .get(profile)
    )
      throw new AuthError("profile_deleted", value.id);
    this.ports.credentialUsed?.(value.id, time);
    return value;
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
      reads: Pick<Authentication<Read>, "profiles" | "read">,
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
              read: (input) => this.readWithin(input, boundary),
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

  private profilesWithin = (
    input: { readonly credential: string },
    boundary?: ReadBoundary,
  ) =>
    this.perform(
      "read",
      null,
      (time) => {
        const credential = this.requireCredential(input, time, "profiles");
        return this.ports
          .profiles()
          .filter(
            (profile) =>
              credential.profile === null || profile.id === credential.profile,
          );
      },
      boundary,
    );

  readonly read = (input: AccessRequest) => this.readWithin(input);

  private readWithin = (input: AccessRequest, boundary?: ReadBoundary) =>
    this.perform(
      "read",
      input.profile,
      (time) => {
        const request = parse(AccessRequest, input);
        this.requireCredential(request, time, "read", request.profile);
        return this.ports.read(request.profile);
      },
      boundary,
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
        const targets = changes(input.event);
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
      return this.ports.startSeries({
        actor: Schema.decodeUnknownSync(ActorId)(credential.id),
        profile: request.profile,
        series: request.series,
        ...(request.external_id === undefined
          ? {}
          : { external_id: request.external_id }),
        ...(request.project === undefined ? {} : { project: request.project }),
        ...(request.tags === undefined ? {} : { tags: request.tags }),
        task_id: request.task_id,
        occurrence_id: request.occurrence_id,
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
    this.perform("mutate", input.profile, (time) => {
      const request = parse(AccessRequest, input);
      const credential = this.requireCredential(
        request,
        time,
        "write",
        request.profile,
      );
      const result = Effect.runSyncExit(
        operation({
          actor: Schema.decodeUnknownSync(ActorId)(credential.id),
          profile: request.profile,
        }),
      );
      if (Exit.isFailure(result)) throw Cause.squash(result.cause);
      return result.value;
    });

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
