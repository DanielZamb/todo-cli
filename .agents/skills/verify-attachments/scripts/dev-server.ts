import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { Schema } from "../../../../packages/domain/node_modules/effect/src/index.ts";
const root = resolve(import.meta.dirname, "../../../..");
const scratch = join(root, ".scratch");
const receipt = join(scratch, "server.json");
const configuration = Schema.Struct({ pid: Schema.Int, url: Schema.String, binary: Schema.String, stopped: Schema.optionalKey(Schema.Boolean), sourceHash: Schema.optionalKey(Schema.String) });
const current = () => existsSync(receipt) ? Schema.decodeUnknownSync(configuration)(JSON.parse(readFileSync(receipt, "utf8"))) : null;
const owned = (value: typeof configuration.Type) => {
  try { return execFileSync("ps", ["-p", String(value.pid), "-o", "command="], { encoding: "utf8" }).trim() === value.binary; } catch { return false; }
};
if (process.argv[2] === "stop") {
  const value = current();
  if (value && !value.stopped && owned(value)) {
    process.kill(value.pid, "SIGTERM");
    await new Promise((r) => setTimeout(r, 1500));
    if (owned(value)) process.kill(value.pid, "SIGKILL");
    writeFileSync(receipt, `${JSON.stringify({ ...value, stopped: true }, null, 2)}\n`);
  }
} else {
  execFileSync("bun", [join(import.meta.dirname, "build.ts")], { cwd: root });
  const build = JSON.parse(readFileSync(join(scratch, "bin", "build.json"), "utf8"));
  const previous = current();
  if (previous && !previous.stopped && owned(previous) && previous.sourceHash !== build.sourceHash) { process.kill(previous.pid, "SIGTERM"); await new Promise((r) => setTimeout(r, 1500)); if (owned(previous)) process.kill(previous.pid, "SIGKILL"); }
  if (previous && !previous.stopped && owned(previous) && previous.sourceHash === build.sourceHash) { process.stdout.write(`${JSON.stringify(previous)}\n`); }
  else {
    const home = join(scratch, "home");
    const database = join(scratch, "dev.db");
    mkdirSync(join(home, ".todo-cli"), { recursive: true, mode: 0o700 });
    const env = { ...process.env, HOME: home, TODO_DB: database, TODO_PORT: "0", TODO_ATTACHMENT_ROOT: join(home, ".todo-cli", "attachments") };
    if (!existsSync(database)) {
      execFileSync(build.cli, ["--profile", "work", "init", "--password-stdin"], { env, input: "scratch verification passphrase\n" });
      execFileSync(build.cli, ["--profile", "personal", "init"], { env });
    }
    const log = join(scratch, "server.log");
    writeFileSync(log, "");
    const child = spawn(build.server, [], { env, cwd: scratch, detached: true, stdio: ["ignore", openSync(log, "a"), openSync(log, "a")] });
    if (!child.pid) throw new Error("Scratch server did not start");
    writeFileSync(receipt, JSON.stringify({ pid: child.pid, url: "", binary: build.server }));
    child.unref();
    const deadline = Date.now() + 60000;
    let url = "";
    while (!url && Date.now() < deadline) { url = /Listening on (http:\/\/127\.0\.0\.1:\d+)/.exec(readFileSync(log, "utf8"))?.[1] ?? ""; if (!url) await new Promise((r) => setTimeout(r, 100)); }
    if (!url) throw new Error("Scratch server readiness timed out; PID is recorded in server.json");
    const value = { pid: child.pid, url, binary: build.server, home, database, attachmentRoot: env.TODO_ATTACHMENT_ROOT, sourceHash: build.sourceHash };
    writeFileSync(receipt, `${JSON.stringify(value, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify(value)}\n`);
  }
}
