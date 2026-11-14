import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Schema } from "effect";
import {
  repositoryInput,
  repositoryPath,
  verificationRoot,
} from "../../../scripts/verification-inputs.ts";

const [cliPath, serverPath, evidencePath] = process.argv.slice(2);
if (!cliPath || !serverPath || !evidencePath)
  throw new Error(
    "Pass repo-relative compiled CLI, server and fresh evidence paths",
  );
const root = verificationRoot(import.meta.dirname);
const cli = repositoryInput(root, cliPath, "compiled CLI");
const serverBinary = repositoryInput(root, serverPath, "compiled server");
const evidence = repositoryPath(root, evidencePath, "amendment evidence");
mkdirSync(evidence, { recursive: false });
const scratch = mkdtempSync(join(tmpdir(), "todo-dag-amendment-"));
const env = {
  ...process.env,
  HOME: scratch,
  TODO_DB: join(scratch, "scratch.db"),
};
const object = Schema.decodeUnknownSync(
  Schema.Record(Schema.String, Schema.Json),
);
const string = Schema.decodeUnknownSync(Schema.String);
const actions: unknown[] = [];
const cases: { name: string; exit: number; error?: string }[] = [];
let server: ReturnType<typeof Bun.spawn> | undefined;
let serverLog = "";
let logs: Promise<void> | undefined;
let base = "";
let credential = "";

function run(args: string[], expected = 0, input = "") {
  const result = Bun.spawnSync([cli, ...args, "--format", "json"], {
    env,
    stdin: new TextEncoder().encode(input),
    timeout: 20000,
  });
  const stdout = result.stdout.toString();
  actions.push({
    transport: "CLI",
    args,
    exit: result.exitCode,
    stdout: ["init", "login"].includes(args[0] ?? "")
      ? "<credential reply omitted>"
      : stdout,
    stderr: result.stderr.toString(),
  });
  assert.equal(result.exitCode, expected, stdout + result.stderr.toString());
  return object(JSON.parse(stdout));
}

