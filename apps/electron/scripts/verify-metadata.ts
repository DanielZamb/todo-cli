import { writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  _electron,
  type ElectronApplication,
  expect,
  type Page,
} from "@playwright/test";
import { QuickAddDraft, Task } from "@todo/domain";
import { Schema } from "effect";
import { setAppearance } from "./appearance.ts";

export async function verifyMetadata({
  page,
  desktop,
  evidence,
  api,
  scratch,
  serverURL,
  cli,
}: {
  page: Page;
  desktop: ElectronApplication;
  evidence: string;
  scratch: string;
  serverURL: string;
  cli: (...args: string[]) => string;
  api: (path: string, method?: string, payload?: unknown) => Promise<unknown>;
}) {
  const created = Schema.decodeUnknownSync(Task)(
    await api("/profiles/work/tasks", "POST", {
      title: "Review metadata for the international launch",
      project_name: "International Platform Accessibility and Release Planning",
      tag_names: [
        "accessibility review",
        "international launch",
        "release planning",
        "deep focus",
      ],
    }),
  );
  const row = page.locator(`[data-task-id="${created.id}"]`);
  await expect(row).toBeVisible();
  const measurements: unknown[] = [];
  for (const compact of [false, true]) {
    if (compact)
      await page
        .getByRole("button", { name: "Compact mode", exact: true })
        .click();
    for (const theme of ["light", "dark"]) {
      if (theme === "dark") await setAppearance(page, "dark");
      await row.scrollIntoViewIfNeeded();
      if (compact) {
        const tags = row.locator(".compact-row-metadata");
        const shown = await tags
          .locator("[data-whole-metadata]")
          .allTextContents();
        const overflow = await tags.locator(".metadata-overflow").textContent();
        expect(shown.length + Number(overflow?.slice(1))).toBe(5);
        expect(
          shown.every((name) =>
            [
              "International Platform Accessibility and Release Planning",
              "#accessibility review",
              "#deep focus",
              "#international launch",
              "#release planning",
            ].includes(name),
          ),
        ).toBe(true);
        await expect(tags).toHaveAttribute(
          "title",
          "International Platform Accessibility and Release Planning · #accessibility review · #deep focus · #international launch · #release planning",
        );
        expect(
          await tags.evaluate((element) => {
            const bounds = element.getBoundingClientRect();
            return [
              ...element.querySelectorAll(
                "[data-whole-metadata], .metadata-overflow",
              ),
            ].every((tag) => {
              const rect = tag.getBoundingClientRect();
              return rect.left >= bounds.left && rect.right <= bounds.right;
            });
          }),
        ).toBe(true);
      }
      measurements.push(
        await row.evaluate((element) => {
          const metadata = element.querySelector(
            ".compact-row-metadata, .task-meta",
          );
          const bounds = element.getBoundingClientRect();
          const meta = metadata?.getBoundingClientRect();
          const project = element
            .querySelector(".task-project")
            ?.getBoundingClientRect();
          const tags = element
            .querySelector(".task-tags")
            ?.getBoundingClientRect();
          return {
            compact: document.querySelector(".compact") !== null,
            visible: meta ? meta.width > 0 && meta.height > 0 : false,
            contained: meta
              ? meta.top >= bounds.top &&
                meta.bottom <= bounds.bottom &&
                meta.left >= bounds.left &&
                meta.right <= bounds.right
              : false,
            rowHeight: bounds.height,
            metadataHeight: meta?.height,
            projectVisible: project
              ? project.width > 0 && project.height > 0
              : false,
            tagsVisible: tags ? tags.width > 0 && tags.height > 0 : false,
          };
        }),
      );
      await page.screenshot({
        path: join(
          evidence,
          `u01-row-${compact ? "compact" : "full"}-${theme}.png`,
        ),
        animations: "disabled",
      });
      if (theme === "dark") await setAppearance(page, "light");
    }
    if (compact)
      await page
        .getByRole("button", { name: "Expand window", exact: true })
        .click();
  }
  writeFileSync(
    join(evidence, "u01-row-bounds.json"),
    JSON.stringify(measurements, null, 2),
  );
  if (process.env.TODO_U01_OBSERVE !== "1")
    for (const measured of measurements)
      expect(measured).toMatchObject({
        visible: true,
        contained: true,
      });
  await api(`/profiles/work/tasks/${created.id}?from_version=1`, "DELETE");
  const env: Record<string, string> = {
    ...Object.fromEntries(
      Object.entries(process.env).flatMap(([key, value]) =>
        value === undefined ? [] : [[key, value]],
      ),
    ),
    HOME: join(scratch, "home"),
    TODO_SERVER_URL: serverURL,
    TODO_ELECTRON_DATA: join(scratch, "metadata-observer"),
  };
  delete env.ELECTRON_RUN_AS_NODE;
  const observer = await _electron.launch({
    executablePath: desktop.process().spawnfile,
    args: [resolve(import.meta.dirname, "../dist/verification/write-host.mjs")],
    env,
  });
  const matrix: unknown[] = [];
  const createdIDs: string[] = [];
  const definitions = Schema.Array(
    Schema.Struct({ id: Schema.String, name: Schema.String }),
  );
  const snapshotThemes = async (name: string) => {
    for (const theme of ["light", "dark"]) {
      await page.evaluate(
        (dark) => document.documentElement.classList.toggle("dark", dark),
        theme === "dark",
      );
      await page.screenshot({
        path: join(evidence, `${name}-${theme}.png`),
        animations: "disabled",
      });
      await page.evaluate(() =>
        document.documentElement.classList.remove("dark"),
      );
    }
  };
  const closeEditor = async (compact: boolean) => {
    if (compact)
      await page
        .getByRole("button", { name: "Back to tasks", exact: true })
        .click();
    else {
      await page
        .getByRole("button", { name: "Task actions", exact: true })
        .click();
      await page
        .getByRole("menuitem", { name: "Close editor", exact: true })
        .click();
    }
  };
  try {
    const otherPage = await observer.firstWindow();
    await expect(
      otherPage.getByRole("heading", { name: "Tasks", exact: true }),
    ).toBeVisible();
    for (const compact of [false, true]) {
      const entry = compact ? "compact" : "full";
      const project = compact ? "U01 Compact Project" : "U01 Window Project";
      const tag = compact ? "compact focus" : "window focus";
      if (compact)
        await page
          .getByRole("button", { name: "Compact mode", exact: true })
          .click();
      await page
        .getByRole("button", { name: "Quick add", exact: true })
        .click();
      const removalTitle = `U01 ${entry} remove one Tag`;
      await page
        .getByLabel("Task title", { exact: true })
        .fill(`${removalTitle} #alpha #beta #gamma`);
      await expect(
        page.getByRole("button", { name: "Remove Tag beta", exact: true }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "Remove Tag beta", exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: "Remove Tag beta", exact: true }),
      ).toBeHidden();
      for (const name of ["alpha", "gamma"])
        await expect(
          page.getByRole("button", { name: `Remove Tag ${name}`, exact: true }),
        ).toBeVisible();
      await page.getByRole("button", { name: "Add task", exact: true }).click();
      await expect(page.getByRole("dialog")).toBeHidden();
      const removalTask = Schema.decodeUnknownSync(Schema.Array(Task))(
        await api("/profiles/work/tasks"),
      ).find((task) => task.title === removalTitle);
      if (!removalTask) throw new Error("Missing chip-removal Task");
      createdIDs.push(removalTask.id);
      const removalTags = Schema.decodeUnknownSync(definitions)(
        await api("/profiles/work/tags"),
      );
      expect(
        removalTags
          .filter((tag) => removalTask.tags.some((id) => id === tag.id))
          .map((tag) => tag.name)
          .sort(),
      ).toEqual(["alpha", "gamma"]);
      for (const names of ["new", "existing"]) {
        const title = `U01 ${entry} ${names}`;
        const text = `${title} #"${tag}" #ready @"${project}" p1`;
        const parsed = Schema.decodeUnknownSync(QuickAddDraft)(
          await api("/profiles/work/quick-add/parse", "POST", {
            text,
            now: "2026-10-28T15:00:00Z",
            time_zone: "America/Bogota",
          }),
        );
        expect(parsed).toEqual({
          title,
          due_at: null,
          scheduled_at: null,
          priority: "P1",
          tags: [tag, "ready"].sort(),
          project,
        });
        const cliDraft = Schema.decodeUnknownSync(
          Schema.Struct({ draft: QuickAddDraft }),
        )(JSON.parse(cli("parse", text))).draft;
        expect(cliDraft).toEqual(parsed);
        await page
          .getByRole("button", { name: "Quick add", exact: true })
          .click();
        await page.getByLabel("Task title", { exact: true }).fill(text);
        await expect(
          page.getByRole("button", { name: "Clear project", exact: true }),
        ).toContainText(project);
        await expect(
          page.getByRole("button", { name: `Remove Tag ${tag}`, exact: true }),
        ).toContainText(tag);
        if (names === "new") {
          await snapshotThemes(`u01-quick-${entry}`);
          if (compact) {
            const gaps = await page
              .locator(".quick-dialog")
              .evaluate((dialog) => {
                const input = dialog
                  .querySelector("#quick-title")
                  ?.getBoundingClientRect();
                const hint = dialog
                  .querySelector(".quick-hint")
                  ?.getBoundingClientRect();
                const preview = dialog
                  .querySelector(".parsed-draft")
                  ?.getBoundingClientRect();
                const footer = dialog
                  .querySelector(".quick-add-footer")
                  ?.getBoundingClientRect();
                if (!input || !hint || !preview || !footer)
                  throw new Error("Missing quick-add group");
                return {
                  inputHint: hint.top - input.bottom,
                  hintPreview: preview.top - hint.bottom,
                  previewFooter: footer.top - preview.bottom,
                  targets: [...dialog.querySelectorAll("button")].map(
                    (button) => ({
                      label:
                        button.getAttribute("aria-label") ??
                        button.textContent?.trim(),
                      width: button.getBoundingClientRect().width,
                      height: button.getBoundingClientRect().height,
                    }),
                  ),
                };
              });
            writeFileSync(
              join(evidence, "u01-compact-quick-spacing.json"),
              JSON.stringify(gaps, null, 2),
            );
            expect(gaps.inputHint).toBe(4);
            expect(gaps.hintPreview).toBe(16);
            expect(gaps.previewFooter).toBe(16);
            expect(gaps.inputHint).toBeLessThan(gaps.hintPreview);
            for (const target of gaps.targets) {
              expect(target.width).toBeGreaterThanOrEqual(32);
              expect(target.height).toBeGreaterThanOrEqual(32);
            }
          }
        }
        await page
          .getByLabel("Task title", { exact: true })
          .press("Meta+Enter");
        await expect(page.getByLabel("Title", { exact: true })).toHaveValue(
          title,
        );
        const all = Schema.decodeUnknownSync(Schema.Array(Task))(
          await api("/profiles/work/tasks"),
        );
        const task = all.find((task) => task.title === title);
        if (!task) throw new Error(`Missing ${title}`);
        createdIDs.push(task.id);
        const initial = Schema.decodeUnknownSync(Task)(
          await api(`/profiles/work/tasks/${task.id}`),
        );
        const initialProjects = Schema.decodeUnknownSync(definitions)(
          await api("/profiles/work/projects"),
        );
        const initialTags = Schema.decodeUnknownSync(definitions)(
          await api("/profiles/work/tags"),
        );
        expect(
          initialProjects.find((entry) => entry.id === initial.project_id)
            ?.name,
        ).toBe(project);
        expect(
          initialTags
            .filter((entry) => initial.tags.some((id) => id === entry.id))
            .map((entry) => entry.name)
            .sort(),
        ).toEqual([tag, "ready"].sort());
        const otherRow = otherPage.locator(`[data-task-id="${task.id}"]`);
        await expect(otherRow.locator(".task-meta")).toContainText(project);
        for (const name of [tag, "ready"])
          await expect(otherRow.locator(".task-meta")).toContainText(
            `#${name}`,
          );
        matrix.push({
          client: "Electron",
          entry,
          path: "quick-add",
          names,
          task: task.id,
          project,
          tags: [tag, "ready"].sort(),
          reload: true,
          secondClientSSE: true,
        });
        const agent = Schema.decodeUnknownSync(
          Schema.Struct({
            task: Schema.Struct({
              id: Schema.String,
              project: Schema.String,
              tags: Schema.Array(Schema.String),
            }),
          }),
        )(JSON.parse(cli("add", "--parse", text)));
        createdIDs.push(agent.task.id);
        expect([agent.task.project, [...agent.task.tags].sort()]).toEqual([
          project,
          [tag, "ready"].sort(),
        ]);
        const editorProject = `U01 ${entry} Editor Project`;
        await page
          .getByRole("combobox", { name: "Project", exact: true })
          .fill(editorProject);
        if (names === "new") {
          await expect(
            page.getByRole("option", {
              name: `Create “${editorProject}”`,
              exact: true,
            }),
          ).toBeVisible();
          await snapshotThemes(`u01-project-sheet-${entry}`);
        }
        await page
          .getByRole("option", {
            name: names === "new" ? `Create “${editorProject}”` : editorProject,
            exact: true,
          })
          .click();
        const editorTag = `${entry} editor tag`;
        await page
          .getByRole("combobox", { name: "Add Tag", exact: true })
          .fill(editorTag);
        if (names === "new") await snapshotThemes(`u01-tag-sheet-${entry}`);
        await page
          .getByRole("combobox", { name: "Add Tag", exact: true })
          .press("Enter");
        await page
          .getByRole("combobox", { name: "Add Tag", exact: true })
          .fill(`${entry} comma tag`);
        await page
          .getByRole("combobox", { name: "Add Tag", exact: true })
          .press(",");
        await page
          .getByLabel("Title", { exact: true })
          .fill(`${title} @literal #821`);
        await page
          .getByRole("button", { name: "Save changes", exact: true })
          .click();
        await expect(page.locator(".version")).toHaveText("Version 2");
        await expect(
          page.getByRole("combobox", { name: "Project", exact: true }),
        ).toHaveValue(editorProject);
        const tags = [tag, "ready", editorTag, `${entry} comma tag`].sort();
        for (const name of tags)
          await expect(
            page.getByRole("button", {
              name: `Remove Tag ${name}`,
              exact: true,
            }),
          ).toBeVisible();
        await expect(otherRow).toContainText(`${title} @literal #821`);
        await expect(otherRow.locator(".task-meta")).toContainText(
          editorProject,
        );
        for (const name of tags)
          await expect(otherRow.locator(".task-meta")).toContainText(
            `#${name}`,
          );
        await page.reload();
        await expect(
          page.getByRole("combobox", { name: "Project", exact: true }),
        ).toHaveValue(editorProject);
        const loaded = Schema.decodeUnknownSync(Task)(
          await api(`/profiles/work/tasks/${task.id}`),
        );
        const projects = Schema.decodeUnknownSync(definitions)(
          await api("/profiles/work/projects"),
        );
        const tagDefinitions = Schema.decodeUnknownSync(definitions)(
          await api("/profiles/work/tags"),
        );
        expect(loaded.title).toBe(`${title} @literal #821`);
        expect(projects.find((p) => p.id === loaded.project_id)?.name).toBe(
          editorProject,
        );
        expect(
          tagDefinitions
            .filter((t) => loaded.tags.some((id) => id === t.id))
            .map((t) => t.name)
            .sort(),
        ).toEqual(tags);
        matrix.push({
          client: "Electron",
          entry,
          path: "Add and edit controls",
          names,
          task: task.id,
          project: editorProject,
          tags,
          reload: true,
          secondClientSSE: true,
        });
        if (names === "new") await snapshotThemes(`u01-editor-${entry}`);
        const reopenedProject =
          names === "new" ? `U01 ${entry} Existing Task Project` : project;
        await page
          .getByRole("combobox", { name: "Project", exact: true })
          .fill(reopenedProject);
        await page
          .getByRole("option", {
            name:
              names === "new" ? `Create “${reopenedProject}”` : reopenedProject,
            exact: true,
          })
          .click();
        await page
          .getByRole("button", { name: "Remove Tag ready", exact: true })
          .click();
        const reopenedTag =
          names === "new" ? `${entry} existing task tag` : "ready";
        await page
          .getByRole("combobox", { name: "Add Tag", exact: true })
          .fill(reopenedTag);
        await page
          .getByRole("combobox", { name: "Add Tag", exact: true })
          .press("Enter");
        await page
          .getByRole("button", { name: "Save changes", exact: true })
          .click();
        await expect(page.locator(".version")).toHaveText("Version 3");
        await expect(otherRow.locator(".task-meta")).toContainText(
          reopenedProject,
        );
        const reopenedTags = [
          ...tags.filter((name) => name !== "ready"),
          reopenedTag,
        ].sort();
        await page.reload();
        await expect(
          page.getByRole("combobox", { name: "Project", exact: true }),
        ).toHaveValue(reopenedProject);
        for (const name of reopenedTags)
          await expect(
            page.getByRole("button", {
              name: `Remove Tag ${name}`,
              exact: true,
            }),
          ).toBeVisible();
        matrix.push({
          client: "Electron",
          entry,
          path: "existing Task controls",
          names,
          task: task.id,
          project: reopenedProject,
          tags: reopenedTags,
          reload: true,
          secondClientSSE: true,
        });
        await closeEditor(compact);
      }
      if (compact)
        await page
          .getByRole("button", { name: "Expand window", exact: true })
          .click();
    }
    writeFileSync(
      join(evidence, "u01-metadata-matrix.json"),
      JSON.stringify(matrix, null, 2),
    );
  } finally {
    await observer.close();
    for (const id of createdIDs) {
      const task = Schema.decodeUnknownSync(Task)(
        await api(`/profiles/work/tasks/${id}`),
      );
      await api(
        `/profiles/work/tasks/${id}?from_version=${task.row_version}`,
        "DELETE",
      );
    }
  }
}
