import { homedir } from "node:os";
import { isAbsolute } from "node:path";
import { BunRuntime } from "@effect/platform-bun";
import { Config, Effect, Layer } from "effect";
import { lifecycle, serviceLabel } from "./lifecycle.ts";
import { serverLayer } from "./server.ts";

Effect.gen(function* () {
  const command = process.argv[2];
  if (
    command !== undefined &&
    !["install", "uninstall", "status"].includes(command)
  )
    return yield* Effect.fail(
      new Error("Usage: todo-server [install|uninstall|status]"),
    );
  if (command !== undefined && process.argv.length > 3)
    return yield* Effect.fail(new Error("Unexpected arguments"));
  if (command !== undefined) {
    if (process.platform !== "darwin")
      return yield* Effect.fail(
        new Error("LaunchAgent lifecycle requires macOS"),
      );
    const label = yield* Config.String("TODO_SERVICE_LABEL").pipe(
      Config.withDefault(serviceLabel),
    );
    const uid = process.getuid?.();
    if (uid === undefined)
      return yield* Effect.fail(new Error("Cannot determine the current user"));
    const agent = yield* Effect.try(() =>
      lifecycle({ home: homedir(), uid, label }),
    );
    if (command === "status" || command === "uninstall") {
      const result = yield* command === "status"
        ? agent.status()
        : agent.uninstall();
      yield* Effect.sync(() =>
        process.stdout.write(`${JSON.stringify(result)}\n`),
      );
      return;
    }
    const database = yield* Config.String("TODO_DB");
    const port = yield* Config.Int("TODO_PORT").pipe(Config.withDefault(4310));
    if (!isAbsolute(database))
      return yield* Effect.fail(
        new Error("TODO_DB must be absolute for install"),
      );
    if (!Bun.main.startsWith("/$bunfs/"))
      return yield* Effect.fail(
        new Error("Install requires the compiled todo-server binary"),
      );
    const result = yield* agent.install({
      executable: process.execPath,
      database,
      port,
    });
    yield* Effect.sync(() =>
      process.stdout.write(`${JSON.stringify(result)}\n`),
    );
    return;
  }
  const path = yield* Config.String("TODO_DB");
  const port = yield* Config.Int("TODO_PORT").pipe(Config.withDefault(4310));
  if (port < 0 || port > 65535)
    return yield* Effect.die(
      new Error("TODO_PORT must be between 0 and 65535"),
    );
  yield* Layer.launch(serverLayer({ path, port }));
}).pipe(BunRuntime.runMain);
