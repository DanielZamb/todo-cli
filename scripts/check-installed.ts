import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { CONTRACT_ID } from "../packages/api/src/contract.ts";
import { BUILD_ID } from "../packages/api/src/identity.ts";

const { values } = parseArgs({
  options: {
    require: { type: "string", multiple: true },
    "require-present": { type: "boolean" },
    "install-dir": {
      type: "string",
      default:
        process.env.TODO_CHECK_INSTALL_DIR ?? join(homedir(), ".local/bin"),
    },
    "agent-plist": {
      type: "string",
      default:
        process.env.TODO_CHECK_AGENT_PLIST ??
        join(
          homedir(),
          "Library/LaunchAgents",
          `${process.env.TODO_SERVICE_LABEL ?? "com.todo-cli.server"}.plist`,
        ),
    },
    "managed-executable": {
      type: "string",
      default: process.env.TODO_CHECK_MANAGED_EXECUTABLE,
    },
    "health-url": {
      type: "string",
      default: process.env.TODO_CHECK_HEALTH_URL,
    },
    "macos-app": {
      type: "string",
      default: process.env.TODO_CHECK_MACOS_APP ?? "/Applications/Todo.app",
    },
    "electron-app": {
      type: "string",
      default:
        process.env.TODO_CHECK_ELECTRON_APP ??
        "/Applications/Todo Electron.app",
    },
    build: { type: "string", default: process.env.TODO_BUILD_ID },
    contract: {
      type: "string",
      default: process.env.TODO_CHECK_CONTRACT ?? CONTRACT_ID,
    },
    help: { type: "boolean" },
  },
});
if (values.help) {
  process.stdout.write(
    "Usage: check-installed.sh [--require cli,server-bin,managed-server,macos-app,electron-app] [--require-present]\nPaths: --install-dir, --agent-plist, --managed-executable, --health-url, --macos-app, --electron-app. Override expected identity with --build and --contract.\nWithout --require, every present component must match. Absent optional components are not failures. No apps are launched; no Keychain access.\n",
  );
  process.exit(0);
}
const components = [
  "cli",
  "server-bin",
  "managed-server",
  "macos-app",
  "electron-app",
];
const required = new Set(
  values.require?.flatMap((value) => value.split(",")) ?? [],
);
for (const name of required)
  if (!components.includes(name))
    throw new Error(`Unknown required component: ${name}`);
