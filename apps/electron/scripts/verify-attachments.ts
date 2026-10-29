import { execFileSync, spawn } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron, type ElectronApplication, expect } from "@playwright/test";
import { setAppearance } from "./appearance.ts";

if (process.env.TODO_ELECTRON_VERIFY_HOST !== "1")
  throw new Error("Compiled host only");
const evidence = resolve(process.argv[2] ?? "");
if (!process.argv[2] || existsSync(evidence))
  throw new Error("Pass a fresh absolute evidence directory");
mkdirSync(evidence, { recursive: true });
const scratch = mkdtempSync(join(tmpdir(), "todo-s01-verify-f11-"));
const root = resolve(import.meta.dirname, "../../..");
const env: NodeJS.ProcessEnv & { HOME: string } = {
  ...process.env,
  HOME: join(scratch, "home"),
  TODO_DB: join(scratch, "scratch.db"),
  TODO_PORT: "0",
  TODO_ELECTRON_VERIFY_HOST: "1",
  TODO_ELECTRON_DATA: join(scratch, "electron"),
};
delete env.ELECTRON_RUN_AS_NODE;
mkdirSync(env.HOME);
let desktop: ElectronApplication | undefined;
let proxy: Bun.Server<undefined> | undefined;
let delayLists = false;
let server: ReturnType<typeof spawn> | undefined;
let log = "";
const receipts: unknown[] = [];
try {
  if (!process.env.TODO_F11_SERVER) {
    for (const { input, name } of [
      { input: "apps/server/src/main.ts", name: "server" },
      { input: "apps/cli/src/main.ts", name: "todo" },
    ]) {
      const supplied =
        name === "server"
          ? process.env.TODO_SERVER_BINARY
          : process.env.TODO_CLI_BINARY;
      if (supplied) {
        copyFileSync(supplied, join(scratch, name));
        continue;
      }
      const out = execFileSync(
        "bun",
        [
          "build",
          "--compile",
          join(root, input),
          "--outfile",
          join(scratch, name),
        ],
        { cwd: scratch, env, encoding: "utf8", timeout: 120000 },
      );
      writeFileSync(join(evidence, `compile-${name}.log`), out);
    }
    execFileSync(
      join(scratch, "todo"),
      ["--profile", "work", "init", "--password-stdin"],
      { env, cwd: scratch, input: "scratch verification passphrase\n" },
    );
    server = spawn(join(scratch, "server"), [], {
      env,
      cwd: scratch,
      stdio: ["ignore", "pipe", "pipe"],
    });
    server.stdout?.on("data", (value) => {
      log += value.toString();
    });
    server.stderr?.on("data", (value) => {
      log += value.toString();
    });
    await expect
      .poll(() => /Listening on (http:\/\/127\.0\.0\.1:\d+)/.exec(log)?.[1], {
        timeout: 60000,
      })
      .toBeTruthy();
  }
  const url =
    process.env.TODO_F11_SERVER ??
    /Listening on (http:\/\/127\.0\.0\.1:\d+)/.exec(log)?.[1];
  if (!url) throw new Error("No server URL");
  const credential = (
    await (
      await fetch(`${url}/auth/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passphrase: "scratch verification passphrase" }),
      })
    ).json()
  ).credential;
  const api = async (path: string, method = "GET", payload?: unknown) => {
    const response = await fetch(`${url}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${credential}`,
        "Content-Type": "application/json",
      },
      ...(payload ? { body: JSON.stringify(payload) } : {}),
    });
    expect(response.status).toBe(200);
    const result = await response.json();
    receipts.push({ method, path, payload, result });
    return result;
  };
  const created = await api("/profiles/work/tasks", "POST", {
    title: "F11 Attachment editor",
    project_name: "International Platform Accessibility and Release Planning",
    tag_names: [
      "accessibility review",
      "deep focus",
      "international launch",
      "release planning",
    ],
  });
  const target = `/profiles/work/tasks/${created.id}`;
  proxy = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(incoming) {
      const upstream = new URL(incoming.url);
      const origin = new URL(url);
      upstream.host = origin.host;
      const response = await fetch(new Request(upstream, incoming));
      if (
        delayLists &&
        incoming.method === "GET" &&
        upstream.pathname === "/profiles/work/tasks"
      )
        await new Promise((done) => setTimeout(done, 1500));
      return response;
    },
  });
  desktop = await _electron.launch({
    executablePath: createRequire(import.meta.url)("electron"),
    args: [join(root, "apps/electron/dist/verification/write-host.mjs")],
    env: { ...env, TODO_SERVER_URL: proxy.url.origin },
    timeout: 60000,
  });
  await desktop.context().tracing.start({ screenshots: true, snapshots: true });
  const page = await desktop.firstWindow();
  page.setDefaultTimeout(60000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.locator(`[data-task-id="${created.id}"] .task-title`).click();
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue(
    "F11 Attachment editor",
  );
  const section = page.getByRole("region", {
    name: "Attachments",
    exact: true,
  });
  await section.scrollIntoViewIfNeeded();
  await expect(
    section.getByText("Drop files or paste an image here."),
  ).toBeVisible();
  await page.screenshot({
    path: join(evidence, "electron-attachments-empty-light.png"),
  });
  const file = join(scratch, "jira-draft.md");
  writeFileSync(file, "Jira draft from the picker\n");
  await desktop.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [path],
    });
  }, file);
  await desktop.evaluate(({ clipboard }) => {
    clipboard.read = async () => [];
  });
  await section
    .getByRole("button", { name: "Add attachment", exact: true })
    .click();
  await expect(
    page.getByRole("menuitem", { name: "Paste Image", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("menuitem", { name: "Add File…", exact: true }).click();
  await expect(
    section.getByRole("button", { name: "jira-draft.md", exact: true }),
  ).toBeVisible({ timeout: 60000 });
  await expect
    .poll(async () => (await api(target)).attachments?.length, {
      timeout: 60000,
    })
    .toBe(1);
  await section
    .getByRole("button", {
      name: "Attachment actions for jira-draft.md",
      exact: true,
    })
    .click();
  await page
    .getByRole("menuitem", { name: "Mark as Jira draft", exact: true })
    .click();
  await expect(section.getByText("Jira", { exact: true })).toBeVisible();
  await expect(
    page
      .locator(`[data-task-id="${created.id}"]`)
      .getByRole("img", { name: "Jira draft attached" }),
  ).toBeVisible();
  await section
    .getByRole("button", {
      name: "Attachment actions for jira-draft.md",
      exact: true,
    })
    .click();
  await page
    .getByRole("menuitem", { name: "Edit label…", exact: true })
    .click();
  await section.getByLabel("Label for jira-draft.md").fill("review");
  await page.screenshot({
    path: join(evidence, "electron-attachments-edit-label-light.png"),
    animations: "disabled",
  });
  await section
    .getByRole("button", { name: "Save label", exact: true })
    .click();
  await expect(section.getByText("review", { exact: true })).toBeVisible();
  await section
    .getByRole("button", {
      name: "Attachment actions for jira-draft.md",
      exact: true,
    })
    .click();
  await page
    .getByRole("menuitem", { name: "Clear label", exact: true })
    .click();
  await expect(section.getByText("review", { exact: true })).toHaveCount(0);
  await section
    .getByRole("button", {
      name: "Attachment actions for jira-draft.md",
      exact: true,
    })
    .click();
  await page
    .getByRole("menuitem", { name: "Mark as Jira draft", exact: true })
    .click();
  await expect(section.getByText("Jira", { exact: true })).toBeVisible();
  await section
    .getByRole("button", { name: "Add attachment", exact: true })
    .click();
  await page.getByRole("menuitem", { name: "Add Link…", exact: true }).click();
  await section
    .getByLabel("Attachment URL")
    .fill("https://example.com/issue/42");
  await section
    .getByRole("button", { name: "Attach link", exact: true })
    .click();
  await expect
    .poll(async () => (await api(target)).attachments?.length, {
      timeout: 60000,
    })
    .toBe(2);
  const image = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 240;
    canvas.height = 160;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas unavailable");
    context.fillStyle = "#e0ede3";
    context.fillRect(0, 0, 240, 160);
    context.fillStyle = "#285d46";
    context.fillRect(24, 24, 124, 12);
    context.fillRect(24, 64, 44, 72);
    context.fillRect(88, 88, 44, 48);
    context.fillRect(152, 48, 44, 88);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  if (!image) throw new Error("Missing PNG");
  writeFileSync(
    join(evidence, "preview-fixture.png"),
    Buffer.from(image, "base64"),
  );
  const transfer = await page.evaluateHandle((base64) => {
    const data = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const transfer = new DataTransfer();
    transfer.items.add(
      new File([data], "launch-sketch.png", { type: "image/png" }),
    );
    return transfer;
  }, image);
  await section.dispatchEvent("drop", { dataTransfer: transfer });
  await expect
    .poll(async () => (await api(target)).attachments?.length, {
      timeout: 60000,
    })
    .toBe(3);
  await expect(section.getByRole("img", { name: /Preview of/ })).toBeVisible();

  writeFileSync(
    join(evidence, "paste-source.json"),
    JSON.stringify(
      await transfer.evaluate((value) =>
        [...value.files].map((file) => ({ type: file.type, size: file.size })),
      ),
    ),
  );
  await section.evaluate(
    (element, clipboardData) =>
      element.dispatchEvent(
        new ClipboardEvent("paste", {
          clipboardData,
          bubbles: true,
          cancelable: true,
        }),
      ),
    transfer,
  );
  writeFileSync(join(evidence, "paste-section.txt"), await section.innerText());
  await expect
    .poll(async () => (await api(target)).attachments?.length, {
      timeout: 60000,
    })
    .toBe(4);
  const snapshot = await api(target);
  const copied = snapshot.attachments.filter(
    (value: { kind: string }) => value.kind === "image",
  );
  for (const value of copied)
    expect(readFileSync(value.path).toString("base64")).toBe(image);
  await section
    .getByRole("button", {
      name: "Remove attachment launch-sketch.png",
      exact: true,
    })
    .last()
    .click();
  await expect
    .poll(async () => (await api(target)).attachments?.length)
    .toBe(3);
  await section
    .getByRole("button", { name: "Remove attachment example.com", exact: true })
    .click();
  await expect
    .poll(async () => (await api(target)).attachments?.length, {
      timeout: 60000,
    })
    .toBe(2);
  await page.getByRole("button", { name: "History", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Revert attachment removed change",
      exact: true,
    })
    .first()
    .click();
  await expect
    .poll(async () => (await api(target)).attachments?.length, {
      timeout: 60000,
    })
    .toBe(3);
  await expect(page.getByRole("dialog", { name: "Task History" })).toBeHidden();
  await expect(section.locator(".attachment-row")).toHaveCount(3);
  rmSync(file);
  await page.reload();
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue(
    "F11 Attachment editor",
  );
  await section.scrollIntoViewIfNeeded();
  await expect(
    section.getByText("Missing file", { exact: true }),
  ).toBeVisible();
  await expect(
    section.getByRole("button", { name: "jira-draft.md", exact: true }),
  ).toBeDisabled();
  await expect(
    section.getByRole("button", {
      name: "Reveal jira-draft.md in Finder",
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(
    section.getByRole("button", {
      name: "Remove attachment jira-draft.md",
      exact: true,
    }),
  ).toBeEnabled();
  await desktop.evaluate(({ clipboard, ClipboardItem }, base64) => {
    clipboard.read = async () => [
      new ClipboardItem({
        "image/png": new Blob(
          [Uint8Array.from(Buffer.from(base64, "base64"))],
          { type: "image/png" },
        ),
      }),
    ];
  }, image);
  await section
    .getByRole("button", { name: "Add attachment", exact: true })
    .click();
  await page
    .getByRole("menuitem", { name: "Paste Image", exact: true })
    .click();
  await expect
    .poll(async () => (await api(target)).attachments?.length)
    .toBe(4);
  await section
    .getByRole("button", { name: "Remove attachment Image.png", exact: true })
    .click();
  await expect
    .poll(async () => (await api(target)).attachments?.length)
    .toBe(3);
  for (const dark of [false, true]) {
    if (dark) await setAppearance(page, "dark");
    const mode = dark ? "dark" : "light";
    await section.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: join(evidence, `electron-attachments-${mode}.png`),
      animations: "disabled",
    });
    await page
      .getByRole("button", { name: "Compact mode", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Back to tasks", exact: true })
      .click();
    const compactRow = page.locator(`[data-task-id="${created.id}"]`);
    await compactRow.scrollIntoViewIfNeeded();
    const marker = compactRow.getByRole("img", {
      name: "Jira draft attached",
      exact: true,
    });
    await expect(marker).toBeVisible();
    const markerBounds = await marker.evaluate((marker) => {
      const bounds = marker.getBoundingClientRect();
      return {
        left: bounds.left,
        right: bounds.right,
        width: bounds.width,
        height: bounds.height,
        shrink: getComputedStyle(marker).flexShrink,
        text: marker.textContent,
      };
    });
    expect(markerBounds.text).toBe("Jira");
    expect(markerBounds.shrink).toBe("0");
    expect(markerBounds.left).toBeGreaterThanOrEqual(0);
    expect(markerBounds.right).toBeLessThanOrEqual(393);
    writeFileSync(
      join(evidence, `compact-jira-bounds-${mode}.json`),
      JSON.stringify(markerBounds, null, 2),
    );
    await page.screenshot({
      path: join(evidence, `electron-attachments-compact-row-${mode}.png`),
      animations: "disabled",
    });
    await compactRow.locator(".task-title").click();
    await section.scrollIntoViewIfNeeded();
    const compactHeader = await page
      .locator(".editor-heading")
      .evaluate((header) => ({
        z: getComputedStyle(header).zIndex,
        background: getComputedStyle(header).backgroundColor,
      }));
    expect(Number(compactHeader.z)).toBeGreaterThanOrEqual(10);
    const bounds = await section.evaluate((section) => {
      const editor = section.closest(".editor");
      const header = editor?.querySelector(".editor-heading");
      const form = editor?.querySelector("form");
      if (!editor || !header || !form)
        throw new Error("Missing editor geometry");
      const heading = header.getBoundingClientRect();
      const clip = form.getBoundingClientRect();
      const rows = [...section.querySelectorAll(".attachment-row")].map((row) =>
        row.getBoundingClientRect(),
      );
      const sectionHeading = section
        .querySelector(".attachment-heading")
        ?.getBoundingClientRect();
      const controls = [...section.querySelectorAll("button")].map((button) =>
        button.getBoundingClientRect(),
      );
      const filenameEnds = [
        ...section.querySelectorAll(".attachment-filename-tail"),
      ].map((tail) => {
        const end = tail.getBoundingClientRect();
        const name = tail.parentElement?.getBoundingClientRect();
        return {
          text: tail.textContent,
          visible:
            !!name && end.left >= name.left && end.right <= name.right + 0.5,
        };
      });
      const outside = editor.querySelectorAll(
        "input,button,select,textarea,[data-slot=input-group-addon]",
      );
      const overlap = [...outside].filter((control) => {
        if (header.contains(control)) return false;
        const rect = control.getBoundingClientRect();
        const left = Math.max(rect.left, clip.left, heading.left);
        const right = Math.min(rect.right, clip.right, heading.right);
        const top = Math.max(rect.top, clip.top, heading.top);
        const bottom = Math.min(rect.bottom, clip.bottom, heading.bottom);
        return right > left && bottom > top;
      });
      return {
        height: innerHeight,
        width: innerWidth,
        header: heading.toJSON(),
        clip: clip.toJSON(),
        rows: rows.map((r) => r.toJSON()),
        sectionHeading: sectionHeading?.toJSON(),
        targets: controls.map((r) => ({ width: r.width, height: r.height })),
        filenameEnds,
        overlap: overlap.length,
        wholeRows: rows.every(
          (r) =>
            r.top >= clip.top && r.bottom <= Math.min(clip.bottom, innerHeight),
        ),
        wholeHeading:
          !!sectionHeading &&
          sectionHeading.top >= clip.top &&
          sectionHeading.bottom <= clip.bottom,
      };
    });
    writeFileSync(
      join(evidence, `compact-bounds-${mode}.json`),
      JSON.stringify(bounds, null, 2),
    );
    expect(bounds.width).toBe(393);
    expect(bounds.height).toBe(426);
    expect(bounds.rows).toHaveLength(3);
    expect(bounds.overlap).toBe(0);
    expect(bounds.wholeRows).toBe(true);
    expect(bounds.wholeHeading).toBe(true);
    expect(bounds.targets.every((r) => r.width >= 32 && r.height >= 32)).toBe(
      true,
    );
    expect(bounds.filenameEnds.map((end) => end.visible)).toEqual([true, true]);
    const managed = section
      .locator(".attachment-row")
      .filter({ hasText: "launch-sketch.png" })
      .locator(".attachment-path");
    await expect(managed).toHaveText(/^Copied image · /);
    const managedPath = await managed.getAttribute("title");
    expect(managedPath).toMatch(/^\//);
    await expect(managed).toHaveAttribute(
      "aria-description",
      managedPath ?? "",
    );
    writeFileSync(
      join(evidence, `compact-bounds-${mode}.json`),
      JSON.stringify(bounds, null, 2),
    );
    await page.screenshot({
      path: join(evidence, `electron-attachments-compact-${mode}.png`),
      animations: "disabled",
    });
    await section
      .getByRole("button", { name: "Add attachment", exact: true })
      .click();
    await expect(
      page.getByRole("menuitem", { name: "Paste Image", exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: join(evidence, `electron-attachments-compact-add-${mode}.png`),
      animations: "disabled",
    });
    await page.keyboard.press("Escape");
    await page
      .getByRole("button", { name: "Expand window", exact: true })
      .click();
  }
  const batch = await api("/profiles/work/tasks", "POST", {
    title: "F11 delayed batch",
  });
  await expect(
    page.locator(`[data-task-id="${batch.id}"] .task-title`),
  ).toBeVisible();
  await page.locator(`[data-task-id="${batch.id}"] .task-title`).click();
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue(
    "F11 delayed batch",
  );
  delayLists = true;
  const pair = await page.evaluateHandle((base64) => {
    const bytes = Uint8Array.from(atob(base64), (character) =>
      character.charCodeAt(0),
    );
    const transfer = new DataTransfer();
    transfer.items.add(new File([bytes], "first.png", { type: "image/png" }));
    transfer.items.add(new File([bytes], "second.png", { type: "image/png" }));
    return transfer;
  }, image);
  await section.dispatchEvent("drop", { dataTransfer: pair });
  await expect
    .poll(
      async () =>
        (await api(`/profiles/work/tasks/${batch.id}`)).attachments?.length ??
        0,
      { timeout: 10000 },
    )
    .toBe(2);
  delayLists = false;
  await expect(section.locator(".attachment-row")).toHaveCount(2);
  await expect(section.getByRole("alert")).toHaveCount(0);
  expect(errors).toEqual([]);
  writeFileSync(
    join(evidence, "result.json"),
    JSON.stringify(
      {
        status: "PASS",
        filePickerNativeBoundaryStubbed: true,
        productionIPC: true,
        rowLabelSetEditClear: true,
        compactHeaderNoOverlap: true,
        compactThreeWholeRows: true,
        oneAddMenu: true,
        link: true,
        imageDropCopied: true,
        imagePasteCopied: true,
        nativePasteMenuCopied: true,
        twoImageBatchWithDelayedListRefresh: true,
        detach: true,
        revert: true,
        missingAfterReload: true,
        jiraRowMarker: true,
        noKeychain: true,
        signedAppLaunched: false,
      },
      null,
      2,
    ),
  );
  await desktop.context().tracing.stop({ path: join(evidence, "trace.zip") });
} catch (error) {
  writeFileSync(join(evidence, "failure.txt"), String(error));
  if (desktop?.windows()[0])
    await desktop
      .windows()[0]
      ?.screenshot({ path: join(evidence, "failure.png") });
  throw error;
} finally {
  if (desktop) await desktop.close();
  proxy?.stop(true);
  if (server && server.exitCode === null && server.signalCode === null) {
    const exited = new Promise<void>((done) =>
      server?.once("exit", () => done()),
    );
    const timer = setTimeout(() => server?.kill("SIGKILL"), 2000);
    server.kill("SIGTERM");
    await exited;
    clearTimeout(timer);
  }
  writeFileSync(join(evidence, "server.log"), log);
  writeFileSync(
    join(evidence, "actions.json"),
    JSON.stringify(receipts, null, 2),
  );
  rmSync(scratch, { recursive: true, force: true });
}
