import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { _electron, type ElectronApplication, expect } from "@playwright/test";
import { Schema } from "effect";
import { verifyCompact } from "./verify-compact.ts";
import { verifyMetadata } from "./verify-metadata.ts";
import { verifyTagLayout } from "./verify-tag-layout.ts";
import { verifyTaskFilters } from "./verify-task-filters.ts";

const scratch = process.argv[2];
const evidence = process.argv[3];
if (
  process.env.TODO_ELECTRON_VERIFY_HOST !== "1" ||
  !scratch?.includes("todo-s01-verify-") ||
  !evidence
)
  throw new Error("Expected host-only scratch and evidence paths");
const env: NodeJS.ProcessEnv & {
  HOME: string;
  TODO_DB: string;
  TODO_PORT: string;
} = {
  ...process.env,
  HOME: join(scratch, "home"),
  TODO_DB: join(scratch, "scratch.db"),
  TODO_PORT: "0",
};
delete env.ELECTRON_RUN_AS_NODE;
mkdirSync(join(env.HOME, ".todo-cli"), { recursive: true });
writeFileSync(
  join(env.HOME, ".todo-cli/config.json"),
  JSON.stringify({ db_path: env.TODO_DB }),
);
let log = "";
let desktop: ElectronApplication | undefined;
const server = spawn(join(scratch, "server"), [], {
  env,
  stdio: ["ignore", "pipe", "pipe"],
});
server.stdout.on("data", (chunk) => {
  log += chunk;
});
server.stderr.on("data", (chunk) => {
  log += chunk;
});
const stopServer = async () => {
  if (server.exitCode !== null || server.signalCode !== null) return;
  const stopped = new Promise<void>((done) =>
    server.once("exit", () => done()),
  );
  const timer = setTimeout(() => server.kill("SIGKILL"), 2000);
  server.kill("SIGTERM");
  await stopped;
  clearTimeout(timer);
};
const receipts: unknown[] = [];
try {
  await expect
    .poll(() => log.match(/Listening on (http:\/\/127\.0\.0\.1:\d+)/)?.[1], {
      timeout: 60000,
    })
    .toBeTruthy();
  const serverURL = log.match(/Listening on (http:\/\/127\.0\.0\.1:\d+)/)?.[1];
  if (!serverURL) throw new Error("Scratch server did not become ready");
  expect(await (await fetch(`${serverURL}/health`)).json()).toEqual({
    service: "todo-server",
  });
  const signedIn = await fetch(`${serverURL}/auth/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ passphrase: "scratch verification passphrase" }),
  });
  const { credential } = Schema.decodeUnknownSync(
    Schema.Struct({ credential: Schema.String }),
  )(await signedIn.json());
  const api = async (
    path: string,
    method = "GET",
    payload?: unknown,
  ): Promise<unknown> => {
    const response = await fetch(serverURL + path, {
      method,
      headers: {
        Authorization: `Bearer ${credential}`,
        "Content-Type": "application/json",
      },
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
    });
    const value: unknown = await response.json();
    receipts.push({
      method,
      path,
      status: response.status,
      ...(payload === undefined ? {} : { payload }),
      response: value,
    });
    expect(response.status).toBe(200);
    return value;
  };
  const cli = (...args: string[]) =>
    execFileSync(
      join(scratch, "todo"),
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
      TODO_SERVER_URL: serverURL,
      TODO_ELECTRON_DATA: join(scratch, "electron"),
    },
    timeout: 60000,
  });
  const page = await desktop.firstWindow();
  page.setDefaultTimeout(30000);
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(String(error)));
  await desktop.context().tracing.start({ screenshots: true, snapshots: true });
  await expect(
    page.getByRole("heading", { name: "Tasks", exact: true }),
  ).toBeVisible();
  if (process.env.TODO_ELECTRON_VERIFY_FILTERS_ONLY === "1") {
    await verifyTaskFilters({
      page,
      desktop,
      evidence,
      api,
      cli,
      disconnect: stopServer,
    });
  } else {
    if (process.env.TODO_ELECTRON_VERIFY_TAG_LAYOUT_ONLY !== "1") {
      await verifyCompact({ desktop, page, scratch, evidence });
      await verifyMetadata({
        desktop,
        page,
        scratch,
        evidence,
        api,
        serverURL,
        cli,
      });
    }
    await verifyTagLayout({ page, evidence, api });
  }
  expect(pageErrors).toEqual([]);
  await page.screenshot({
    path: join(evidence, "tasks.png"),
    animations: "disabled",
  });
  await desktop.context().tracing.stop({ path: join(evidence, "trace.zip") });
  writeFileSync(
    join(evidence, "result.json"),
    JSON.stringify(
      {
        status: "THIN_PASS_NATIVE_BLOCKED",
        metadataMatrix:
          process.env.TODO_ELECTRON_VERIFY_FILTERS_ONLY !== "1" &&
          process.env.TODO_ELECTRON_VERIFY_TAG_LAYOUT_ONLY !== "1",
        tagLayout: process.env.TODO_ELECTRON_VERIFY_FILTERS_ONLY !== "1",
        taskFilters: process.env.TODO_ELECTRON_VERIFY_FILTERS_ONLY === "1",
        compactMode: true,
        pageErrors,
        native:
          "HOLD. Compiled scratch host only; no Keychain, signing or native notification proof.",
      },
      null,
      2,
    ),
  );
} catch (error) {
  writeFileSync(join(evidence, "failure.txt"), String(error));
  const page = desktop?.windows()[0];
  if (page) {
    await page.screenshot({ path: join(evidence, "failure.png") });
    writeFileSync(
      join(evidence, "filter-geometry-failure.json"),
      JSON.stringify(
        await page
          .locator(
            ".task-filters, .task-filter-fields, .task-filter-fields fieldset, .task-filter-fields select",
          )
          .evaluateAll((elements) =>
            elements.map((element) => ({
              tag: element.tagName,
              classes: element.className,
              rect: element.getBoundingClientRect().toJSON(),
              display: getComputedStyle(element).display,
              flex: getComputedStyle(element).flex,
              containerType: getComputedStyle(element).containerType,
            })),
          ),
        null,
        2,
      ),
    );
  }
  throw error;
} finally {
  if (desktop) await desktop.close();
  await stopServer();
  writeFileSync(join(evidence, "server.log"), log);
  writeFileSync(
    join(evidence, "actions.json"),
    JSON.stringify(receipts, null, 2),
  );
}
