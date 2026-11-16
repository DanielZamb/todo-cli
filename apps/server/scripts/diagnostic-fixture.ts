import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Schema } from "effect";

export async function diagnosticFixture(
  recording: boolean,
  count: number,
  serverCommand: readonly [string, ...string[]] = [
    resolve(".scratch/bin/todo-server"),
  ],
) {
  const scratch = mkdtempSync(join(tmpdir(), "todo-diag-joins-"));
  const home = join(scratch, "home");
  mkdirSync(home);
  const env = {
    ...process.env,
    HOME: home,
    TODO_DB: join(scratch, "scratch.db"),
    TODO_PORT: "0",
    TODO_ATTACHMENT_ROOT: join(scratch, "attachments"),
    TODO_DIAGNOSTICS_RECORDING: recording ? "1" : "0",
  };
  const cli = (args: string[], input?: string) => {
    const result = spawnSync(
      resolve(".scratch/bin/todo"),
      ["--profile", "work", ...args],
      { env, input, encoding: "utf8" },
    );
    assert.equal(result.status, 0, result.stderr);
    return result.stdout;
  };
  cli(["init", "--password-stdin"], "isolated diagnostics passphrase\n");
  cli(["login", "--password-stdin"], "isolated diagnostics passphrase\n");
  for (let index = 0; index < count; index++)
    cli([
      "add",
      `Benchmark Task ${String(index).padStart(3, "0")}`,
      "--format",
      "json",
    ]);
  let log = "";
  const [executable, ...arguments_] = serverCommand;
  const server = spawn(executable, arguments_, {
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.on("data", (chunk) => {
    log += chunk.toString();
  });
  server.stderr.on("data", (chunk) => {
    log += chunk.toString();
  });
  const close = async () => {
    if (server.exitCode === null && server.signalCode === null) {
      const stopped = new Promise<void>((resolve) =>
        server.once("exit", () => resolve()),
      );
      server.kill("SIGTERM");
      await stopped;
    }
    rmSync(scratch, { recursive: true, force: true });
  };
  try {
    let url = "";
    const deadline = performance.now() + 60000;
    while (!url && performance.now() < deadline) {
      assert.equal(server.exitCode, null, log);
      url = /Listening on (http:\/\/127\.0\.0\.1:\d+)/u.exec(log)?.[1] ?? "";
      if (!url) await new Promise((resolve) => setTimeout(resolve, 25));
    }
    assert.ok(url, log);
    const response = await fetch(`${url}/auth/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passphrase: "isolated diagnostics passphrase" }),
    });
    assert.equal(response.status, 200);
    const credential = Schema.decodeUnknownSync(
      Schema.Struct({ credential: Schema.String }),
    )(await response.json()).credential;
    return {
      url,
      credential,
      server,
      cli,
      close,
      scratch,
      env,
      log: () => log,
    };
  } catch (error) {
    await close();
    throw error;
  }
}
