import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { LookupResponse, ProfileListResponse } from "../../../../packages/domain/src/index.ts";
import { TaskResponse } from "../../../../packages/domain/src/presentation.ts";
import { Schema } from "effect";

export function verifyCredentialSelection(input: {
  binary: string;
  env: NodeJS.ProcessEnv;
  home: string;
  passphrase: string;
  scopedCredential: string;
  workTask: string;
  actions: unknown[];
}) {
  const { binary, env, home, passphrase, actions } = input;
  const run = (args: string[], expected = 0, stdin?: string, format = "json") => {
    const result = spawnSync(binary, [...args, "--format", format], { env, input: stdin, encoding: "utf8", timeout: 30000 });
    if (result.error) throw result.error;
    actions.push({ args, format, exit: result.status, stdout: result.stdout, stderr: result.stderr });
    assert.equal(result.status, expected, result.stdout || result.stderr);
    return result.stdout;
  };
  const json = (args: string[], expected = 0, stdin?: string): unknown => JSON.parse(run(args, expected, stdin));
  const file = (name: string) => join(home, ".todo-cli", `session_${encodeURIComponent(name)}.json`);
  const error = (args: string[]) => Schema.decodeUnknownSync(Schema.Struct({ code: Schema.String, message: Schema.String }))(json(args, 3));
  const execute = (command: string, taskId: string) => {
    const quotedBinary = "'" + binary.replaceAll("'", "'\\''") + "'";
    const result = spawnSync("/bin/sh", ["-c", quotedBinary + " " + command.slice(5) + " --format json"], { env, encoding: "utf8", timeout: 30000 });
    actions.push({ printedCommand: command, exit: result.status, stdout: result.stdout, stderr: result.stderr });
    assert.equal(result.status, 0, result.stdout || result.stderr);
    assert.equal(Schema.decodeUnknownSync(TaskResponse)(JSON.parse(result.stdout)).task.id, taskId);
  };
  run(["login", "--profile", "source", "--password-stdin"], 0, passphrase + "\n");
  run(["login", "--profile", "dest", "--password-stdin"], 0, passphrase + "\n");
  const target = Schema.decodeUnknownSync(TaskResponse)(json(["add", "Credential destination Task", "--profile", "dest"])).task;
  run(["logout", "--profile", "dest"]);
  assert.equal(existsSync(file("dest")), false);
  const legacy = error(["show", target.id, "--profile", "dest"]);
  assert.deepEqual(legacy, { code: "auth_required", message: "run todo login" });
  for (const format of ["md", "table"]) {
    const text = run(["lookup", "--prefix", target.id, "--profile", "source"], 0, undefined, format);
    const command = text.slice(text.indexOf("todo show ")).trim();
    assert.equal(command, `todo show ${target.id} --profile dest --credential-profile source`);
    execute(command, target.id);
  }
  const explicit = Schema.decodeUnknownSync(LookupResponse)(json(["lookup", "--prefix", target.id, "--profile", "dest", "--credential-profile", "source"]));
  assert.equal(explicit.matches[0]?.task_id, target.id);
  const directory = Schema.decodeUnknownSync(ProfileListResponse)(json(["profile", "list", "--projects", "--profile", "not-a-target", "--credential-profile", "source"]));
  assert.ok(directory.profiles.some((p) => p.id === "dest"));
  assert.ok(!directory.profiles.some((p) => p.id === "not-a-target"));
  const updated = Schema.decodeUnknownSync(TaskResponse)(json(["edit", target.id, "--profile", "dest", "--credential-profile", "source", "--expected-version", "1", "--title", "Explicit credential write"])).task;
  assert.equal(updated.row_version, 2);
  assert.equal(Schema.decodeUnknownSync(TaskResponse)(json(["show", target.id, "--profile", "dest", "--credential-profile", "source"])).task.title, "Explicit credential write");
  json(["history", target.id, "--profile", "dest", "--credential-profile", "source"]);
  writeFileSync(file("scoped-source"), JSON.stringify({ token: input.scopedCredential }), { mode: 0o600 });
  for (const args of [
    ["show", target.id, "--profile", "dest", "--credential-profile", "scoped-source"],
    ["edit", target.id, "--profile", "dest", "--credential-profile", "scoped-source", "--expected-version", "2", "--title", "Denied foreign write"],
    ["list", "--profile", "dest", "--credential-profile", "scoped-source"],
  ]) {
    const denied = error(args);
    assert.ok(!denied.message.includes("Credential destination Task") && !denied.message.includes("Explicit credential write"));
  }
  const unchanged = Schema.decodeUnknownSync(TaskResponse)(json(["show", target.id, "--profile", "dest", "--credential-profile", "source"])).task;
  assert.equal(unchanged.row_version, 2);
  assert.equal(unchanged.title, "Explicit credential write");
  const scopedLookup = Schema.decodeUnknownSync(LookupResponse)(json(["lookup", "--prefix", target.id, "--profile", "dest", "--credential-profile", "scoped-source"]));
  assert.deepEqual(scopedLookup.matches, []);
  const missing = error(["show", target.id, "--profile", "dest", "--credential-profile", "missing-key"]);
  assert.equal(missing.code, "auth_required");
  assert.ok(missing.message.includes("missing-key") && !missing.message.includes("dest") && !missing.message.includes("source"));
  const normal = run(["lookup", "--prefix", input.workTask, "--profile", "work"], 0, undefined, "md");
  const same = run(["lookup", "--prefix", input.workTask, "--profile", "work", "--credential-profile", "work"], 0, undefined, "md");
  assert.equal(normal, same);
  assert.ok(!normal.includes("--credential-profile"));
  run(["login", "--profile", "login-target", "--credential-profile", "stored-key", "--password-stdin"], 0, passphrase + "\n");
  assert.ok(existsSync(file("stored-key")) && !existsSync(file("login-target")));
  json(["whoami", "--profile", "login-target", "--credential-profile", "stored-key"]);
  run(["logout", "--profile", "login-target", "--credential-profile", "stored-key"]);
  assert.ok(!existsSync(file("stored-key")) && !existsSync(file("login-target")));
  assert.equal(error(["show", input.workTask, "--profile", "work", "--credential-profile", "stored-key"]).code, "auth_required");
  run(["login", "--profile=--target", "--credential-profile=--key", "--password-stdin"], 0, passphrase + "\n");
  const leading = Schema.decodeUnknownSync(TaskResponse)(json(["add", "Leading flags", "--profile=--target", "--credential-profile=--key"])).task;
  const text = run(["lookup", "--prefix", leading.id, "--profile", "work", "--credential-profile=--key"], 0, undefined, "md");
  const command = text.slice(text.indexOf("todo show ")).trim();
  assert.equal(command, `todo show ${leading.id} --profile=--target --credential-profile=--key`);
  execute(command, leading.id);
  const schema = Schema.decodeUnknownSync(Schema.Struct({ $comment: Schema.String }))(json(["schema", "lookup", "--credential-profile", "missing-key"]));
  assert.ok(schema.$comment.includes("overrides --profile") && schema.$comment.includes("No other credential file"));
  json(["lookup", "--help", "--credential-profile", "missing-key"]);
  json(["lookup", "--prefix", "ab", "--credential-profile="], 2);
}