let build = values.build;
if (!build) {
  try {
    build = execFileSync("git", ["rev-parse", "--short", "HEAD"], {
      cwd: import.meta.dirname,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    build = BUILD_ID;
  }
}
const expected = { build, contract: values.contract };
type Identity = { build: string; contract: string };
const version = (path: string): Identity => {
  const output = execFileSync(path, ["--version"], {
    encoding: "utf8",
    timeout: 10000,
    stdio: ["ignore", "pipe", "pipe"],
  });
  return {
    build: /\bbuild=(\S+)/.exec(output)?.[1] ?? "unknown",
    contract: /\bcontract=(\S+)/.exec(output)?.[1] ?? "missing",
  };
};
const readIdentity = (value: unknown): Identity => {
  if (value === null || typeof value !== "object")
    throw new Error("Invalid identity");
  return {
    build:
      "build" in value && typeof value.build === "string"
        ? value.build
        : "unknown",
    contract:
      "contract" in value && typeof value.contract === "string"
        ? value.contract
        : "missing",
  };
};
const rows: {
  component: string;
  artifact: string;
  identity?: Identity;
  error?: string;
  present: boolean;
}[] = [];
const binary = (
  component: string,
  artifact: string,
  path: string,
  present = existsSync(path),
) => {
  try {
    rows.push({
      component,
      artifact,
      present,
      ...(present ? { identity: version(path) } : {}),
    });
  } catch (error) {
    rows.push({
      component,
      artifact,
      present: true,
      error:
        error instanceof Error
          ? (error.message.split("\n")[0] ?? error.message)
          : String(error),
    });
  }
};
binary("cli", "todo", join(values["install-dir"], "todo"));
binary("server-bin", "todo-server", join(values["install-dir"], "todo-server"));
const plist = values["agent-plist"];
let managed = values["managed-executable"];
let health = values["health-url"];
const managedPresent =
  existsSync(plist) || Boolean(managed && existsSync(managed));
try {
  if (existsSync(plist)) {
    const configuration = JSON.parse(
      execFileSync("/usr/bin/plutil", ["-convert", "json", "-o", "-", plist], {
        encoding: "utf8",
      }),
    );
    managed ??= configuration.ProgramArguments?.[0];
    health ??= `http://127.0.0.1:${configuration.EnvironmentVariables?.TODO_PORT}/health`;
  }
  if (managedPresent) {
    if (!managed) throw new Error("Agent executable is missing");
    binary("managed-server", "agent executable", managed, true);
    if (!health)
      throw new Error(
        "Live health address is missing; set --health-url for a dynamic port",
      );
    const url = new URL(health);
    if (
      url.protocol !== "http:" ||
      url.hostname !== "127.0.0.1" ||
      url.username ||
      url.password
    )
      throw new Error("Expected loopback health URL");
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error(`Health HTTP ${response.status}`);
    const body: unknown = await response.json();
    if (
      !body ||
      typeof body !== "object" ||
      !("service" in body) ||
      body.service !== "todo-server"
    )
      throw new Error("Unexpected health service");
    rows.push({
      component: "managed-server",
      artifact: "live /health",
      present: true,
      identity: readIdentity(body),
    });
  } else
    rows.push({
      component: "managed-server",
      artifact: "agent",
      present: false,
    });
} catch (error) {
  rows.push({
    component: "managed-server",
    artifact: "agent / health",
    present: managedPresent,
    error: String(error),
  });
}
binary(
  "macos-app",
  "bundled server",
  join(values["macos-app"], "Contents/Resources/Server/todo-server"),
  existsSync(values["macos-app"]),
);
const electron = values["electron-app"];
try {
  const present = existsSync(electron);
  rows.push({
    component: "electron-app",
    artifact: "bundle identity",
    present,
    ...(present
      ? {
          identity: readIdentity(
            JSON.parse(
              readFileSync(
                join(electron, "Contents/Resources/app/identity.json"),
                "utf8",
              ),
            ),
          ),
        }
      : {}),
  });
} catch (error) {
  rows.push({
    component: "electron-app",
    artifact: "bundle identity",
    present: true,
    error: String(error),
  });
}
let failed = false;
process.stdout.write(
  `Checkout build=${expected.build} contract=${expected.contract}\n`,
);
process.stdout.write(
  "COMPONENT       ARTIFACT           RESULT          BUILD        CONTRACT\n",
);
for (const row of rows) {
  const mustMatch =
    required.has(row.component) ||
    (row.present &&
      (values["require-present"] || values.require === undefined));
  const matches =
    row.identity?.build === expected.build &&
    row.identity.contract === expected.contract;
  const mismatch = row.present && !matches;
  const status = !row.present
    ? mustMatch
      ? "MISSING"
      : "not installed"
    : matches
      ? "OK"
      : mustMatch
        ? "MISMATCH"
        : "WARNING";
  if (mustMatch && (!row.present || mismatch)) failed = true;
  process.stdout.write(
    `${row.component.padEnd(16)}${row.artifact.padEnd(19)}${status.padEnd(16)}${(row.identity?.build ?? "-").padEnd(13)}${row.identity?.contract ?? "-"}${row.error ? ` (${row.error})` : ""}\n`,
  );
  if (mismatch && !mustMatch)
    process.stdout.write(
      `WARNING ${row.component}: installed components differ. Run scripts/upgrade-local.sh.\n`,
    );
}
process.exitCode = failed ? 1 : 0;
