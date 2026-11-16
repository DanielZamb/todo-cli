import assert from "node:assert/strict";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { diagnosticFixture } from "../../../../apps/server/scripts/diagnostic-fixture.ts";
import { topPanes } from "../../../../apps/cli/src/top.ts";
import { DiagnosticsSnapshot } from "../../../../packages/domain/src/index.ts";
import { modelBatch } from "../../../../packages/domain/test/fixtures/recording-authority.ts";
import { Schema } from "effect";

// A store left by an initializer killed before its first commit is refused,
// named to the owner with its reason and files, and recovers exactly by the
// stated way out: stop the server, remove the files, start it again.
const evidence = resolve(
  process.argv[2] ?? "docs/evidence/ui-speed/recordings-refusal-visibility",
);
mkdirSync(evidence, { recursive: true });
const f = await diagnosticFixture(true, 1);
const directory = join(f.scratch, "diagnostic-recordings");
const headers = {
  Authorization: "Bearer " + f.credential,
  "Content-Type": "application/json",
};
const snapshot = () =>
  readdirSync(directory)
    .sort()
    .map((name) => ({
      name,
      mode: statSync(join(directory, name)).mode & 0o777,
      sha256: createHash("sha256")
        .update(readFileSync(join(directory, name)))
        .digest("hex"),
    }));
let server: ChildProcess | undefined;
const stop = async (c: ChildProcess | undefined) => {
  if (!c || c.exitCode !== null || c.signalCode !== null) return;
  const done = new Promise<void>((r) => c.once("exit", () => r()));
  c.kill("SIGTERM");
  await done;
};
const start = async () => {
  const child = spawn(resolve(".scratch/bin/todo-server"), [], {
    env: f.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  child.stdout?.on("data", (x) => (log += x));
  child.stderr?.on("data", (x) => (log += x));
  let url = "";
  const listening = Date.now() + 60000;
  while (!url && Date.now() < listening) {
    assert.equal(child.exitCode, null, log);
    url = log.match(/Listening on (http:\/\/127\.0\.0\.1:\d+)/)?.[1] ?? "";
    if (!url) await Bun.sleep(5);
  }
  assert.ok(url, log);
  return { child, url };
};
const diagnostics = async (url: string) => {
  const r = await fetch(url + "/diagnostics", { headers });
  assert.equal(r.status, 200);
  return Schema.decodeUnknownSync(DiagnosticsSnapshot)(await r.json());
};
const refusalEntry = (body: typeof DiagnosticsSnapshot.Type) =>
  body.errors.find((e) => e.code.startsWith("Recordings refused:"));
const result: Record<string, unknown> = {};
try {
  await stop(f.server);
  rmSync(directory, { recursive: true, force: true });
  mkdirSync(directory, { mode: 0o700 });
  writeFileSync(join(directory, "recordings.db"), "", { mode: 0o600 });
  writeFileSync(join(directory, "recordings.db-journal"), Buffer.alloc(512, 7), {
    mode: 0o600,
  });
  const before = snapshot();
  let started = await start();
  server = started.child;
  let entry: ReturnType<typeof refusalEntry>;
  const seen = Date.now() + 60000;
  while (!entry && Date.now() < seen) {
    entry = refusalEntry(await diagnostics(started.url));
    if (!entry) await Bun.sleep(50);
  }
  assert.ok(entry);
  const files = [
    join(directory, "recordings.db"),
    join(directory, "recordings.db-journal"),
  ];
  assert.equal(
    entry.code,
    "Recordings refused: interrupted_initialization. recordings.db is empty beside a non-empty -journal: initialization stopped before its first commit, and the store cannot prove the journal is its own.",
  );
  assert.equal(
    entry.route,
    `Recording storage. Recordings are diagnostic data and may be discarded; Task service is unaffected. Stop the server, remove ${files.join(", ")}, then start it again to create an empty store.`,
  );
  const task = await fetch(started.url + "/profiles/work/tasks", {
    headers,
  });
  assert.equal(task.status, 200);
  const cli = (format: string) =>
    spawnSync(
      resolve(".scratch/bin/todo"),
      ["--profile", "work", "diagnostics", "--server", started.url, "--format", format],
      { env: f.env, encoding: "utf8" },
    );
  const json = cli("json");
  assert.equal(json.status, 0, json.stderr);
  const cliEntry = refusalEntry(
    Schema.decodeUnknownSync(Schema.fromJsonString(DiagnosticsSnapshot))(
      json.stdout,
    ),
  );
  assert.deepEqual(cliEntry && { code: cliEntry.code, route: cliEntry.route }, {
    code: entry.code,
    route: entry.route,
  });
  const md = cli("md");
  assert.equal(md.status, 0, md.stderr);
  assert.ok(md.stdout.includes(`## Recording storage\n\n${entry.code}\n\n${entry.route}\n`));
  const pane = topPanes(await diagnostics(started.url), null).find(
    (p) => p.title === "Recent errors",
  );
  assert.ok(pane);
  const wrapped = pane.lines.slice(
    pane.lines.findIndex((line) => line.includes("Recordings refused:")),
  );
  assert.ok(wrapped.length > 2 && wrapped.every((line) => [...line].length <= 46), pane.lines.join("\n"));
  const joined = wrapped.join("");
  for (const file of files) assert.ok(joined.includes(file), file);
  assert.ok(joined.includes("interrupted_initialization"));
  assert.ok(joined.includes("may be discarded"));
  assert.deepEqual(snapshot(), before);
  result.refused = { entry, md: md.stdout, pane: pane.lines, files: before };
  await stop(server);
  for (const file of files) rmSync(file);
  started = await start();
  server = started.child;
  let upload = 0;
  const ready = Date.now() + 60000;
  while (Date.now() < ready) {
    const r = await fetch(started.url + "/diagnostics/profiler/ingest", {
      method: "POST",
      headers,
      body: JSON.stringify(modelBatch()),
    });
    upload = r.status;
    if (upload === 200) break;
    await Bun.sleep(50);
  }
  assert.equal(upload, 200);
  assert.equal(refusalEntry(await diagnostics(started.url)), undefined);
  result.recovered = { upload, files: snapshot().map((x) => x.name) };
  writeFileSync(
    join(evidence, "result.json"),
    JSON.stringify({ result: "PASS", ...result }, null, 2),
  );
} catch (error) {
  writeFileSync(
    join(evidence, "result.json"),
    JSON.stringify(
      { result: "FAIL", error: String(error), log: f.log(), ...result },
      null,
      2,
    ),
  );
  throw error;
} finally {
  await stop(server);
  await f.close();
}
