import { strict as assert } from "node:assert";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { TaskResponse } from "@todo/domain/presentation";
import { Schema } from "effect";

const root = resolve(import.meta.dirname, "../../..");
const directory = join(root, ".scratch");
const bin = join(directory, "bin");
const home = join(directory, "home");
const database = join(directory, "dev.db");
const serverFile = join(directory, "server.json");
const ServerRecord = Schema.Struct({
  pid: Schema.Int,
  url: Schema.String,
  source_hash: Schema.String,
  executable: Schema.String,
  database: Schema.String,
  home: Schema.String,
});
const record = () =>
  existsSync(serverFile)
    ? Schema.decodeUnknownSync(ServerRecord)(
        JSON.parse(readFileSync(serverFile, "utf8")),
      )
    : null;
const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function stop() {
  const value = record();
  if (!value || !alive(value.pid)) return;
  const command = spawnSync("ps", ["-p", String(value.pid), "-o", "command="], {
    encoding: "utf8",
  });
  assert.ok(
    command.stdout.trim().startsWith(value.executable),
    "Recorded PID no longer belongs to the scratch server",
  );
  process.kill(value.pid, "SIGTERM");
  for (let attempt = 0; attempt < 60 && alive(value.pid); attempt++)
    await sleep(50);
  if (alive(value.pid)) {
    const current = spawnSync(
      "ps",
      ["-p", String(value.pid), "-o", "command="],
      { encoding: "utf8" },
    );
    assert.ok(current.stdout.trim().startsWith(value.executable));
    process.kill(value.pid, "SIGKILL");
  }
  writeFileSync(
    serverFile,
    `${JSON.stringify({ ...value, stopped: true }, null, 2)}\n`,
  );
}
if (process.argv[2] === "stop") {
  await stop();
  process.stdout.write("Scratch server stopped\n");
  process.exit(0);
}
mkdirSync(bin, { recursive: true });
mkdirSync(home, { recursive: true, mode: 0o700 });
const files = spawnSync(
  "git",
  [
    "ls-files",
    "--cached",
    "--others",
    "--exclude-standard",
    "apps/cli",
    "apps/server",
    "packages",
    "pnpm-lock.yaml",
  ],
  { cwd: root, encoding: "utf8" },
);
assert.equal(files.status, 0);
const hash = createHash("sha256");
for (const file of [...new Set(files.stdout.trim().split("\n"))].sort()) {
  hash.update(file);
  hash.update(readFileSync(join(root, file)));
}
const sourceHash = hash.digest("hex");
const manifestFile = join(bin, "source.json");
const manifest = existsSync(manifestFile)
  ? readFileSync(manifestFile, "utf8")
  : "";
if (
  !manifest.includes(sourceHash) ||
  !existsSync(join(bin, "todo")) ||
  !existsSync(join(bin, "todo-server"))
) {
  await stop();
  for (const [entry, output] of [
    ["apps/cli/src/main.ts", "todo"],
    ["apps/server/src/main.ts", "todo-server"],
    ["apps/server/scripts/seed-verification.ts", "seed"],
  ]) {
    const build = spawnSync(
      "bun",
      [
        "build",
        "--compile",
        join(root, entry ?? ""),
        "--outfile",
        join(bin, output ?? ""),
      ],
      { cwd: bin, stdio: "inherit" },
    );
    assert.equal(build.status, 0);
  }
  const head = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).stdout.trim();
  writeFileSync(
    manifestFile,
    `${JSON.stringify({ source_hash: sourceHash, head, cli: join(bin, "todo"), server: join(bin, "todo-server") }, null, 2)}\n`,
  );
}
if (process.argv[2] === "build") {
  process.stdout.write(`${manifestFile}\n`);
  process.exit(0);
}
const previous = record();
if (previous && previous.source_hash === sourceHash && alive(previous.pid)) {
  process.stdout.write(`${previous.url}\n`);
  process.exit(0);
}
await stop();
const env = {
  ...process.env,
  HOME: home,
  TODO_DB: database,
  TODO_PORT: "0",
  TODO_ATTACHMENT_ROOT: join(directory, "attachments"),
};
const cli = (args: string[], input?: string) => {
  const result = spawnSync(join(bin, "todo"), args, {
    cwd: root,
    env,
    ...(input === undefined ? {} : { input }),
    encoding: "utf8",
    timeout: 60000,
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
};
if (!existsSync(database)) {
  cli(
    ["--profile", "work", "init", "--password-stdin"],
    "scratch verification passphrase\n",
  );
  cli(["--profile", "personal", "init"]);
}
cli(
  ["--profile", "work", "login", "--password-stdin"],
  "scratch verification passphrase\n",
);
if (!previous)
  for (let index = 0; index < 8; index++)
    cli([
      "--profile",
      "work",
      "add",
      `Diagnostics traffic ${index}`,
      "--format",
      "json",
    ]);
const logFile = join(directory, "server.log");
const log = openSync(logFile, "w");
const child = spawn(join(bin, "todo-server"), [], {
  cwd: root,
  env,
  detached: true,
  stdio: ["ignore", log, log],
});
closeSync(log);
assert.ok(child.pid);
const value = {
  pid: child.pid,
  url: "",
  source_hash: sourceHash,
  executable: join(bin, "todo-server"),
  database,
  home,
};
writeFileSync(serverFile, `${JSON.stringify(value, null, 2)}\n`);
child.unref();
for (let attempt = 0; attempt < 1200; attempt++) {
  const url = readFileSync(logFile, "utf8").match(
    /Listening on (http:\/\/127\.0\.0\.1:\d+)/,
  )?.[1];
  if (url) {
    writeFileSync(
      serverFile,
      `${JSON.stringify({ ...value, url }, null, 2)}\n`,
    );
    const task = Schema.decodeUnknownSync(TaskResponse)(
      JSON.parse(
        cli([
          "--profile",
          "work",
          "add",
          "Live diagnostics traffic",
          "--format",
          "json",
        ]),
      ),
    );
    const update = spawnSync(
      join(bin, "todo"),
      [
        "--profile",
        "work",
        "edit",
        task.task.id,
        "--expected-version",
        "99",
        "--title",
        "Rejected diagnostic edit",
        "--format",
        "json",
      ],
      { env, encoding: "utf8" },
    );
    assert.equal(update.status, 4);
    process.stdout.write(`${url}\n`);
    process.exit(0);
  }
  assert.ok(alive(child.pid));
  await sleep(50);
}
await stop();
throw new Error("Scratch server readiness exceeded 60 seconds");
