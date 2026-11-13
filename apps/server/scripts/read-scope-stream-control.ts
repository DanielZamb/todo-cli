import { Database } from "bun:sqlite";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as pause } from "node:timers/promises";
import { Schema } from "effect";

const Fixture = Schema.Struct({
  path: Schema.String,
  controller: Schema.String,
  shortToken: Schema.String,
  credentials: Schema.Struct({
    owner: Schema.String,
    work: Schema.String,
    unscoped: Schema.String,
  }),
});
const [before, after, cliBefore, cliAfter, manifest, output] =
  process.argv.slice(2);
assert.ok(before && after && cliBefore && cliAfter && manifest && output);
const fixture = Schema.decodeUnknownSync(Fixture)(
  JSON.parse(readFileSync(manifest, "utf8")),
);
assert.ok(fixture.path.startsWith(`${resolve(".scratch")}/`));
const initialTime = Date.parse("2026-11-11T18:00:00Z");
const uuids = [
  "00000000-0000-4000-8000-000000000011",
  "00000000-0000-4000-8000-000000000012",
  "00000000-0000-4000-8000-000000000013",
] as const;
type FinalCredential = {
  kind: "session" | "token";
  profile: string | null;
  revoked: boolean;
  expired: boolean;
  readAccess: boolean;
};
type PassCheck =
  | { kind: "not-observed" }
  | { kind: "missing" }
  | { kind: "live" | "ended"; credential: FinalCredential };
