import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, expect, it } from "@effect/vitest";

const scratch = mkdtempSync(join(tmpdir(), "todo-discovery-integration-"));
const home = join(scratch, "home");
const binary = process.env.TODO_CLI_BINARY || join(scratch, "todo");
const env = {
  ...process.env,
  HOME: home,
  TODO_DB: join(scratch, "scratch.db"),
  PATH: `${join(scratch, "bin")}:${process.env.PATH}`,
};
const actions: unknown[] = [];
const credentialProfile = "Key: It's Mine";
const quotedCredential = "'Key: It'\\''s Mine'";
let taskId = "";

function run(args: string[], input = "") {
  const result = spawnSync(binary, ["--format", "json", ...args], {
    env,
    encoding: "utf8",
    input,
    timeout: 60000,
  });
  actions.push({
    args,
    exit: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  });
  return { ...result, body: JSON.parse(result.stdout) };
}

function shell(command: string) {
  const result = spawnSync("/bin/sh", ["-c", command], {
    env,
    encoding: "utf8",
    timeout: 60000,
  });
  actions.push({
    command,
    exit: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  });
  return result;
}

beforeAll(() => {
  mkdirSync(home);
  mkdirSync(join(scratch, "bin"));
  if (!process.env.TODO_CLI_BINARY) {
    expect(
      spawnSync("sh", [
        resolve(import.meta.dirname, "../../../scripts/disk-guard.sh"),
      ]).status,
    ).toBe(0);
    const built = spawnSync(
      "bun",
      [
        "build",
        "--compile",
        resolve(import.meta.dirname, "../src/main.ts"),
        "--outfile",
        binary,
      ],
      { encoding: "utf8" },
    );
    expect(built.status, built.stderr).toBe(0);
  }
  symlinkSync(binary, join(scratch, "bin/todo"));
  for (const args of [
    ["init", "--profile", credentialProfile, "--password-stdin"],
    ["login", "--profile", credentialProfile, "--password-stdin"],
    ["login", "--profile", "dest", "--password-stdin"],
  ])
    expect(run(args, "scratch integration passphrase\n").status).toBe(0);
  const created = run(["add", "Recovered Task", "--profile", "dest"]);
  expect(created.status).toBe(0);
  taskId = created.body.task.id;
  expect(run(["logout", "--profile", "dest"]).status).toBe(0);
}, 60000);

afterAll(() => {
  if (process.env.TODO_CLI_EVIDENCE) {
    mkdirSync(process.env.TODO_CLI_EVIDENCE, { recursive: true });
    writeFileSync(
      join(process.env.TODO_CLI_EVIDENCE, "discovery-integration-actions.json"),
      JSON.stringify(actions, null, 2),
    );
  }
  rmSync(scratch, { recursive: true, force: true });
});

it("recovers through both printed hints and Show with the credential actually used", () => {
  const prefix = taskId.slice(0, 8);
  const missing = run([
    "show",
    prefix,
    "--profile",
    "dest",
    "--credential-profile",
    credentialProfile,
  ]);
  expect(missing.status).toBe(3);
  expect(missing.body.details.profile).toEqual({ id: "dest", name: "dest" });
  const expected = `Run todo list --profile dest --prefix ${prefix} --credential-profile ${quotedCredential} for this Profile, or todo lookup --prefix ${prefix} --credential-profile ${quotedCredential} across Profiles this credential can access. Mutations need the full Task id and an explicit Profile.`;
  expect(missing.body.details.recovery).toBe(expected);
  const hints =
    /^Run (todo list.*?) for this Profile, or (todo lookup.*?) across Profiles/.exec(
      missing.body.details.recovery,
    );
  expect(hints).not.toBeNull();
  for (const command of hints?.slice(1) ?? []) {
    const found = shell(command);
    expect(found.status, found.stderr).toBe(0);
    expect(found.stdout).toContain(taskId);
  }
  const found = shell(hints?.[2] ?? "false");
  const next = found.stdout
    .split("\n")
    .find((line) => line.includes("todo show "));
  expect(next).toBeDefined();
  const shown = shell(next?.slice(next.indexOf("todo show ")) ?? "false");
  expect(shown.status, shown.stderr).toBe(0);
  expect(shown.stdout).toContain("Recovered Task");
}, 60000);

it("prints executable single-dash prefix hints with the selected credential", () => {
  const missing = run([
    "show",
    "--profile",
    "dest",
    "--credential-profile",
    credentialProfile,
    "--",
    "-a",
  ]);
  expect(missing.status).toBe(3);
  expect(missing.body.details.recovery).toBe(
    `Run todo list --profile dest --prefix=-a --credential-profile ${quotedCredential} for this Profile, or todo lookup --prefix=-a --credential-profile ${quotedCredential} across Profiles this credential can access. Mutations need the full Task id and an explicit Profile.`,
  );
  for (const command of [
    `todo list --profile dest --prefix=-a --credential-profile ${quotedCredential}`,
    `todo lookup --prefix=-a --credential-profile ${quotedCredential}`,
  ])
    expect(shell(command).status).toBe(0);
}, 60000);
