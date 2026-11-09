import { Database } from "bun:sqlite";
import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, expect, it } from "@effect/vitest";

const build = mkdtempSync(join(tmpdir(), "todo-auth-history-build-"));
const binary = process.env.TODO_CLI_BINARY || join(build, "todo");
const serverBinary =
  process.env.TODO_SERVER_BINARY || join(build, "todo-server");
const actions: unknown[] = [];
beforeAll(() => {
  for (const [provided, source, destination] of [
    [process.env.TODO_CLI_BINARY, "../src/main.ts", binary],
    [process.env.TODO_SERVER_BINARY, "../../server/src/main.ts", serverBinary],
  ] as const) {
    if (provided) continue;
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
        resolve(import.meta.dirname, source),
        "--outfile",
        destination,
      ],
      { cwd: build, encoding: "utf8" },
    );
    expect(built.status, built.stderr).toBe(0);
  }
});
afterAll(() => {
  if (process.env.TODO_CLI_EVIDENCE) {
    mkdirSync(process.env.TODO_CLI_EVIDENCE, { recursive: true });
    writeFileSync(
      join(process.env.TODO_CLI_EVIDENCE, "auth-history-actions.json"),
      JSON.stringify(actions, null, 2),
    );
  }
  rmSync(build, { recursive: true, force: true });
});

it.each([
  {
    state: "revoked",
    command: "show",
    surface: "cli",
    status: 3,
    action: "read",
  },
  {
    state: "revoked",
    command: "show",
    surface: "http",
    status: 401,
    action: "read",
  },
  {
    state: "revoked",
    command: "edit",
    surface: "cli",
    status: 3,
    action: "mutate",
  },
  {
    state: "revoked",
    command: "edit",
    surface: "http",
    status: 401,
    action: "mutate",
  },
  {
    state: "expired",
    command: "show",
    surface: "cli",
    status: 3,
    action: "read",
  },
  {
    state: "expired",
    command: "show",
    surface: "http",
    status: 401,
    action: "read",
  },
  {
    state: "expired",
    command: "edit",
    surface: "cli",
    status: 3,
    action: "mutate",
  },
  {
    state: "expired",
    command: "edit",
    surface: "http",
    status: 401,
    action: "mutate",
  },
])(
  "records one selected-Profile rejection for $state $surface $command",
  async ({ state, command, surface, status, action }) => {
    const home = mkdtempSync(join(tmpdir(), "todo-auth-history-"));
    const path = join(home, "scratch.db");
    const env = { ...process.env, HOME: home, TODO_DB: path, TODO_PORT: "0" };
    let server: ChildProcess | undefined;
    const run = (args: string[], input = "") =>
      spawnSync(binary, args, { env, input, encoding: "utf8", timeout: 60000 });
    try {
      expect(
        run(["init", "--password-stdin"], "scratch-passphrase\n").status,
      ).toBe(0);
      expect(
        run(["login", "--password-stdin"], "scratch-passphrase\n").status,
      ).toBe(0);
      const added = run(["add", "Auth target", "--format", "json"]);
      expect(added.status, added.stderr).toBe(0);
      const id: string = JSON.parse(added.stdout).task.id;
      const credential: string = JSON.parse(
        readFileSync(join(home, ".todo-cli/session_default.json"), "utf8"),
      ).token;
      let base: string | undefined;
      if (surface === "http") {
        let log = "";
        server = spawn(serverBinary, [], {
          env,
          stdio: ["ignore", "pipe", "pipe"],
        });
        server.stdout?.on("data", (chunk) => {
          log += String(chunk);
        });
        server.stderr?.on("data", (chunk) => {
          log += String(chunk);
        });
        const deadline = Date.now() + 60000;
        while (
          !/Listening on http:\/\/127\.0\.0\.1:\d+/.test(log) &&
          Date.now() < deadline &&
          server.exitCode === null
        )
          await new Promise((done) => setTimeout(done, 50));
        base = /Listening on (http:\/\/127\.0\.0\.1:\d+)/.exec(log)?.[1];
        expect(base, log).toBeDefined();
      }
      const db = new Database(path);
      let before: number;
      try {
        db.exec("PRAGMA busy_timeout=5000");
        before =
          db
            .query<{ seq: number }, []>(
              "SELECT coalesce(max(seq),0) seq FROM op_log",
            )
            .get()?.seq ?? 0;
        const hash = createHash("sha256").update(credential).digest("hex");
        db.query(
          `UPDATE credentials SET ${state === "revoked" ? "revoked_at" : "expires_at"}=? WHERE secret_hash=?`,
        ).run("2000-01-01T00:00:00Z", hash);
      } finally {
        db.close();
      }
      let actual: number | null;
      if (surface === "cli") {
        const result = run([
          command,
          id,
          ...(command === "edit"
            ? ["--title", "New title", "--expected-version", "1"]
            : []),
          "--format",
          "json",
        ]);
        actual = result.status;
        expect(JSON.parse(result.stdout)).toMatchObject({
          code: "auth_required",
          exit_code: 3,
          exit_meaning: "not found or auth missing",
        });
      } else {
        const response = await fetch(`${base}/profiles/default/tasks/${id}`, {
          method: command === "edit" ? "PATCH" : "GET",
          headers: {
            Authorization: `Bearer ${credential}`,
            ...(command === "edit"
              ? { "Content-Type": "application/json" }
              : {}),
          },
          ...(command === "edit"
            ? {
                body: JSON.stringify({
                  from_version: 1,
                  changes: { title: "New title" },
                }),
              }
            : {}),
        });
        actual = response.status;
        expect(await response.json()).toMatchObject({
          _tag: "Unauthorized",
          exit_code: 3,
          exit_meaning: "not found or auth missing",
        });
      }
      const check = new Database(path, { readonly: true });
      let rejections: unknown[];
      try {
        rejections = check
          .query(
            "SELECT profile,json_extract(event,'$.action') action,json_extract(event,'$.detail') detail FROM op_log WHERE seq>? AND json_extract(event,'$.kind')='AuthAttemptRejected' ORDER BY seq",
          )
          .all(before);
        expect(
          check.query("SELECT title,row_version FROM tasks WHERE id=?").get(id),
        ).toEqual({ title: "Auth target", row_version: 1 });
      } finally {
        check.close();
      }
      actions.push({ state, command, surface, status: actual, rejections });
      expect(actual).toBe(status);
      expect(rejections).toEqual([
        { profile: "default", action, detail: state },
      ]);
    } finally {
      if (server && server.exitCode === null && server.signalCode === null) {
        const stopped = new Promise<void>((done) =>
          server?.once("exit", () => done()),
        );
        server.kill("SIGTERM");
        await stopped;
      }
      rmSync(home, { recursive: true, force: true });
    }
  },
  120000,
);
