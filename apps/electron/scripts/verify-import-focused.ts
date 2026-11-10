import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron, type ElectronApplication, expect } from "@playwright/test";
import { verifyImport } from "./verify-import.ts";

const binaries = process.argv[2];
const evidence = process.argv[3];
if (!binaries || !evidence)
  throw new Error("Pass compiled binary directory and fresh evidence path");
mkdirSync(evidence, { recursive: false });
const scratch = mkdtempSync(join(tmpdir(), "todo-s01-verify-import-"));
const env: NodeJS.ProcessEnv & { HOME: string; TODO_DB: string } = {
  ...process.env,
  HOME: join(scratch, "home"),
  TODO_DB: join(scratch, "scratch.db"),
  TODO_PORT: "0",
  TODO_ELECTRON_VERIFY_HOST: "1",
};
delete env.ELECTRON_RUN_AS_NODE;
mkdirSync(join(env.HOME, ".todo-cli"), { recursive: true });
writeFileSync(
  join(env.HOME, ".todo-cli/config.json"),
  JSON.stringify({ db_path: env.TODO_DB }),
);
execFileSync(join(binaries, "seed"), [scratch], { env });
const server = spawn(join(binaries, "server"), [], {
  env,
  stdio: ["ignore", "pipe", "pipe"],
});
let log = "";
server.stdout.on("data", (chunk) => {
  log += chunk;
});
server.stderr.on("data", (chunk) => {
  log += chunk;
});
let desktop: ElectronApplication | undefined;
try {
  await expect
    .poll(() => log.match(/Listening on (http:\/\/127\.0\.0\.1:\d+)/)?.[1], {
      timeout: 60000,
    })
    .toBeTruthy();
  const url = log.match(/Listening on (http:\/\/127\.0\.0\.1:\d+)/)?.[1];
  if (!url) throw new Error("Scratch server did not publish its loopback URL");
  const cli = (...args: string[]) =>
    execFileSync(
      join(binaries, "todo"),
      ["--profile", "work", "--format", "json", ...args],
      {
        env,
        encoding: "utf8",
        input: args[0] === "login" ? "scratch verification passphrase\n" : "",
      },
    );
  cli("login");
  const executablePath: string = createRequire(import.meta.url)("electron");
  desktop = await _electron.launch({
    executablePath,
    args: [resolve(import.meta.dirname, "../dist/verification/write-host.mjs")],
    env: {
      ...env,
      TODO_SERVER_URL: url,
      TODO_ELECTRON_DATA: join(scratch, "electron"),
    },
    timeout: 60000,
  });
  const page = await desktop.firstWindow({ timeout: 60000 });
  await expect(
    page.getByRole("button", { name: "Import…", exact: true }),
  ).toBeVisible({ timeout: 60000 });
  await verifyImport({ page, scratch, evidence, cli });
  writeFileSync(
    join(evidence, "result.json"),
    JSON.stringify({ status: "PASS", signed: false, keychainAccess: false }),
  );
} catch (error) {
  const page = desktop?.windows()[0];
  if (page) await page.screenshot({ path: join(evidence, "failure.png") });
  writeFileSync(join(evidence, "failure.txt"), String(error));
  throw error;
} finally {
  await desktop?.close();
  writeFileSync(join(evidence, "server.log"), log);
  if (server.exitCode === null && server.signalCode === null) {
    const stopped = new Promise<void>((done) =>
      server.once("exit", () => done()),
    );
    const timer = setTimeout(() => server.kill("SIGKILL"), 2000);
    server.kill("SIGTERM");
    await stopped;
    clearTimeout(timer);
  }
  rmSync(scratch, { recursive: true, force: true });
}
