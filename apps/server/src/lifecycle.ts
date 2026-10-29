import { execFileSync } from "node:child_process";
import {
  lstatSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { isAbsolute, join } from "node:path";
import { Effect, Schedule, Schema } from "effect";

const managedPlist = Schema.Struct({
  ProgramArguments: Schema.Array(Schema.String),
  EnvironmentVariables: Schema.Struct({
    TODO_DB: Schema.String,
    TODO_PORT: Schema.String,
  }),
});

export const serviceLabel = "com.todo-cli.server";
export type LaunchResult = {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
};
export type Launchctl = (
  args: readonly string[],
) => Effect.Effect<LaunchResult, Error>;
export const launchctl: Launchctl = (args) =>
  Effect.tryPromise({
    try: async () => {
      const process = Bun.spawn(["/bin/launchctl", ...args], {
        stdout: "pipe",
        stderr: "pipe",
      });
      const [code, stdout, stderr] = await Promise.all([
        process.exited,
        new Response(process.stdout).text(),
        new Response(process.stderr).text(),
      ]);
      return { code, stdout, stderr };
    },
    catch: (cause) => new Error("Unable to run launchctl", { cause }),
  });
const xml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
const io = <A>(run: () => A) =>
  Effect.try({
    try: run,
    catch: (cause) => new Error("LaunchAgent file operation failed", { cause }),
  });

export const lifecycle = (options: {
  readonly home: string;
  readonly uid: number;
  readonly label: string;
  readonly run?: Launchctl;
}) => {
  if (!/^com\.todo-cli\.server(?:\.[a-z0-9-]+)?$/.test(options.label))
    throw new Error(
      "TODO_SERVICE_LABEL must be com.todo-cli.server or an app-owned suffix",
    );
  if (!isAbsolute(options.home)) throw new Error("HOME must be absolute");
  const run = options.run ?? launchctl;
  const directory = join(options.home, "Library", "LaunchAgents");
  const path = join(directory, `${options.label}.plist`);
  const domain = `gui/${options.uid}`;
  const target = `${domain}/${options.label}`;
  const installed = () => {
    const stat = lstatSync(path, { throwIfNoEntry: false });
    if (stat === undefined) return false;
    if (
      !stat.isFile() ||
      !readFileSync(path, "utf8").includes(
        `<key>Label</key><string>${options.label}</string>`,
      )
    )
      throw new Error(`Refusing to manage a foreign plist at ${path}`);
    return true;
  };
  const loaded = () =>
    Effect.gen(function* () {
      const result = yield* run(["print", target]);
      if (result.code === 0) return true;
      if (
        result.code === 113 &&
        result.stderr.includes("Could not find service")
      )
        return false;
      return yield* Effect.fail(
        new Error(`launchctl print failed (${result.code}): ${result.stderr}`),
      );
    });
  const checked = (args: readonly string[]) =>
    run(args).pipe(
      Effect.flatMap((result) =>
        result.code === 0
          ? Effect.void
          : Effect.fail(
              new Error(
                `launchctl ${args[0]} failed (${result.code}): ${result.stderr}`,
              ),
            ),
      ),
    );
  const status = () =>
    Effect.gen(function* () {
      const present = yield* io(installed);
      return {
        label: options.label,
        path,
        installed: present,
        loaded: yield* loaded(),
        configuration: present
          ? yield* io(() => {
              const plist = Schema.decodeUnknownSync(managedPlist)(
                JSON.parse(
                  execFileSync(
                    "/usr/bin/plutil",
                    ["-convert", "json", "-o", "-", path],
                    { encoding: "utf8" },
                  ),
                ),
              );
              const executable = plist.ProgramArguments[0];
              const database = plist.EnvironmentVariables.TODO_DB;
              const port = Number(plist.EnvironmentVariables.TODO_PORT);
              if (
                plist.ProgramArguments.length !== 1 ||
                executable === undefined ||
                !isAbsolute(executable) ||
                !isAbsolute(database) ||
                !/^\d+$/.test(plist.EnvironmentVariables.TODO_PORT) ||
                !Number.isInteger(port) ||
                port < 0 ||
                port > 65535
              )
                throw new Error("Invalid managed LaunchAgent configuration");
              return { executable, database, port };
            })
          : null,
      };
    });
  const stop = () =>
    checked(["bootout", target]).pipe(
      Effect.andThen(
        loaded().pipe(
          Effect.flatMap((active) =>
            active
              ? Effect.fail(new Error("LaunchAgent is still stopping"))
              : Effect.void,
          ),
          Effect.retry({ times: 50, schedule: Schedule.spaced(100) }),
        ),
      ),
    );
  return {
    status,
    install: (config: {
      readonly executable: string;
      readonly database: string;
      readonly port: number;
    }) =>
      Effect.gen(function* () {
        if (
          !isAbsolute(config.executable) ||
          !isAbsolute(config.database) ||
          !Number.isInteger(config.port) ||
          config.port < 0 ||
          config.port > 65535
        )
          return yield* Effect.fail(
            new Error(
              "Install requires absolute executable and database paths and a valid port",
            ),
          );
        yield* io(installed);
        const logs = join(options.home, "Library", "Logs", options.label);
        const plist = `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict>\n<key>Label</key><string>${options.label}</string>\n<key>ProgramArguments</key><array><string>${xml(config.executable)}</string></array>\n<key>EnvironmentVariables</key><dict><key>HOME</key><string>${xml(options.home)}</string><key>TODO_DB</key><string>${xml(config.database)}</string><key>TODO_PORT</key><string>${config.port}</string></dict>\n<key>RunAtLoad</key><true/><key>KeepAlive</key><true/>\n<key>StandardOutPath</key><string>${xml(join(logs, "stdout.log"))}</string>\n<key>StandardErrorPath</key><string>${xml(join(logs, "stderr.log"))}</string>\n</dict></plist>\n`;
        yield* io(() => {
          mkdirSync(directory, { recursive: true, mode: 0o700 });
          mkdirSync(logs, { recursive: true, mode: 0o700 });
          const temporary = `${path}.${crypto.randomUUID()}.tmp`;
          try {
            writeFileSync(temporary, plist, { mode: 0o600, flag: "wx" });
            renameSync(temporary, path);
          } finally {
            rmSync(temporary, { force: true });
          }
        });
        if (yield* loaded()) yield* stop();
        yield* run(["bootstrap", domain, path]).pipe(
          Effect.flatMap((result) =>
            result.code === 0 ? Effect.void : Effect.fail(result),
          ),
          Effect.retry({
            times: 50,
            schedule: Schedule.spaced(100),
            while: (result) => !(result instanceof Error) && result.code === 5,
          }),
          Effect.mapError((result) =>
            result instanceof Error
              ? result
              : new Error(
                  `launchctl bootstrap failed (${result.code}): ${result.stderr}`,
                ),
          ),
        );
        return yield* status();
      }),
    uninstall: () =>
      Effect.gen(function* () {
        yield* io(installed);
        if (yield* loaded()) yield* stop();
        yield* io(() => rmSync(path, { force: true }));
        return yield* status();
      }),
  };
};
