import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import { FetchHttpClient } from "effect/http";
import { taskHttpClient } from "../src/http-client.ts";

const [cli, binary, evidence] = process.argv.slice(2);
assert.ok(cli && binary && evidence);
mkdirSync(evidence, { recursive: true });
const scratch = mkdtempSync(join(tmpdir(), "todo-auth-sequence-"));
const env = {
  ...process.env,
  HOME: scratch,
  TODO_DB: join(scratch, "scratch.db"),
  TODO_PORT: "0",
};
const initialized = Bun.spawnSync(
  [cli, "--profile", "work", "init", "--password-stdin", "--format", "json"],
  {
    env,
    stdin: new TextEncoder().encode("auth sequence scratch\n"),
    timeout: 60000,
  },
);
assert.equal(initialized.exitCode, 0, initialized.stderr.toString());
const server = Bun.spawn([binary], {
  env,
  stdout: "pipe",
  stderr: "pipe",
  stdin: "ignore",
});
let log = "";
const collect = async (stream: ReadableStream<Uint8Array>) => {
  for await (const bytes of stream) log += new TextDecoder().decode(bytes);
};
const logs = Promise.all([collect(server.stdout), collect(server.stderr)]);
const requests: Array<{
  method: string;
  path: string;
  has_authorization: boolean;
  status: number;
}> = [];
let upstream = "";
const proxy = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  async fetch(request) {
    const path = new URL(request.url).pathname;
    const response = await fetch(upstream + path, {
      method: request.method,
      headers: request.headers,
      ...(request.method === "GET"
        ? {}
        : { body: await request.arrayBuffer() }),
    });
    requests.push({
      method: request.method,
      path,
      has_authorization: request.headers.has("Authorization"),
      status: response.status,
    });
    return response;
  },
});
try {
  const deadline = Date.now() + 60000;
  while (!/Listening on (http:\/\/127\.0\.0\.1:\d+)/.test(log)) {
    assert.ok(Date.now() < deadline, log);
    await Bun.sleep(20);
  }
  upstream = log.match(/http:\/\/127\.0\.0\.1:\d+/)?.[0] ?? "";
  let current: string | undefined;
  const result = await Effect.runPromise(
    Effect.gen(function* () {
      const http = yield* taskHttpClient(
        `http://127.0.0.1:${proxy.port}`,
        () => current,
      );
      const session = yield* http.signIn.signIn({
        payload: { passphrase: "auth sequence scratch" },
      });
      current = session.credential;
      const profiles = yield* Effect.result(http.reads.profiles());
      if (profiles._tag === "Failure")
        return {
          profiles: "Failure",
          error: String(profiles.failure),
          sign_out: "not reached",
          after_clear: "not reached",
        };
      assert.deepEqual(
        profiles.success.map((profile) => profile.id),
        ["work"],
      );
      yield* http.credentials.signOut();
      current = undefined;
      const after = yield* Effect.result(http.reads.profiles());
      return {
        profiles: "Success",
        sign_out: "Success",
        after_clear: after._tag,
      };
    }).pipe(Effect.provide(FetchHttpClient.layer)),
  );
  writeFileSync(
    join(evidence, "result.json"),
    JSON.stringify(
      {
        desired_behavior: result.profiles === "Success",
        one_client_instances: 1,
        factory_api: "credential getter",
        result,
        requests,
      },
      null,
      2,
    ),
  );
  assert.equal(
    result.profiles,
    "Success",
    "One client built while signed out must send the newly assigned credential on its next request",
  );
  assert.deepEqual(requests, [
    {
      method: "POST",
      path: "/auth/sessions",
      has_authorization: false,
      status: 200,
    },
    { method: "GET", path: "/profiles", has_authorization: true, status: 200 },
    {
      method: "DELETE",
      path: "/auth/session",
      has_authorization: true,
      status: 204,
    },
    { method: "GET", path: "/profiles", has_authorization: false, status: 401 },
  ]);
  assert.equal(result.after_clear, "Failure");
} finally {
  proxy.stop(true);
  server.kill("SIGTERM");
  const timer = setTimeout(() => server.kill("SIGKILL"), 3000);
  const exit = await server.exited;
  clearTimeout(timer);
  await logs;
  writeFileSync(join(evidence, "server.log"), log);
  writeFileSync(
    join(evidence, "cleanup.json"),
    JSON.stringify({ pid: server.pid, exit, scratch_removed: true }),
  );
  rmSync(scratch, { recursive: true, force: true });
}
