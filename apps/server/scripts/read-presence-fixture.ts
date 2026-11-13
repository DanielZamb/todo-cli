import { setSystemTime } from "bun:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { Instant, Profile, ProfileId, TaskId } from "@todo/domain";
import { openStore, TaskCommands } from "@todo/domain/store";
import { Effect, Schema } from "effect";

const root = resolve(process.argv[2] ?? ".scratch/server-reads/strict-absent");
assert.ok(root.startsWith(resolve(".scratch") + "/"));
assert.ok(!existsSync(join(root, "fixture.db")));
mkdirSync(root, { recursive: true });
const run = Effect.runPromise,
  store = await run(openStore({ path: join(root, "fixture.db") }));
const at = "2026-11-01T18:00:00.000Z";
setSystemTime(new Date(at));
try {
  const profile = (id: string, name = id) =>
    Schema.decodeUnknownSync(Profile)({
      id,
      name,
      created_at: at,
      updated_at: at,
    });
  for (const id of ["work", "personal", "deleted", "reused"])
    await run(store.putProfile(profile(id)));
  await run(store.auth.setupOwner("absent scratch only passphrase"));
  const expired = await run(
    store.auth.signIn("absent scratch only passphrase"),
  );
  const expiredToken = await run(
    store.auth.issueToken({
      credential: expired.credential,
      token: {
        name: "expired",
        profile: null,
        scope: "read-only",
        expires_at: Schema.decodeUnknownSync(Instant)("2026-11-02T18:00:00Z"),
      },
    }),
  );
  setSystemTime(new Date("2026-11-11T18:00:00Z"));
  const owner = await run(store.auth.signIn("absent scratch only passphrase")),
    revoked = await run(store.auth.signIn("absent scratch only passphrase"));
  await run(store.auth.signOut({ credential: revoked.credential }));
  for (const id of ["deleted", "reused"])
    await run(
      store.auth.deleteProfile({
        credential: owner.credential,
        profile: Schema.decodeUnknownSync(ProfileId)(id),
        options: { dry_run: false, with_tasks: false },
      }),
    );
  const reused = await run(store.ensureProfile(profile("reused")));
  const credentials: Record<string, string | null> = {
    none: null,
    invalid: "invalid",
    expiredSession: expired.credential,
    revokedSession: revoked.credential,
    owner: owner.credential,
    expiredToken: expiredToken.credential,
  };
  for (const [name, profileId] of [
    ["unscoped", null],
    ["other", "personal"],
    ["work", "work"],
    ["revokedToken", null],
  ] as const) {
    const token = await run(
      store.auth.issueToken({
        credential: owner.credential,
        token: {
          name,
          profile:
            profileId === null
              ? null
              : Schema.decodeUnknownSync(ProfileId)(profileId),
          scope: "read-only",
        },
      }),
    );
    credentials[name] = token.credential;
    if (name === "revokedToken")
      await run(store.auth.revokeToken({ credential: owner.credential, name }));
  }
  const created = await run(
    new TaskCommands(store).create(
      {
        credential: owner.credential,
        profile: Schema.decodeUnknownSync(ProfileId)("work"),
      },
      { title: "Present sentinel" },
      { task_id: Schema.decodeUnknownSync(TaskId)("ab-present") },
    ),
  );
  if (created.outcome !== "committed") throw Error(created.outcome);
  const shortToken = await run(
    store.auth.issueToken({
      credential: owner.credential,
      token: {
        name: "short",
        profile: null,
        scope: "read-only",
        expires_at: Schema.decodeUnknownSync(Instant)("2026-11-11T18:00:01Z"),
      },
    }),
  );
  setSystemTime(new Date("2026-11-12T18:00:00Z"));
  const controller = await run(
    store.auth.signIn("absent scratch only passphrase"),
  );
  setSystemTime(new Date("2026-11-11T18:00:00Z"));
  writeFileSync(
    join(root, "fixture.json"),
    JSON.stringify({
      path: join(root, "fixture.db"),
      controller: controller.credential,
      shortToken: shortToken.credential,
      credentials,
      profiles: {
        present: "work",
        never: "never-created",
        tombstoned: "deleted",
        reusedId: reused.id,
        reusedName: reused.name,
        oldReusedId: "reused",
      },
    }),
  );
} finally {
  await run(store.close());
}