const add = (title: string) => object(run(["add", title]).task);
async function http(
  method: string,
  path: string,
  body?: Schema.Json,
  expected = 200,
) {
  const response = await fetch(base + path, {
    method,
    headers: {
      "content-type": "application/json",
      ...(credential ? { authorization: `Bearer ${credential}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const value = object(await response.json());
  actions.push({
    transport: "HTTP",
    method,
    path,
    status: response.status,
    body: path === "/auth/sessions" ? "<credential reply omitted>" : value,
  });
  assert.equal(response.status, expected, JSON.stringify(value));
  return value;
}

async function check(name: string, body: () => Promise<void>) {
  try {
    await body();
    cases.push({ name, exit: 0 });
  } catch (error) {
    cases.push({
      name,
      exit: 1,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function batch(transport: "CLI" | "HTTP") {
  const dependent = add(`Stale ${transport} dependent`),
    blocker = add(`Stale ${transport} blocker`);
  const id = string(dependent.id);
  run([
    "edit",
    id,
    "--expected-version",
    "1",
    "--title",
    "New authoritative title",
  ]);
  const body = {
    items: [
      {
        action: "depend",
        dependent_id: id,
        blocker_id: string(blocker.id),
        from_version: 1,
      },
    ],
    dry_run: true,
  };
  let reply: ReturnType<typeof object>;
  if (transport === "CLI") {
    const file = join(scratch, "batch.json");
    writeFileSync(file, JSON.stringify(body));
    reply = run(["batch-depend", "--file", file], 4);
  } else
    reply = await http("POST", "/profiles/default/dependencies/batch", body);
  const rows = Schema.decodeUnknownSync(
    Schema.Array(Schema.Record(Schema.String, Schema.Json)),
  )(reply.results);
  assert.equal(rows.length, 1);
  const failure = object(rows[0]?.error);
  assert.equal(failure.code, "occ_conflict");
  assert.notEqual(failure.code, "conflict");
  assert.equal(failure.exit_code, 4);
  assert.equal(failure.exit_meaning, "Conflict");
  assert.equal(object(failure.details).current_version, 2);
}

try {
  run(["init", "--password-stdin"], 0, "scratch amendment passphrase\n");
  run(["login", "--password-stdin"], 0, "scratch amendment passphrase\n");
  const child = Bun.spawn([serverBinary], {
    env: { ...env, TODO_PORT: "0" },
    stdout: "pipe",
    stderr: "pipe",
  });
  server = child;
  writeFileSync(
    join(evidence, "server.json"),
    JSON.stringify({ pid: server.pid, scratch }) + "\n",
  );
  const ready = Promise.withResolvers<string>();
  logs = (async () => {
    for await (const chunk of child.stdout) {
      serverLog += new TextDecoder().decode(chunk);
      const address = serverLog.match(
        /Listening on (http:\/\/127\.0\.0\.1:\d+)/u,
      )?.[1];
      if (address) ready.resolve(address);
    }
    ready.reject(new Error("Server exited before readiness"));
  })();
  const deadline = setTimeout(
    () =>
      ready.reject(new Error("Scratch server readiness exceeded 60 seconds")),
    60000,
  );
  try {
    base = await ready.promise;
  } finally {
    clearTimeout(deadline);
  }
  credential = string(
    (
      await http("POST", "/auth/sessions", {
        passphrase: "scratch amendment passphrase",
      })
    ).credential,
  );

  await check("CLI preview names its confirmation Version", async () => {
    const id = string(add("CLI confirmation Version").id);
    const before = run(["history", id]).entries;
    const preview = run(["rm", id, "--expected-version", "1", "--dry-run"]);
    assert.deepEqual(run(["history", id]).entries, before);
    assert.equal(object(preview.task).row_version, 2);
    assert.equal(preview.dry_run, true);
    assert.equal(preview.confirm_from_version, 1);
    const fingerprint = string(preview.dependency_fingerprint);
    const stale = run(
      [
        "rm",
        id,
        "--expected-version",
        "2",
        "--dependency-fingerprint",
        fingerprint,
      ],
      4,
    );
    assert.equal(stale.code, "occ_conflict");
    const confirmed = run([
      "rm",
      id,
      "--expected-version",
      String(preview.confirm_from_version),
      "--dependency-fingerprint",
      fingerprint,
    ]);
    assert.equal(confirmed.confirm_from_version, undefined);
    assert.equal(confirmed.dry_run, false);
    assert.equal(object(confirmed.task).row_version, 2);
    assert.notEqual(object(confirmed.task).deleted_at, null);
  });
  await check("HTTP preview names its confirmation Version", async () => {
    const id = string(add("HTTP confirmation Version").id),
      route = `/profiles/default/tasks/${id}`;
    const before = run(["history", id]).entries;
    const preview = await http(
      "DELETE",
      route + "?from_version=1&dry_run=true",
    );
    assert.deepEqual(run(["history", id]).entries, before);
    assert.equal(preview.row_version, 2);
    assert.equal(preview.dry_run, true);
    assert.equal(preview.confirm_from_version, 1);
    const fingerprint = string(preview.dependency_fingerprint);
    const stale = await http(
      "DELETE",
      route + `?from_version=2&dependency_fingerprint=${fingerprint}`,
      undefined,
      409,
    );
    assert.equal(stale._tag, "Conflict");
    assert.equal(stale.exit_code, 4);
    const confirmed = await http(
      "DELETE",
      route +
        `?from_version=${preview.confirm_from_version}&dependency_fingerprint=${fingerprint}`,
    );
    assert.equal(confirmed.confirm_from_version, undefined);
    assert.equal(confirmed.dry_run, false);
    assert.equal(confirmed.row_version, 2);
    assert.notEqual(confirmed.deleted_at, null);
  });
  await check("CLI batch conflict uses only occ_conflict", () => batch("CLI"));
  await check("HTTP batch conflict uses only occ_conflict", () =>
    batch("HTTP"),
  );
  await check(
    "compiled schemas and help explain confirmation Versions",
    async () => {
      const description =
        "Confirm with the Version you sent for the preview (confirm_from_version) and the returned fingerprint. The Task in a preview is the projected result; its Version is not the one to send.";
      const rm = run(["schema", "rm"]);
      assert.ok(JSON.stringify(rm).includes(description));
      assert.ok(string(run(["rm", "--help"]).text).includes(description));
      const batchSchema = run(["schema", "batch-depend"]);
      const enums: Schema.Json[][] = [];
      function visit(value: Schema.Json) {
        if (Array.isArray(value)) {
          for (const child of value) visit(child);
        } else if (value !== null && typeof value === "object") {
          for (const [key, child] of Object.entries(value)) {
            if (key === "enum" && Array.isArray(child)) enums.push(child);
            visit(child);
          }
        }
      }
      visit(batchSchema);
      assert.ok(enums.some((values) => values.includes("occ_conflict")));
      assert.ok(enums.every((values) => !values.includes("conflict")));
      const document = await http("GET", "/openapi.json");
      const operation = object(
        object(object(document.paths)["/profiles/{profile}/tasks/{task}"])
          .delete,
      );
      assert.equal(operation.description, description);
      const parameters = Schema.decodeUnknownSync(
        Schema.Array(Schema.Record(Schema.String, Schema.Json)),
      )(operation.parameters);
      assert.equal(
        parameters.find((parameter) => parameter.name === "from_version")
          ?.description,
        description,
      );
      const fields = object(
        object(object(object(document.components).schemas).TaskWrite)
          .properties,
      );
      assert.equal(
        object(fields.confirm_from_version).description,
        description,
      );
    },
  );
} finally {
  if (server) {
    server.kill();
    await server.exited;
  }
  await logs;
  writeFileSync(join(evidence, "server.log"), serverLog);
  rmSync(scratch, { recursive: true, force: true });
  writeFileSync(
    join(evidence, "actions.json"),
    JSON.stringify(actions, null, 2) + "\n",
  );
  writeFileSync(
    join(evidence, "result.json"),
    JSON.stringify(
      {
        cases,
        exit: cases.length === 5 && cases.every((x) => x.exit === 0) ? 0 : 1,
        scratchRemoved: true,
        binaries: [cli, serverBinary].map((path) => ({
          path,
          sha256: createHash("sha256").update(readFileSync(path)).digest("hex"),
        })),
      },
      null,
      2,
    ) + "\n",
  );
}
console.log(JSON.stringify(cases));
process.exitCode =
  cases.length === 5 && cases.every((x) => x.exit === 0) ? 0 : 1;
