import { writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { expect as baseExpect, type Page } from "@playwright/test";
import { TaskViewSchema } from "@todo/domain/presentation";
import { Schema } from "effect";

const expect = baseExpect.configure({ timeout: 60000 });

export async function verifyImportRaces(
  page: Page,
  scratch: string,
  evidence: string,
  cli: (...args: string[]) => string,
) {
  const task = (text: string) =>
    Schema.decodeUnknownSync(Schema.Struct({ task: TaskViewSchema }))(
      JSON.parse(text),
    ).task;
  const prefix = `race:${basename(evidence)}`;
  const a = task(cli("add", "File Task", "--external-id", `${prefix}:a`));
  const b = task(
    cli("add", "Keep missing Task", "--external-id", `${prefix}:b`),
  );
  const file = join(scratch, "race-close.json");
  writeFileSync(
    file,
    JSON.stringify([{ external_id: `${prefix}:a`, title: "File draft" }]),
  );
  await page.getByRole("button", { name: "Import…", exact: true }).click();
  await page.getByLabel("Import file", { exact: true }).setInputFiles(file);
  await page
    .getByLabel("Cancel missing Tasks with external ids", { exact: true })
    .check();
  await page
    .getByRole("button", { name: "Preview changes", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Preview import", exact: true }),
  ).toBeVisible();
  cli(
    "edit",
    a.id,
    "--expected-version",
    "1",
    "--title",
    "Concurrent file edit",
  );
  await page.getByRole("button", { name: /^Apply(?: \d+)? changes?$/ }).click();
  await expect(
    page.getByRole("heading", { name: "Import results", exact: true }),
  ).toBeVisible();
  const preserved = task(cli("show", b.id));
  expect([preserved.title, preserved.status, preserved.row_version]).toEqual([
    "Keep missing Task",
    "open",
    1,
  ]);
  await page.getByRole("button", { name: "Done", exact: true }).click();

  const slow = join(scratch, "slow-a.json");
  const fast = join(scratch, "fast-b.json");
  writeFileSync(
    slow,
    JSON.stringify([
      { external_id: `${prefix}:slow`, title: "Obsolete selection" },
    ]),
  );
  writeFileSync(
    fast,
    JSON.stringify([
      { external_id: `${prefix}:fast`, title: "Latest selection" },
    ]),
  );
  await page.getByRole("button", { name: "Import…", exact: true }).click();
  await page.evaluate(() => {
    const original = File.prototype.text;
    Reflect.set(window, "releaseImportRead", undefined);
    File.prototype.text = async function () {
      if (this.name === "slow-a.json")
        await new Promise<void>((resolve) =>
          Reflect.set(window, "releaseImportRead", resolve),
        );
      return original.call(this);
    };
    Reflect.set(window, "restoreImportRead", () => {
      File.prototype.text = original;
    });
  });
  await page.getByLabel("Import file", { exact: true }).setInputFiles(slow);
  await expect
    .poll(() =>
      page.evaluate(() => typeof Reflect.get(window, "releaseImportRead")),
    )
    .toBe("function");
  await page.getByLabel("Import file", { exact: true }).setInputFiles(fast);
  await expect(
    page.getByText("1 Task ready to preview", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Preview changes", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Preview import", exact: true }),
  ).toBeVisible();
  await page.evaluate(() => {
    Reflect.get(window, "releaseImportRead")();
    Reflect.get(window, "restoreImportRead")();
  });
  await expect(page.getByRole("dialog")).toContainText("Latest selection");
  await page.getByRole("button", { name: /^Apply(?: \d+)? changes?$/ }).click();
  await expect(
    page.getByRole("heading", { name: "Import results", exact: true }),
  ).toBeVisible();
  const listed = JSON.parse(cli("list"));
  const tasks = Schema.decodeUnknownSync(
    Schema.Struct({ tasks: Schema.Array(TaskViewSchema) }),
  )(listed).tasks;
  expect(
    tasks.filter((t) => t.external_id === `${prefix}:fast`).map((t) => t.title),
  ).toEqual(["Latest selection"]);
  expect(tasks.filter((t) => t.external_id === `${prefix}:slow`)).toEqual([]);
  await page.getByRole("button", { name: "Done", exact: true }).click();
  writeFileSync(
    join(evidence, "import-races.json"),
    JSON.stringify(
      {
        passed: true,
        rejectedFileSkipsCancellations: true,
        obsoleteReadDiscarded: true,
      },
      null,
      2,
    ),
  );
}
