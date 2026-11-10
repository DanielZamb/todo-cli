import assert from "node:assert/strict";
import { expect, type Locator, type Page } from "@playwright/test";
import { ProfileId, TaskId, Version } from "@todo/domain";
import { Effect, Schema } from "effect";
import { FetchHttpClient, type HttpClient } from "effect/http";
import type { taskHttpClient } from "../src/http-client.ts";
import type { Reply, Request } from "../src/protocol.ts";

const Created = Schema.Struct({
  task: Schema.Struct({
    id: TaskId,
    title: Schema.String,
    row_version: Version,
  }),
});
const profile = Schema.decodeUnknownSync(ProfileId)("work");
const run = <A, E>(effect: Effect.Effect<A, E, HttpClient.HttpClient>) =>
  Effect.runPromise(effect.pipe(Effect.provide(FetchHttpClient.layer)));

export async function verifyDependencyReviewRecovery({
  page,
  client,
  cli,
  capture,
  notify,
  holdUpdates,
  replaceDelete,
  pauseDelete,
  resume,
  requests,
  deliveries,
  record,
}: {
  page: Page;
  client: Effect.Success<ReturnType<typeof taskHttpClient>>;
  cli: (...args: string[]) => unknown;
  capture: (
    state: string,
    description: string,
    target: Locator,
  ) => Promise<void>;
  notify: (notice: unknown) => Promise<unknown>;
  holdUpdates: (hold: boolean) => Promise<void>;
  replaceDelete: (reply: "preview" | Reply) => void;
  pauseDelete: () => void;
  resume: () => void;
  requests: readonly Request[];
  deliveries: readonly { request: Request; reply: Reply["_tag"] }[];
  record: (receipt: unknown) => void;
}) {
  await page.setViewportSize({ width: 393, height: 426 });
  await notify({ _tag: "windowMode", compact: true });
  const back = page.getByRole("button", { name: "Back to tasks", exact: true });
  if (await back.count()) await back.click();
  const search = page.getByRole("textbox", {
    name: "Search tasks",
    exact: true,
  });
  await expect(search).toBeVisible();
  const add = (title: string) =>
    Schema.decodeUnknownSync(Created)(cli("add", title)).task;
  const root = add("Review recovery root");
  const candidate = add("Review recovery candidate");
  const draftTask = add("Review recovery saved draft");
  const select = async (task: typeof root) => {
    await search.fill(task.title);
    const row = page.locator(`[data-task-id="${task.id}"] .task-content`);
    await expect(row).toBeVisible();
    await row.click();
  };
  const relationWrites = () =>
    requests.filter((request) => request._tag === "depend");
  await select(root);
  await page.getByTestId("dependency-add").click();
  await page.getByTestId("dependency-search").fill(candidate.title);
  const choice = page.getByTestId(`dependency-choice-${candidate.id}`);
  await expect(choice).toBeEnabled();
  await holdUpdates(true);
  const initialWrites = relationWrites().length;
  cli(
    "edit",
    root.id,
    "--title",
    `${root.title} externally edited`,
    "--expected-version",
    "1",
  );
  await choice.check();
  const reload = page.getByTestId("dependency-reload");
  await expect(reload).toBeVisible();
  await expect(choice).toBeDisabled();
  await page.getByTestId("dependency-blocks").click();
  await expect(reload).toHaveCount(0);
  await expect(choice).toBeEnabled();
  await page.getByTestId("dependency-depends-on").click();
  await expect(reload).toBeVisible();
  await expect(choice).toBeDisabled();
  await expect(page.getByTestId("dependency-error")).toContainText(
    "error 4 - Conflict",
  );
  await expect(
    page
      .getByTestId("dependency-error")
      .getByRole("button", { name: "Dismiss", exact: true }),
  ).toHaveCount(0);
  assert.equal(relationWrites().length, initialWrites + 1);
  await reload.click();
  await expect(choice).toBeEnabled();
  assert.equal(relationWrites().length, initialWrites + 1);
  await page.getByTestId("dependency-blocks").click();
  for (const version of [1, 2])
    cli(
      "edit",
      candidate.id,
      "--title",
      `${candidate.title} external ${version}`,
      "--expected-version",
      String(version),
    );
  await choice.check();
  await expect(reload).toBeVisible();
  await expect(choice).toBeDisabled();
  await page.getByTestId("dependency-depends-on").click();
  await expect(reload).toHaveCount(0);
  await expect(choice).toBeEnabled();
  await page.getByTestId("dependency-blocks").click();
  await expect(reload).toBeVisible();
  await expect(choice).toBeDisabled();
  await expect(page.getByTestId("dependency-error")).toContainText(
    "This Task changed. Reload its Dependencies before trying again.",
  );
  assert.equal(relationWrites().length, initialWrites + 2);
  await capture(
    "picker-direction-roundtrip",
    "Real Conflicts in both directions retain dependent-scoped Reload and lock after a direction round trip, with no automatic resend",
    page.getByTestId("dependency-error"),
  );
  await reload.click();
  await expect(choice).toBeEnabled();
  assert.equal(relationWrites().length, initialWrites + 2);
  await choice.check();
  await expect(choice).toBeChecked();
  await expect(choice).toBeEnabled();
  const finalWrite = relationWrites().at(-1);
  assert.ok(finalWrite?._tag === "depend");
  assert.equal(finalWrite.task, candidate.id);
  assert.equal(finalWrite.payload.from_version, 3);
  const afterRoot = await run(
    client.tasks.show({ params: { profile, task: root.id } }),
  );
  const afterCandidate = await run(
    client.tasks.show({ params: { profile, task: candidate.id } }),
  );
  assert.equal(afterRoot.row_version, 2);
  assert.equal(afterCandidate.row_version, 4);
  assert.deepEqual(afterCandidate.depends_on, [root.id]);
  record({
    kind: "conflict-direction-roundtrips",
    initialWrites,
    finalWrite,
    afterRoot,
    afterCandidate,
  });
  await page.getByTestId("dependency-picker-close").click();
  await holdUpdates(false);
  await page
    .getByLabel("Title", { exact: true })
    .fill("Unrelated saved editor draft");
  await back.click();
  await select(draftTask);
  const title = page.getByLabel("Title", { exact: true });
  const draftTitle = "Unsaved review draft";
  await title.fill(draftTitle);
  const key = `task-editor:${JSON.stringify([profile, draftTask.id])}`;
  const saved = () => page.evaluate((key) => localStorage.getItem(key), key);
  const unrelatedKey = `task-editor:${JSON.stringify([profile, root.id])}`;
  const unrelated = () =>
    page.evaluate((key) => localStorage.getItem(key), unrelatedKey);
  const unrelatedBefore = await unrelated();
  assert.ok(unrelatedBefore?.includes("Unrelated saved editor draft"));
  await expect.poll(saved).not.toBeNull();
  let before = await saved();
  const actual = await run(
    client.tasks.show({ params: { profile, task: draftTask.id } }),
  );
  const openDelete = async () => {
    before = await saved();
    assert.ok(before?.includes(draftTitle));
    await page
      .getByRole("button", { name: "Task actions", exact: true })
      .click();
    await page
      .getByRole("menuitem", { name: "Delete task", exact: true })
      .click();
    await expect(page.getByTestId("dependency-delete-confirm")).toBeEnabled();
    assert.equal(await saved(), before, "Preview must retain the saved editor");
  };
  const rejected = [
    "preview",
    { _tag: "task", task: { ...afterRoot, dry_run: false } },
    {
      _tag: "error",
      message: "Controlled rejected confirmation",
      exit_detail: "error 1 - runtime failure",
    },
  ] satisfies ("preview" | Reply)[];
  for (const [index, reply] of rejected.entries()) {
    await openDelete();
    replaceDelete(reply);
    await page.getByTestId("dependency-delete-confirm").click();
    await expect(page.getByTestId("dependency-error")).toBeVisible();
    assert.equal(
      await saved(),
      before,
      "Rejected confirmation must retain saved bytes",
    );
    assert.equal(await unrelated(), unrelatedBefore);
    await page.getByTestId("dependency-delete-cancel").click();
    await back.click();
    await select(draftTask);
    await expect(title).toHaveValue(draftTitle);
    if (index === 0)
      await capture(
        "delete-rejected-draft-reopened",
        "A controlled actual-server preview delivered as confirmation is rejected; reopening retains the exact unsaved title and saved draft bytes",
        title,
      );
    assert.deepEqual(
      await run(client.tasks.show({ params: { profile, task: draftTask.id } })),
      actual,
    );
    record({
      kind: "rejected-delete-draft",
      index,
      saved: await saved(),
      title: await title.inputValue(),
      server: actual,
    });
  }
  await openDelete();
  replaceDelete({ _tag: "task", task: { ...actual, dry_run: false } });
  pauseDelete();
  await page.getByTestId("dependency-delete-confirm").click();
  await expect(page.getByTestId("dependency-delete-confirm")).toHaveText(
    "Deleting…",
  );
  await page.getByTestId("dependency-delete-cancel").click();
  const deleteDeliveries = () =>
    deliveries.filter(
      ({ request }) =>
        request._tag === "delete" &&
        request.task === draftTask.id &&
        !request.query.dry_run,
    ).length;
  const deliveriesBefore = deleteDeliveries();
  resume();
  await expect.poll(deleteDeliveries).toBe(deliveriesBefore + 1);
  await back.click();
  await select(draftTask);
  await expect(title).toHaveValue(draftTitle);
  assert.equal(await saved(), before);
  assert.deepEqual(
    await run(client.tasks.show({ params: { profile, task: draftTask.id } })),
    actual,
  );
  record({
    kind: "stale-delete-draft",
    deliveriesBefore,
    saved: await saved(),
    title: await title.inputValue(),
  });
  await openDelete();
  await page.getByTestId("dependency-delete-confirm").click();
  await expect(page.getByTestId("dependency-delete-dialog")).toHaveCount(0);
  await expect.poll(saved).toBeNull();
  assert.equal(await unrelated(), unrelatedBefore);
  assert.deepEqual(
    await run(
      client.tasks.list({
        params: { profile },
        query: { prefix: draftTask.id },
      }),
    ),
    [],
  );
  record({
    kind: "accepted-delete-clears-only-reviewed-draft",
    id: draftTask.id,
    saved: await saved(),
  });
}
