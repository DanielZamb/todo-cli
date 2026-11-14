import assert from "node:assert/strict";
import { expect, type Page } from "@playwright/test";
import { ProfileId, TaskId, Version } from "@todo/domain";
import { Effect, Schema } from "effect";
import { FetchHttpClient, type HttpClient } from "effect/http";
import type { taskHttpClient } from "../src/http-client.ts";

const run = <A, E>(effect: Effect.Effect<A, E, HttpClient.HttpClient>) =>
  Effect.runPromise(effect.pipe(Effect.provide(FetchHttpClient.layer)));
const profile = Schema.decodeUnknownSync(ProfileId)("work");
const destination = Schema.decodeUnknownSync(ProfileId)("recovery-other");
const Created = Schema.Struct({
  task: Schema.Struct({ id: TaskId, title: Schema.String }),
});
export async function verifyDependencyLifecycle({
  page,
  client,
  cli,
  prepareOtherProfile,
  capture,
  notify,
  record,
}: {
  page: Page;
  client: Effect.Success<ReturnType<typeof taskHttpClient>>;
  cli: (...args: string[]) => unknown;
  prepareOtherProfile: () => void;
  capture: (
    state: string,
    description: string,
    layout?: string,
  ) => Promise<void>;
  notify: (notice: unknown) => Promise<unknown>;
  record: (receipt: unknown) => void;
}) {
  prepareOtherProfile();
  const add = (title: string, ...args: string[]) =>
    Schema.decodeUnknownSync(Created)(
      cli("add", `Lifecycle fixture ${title}`, ...args),
    ).task;
  const blocker = add("resolved blocker");
  cli("done", blocker.id, "--expected-version", "1");
  const root = add("transfer root", "--depends-on", blocker.id);
  const dependent = add("transfer dependent", "--depends-on", root.id);
  const show = (task: TaskId, scope = profile) =>
    run(client.tasks.show({ params: { profile: scope, task } }));
  const history = (task: TaskId, scope = profile) =>
    run(client.reads.history({ params: { profile: scope, task } }));
  const graph = (task: TaskId, scope = profile) =>
    run(client.tasks.graph({ params: { profile: scope, task } }));
  const search = page.getByRole("textbox", {
    name: "Search tasks",
    exact: true,
  });
  await page.setViewportSize({ width: 393, height: 426 });
  await notify({ _tag: "windowMode", compact: true });
  await page.getByRole("button", { name: "More filters", exact: true }).click();
  await page.locator("#filter-status").selectOption("");
  await page
    .getByRole("button", { name: "Apply filters", exact: true })
    .click();
  await search.fill(root.title);
  await page.getByTestId(`dependency-drag-source-${root.id}`).click();
  await page.getByRole("button", { name: "History", exact: true }).click();
  await expect(
    page.locator(".history-dialog .dependency-edge-report").filter({
      hasText: `Added: ${root.title} depends on`,
    }),
  ).toContainText(`Added: ${root.title} depends on`);
  const created = (await history(root.id)).find(
    (entry) => entry.event.kind === "TaskCreated",
  )?.event;
  assert.ok(created?.kind === "TaskCreated" && created.entity_version === 2);
  assert.deepEqual(
    created.dependencies.added.map((edge) => [
      edge.blocker_id,
      edge.dependent_id,
    ]),
    [[blocker.id, root.id]],
  );
  await capture(
    "history-created-initial-v2",
    "Existing History renders the initial edge from a real typed TaskCreated v2; Version 1 creation contains the edge atomically",
  );
  await page.keyboard.press("Escape");
  await expect(page.locator(".history-dialog")).toHaveCount(0);
  const transfer = async (kind: "Copy" | "Move") => {
    await page
      .getByRole("button", { name: "Task actions", exact: true })
      .click();
    await page
      .getByRole("menuitem", { name: `${kind} to Profile`, exact: true })
      .click();
    await expect(
      page.locator('#destination option[value="recovery-other"]'),
    ).toHaveCount(1);
    await page.locator("#destination").selectOption(destination);
    await capture(
      `transfer-${kind.toLowerCase()}-review`,
      "The existing Profile transfer dialog preserves relation context and uses one public grouped command",
    );
    await page
      .getByRole("button", { name: `${kind} task`, exact: true })
      .click();
    await expect(page.locator(".move-dialog")).toHaveCount(0);
  };
  await transfer("Copy");
  const copy = (
    await run(
      client.tasks.list({
        params: { profile: destination },
        query: { text: root.title },
      }),
    )
  ).find((task) => task.title === root.title);
  assert.ok(copy);
  assert.notEqual(copy.id, root.id);
  assert.equal(copy.row_version, 1);
  const copyGraph = await graph(copy.id, destination);
  assert.deepEqual(copyGraph.edges, []);
  const afterCopy = await show(root.id);
  assert.equal(afterCopy.row_version, 1);
  const sourceGraph = await graph(root.id);
  assert.deepEqual(
    sourceGraph.edges
      .map((edge) => [edge.blocker_id, edge.dependent_id])
      .sort(),
    [
      [blocker.id, root.id],
      [root.id, dependent.id],
    ].sort(),
  );
  await page
    .getByRole("button", { name: "Back to tasks", exact: true })
    .click();
  await expect(
    page.getByText("The copy has no Dependencies.", { exact: true }),
  ).toBeVisible();
  await capture(
    "transfer-copy-no-dependencies",
    "A fresh public read proves the new Version 1 copy has no edges while both source directions remain unchanged",
  );
  await page.getByTestId(`dependency-drag-source-${root.id}`).click();
  await transfer("Move");
  const dropped = page.locator('[role="alert"] .dependency-edge-report');
  await expect(dropped.locator("li")).toHaveCount(2);
  await expect(dropped).toContainText(`Removed: ${root.title} depends on`);
  await expect(dropped).toContainText(
    `Removed: ${dependent.title} depends on ${root.title}`,
  );
  await capture(
    "transfer-move-dropped-edges",
    "Move reports each removed incident edge in the existing Alert/report; it does not loop through client undepend requests",
  );
  const moved = await show(root.id, destination);
  const afterDependent = await show(dependent.id);
  assert.equal(moved.row_version, 2);
  assert.equal(moved.profile_id, destination);
  assert.deepEqual((await graph(root.id, destination)).edges, []);
  assert.equal(afterDependent.row_version, 2);
  assert.deepEqual((await graph(dependent.id)).edges, []);
  assert.equal((await show(blocker.id)).row_version, 2);
  const movedHistory = await history(root.id);
  const movedEvent = movedHistory.find(
    (entry) => entry.event.kind === "TaskMovedOut",
  )?.event;
  assert.ok(
    movedEvent?.kind === "TaskMovedOut" && movedEvent.entity_version === 2,
  );
  assert.deepEqual(
    movedEvent.dependencies.removed
      .map((edge) => [edge.blocker_id, edge.dependent_id])
      .sort(),
    [
      [blocker.id, root.id],
      [root.id, dependent.id],
    ].sort(),
  );
  record({
    kind: "copy-move",
    blocker,
    root,
    dependent,
    copy,
    copyGraph,
    sourceGraph,
    afterCopy,
    moved,
    afterDependent,
    movedHistory,
  });
  await page
    .getByRole("button", { name: "Dismiss transfer result", exact: true })
    .click();
  const prerequisite = add("completion prerequisite");
  cli("done", prerequisite.id, "--expected-version", "1");
  const doneDependent = add("done dependent", "--depends-on", prerequisite.id);
  cli("done", doneDependent.id, "--expected-version", "1");
  await search.fill(prerequisite.title);
  await page.getByTestId(`dependency-drag-source-${prerequisite.id}`).click();
  await page.getByRole("button", { name: "History", exact: true }).click();
  await page
    .getByRole("button", { name: "Revert completed change", exact: true })
    .click();
  const refusal = page
    .locator(".history-dialog")
    .getByTestId("dependency-error");
  await expect(refusal).toContainText(
    "This completion can't be reverted while these Tasks are done.",
  );
  await expect(refusal).toContainText(doneDependent.title);
  await expect(refusal).toContainText("error 2 - validation or usage");
  assert.equal((await show(prerequisite.id)).status, "done");
  assert.equal((await show(doneDependent.id)).status, "done");
  await capture(
    "history-revert-completion-refused",
    "Real Revert refuses reopening a blocker of a done Task and keeps both resolved; the typed witness supplies deliberate follow-up recovery",
  );
  await refusal.getByTestId("dependency-follow-up").click();
  await expect(
    page.getByTestId(`dependency-initial-${doneDependent.id}`),
  ).toBeVisible();
  await expect(
    page.getByTestId(`dependency-initial-${prerequisite.id}`),
  ).toHaveCount(0);
  const title = "Lifecycle follow-up from refused completion Revert";
  await page.getByLabel("Task title", { exact: true }).fill(title);
  await expect(page.locator(".parsed-draft")).toContainText(
    `Task title: ${title}`,
  );
  await capture(
    "history-revert-follow-up-preselected",
    "Create follow-up preselects the specified DONE dependent, not the blocker whose completion was reverted",
  );
  await page
    .locator(".quick-dialog")
    .getByRole("button", { name: "Add task", exact: true })
    .click();
  await expect(page.locator(".quick-dialog")).toHaveCount(0);
  const followUp = (
    await run(
      client.tasks.list({ params: { profile }, query: { text: title } }),
    )
  ).find((task) => task.title === title);
  assert.ok(followUp);
  assert.equal(followUp.row_version, 1);
  assert.deepEqual(followUp.depends_on, [doneDependent.id]);
  assert.equal((await show(prerequisite.id)).status, "done");
  assert.equal((await show(doneDependent.id)).status, "done");
  const followUpHistory = await history(followUp.id);
  assert.equal(followUpHistory.length, 1);
  const event = followUpHistory[0]?.event;
  assert.ok(event?.kind === "TaskCreated" && event.entity_version === 2);
  assert.deepEqual(
    event.dependencies.added.map((edge) => [
      edge.blocker_id,
      edge.dependent_id,
    ]),
    [[doneDependent.id, followUp.id]],
  );
  record({
    kind: "revert-follow-up",
    prerequisite,
    doneDependent,
    followUp,
    followUpHistory,
  });
  await page
    .getByRole("button", { name: "Back to tasks", exact: true })
    .click();
  await search.fill(title);
  await expect(page.getByTestId(`dependency-state-${followUp.id}`)).toHaveText(
    "Ready",
  );
  await capture(
    "history-revert-follow-up-created",
    "The real add flow creates one TaskCreated v2 at Version 1 with the requested edge; resolved originals remain unchanged",
  );
  await verifyInitialDependencyRecovery({
    page,
    client,
    cli,
    capture,
    notify,
    record,
  });
}
export async function verifyInitialDependencyRecovery({
  page,
  client,
  cli,
  capture,
  notify,
  record,
}: Omit<
  Parameters<typeof verifyDependencyLifecycle>[0],
  "prepareOtherProfile"
>) {
  const add = (title: string) =>
    Schema.decodeUnknownSync(Created)(cli("add", `Lifecycle fixture ${title}`))
      .task;
  const graph = (task: TaskId) =>
    run(client.tasks.graph({ params: { profile, task } }));
  const stale = add("initial blocker removed before save");
  const initialVersion = Schema.decodeUnknownSync(Version)(1);
  await notify({ _tag: "quickAdd" });
  const draft = "Initial draft retained after a missing Dependency";
  await page.getByLabel("Task title", { exact: true }).fill(draft);
  await page
    .getByRole("button", { name: "Add Dependencies", exact: true })
    .click();
  await page
    .getByTestId("dependency-initial-picker")
    .getByRole("textbox")
    .fill(stale.title);
  await page.getByTestId(`dependency-choice-${stale.id}`).check();
  await page.getByTestId("dependency-initial-done").click();
  const stalePreview = await run(
    client.tasks.delete({
      params: { profile, task: stale.id },
      query: { dry_run: true, from_version: initialVersion },
    }),
  );
  assert.ok(stalePreview.dependency_fingerprint);
  await run(
    client.tasks.delete({
      params: { profile, task: stale.id },
      query: {
        from_version: initialVersion,
        with_dependencies: true,
        dependency_fingerprint: stalePreview.dependency_fingerprint,
      },
    }),
  );
  await page
    .locator(".quick-dialog")
    .getByRole("button", { name: "Add task", exact: true })
    .click();
  await expect(page.getByLabel("Task title", { exact: true })).toHaveValue(
    draft,
  );
  await expect(
    page.getByTestId(`dependency-initial-${stale.id}`),
  ).toBeVisible();
  await expect(page.locator(".quick-dialog")).toContainText(
    "A Task and its Dependency must be in the same Profile. Choose a Task in this Profile.",
  );
  await expect(page.locator(".quick-dialog")).toContainText(
    "error 2 - validation or usage",
  );
  await capture(
    "initial-refusal-retains-draft",
    "The real server returns dependency_profile_mismatch for the removed endpoint; initial creation retains title/selection and projects that typed refusal with its actual exit pair",
  );
  assert.deepEqual(
    await run(
      client.tasks.list({ params: { profile }, query: { text: draft } }),
    ),
    [],
  );
  await page.getByTestId(`dependency-initial-${stale.id}`).click();
  await page
    .locator(".quick-dialog")
    .getByRole("button", { name: "Add task", exact: true })
    .click();
  await expect(page.locator(".quick-dialog")).toHaveCount(0);
  const recovered = (
    await run(
      client.tasks.list({ params: { profile }, query: { text: draft } }),
    )
  ).find((task) => task.title === draft);
  assert.ok(recovered);
  assert.equal(recovered.row_version, 1);
  assert.deepEqual((await graph(recovered.id)).edges, []);
  record({ kind: "initial-refusal", stale, draft, recovered });
}
