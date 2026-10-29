import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { type Launchctl, lifecycle } from "../src/lifecycle.ts";

const fixture = Effect.gen(function* () {
  const home = yield* Effect.acquireRelease(
    Effect.sync(() => mkdtempSync(join(tmpdir(), "todo-s03-lifecycle-"))),
    (path) => Effect.sync(() => rmSync(path, { recursive: true, force: true })),
  );
  let loaded = false;
  const calls: string[][] = [];
  const run: Launchctl = (args) =>
    Effect.sync(() => {
      calls.push([...args]);
      if (args[0] === "print")
        return loaded
          ? { code: 0, stdout: "service", stderr: "" }
          : { code: 113, stdout: "", stderr: "Could not find service" };
      loaded = args[0] === "bootstrap";
      return { code: 0, stdout: "", stderr: "" };
    });
  const agent = lifecycle({
    home,
    uid: 501,
    label: "com.todo-cli.server.verify",
    run,
  });
  return { home, agent, calls };
});

describe("LaunchAgent lifecycle", () => {
  it.effect(
    "installs, replaces, reports and uninstalls only its owned agent",
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const { home, agent, calls } = yield* fixture;
          const initial = yield* agent.status();
          expect([initial.installed, initial.loaded]).toEqual([false, false]);
          expect(initial.configuration).toBeNull();
          const config = {
            executable: "/Applications/Todo & Tasks/todo-server",
            database: join(home, "Tasks & plans.db"),
            port: 4310,
          };
          const installed = yield* agent.install(config);
          expect([installed.installed, installed.loaded]).toEqual([true, true]);
          expect(installed.configuration).toEqual(config);
          const plist = readFileSync(installed.path, "utf8");
          expect(plist).toContain("/Applications/Todo &amp; Tasks/todo-server");
          expect(plist).toContain("Tasks &amp; plans.db");
          expect(plist).toContain("<key>TODO_PORT</key><string>4310</string>");
          yield* agent.install({ ...config, port: 4311 });
          expect((yield* agent.status()).configuration).toEqual({
            ...config,
            port: 4311,
          });
          expect(calls.filter((call) => call[0] === "bootout")).toEqual([
            ["bootout", "gui/501/com.todo-cli.server.verify"],
          ]);
          const removed = yield* agent.uninstall();
          expect([
            removed.installed,
            removed.loaded,
            existsSync(removed.path),
          ]).toEqual([false, false, false]);
          expect(removed.configuration).toBeNull();
          expect((yield* agent.uninstall()).label).toBe(
            "com.todo-cli.server.verify",
          );
          expect(calls.filter((call) => call[0] === "bootstrap").length).toBe(
            2,
          );
        }),
      ),
  );
  it.effect("reports configuration errors without rewriting the plist", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const { home, agent } = yield* fixture;
        const installed = yield* agent.install({
          executable: "/tmp/todo-server",
          database: join(home, "explicit.db"),
          port: 0,
        });
        expect(installed.configuration).toEqual({
          executable: "/tmp/todo-server",
          database: join(home, "explicit.db"),
          port: 0,
        });
        const malformed = readFileSync(installed.path, "utf8").replace(
          "<key>TODO_PORT</key><string>0</string>",
          "<key>TODO_PORT</key><string>invalid</string>",
        );
        writeFileSync(installed.path, malformed);
        expect((yield* Effect.result(agent.status()))._tag).toBe("Failure");
        expect(readFileSync(installed.path, "utf8")).toBe(malformed);
      }),
    ),
  );
  it.effect("preserves a foreign plist and reports launchctl failures", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const { home, agent } = yield* fixture;
        const installed = yield* agent.install({
          executable: "/tmp/todo-server",
          database: join(home, "scratch.db"),
          port: 0,
        });
        writeFileSync(installed.path, "foreign agent");
        expect((yield* Effect.result(agent.uninstall()))._tag).toBe("Failure");
        expect(readFileSync(installed.path, "utf8")).toBe("foreign agent");
        const denied = lifecycle({
          home,
          uid: 501,
          label: "com.todo-cli.server.denied",
          run: () =>
            Effect.succeed({
              code: 1,
              stdout: "",
              stderr: "permission denied",
            }),
        });
        const result = yield* Effect.result(denied.status());
        expect(result._tag).toBe("Failure");
      }),
    ),
  );
});
