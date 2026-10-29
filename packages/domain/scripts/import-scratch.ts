import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { Schema } from "effect";

const root = resolve(import.meta.dirname, "../../..");
const scratch = join(root, ".scratch");
const bin = join(scratch, "bin");
mkdirSync(bin, { recursive: true });
const receiptPath = join(scratch, "server.json");
const Receipt = Schema.Struct({
  pid: Schema.Int,
  server: Schema.String,
  cli: Schema.String,
  hash: Schema.String,
  url: Schema.String,
  home: Schema.String,
  database: Schema.String,
  stopped: Schema.optionalKey(Schema.Boolean),
});
const wait = (ms: number) => new Promise((done) => setTimeout(done, ms));
function run(
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
  stdin?: string,
) {
  const result = Bun.spawnSync(args, {
    cwd: root,
    env,
    stdin: stdin === undefined ? "ignore" : new TextEncoder().encode(stdin),
  });
  if (result.exitCode !== 0)
    throw new Error(
      new TextDecoder().decode(result.stderr) +
        new TextDecoder().decode(result.stdout),
    );
  return new TextDecoder().decode(result.stdout);
}
function receipt() {
  return existsSync(receiptPath)
    ? Schema.decodeUnknownSync(Receipt)(
        JSON.parse(readFileSync(receiptPath, "utf8")),
      )
    : null;
}
async function stop() {
  const value = receipt();
  if (!value || value.stopped) return;
  const result = Bun.spawnSync(
    ["ps", "-p", String(value.pid), "-o", "command="],
    { stdout: "pipe" },
  );
  const command = new TextDecoder().decode(result.stdout).trim();
  if (command) {
    if (!value.server.startsWith(`${bin}/`) || !command.includes(value.server))
      throw new Error("Recorded scratch PID no longer belongs to this server");
    process.kill(value.pid, "SIGTERM");
    const deadline = Date.now() + 2000;
    while (Date.now() < deadline) {
      try {
        process.kill(value.pid, 0);
      } catch {
        break;
      }
      await wait(100);
    }
    const check = Bun.spawnSync(
      ["ps", "-p", String(value.pid), "-o", "command="],
      { stdout: "pipe" },
    );
    if (new TextDecoder().decode(check.stdout).includes(value.server))
      process.kill(value.pid, "SIGKILL");
  }
  writeFileSync(
    receiptPath,
    JSON.stringify({ ...value, stopped: true }, null, 2),
  );
}
if (process.argv[2] === "stop") {
  await stop();
  process.stdout.write("Scratch server stopped.\n");
} else {
  const files = run([
    "rg",
    "--files",
    "apps/cli",
    "apps/server",
    "packages",
    "pnpm-lock.yaml",
  ])
    .trim()
    .split("\n")
    .sort();
  const hash = createHash("sha256");
  for (const file of files) {
    hash.update(file);
    hash.update(readFileSync(join(root, file)));
  }
  const key = hash.digest("hex").slice(0, 20);
  const cli = join(bin, `${key}-todo`);
  const server = join(bin, `${key}-todo-server`);
  for (const [source, target] of [
    ["apps/cli/src/main.ts", cli],
    ["apps/server/src/main.ts", server],
  ])
    if (target && source && !existsSync(target)) {
      const build = Bun.spawnSync(
        ["bun", "build", "--compile", join(root, source), "--outfile", target],
        { cwd: bin },
      );
      if (build.exitCode !== 0)
        throw new Error(new TextDecoder().decode(build.stderr));
    }
  if (process.argv[2] === "start") {
    const old = receipt();
    if (old && !old.stopped && old.hash === key) {
      try {
        const health = await fetch(`${old.url}/health`);
        if (health.ok) {
          process.stdout.write(`${JSON.stringify(old)}\n`);
          process.exit(0);
        }
      } catch {}
    }
    await stop();
    const home = join(scratch, "home");
    const database = join(scratch, "dev.db");
    mkdirSync(home, { recursive: true });
    const env = {
      ...process.env,
      HOME: home,
      TODO_DB: database,
      TODO_PORT: "0",
    };
    if (!existsSync(database))
      run(
        [cli, "--profile", "work", "init", "--password-stdin"],
        env,
        "scratch verification passphrase\n",
      );
    run(
      [cli, "--profile", "work", "login", "--password-stdin"],
      env,
      "scratch verification passphrase\n",
    );
    const log = join(scratch, "server.log");
    writeFileSync(log, "");
    const child = Bun.spawn([server], {
      cwd: root,
      env,
      detached: true,
      stdout: Bun.file(log),
      stderr: Bun.file(log),
    });
    child.unref();
    writeFileSync(
      receiptPath,
      JSON.stringify(
        { pid: child.pid, server, cli, hash: key, url: "", home, database },
        null,
        2,
      ),
    );
    try {
      const deadline = Date.now() + 60000;
      let url = "";
      while (Date.now() < deadline) {
        const text = existsSync(log) ? readFileSync(log, "utf8") : "";
        url = /Listening on (http:\/\/127\.0\.0\.1:\d+)/.exec(text)?.[1] ?? "";
        if (url) break;
        await wait(100);
      }
      if (!url) throw new Error("Scratch server readiness timed out");
      const health = await fetch(`${url}/health`);
      if (!health.ok) throw new Error("Scratch health failed");
      const value = {
        pid: child.pid,
        server,
        cli,
        hash: key,
        url,
        home,
        database,
      };
      writeFileSync(receiptPath, JSON.stringify(value, null, 2));
      process.stdout.write(`${JSON.stringify(value)}\n`);
    } catch (error) {
      await stop();
      throw error;
    }
  } else
    process.stdout.write(`${JSON.stringify({ cli, server, hash: key })}\n`);
}