const deletionStates = new Map<string, FinalCredential>([
  [
    "delete-owner",
    {
      kind: "session",
      profile: null,
      revoked: false,
      expired: false,
      readAccess: true,
    },
  ],
  [
    "delete-unscoped",
    {
      kind: "token",
      profile: null,
      revoked: false,
      expired: false,
      readAccess: true,
    },
  ],
  [
    "delete-scoped",
    {
      kind: "token",
      profile: "work",
      revoked: true,
      expired: false,
      readAccess: true,
    },
  ],
  [
    "delete-revoked-token",
    {
      kind: "token",
      profile: null,
      revoked: true,
      expired: false,
      readAccess: true,
    },
  ],
  [
    "delete-revoked-session",
    {
      kind: "session",
      profile: null,
      revoked: true,
      expired: false,
      readAccess: true,
    },
  ],
  [
    "delete-expired-token",
    {
      kind: "token",
      profile: null,
      revoked: false,
      expired: true,
      readAccess: true,
    },
  ],
  [
    "delete-expired-session",
    {
      kind: "session",
      profile: null,
      revoked: false,
      expired: true,
      readAccess: true,
    },
  ],
]);
type Frame = {
  raw: string;
  event: string;
  id: string | undefined;
  data: unknown;
};
async function* frames(response: Response): AsyncGenerator<Frame> {
  const reader = response.body?.getReader();
  assert.ok(reader);
  let pending = "";
  const decoder = new TextDecoder();
  try {
    while (true) {
      const row = await reader.read();
      if (row.done) return;
      pending += decoder.decode(row.value, { stream: true });
      for (
        let end = pending.indexOf("\n\n");
        end >= 0;
        end = pending.indexOf("\n\n")
      ) {
        const raw = pending.slice(0, end + 2);
        pending = pending.slice(end + 2);
        const fields = Object.fromEntries(
          raw
            .trimEnd()
            .split("\n")
            .map((line) => {
              const colon = line.indexOf(":");
              return [line.slice(0, colon), line.slice(colon + 1).trimStart()];
            }),
        );
        assert.ok(fields.event);
        yield {
          raw,
          event: fields.event,
          id: fields.id,
          data: JSON.parse(fields.data ?? "null"),
        };
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
}
const restoreStates = ["tombstoned", "active", "absent"] as const;
const restoreSubjects = [
  "owner",
  "unscoped",
  "scoped",
  "revoked-token",
  "revoked-session",
  "expired-token",
  "expired-session",
] as const;
const restoreCases = new Map<
  string,
  {
    state: (typeof restoreStates)[number];
    subject: (typeof restoreSubjects)[number];
  }
>(
  restoreStates.flatMap((state) =>
    restoreSubjects.map(
      (subject) => [`restore-${state}-${subject}`, { state, subject }] as const,
    ),
  ),
);
const scenarios = [
  "never-created",
  "ordering-reconnect",
  "restore",
  "revoke-token",
  "revoke-session",
  "expire-token",
  "expire-session",
  "delete-owner",
  "delete-scoped",
  "delete-unscoped",
  "delete-unscoped-read-write",
  "delete-revoked-token",
  "delete-revoked-session",
  "delete-expired-token",
  "delete-expired-session",
  ...restoreCases.keys(),
  "restore-direct-removed",
];
restoreCases.set("restore-direct-removed", {
  state: "absent",
  subject: "scoped",
});
async function run(
  binary: string,
  cli: string,
  scenario: string,
): Promise<{
  frames: string[];
  finalCredential: FinalCredential | null;
  revokedBeforeRestore: boolean;
  passCheck: PassCheck;
  beforeRestore: FinalCredential | null;
}> {
  const restoration = restoreCases.get(scenario);
  const directory = mkdtempSync(join(tmpdir(), "todo-stream-scope-"));
  const path = join(directory, "scratch.db"),
    clock = join(directory, "clock"),
    gate = join(directory, "gate");
  copyFileSync(fixture.path, path);
  writeFileSync(clock, String(initialTime));
  writeFileSync(gate, "open");
  const home = join(directory, "home");
  mkdirSync(join(home, ".todo-cli"), { recursive: true, mode: 0o700 });
  writeFileSync(
    join(home, ".todo-cli", "session_control.json"),
    JSON.stringify({ token: fixture.credentials.owner }),
    { mode: 0o600 },
  );
  const child = spawn(resolve(binary), [], {
    env: {
      ...process.env,
      HOME: home,
      TODO_DB: path,
      READ_CONTROL_CLOCK_FILE: clock,
      READ_CONTROL_POLL_GATE: gate,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  child.stdout.on("data", (chunk: Buffer) => {
    log += chunk.toString();
  });
  child.stderr.on("data", (chunk: Buffer) => {
    log += chunk.toString();
  });
  const controllers: AbortController[] = [],
    received: Frame[] = [];
  let finalCredential: FinalCredential | null = null;
  let revokedBeforeRestore = false;
  let passCheck: PassCheck = { kind: "not-observed" };
  let beforeRestore: FinalCredential | null = null;
  try {
    const deadline = performance.now() + 30000;
    while (!/Listening on http:\/\/127.0.0.1:\d+/.test(log)) {
      assert.equal(child.exitCode, null, log);
      assert.ok(performance.now() < deadline, log);
      await pause(20);
    }
    const base = log.match(/Listening on (http:\/\/127.0.0.1:\d+)/)?.[1];
    assert.ok(base);
    const request = async (
      method: string,
      route: string,
      body?: unknown,
      credential = fixture.credentials.owner,
      expected = 200,
    ): Promise<unknown> => {
      const response: Response = await fetch(base + route, {
        method,
        headers: {
          Authorization: `Bearer ${credential}`,
          "Content-Type": "application/json",
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const text = await response.text();
      assert.equal(response.status, expected, `${route}: ${text}`);
      return text === "" ? null : JSON.parse(text);
    };
    const credentialState = (credential: string): FinalCredential | null => {
      const db = new Database(path, { readonly: true });
      try {
        const row = Schema.decodeUnknownSync(
          Schema.NullOr(
            Schema.Struct({
              kind: Schema.Literals(["session", "token"]),
              profile: Schema.NullOr(Schema.String),
              scope: Schema.Literals(["read-only", "read-write"]),
              expires_at: Schema.String,
              revoked_at: Schema.NullOr(Schema.String),
            }),
          ),
        )(
          db
            .query(
              "SELECT kind,profile,scope,expires_at,revoked_at FROM credentials WHERE secret_hash=?",
            )
            .get(createHash("sha256").update(credential).digest("hex")),
        );
        return row === null
          ? null
          : {
              kind: row.kind,
              profile: row.profile,
              revoked: row.revoked_at !== null,
              expired:
                Number(readFileSync(clock, "utf8")) >=
                Date.parse(row.expires_at),
              readAccess:
                row.scope === "read-only" || row.scope === "read-write",
            };
      } finally {
        db.close();
      }
    };
    const connect = async (
      credential: string,
      profile: string,
      cursor: string,
    ) => {
      const controller = new AbortController();
      controllers.push(controller);
      const response = await fetch(`${base}/profiles/${profile}/events`, {
        signal: AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(15000),
        ]),
        headers: {
          Authorization: `Bearer ${credential}`,
          "Last-Event-ID": cursor,
          "X-Todo-Generation": "initial",
        },
      });
      assert.equal(response.status, 200);
      return frames(response);
    };
    const next = async (reader: AsyncGenerator<Frame>) => {
      const row = await reader.next();
      assert.equal(row.done, false, `${scenario}: unexpected close`);
      assert.ok(row.value);
      received.push(row.value);
      return row.value;
    };
    const cliWrite = (profile: string, id: string, title: string) => {
      const result = spawnSync(
        resolve(cli),
        [
          "--db",
          path,
          "--profile",
          profile,
          "--credential-profile",
          "control",
          "--format",
          "json",
          "add",
          title,
        ],
        {
          env: { ...process.env, HOME: home, READ_CONTROL_UUID: id },
          encoding: "utf8",
          timeout: 10000,
        },
      );
      assert.equal(result.status, 0, result.stdout + result.stderr);
      assert.ok(result.stdout.includes(id), result.stdout);
    };
    let credential =
      scenario.includes("expired-token") || scenario === "expire-token"
        ? fixture.shortToken
        : (scenario.includes("scoped") && !scenario.includes("unscoped")) ||
            scenario === "revoke-token"
          ? fixture.credentials.work
          : scenario.includes("unscoped") || scenario.includes("revoked-token")
            ? fixture.credentials.unscoped
            : fixture.credentials.owner;
    const profile =
      scenario === "never-created"
        ? "never-created"
        : restoration?.state === "absent"
          ? "never-restored"
          : "work";
    const retainExpiryFixture = () => {
      const db = new Database(path);
      try {
        const hash = createHash("sha256").update(credential).digest("hex");
        db.exec(
          "CREATE TRIGGER IF NOT EXISTS read_control_keep_expired BEFORE DELETE ON credentials " +
            "WHEN OLD.secret_hash='" +
            hash +
            "' BEGIN SELECT RAISE(IGNORE); END",
        );
      } finally {
        db.close();
      }
    };
    const observeCredential = () => {
      finalCredential = credentialState(credential);
      passCheck =
        finalCredential === null
          ? { kind: "missing" }
          : {
              kind:
                !finalCredential.revoked &&
                !finalCredential.expired &&
                finalCredential.readAccess &&
                (finalCredential.profile === null ||
                  finalCredential.profile === profile)
                  ? "live"
                  : "ended",
              credential: finalCredential,
            };
      return finalCredential;
    };
    const initProfile = () => {
      const initialized = spawnSync(
        resolve(cli),
        ["--db", path, "--profile", profile, "--format", "json", "init"],
        {
          env: { ...process.env, HOME: home },
          encoding: "utf8",
          timeout: 10000,
        },
      );
      assert.equal(
        initialized.status,
        0,
        initialized.stdout + initialized.stderr,
      );
    };
    let saved: { id: string } | undefined;
    if (scenario === "delete-unscoped-read-write") {
      const issued = Schema.decodeUnknownSync(
        Schema.Struct({
          credential: Schema.String,
          kind: Schema.Literal("token"),
          profile: Schema.Null,
          scope: Schema.Literal("read-write"),
        }),
      )(
        await request("POST", "/auth/tokens", {
          name: "unscoped-read-write",
          profile: null,
          scope: "read-write",
        }),
      );
      credential = issued.credential;
    }
    if (restoration && restoration.state !== "tombstoned") {
      saved = Schema.decodeUnknownSync(Schema.Struct({ id: Schema.String }))(
        await request("POST", "/snapshots", {
          reason: "stream restore matrix",
        }),
      );
      if (restoration.state === "absent") {
        initProfile();
        cliWrite(profile, uuids[0], "Created after absent Snapshot");
        if (restoration.subject === "scoped") {
          const issued = Schema.decodeUnknownSync(
            Schema.Struct({ credential: Schema.String }),
          )(
            await request("POST", "/auth/tokens", {
              name: "restore-scoped",
              profile,
              scope: "read-only",
            }),
          );
          credential = issued.credential;
        }
      }
    }
    const metadata = new Database(path, { readonly: true });
    const initialCursor =
      metadata
        .query<{ seq: number }, []>(
          "SELECT coalesce(max(seq),0) AS seq FROM op_log",
        )
        .get()?.seq ?? 0;
    metadata.close();
    let reader = await connect(credential, profile, String(initialCursor));
    assert.equal((await next(reader)).raw, "event: ready\ndata: null\n\n");
    if (restoration) {
      writeFileSync(gate, "closed");
      if (scenario !== "restore-direct-removed")
        await request(
          "DELETE",
          `/profiles/${profile}`,
          { with_tasks: true, dry_run: false },
          fixture.controller,
        );
      revokedBeforeRestore = credentialState(credential)?.revoked ?? false;
      beforeRestore = credentialState(credential);
      if (scenario === "restore-direct-removed")
        assert.deepEqual(
          beforeRestore,
          {
            kind: "token",
            profile: "never-restored",
            revoked: false,
            expired: false,
            readAccess: true,
          },
          "direct restore: credential is live before restore",
        );
      if (restoration.state === "tombstoned") {
        saved = Schema.decodeUnknownSync(Schema.Struct({ id: Schema.String }))(
          await request("POST", "/snapshots", {
            reason: "stream tombstoned restore",
          }),
        );
      }
      assert.ok(saved);
      await request("POST", `/snapshots/${saved.id}/restore`, {
        dry_run: false,
      });
      if (restoration.subject === "revoked-token")
        await request(
          "DELETE",
          "/auth/tokens/unscoped",
          undefined,
          fixture.controller,
          204,
        );
      if (restoration.subject === "revoked-session")
        await request(
          "DELETE",
          "/auth/session",
          undefined,
          fixture.credentials.owner,
          204,
        );
      if (restoration.subject === "expired-token") {
        retainExpiryFixture();
        writeFileSync(clock, String(initialTime + 1000));
      }
      if (restoration.subject === "expired-session") {
        retainExpiryFixture();
        writeFileSync(clock, String(initialTime + 7 * 86400000));
      }
      finalCredential = observeCredential();
      assert.deepEqual(
        finalCredential,
        restoration.state === "absent" && restoration.subject === "scoped"
          ? null
          : deletionStates.get(`delete-${restoration.subject}`),
        `${scenario}: literal final credential state`,
      );
      assert.equal(
        revokedBeforeRestore,
        restoration.subject === "scoped" &&
          scenario !== "restore-direct-removed",
        `${scenario}: deletion revocation before restore`,
      );
      const invalid =
        finalCredential === null ||
        finalCredential.revoked ||
        finalCredential.expired;
      assert.equal(
        invalid,
        restoration.subject !== "owner" && restoration.subject !== "unscoped",
        `${scenario}: final credential validity`,
      );
      writeFileSync(gate, "open");
      const first = await next(reader);
      if (first.event === "reload") {
        if (restoration.state !== "tombstoned" && !invalid) {
          if (restoration.state === "absent") initProfile();
          cliWrite(profile, uuids[2], "After restored Profile state");
          const operation = await next(reader);
          assert.equal(operation.event, "operation");
          assert.equal(operation.id, "19");
          const data = Schema.decodeUnknownSync(
            Schema.Struct({
              profile: Schema.String,
              event: Schema.Struct({
                kind: Schema.String,
                task: Schema.Struct({
                  id: Schema.String,
                  title: Schema.String,
                }),
              }),
            }),
          )(operation.data);
          assert.deepEqual(
            [
              data.profile,
              data.event.kind,
              data.event.task.id,
              data.event.task.title,
            ],
            [profile, "TaskCreated", uuids[2], "After restored Profile state"],
          );
        } else {
          assert.equal(
            (await next(reader)).event,
            "effect/http-api/stream/failure",
          );
          assert.equal((await reader.next()).done, true);
        }
      } else {
        assert.equal(first.event, "effect/http-api/stream/failure");
        assert.equal((await reader.next()).done, true);
      }
    } else if (scenario === "never-created") {
      const initialized = spawnSync(
        resolve(cli),
        ["--db", path, "--profile", profile, "--format", "json", "init"],
        {
          env: { ...process.env, HOME: home },
          encoding: "utf8",
          timeout: 10000,
        },
      );
      assert.equal(
        initialized.status,
        0,
        initialized.stdout + initialized.stderr,
      );
      cliWrite(profile, uuids[0] ?? "", "First write creates Profile");
      const event = await next(reader);
      assert.equal(event.event, "operation");
      const data = Schema.decodeUnknownSync(
        Schema.Struct({
          profile: Schema.String,
          event: Schema.Struct({
            kind: Schema.String,
            task: Schema.Struct({ id: Schema.String, title: Schema.String }),
          }),
        }),
      )(event.data);
      assert.deepEqual(
        [
          data.profile,
          data.event.kind,
          data.event.task.id,
          data.event.task.title,
        ],
        [
          "never-created",
          "TaskCreated",
          uuids[0],
          "First write creates Profile",
        ],
      );
    } else if (scenario === "ordering-reconnect") {
      cliWrite("work", uuids[0] ?? "", "First ordered Task");
      const first = await next(reader);
      cliWrite("personal", uuids[1] ?? "", "Private unrelated Task");
      cliWrite("work", uuids[2] ?? "", "Second ordered Task");
      const second = await next(reader);
      assert.ok(Number(second.id) > Number(first.id) + 1);
      controllers.at(-1)?.abort();
      await reader.return(undefined);
      reader = await connect(credential, "work", first.id ?? "");
      assert.equal((await next(reader)).event, "ready");
      assert.equal((await next(reader)).raw, second.raw);
    } else if (scenario === "restore") {
      writeFileSync(gate, "closed");
      const saved = Schema.decodeUnknownSync(
        Schema.Struct({ id: Schema.String }),
      )(
        await request("POST", "/snapshots", { reason: "stream scope restore" }),
      );
      cliWrite("work", uuids[0] ?? "", "Rolled back by restore");
      await request("POST", `/snapshots/${saved.id}/restore`, {
        dry_run: false,
      });
      cliWrite("work", uuids[2] ?? "", "After restore");
      observeCredential();
      writeFileSync(gate, "open");
      assert.equal((await next(reader)).event, "reload");
      assert.equal((await next(reader)).event, "operation");
    } else {
      writeFileSync(gate, "closed");
      cliWrite("work", uuids[0] ?? "", "Pending before terminal transition");
      if (scenario.includes("revoked-token") || scenario === "revoke-token")
        await request(
          "DELETE",
          `/auth/tokens/${scenario === "revoke-token" ? "work" : "unscoped"}`,
          undefined,
          fixture.controller,
          204,
        );
      if (scenario.includes("revoked-session") || scenario === "revoke-session")
        await request(
          "DELETE",
          "/auth/session",
          undefined,
          fixture.credentials.owner,
          204,
        );
      if (scenario.includes("expired-token") || scenario === "expire-token") {
        retainExpiryFixture();
        writeFileSync(clock, String(initialTime + 1000));
      }
      if (
        scenario.includes("expired-session") ||
        scenario === "expire-session"
      ) {
        retainExpiryFixture();
        writeFileSync(clock, String(initialTime + 7 * 86400000));
      }
      if (scenario.startsWith("delete-"))
        await request(
          "DELETE",
          "/profiles/work",
          { with_tasks: true, dry_run: false },
          fixture.controller,
        );
      if (scenario.startsWith("delete-")) {
        const db = new Database(path, { readonly: true });
        try {
          const row = Schema.decodeUnknownSync(
            Schema.Struct({
              kind: Schema.Literals(["session", "token"]),
              profile: Schema.NullOr(Schema.String),
              scope: Schema.Literals(["read-only", "read-write"]),
              expires_at: Schema.String,
              revoked_at: Schema.NullOr(Schema.String),
            }),
          )(
            db
              .query(
                "SELECT kind,profile,scope,expires_at,revoked_at FROM credentials WHERE secret_hash=?",
              )
              .get(createHash("sha256").update(credential).digest("hex")),
          );
          finalCredential = {
            kind: row.kind,
            profile: row.profile,
            revoked: row.revoked_at !== null,
            expired:
              Number(readFileSync(clock, "utf8")) >= Date.parse(row.expires_at),
            readAccess: row.scope === "read-only" || row.scope === "read-write",
          };
          assert.deepEqual(
            finalCredential,
            deletionStates.get(
              scenario === "delete-unscoped-read-write"
                ? "delete-unscoped"
                : scenario,
            ),
            `${scenario}: final-pass credential state`,
          );
        } finally {
          db.close();
        }
      }
      observeCredential();
      writeFileSync(gate, "open");
      while (true) {
        const row = await reader.next();
        if (row.done) break;
        received.push(row.value);
      }
      assert.equal(received.at(-1)?.event, "effect/http-api/stream/failure");
    }
    if (passCheck.kind === "not-observed") observeCredential();
    return {
      frames: received.map((frame) => frame.raw),
      finalCredential,
      revokedBeforeRestore,
      passCheck,
      beforeRestore,
    };
  } finally {
    for (const controller of controllers) controller.abort();
    if (child.exitCode === null && child.signalCode === null) {
      const done = new Promise<void>((resolve) =>
        child.once("exit", () => resolve()),
      );
      child.kill("SIGTERM");
      await done;
    }
    rmSync(directory, { recursive: true, force: true });
  }
}
mkdirSync(output, { recursive: true });
const results = [];
const selected = Schema.decodeUnknownSync(
  Schema.Array(Schema.Literals(scenarios)),
)(process.env.READ_STREAM_SCENARIOS?.split(",") ?? scenarios);
for (const scenario of selected) {
  const baseline = await run(before, cliBefore, scenario);
  const candidate: Awaited<ReturnType<typeof run>> =
    process.env.READ_STREAM_CAPTURE_ONLY === "1"
      ? baseline
      : await run(after, cliAfter, scenario);
  const old = baseline.frames,
    current = candidate.frames;
  assert.deepEqual(
    candidate.finalCredential,
    baseline.finalCredential,
    scenario,
  );
  assert.deepEqual(
    candidate.passCheck,
    baseline.passCheck,
    `${scenario}: credential check at pass`,
  );
  assert.notEqual(
    candidate.passCheck.kind,
    "not-observed",
    `${scenario}: pass must be observed`,
  );
  const state = candidate.finalCredential;
  const restoration = restoreCases.get(scenario);
  const endedAuthority =
    candidate.passCheck.kind === "missing" ||
    candidate.passCheck.kind === "ended";
  const exceptionEligible =
    process.env.READ_STREAM_ENDED_MUTANT === "old-revocation-proxy"
      ? state !== null
        ? state.revoked || state.expired
        : restoration !== undefined && candidate.revokedBeforeRestore
      : endedAuthority;
  const approved =
    exceptionEligible &&
    (restoration !== undefined || scenario.startsWith("delete-"));
  const result = {
    scenario,
    finalCredential: state,
    revokedBeforeRestore: candidate.revokedBeforeRestore,
    approvedTerminalDifference: approved,
    endedAuthority,
    passCheck: candidate.passCheck,
    beforeRestore: candidate.beforeRestore,
    before: old,
    after: current,
  };
  writeFileSync(
    join(output, `${scenario}.json`),
    JSON.stringify(result, null, 2),
  );
  if (restoration) {
    assert.equal(old.length, 3, `${scenario}: literal base frame count`);
    assert.equal(
      old[1],
      `event: reload\ndata: {"generation":"00000000-0000-4000-8000-${scenario === "restore-direct-removed" ? "000000000009" : "000000000011"}","seq":${restoration.state === "tombstoned" ? 20 : 18}}\n\n`,
      `${scenario}: literal reload frame`,
    );
    if (approved) {
      const message =
        state === null
          ? "invalid_credential"
          : state.revoked
            ? "revoked"
            : "expired";
      assert.equal(
        old[2],
        `event: effect/http-api/stream/failure\ndata: [{"_tag":"Fail","error":{"_tag":"Unauthorized","message":"${message}","exit_code":3,"exit_meaning":"not found or auth missing"}}]\n\n`,
        `${scenario}: literal credential refusal`,
      );
    } else if (restoration.state === "tombstoned") {
      assert.equal(
        old[2],
        'event: effect/http-api/stream/failure\ndata: [{"_tag":"Fail","error":{"exit_code":3,"exit_meaning":"not found or auth missing","generated_at":"2026-11-11T18:00:00.000Z","code":"not_found","message":"Profile not found; choose a Profile from GET /profiles"}}]\n\n',
        `${scenario}: literal tombstone refusal`,
      );
    }
  }
  if (process.env.READ_STREAM_CAPTURE_ONLY === "1") {
    assert.ok(restoration);
  } else if (approved && restoration) {
    assert.equal(old[1]?.startsWith("event: reload\n"), true, scenario);
    assert.deepEqual(current, [old[0], old.at(-1)], scenario);
  } else if (approved) {
    assert.ok(
      old.some((raw) => raw.includes('"kind":"ProfileDeleted"')),
      scenario,
    );
    assert.deepEqual(current, [old[0], old.at(-1)], scenario);
  } else
    assert.deepEqual(
      current,
      old,
      restoration
        ? `${scenario}: valid credentials must retain reload before the restored Profile outcome`
        : `${scenario}: valid credentials must retain the base terminal batch`,
    );
  results.push({
    scenario,
    finalCredential: state,
    approvedTerminalDifference: approved,
    endedAuthority,
    passCheck: candidate.passCheck,
    beforeFrames: old.length,
    afterFrames: current.length,
  });
  writeFileSync(join(output, "result.json"), JSON.stringify(results, null, 2));
  console.log(`${scenario}: ${old.length}/${current.length} frames`);
}
