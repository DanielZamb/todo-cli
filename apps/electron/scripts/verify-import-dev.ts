import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { _electron, expect } from "@playwright/test";
import { Schema } from "effect";
import { verifyImport } from "./verify-import.ts";
import { verifyImportRaces } from "./verify-import-races.ts";

const root = resolve(import.meta.dirname, "../../..");
const receipt = Schema.decodeUnknownSync(
  Schema.Struct({
    url: Schema.String,
    cli: Schema.String,
    home: Schema.String,
    database: Schema.String,
  }),
)(JSON.parse(readFileSync(join(root, ".scratch/server.json"), "utf8")));
const evidence = process.argv[2];
if (!evidence) throw new Error("Pass evidence directory");
mkdirSync(evidence, { recursive: true });
if (!receipt.url) throw new Error("Start the worktree scratch server first");
const scratch = join(root, ".scratch/todo-s01-verify-import");
mkdirSync(scratch, { recursive: true });
const env = {
  ...Object.fromEntries(
    Object.entries(process.env).flatMap(([key, value]) =>
      value === undefined || key === "ELECTRON_RUN_AS_NODE"
        ? []
        : [[key, value]],
    ),
  ),
  HOME: receipt.home,
  TODO_DB: receipt.database,
  TODO_SERVER_URL: receipt.url,
  TODO_ELECTRON_DATA: join(scratch, "electron"),
  TODO_ELECTRON_VERIFY_HOST: "1",
};

const cli = (...args: string[]) =>
  execFileSync(
    receipt.cli,
    ["--profile", "work", "--format", "json", ...args],
    { env, encoding: "utf8" },
  );
const executablePath: string = createRequire(import.meta.url)("electron");
const desktop = await _electron.launch({
  executablePath,
  args: [join(root, "apps/electron/dist/verification/write-host.mjs")],
  env,
  timeout: 60000,
});
try {
  const page = await desktop.firstWindow({ timeout: 60000 });
  page.setDefaultTimeout(30000);
  await expect(
    page.getByRole("button", { name: "Import…", exact: true }),
  ).toBeVisible({ timeout: 60000 });
  if (
    await page
      .getByRole("button", { name: "Expand window", exact: true })
      .isVisible()
  )
    await page
      .getByRole("button", { name: "Expand window", exact: true })
      .click();
  if (
    await page
      .getByRole("button", { name: "Light appearance", exact: true })
      .isVisible()
  )
    await page
      .getByRole("button", { name: "Light appearance", exact: true })
      .click();
  await expect(
    page.getByRole("heading", { name: "Tasks", exact: true }),
  ).toBeVisible();
  if (process.env.TODO_IMPORT_RACES_ONLY === "1")
    await verifyImportRaces(page, scratch, evidence, cli);
  else await verifyImport({ page, scratch, evidence, cli });
} catch (error) {
  const page = desktop.windows()[0];
  if (page) await page.screenshot({ path: join(evidence, "failure.png") });
  writeFileSync(join(evidence, "failure.txt"), String(error));
  throw error;
} finally {
  await desktop.close();
}
