import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type Page } from "@playwright/test";
import { Task } from "@todo/domain";
import { Schema } from "effect";
import { setAppearance } from "./appearance.ts";
import { selectProfile } from "./profile-menu.ts";

export async function verifyTransferRegressions(input: {
  page: Page;
  evidence: string;
  api: (path: string, method?: string, payload?: unknown) => Promise<unknown>;
}) {
  const { page, evidence, api } = input;
  const expand = page.getByRole("button", {
    name: "Expand window",
    exact: true,
  });
  if (await expand.count()) await expand.click();
  const light = page.getByRole("button", {
    name: "Light appearance",
    exact: true,
  });
  if (await light.count()) await light.click();
  const results: { name: string; passed: boolean; error?: string }[] = [];
  const create = async (profile: string, title: string) =>
    Schema.decodeUnknownSync(Task)(
      await api(`/profiles/${profile}/tasks`, "POST", { title }),
    );
  const profile = async (value: string) => {
    const picker = page.getByRole("button", { name: "Profile", exact: true });
    if ((await picker.getAttribute("data-profile-id")) !== value)
      await selectProfile(page, value);
    await expect(picker).toHaveAttribute("data-profile-id", value);
  };
  const select = async (title: string) => {
    await expect(page.getByText(title, { exact: true })).toBeVisible();
    await page.getByText(title, { exact: true }).click();
    await expect(page.getByLabel("Title", { exact: true })).toHaveValue(title);
  };
  const move = async () => {
    await page
      .getByRole("button", { name: "Task actions", exact: true })
      .click();
    await page
      .getByRole("menuitem", { name: "Move to Profile", exact: true })
      .click();
    await page.getByRole("button", { name: "Move task", exact: true }).click();
    await expect(
      page.getByText("Task moved to Personal", { exact: true }),
    ).toBeVisible();
  };
  const scenario = async (name: string, run: () => Promise<void>) => {
    try {
      await run();
      results.push({ name, passed: true });
    } catch (error) {
      results.push({ name, passed: false, error: String(error) });
    }
    writeFileSync(
      join(evidence, "transfer-regressions.json"),
      `${JSON.stringify(results, null, 2)}\n`,
    );
  };
  await scenario(
    "row transfer Cancel preserves the current draft",
    async () => {
      const task = await create("work", "C10 row draft regression");
      await profile("work");
      await select(task.title);
      await page.getByLabel("Description").fill("Keep this source draft");
      await page
        .locator(`[data-task-id="${task.id}"] .task-content`)
        .click({ button: "right" });
      await page
        .getByRole("menuitem", { name: "Copy to Profile", exact: true })
        .click();
      await page.getByRole("button", { name: "Cancel", exact: true }).click();
      await expect(page.getByLabel("Description")).toHaveValue(
        "Keep this source draft",
      );
    },
  );
  await scenario(
    "Move preserves an unrelated destination draft and its own draft",
    async () => {
      const destination = await create(
        "personal",
        "C10 destination draft regression",
      );
      const source = await create(
        "work",
        "C10 separate moved draft regression",
      );
      await profile("personal");
      await select(destination.title);
      await page
        .getByLabel("Description")
        .fill("Keep this unrelated destination draft");
      await profile("work");
      await select(source.title);
      await page.getByLabel("Description").fill("Keep this moved draft too");
      await move();
      await profile("personal");
      await expect(page.getByLabel("Title", { exact: true })).toHaveValue(
        destination.title,
      );
      await expect(page.getByLabel("Description")).toHaveValue(
        "Keep this unrelated destination draft",
      );
      await select(source.title);
      await expect(page.getByLabel("Description")).toHaveValue(
        "Keep this moved draft too",
      );
    },
  );
  await scenario(
    "cross-Profile Move Revert returns to the restored Profile and can save",
    async () => {
      const source = await create("work", "C10 Revert Profile regression");
      await profile("work");
      await select(source.title);
      await move();
      await page
        .getByRole("button", { name: "Open in Personal", exact: true })
        .click();
      await expect(page.getByLabel("Profile", { exact: true })).toHaveAttribute(
        "data-profile-id",
        "personal",
      );
      await page.getByRole("button", { name: "History", exact: true }).click();
      await page
        .getByRole("button", { name: "Revert moved change", exact: true })
        .click();
      await expect(page.getByLabel("Profile", { exact: true })).toHaveAttribute(
        "data-profile-id",
        "work",
      );
      await expect(page.getByLabel("Title", { exact: true })).toHaveValue(
        source.title,
      );
      await page
        .getByLabel("Description")
        .fill("Saved after cross-Profile Revert");
      await page
        .getByRole("button", { name: "Save changes", exact: true })
        .click();
      const saved = Schema.decodeUnknownSync(Task)(
        await api(`/profiles/work/tasks/${source.id}`),
      );
      expect([saved.profile_id, saved.row_version, saved.description]).toEqual([
        "work",
        4,
        "Saved after cross-Profile Revert",
      ]);
    },
  );
  await scenario(
    "external-id Move validation stays in the focused dialog",
    async () => {
      const source = Schema.decodeUnknownSync(Task)(
        await api("/profiles/work/tasks", "POST", {
          title: "C11 identity source",
          external_id: "c11:move-clash",
        }),
      );
      const target = Schema.decodeUnknownSync(Task)(
        await api("/profiles/personal/tasks", "POST", {
          title: "C11 identity target",
          external_id: "c11:move-clash",
        }),
      );
      await profile("work");
      await select(source.title);
      for (const compact of [false, true]) {
        if (compact)
          await page
            .getByRole("button", { name: "Compact mode", exact: true })
            .click();
        for (const dark of [false, true]) {
          if (compact)
            await page
              .getByRole("button", { name: "Back to tasks", exact: true })
              .click();
          if (dark) await setAppearance(page, "dark");
          if (compact) await select(source.title);
          await page
            .getByRole("button", { name: "Task actions", exact: true })
            .click();
          await page
            .getByRole("menuitem", { name: "Move to Profile", exact: true })
            .click();
          await page
            .getByRole("button", { name: "Move task", exact: true })
            .click();
          const dialog = page.getByRole("dialog", {
            name: "Move to Profile",
            exact: true,
          });
          await expect(dialog.getByRole("alert")).toHaveText(
            '"Personal" already has a Task with external id "c11:move-clash". Choose another Profile.',
          );
          const button = await dialog
            .getByRole("button", { name: "Cancel", exact: true })
            .boundingBox();
          expect(
            button !== null &&
              button.y + button.height <= (page.viewportSize()?.height ?? 927),
          ).toBe(true);
          await page.screenshot({
            path: join(
              evidence,
              `c11-move-identity-${compact ? "compact-" : ""}${dark ? "dark" : "light"}.png`,
            ),
            animations: "disabled",
          });
          await dialog
            .getByRole("button", { name: "Cancel", exact: true })
            .click();
        }
        if (compact)
          await page
            .getByRole("button", { name: "Back to tasks", exact: true })
            .click();
        await setAppearance(page, "light");
      }
      await page
        .getByRole("button", { name: "Expand window", exact: true })
        .click();
      expect(
        Schema.decodeUnknownSync(Task)(
          await api(`/profiles/work/tasks/${source.id}`),
        ),
      ).toEqual(source);
      expect(
        Schema.decodeUnknownSync(Task)(
          await api(`/profiles/personal/tasks/${target.id}`),
        ),
      ).toEqual(target);
    },
  );
  const failures = results.filter((result) => !result.passed);
  expect(failures, JSON.stringify(failures)).toEqual([]);
}
