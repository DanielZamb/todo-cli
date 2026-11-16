import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { Effect } from "effect";
import { diagnosticFixture } from "../../../../apps/server/scripts/diagnostic-fixture.ts";
import { openStore } from "../../../../packages/domain/src/store/store.ts";
import { modelBatch } from "../../../../packages/domain/test/fixtures/recording-authority.ts";
const evidence = resolve(
  process.argv[2] ?? "docs/evidence/ui-speed/recordings-sqlite/revoked",
);
mkdirSync(evidence, { recursive: true });
const f = await diagnosticFixture(true, 0, [
    resolve(".scratch/bin/sqlite-auth-server"),
  ]),
  batch = modelBatch(),
  headers = {
    Authorization: "Bearer " + f.credential,
    "Content-Type": "application/json",
  };
try {
  assert.equal(
    (
      await fetch(f.url + "/diagnostics/profiler/ingest", {
        method: "POST",
        headers,
        body: JSON.stringify(batch),
      })
    ).status,
    200,
  );
  const other = modelBatch();
  assert.equal(
    (
      await fetch(f.url + "/diagnostics/profiler/ingest", {
        method: "POST",
        headers,
        body: JSON.stringify({
          ...other,
          run: {
            ...other.run,
            comparison: {
              ...other.run.comparison,
              environment_hash: "f".repeat(64),
            },
          },
        }),
      })
    ).status,
    200,
  );
  writeFileSync(join(f.scratch, "hold-ingest"), "hold");
  const pending =
    process.argv[3] === "read"
      ? fetch(
          f.url +
            "/diagnostics/profiler/compare?before=" +
            batch.run.run_id +
            "&after=" +
            other.run.run_id,
          { headers },
        )
      : fetch(f.url + "/diagnostics/profiler/ingest", {
          method: "POST",
          headers,
          body: JSON.stringify({
            ...batch,
            batch_id: randomUUID(),
            events: [{ ...batch.events[0], action_id: randomUUID() }],
          }),
        });
  const end = Date.now() + 60000;
  while (!existsSync(join(f.scratch, "ingest-held")) && Date.now() < end)
    await Bun.sleep(5);
  assert.ok(existsSync(join(f.scratch, "ingest-held")));
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const store = yield* Effect.acquireRelease(
          openStore({ path: f.env.TODO_DB }),
          (s) => Effect.orDie(s.close()),
        );
        yield* store.auth.signOut({ credential: f.credential });
      }),
    ),
  );
  writeFileSync(join(f.scratch, "release-ingest"), "release");
  const response = await pending,
    text = await response.text();
  writeFileSync(
    join(evidence, "result.json"),
    JSON.stringify({ status: response.status, text }, null, 2),
  );
  assert.equal(response.status, 401);
  assert.ok(!text.includes("conflicts"));
  assert.ok(!text.includes(batch.run.run_id));
} finally {
  writeFileSync(join(f.scratch, "release-ingest"), "release");
  await f.close();
}
