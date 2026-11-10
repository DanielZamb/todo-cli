import assert from "node:assert/strict";
import { expect, type Locator, type Page } from "@playwright/test";
import { ProfileId, TaskId, Version } from "@todo/domain";
import { Effect, Schema } from "effect";
import { FetchHttpClient, type HttpClient } from "effect/http";
import type { taskHttpClient } from "../src/http-client.ts";
import type { Reply, Request } from "../src/protocol.ts";

const run = <A, E>(effect: Effect.Effect<A, E, HttpClient.HttpClient>) =>
  Effect.runPromise(effect.pipe(Effect.provide(FetchHttpClient.layer)));
const profile = Schema.decodeUnknownSync(ProfileId)("work");
const Created = Schema.Struct({
  task: Schema.Struct({
    id: TaskId,
    title: Schema.String,
    row_version: Version,
  }),
});
export async function verifyDependencyEdgeCases({
  page,
  client,
  cli,
  capture,
  notify,
  holdUpdates,
  pause,
  pending,
  resume,
  requests,
  responses,
}: {
  page: Page;
  client: Effect.Success<ReturnType<typeof taskHttpClient>>;
  cli: (...args: string[]) => unknown;
  capture: (
    state: string,
    description: string,
    layout?: string,
    target?: Locator,
  ) => Promise<void>;
  notify: (notice: unknown) => Promise<unknown>;
  holdUpdates: (hold: boolean) => Promise<void>;
  pause: (kind: "relation" | "preview") => void;
  pending: () => boolean;
  resume: () => void;
  requests: readonly Request[];
  responses: readonly { request: Request; reply: Reply }[];
}) {
  const add = (title: string, ...args: string[]) =>
    Schema.decodeUnknownSync(Created)(
      cli("add", `Edge fixture ${title}`, ...args),
    ).task;
  const show = (task: TaskId) =>
    run(client.tasks.show({ params: { profile, task } }));
  const graph = (task: TaskId) =>
    run(client.tasks.graph({ params: { profile, task } }));
  const search = page.getByRole("textbox", {
    name: "Search tasks",
    exact: true,
  });
  const select = async (task: Schema.Schema.Type<typeof Created>["task"]) => {
    await search.fill(task.title);
    await expect(page.locator(`[data-task-id="${task.id}"]`)).toBeVisible();
  };
  const openPicker = async (
    task: Schema.Schema.Type<typeof Created>["task"],
  ) => {
    await select(task);
    await page
      .getByRole("button", {
        name: `Task actions for ${task.title}`,
        exact: true,
      })
      .click();
    await page
      .getByRole("menuitem", { name: "Add dependency", exact: true })
      .click();
    await expect(page.getByTestId("dependency-search")).toBeFocused();
  };
  const closePicker = () => page.getByTestId("dependency-picker-close").click();
  const advice = (count: number) =>
    `This Task depends on ${count} Tasks. That's a lot for one Task. It might be a whole Project, or it might be clearer split under a few more parent Tasks.`;
  const blockers: Array<ReturnType<typeof add>> = [];
  for (let index = 1; index <= 14; index++)
    blockers.push(add(`many blocker ${String(index).padStart(2, "0")}`));
  const first = blockers.slice(0, 8);
  const many = add(
    "many root",
    ...first.flatMap((task) => ["--depends-on", task.id]),
  );
  await openPicker(many);
  for (let index = 8; index < 14; index++) {
    const candidate = blockers[index];
    assert.ok(candidate);
    await page.getByTestId("dependency-search").fill(candidate.title);
    const checkbox = page.getByTestId(`dependency-choice-${candidate.id}`);
    await expect(checkbox).not.toBeChecked();
    await checkbox.check();
    if (index < 13) {
      await expect(checkbox).toBeChecked();
      await expect(page.getByTestId("dependency-warning")).toContainText(
        advice(index + 1),
      );
      await expect(page.getByTestId("dependency-warning")).not.toContainText(
        "error 2",
      );
      const data = await graph(many.id);
      assert.equal(
        data.edges.filter((edge) => edge.dependent_id === many.id).length,
        index + 1,
      );
      if (index === 8 || index === 12)
        await capture(
          `picker-many-${index + 1}`,
          "A committed edge returns the exact typed many-Dependencies advice; it is not a failed add",
          "compact",
          page.getByTestId("dependency-warning"),
        );
    } else {
      await expect(checkbox).not.toBeChecked();
      await expect(page.getByTestId("dependency-error")).toContainText(
        "A Task can have at most 13 direct Dependencies.",
      );
      await expect(page.getByTestId("dependency-error")).toContainText(
        advice(14),
      );
      await expect(page.getByTestId("dependency-error")).toContainText(
        "error 2 - validation or usage",
      );
      assert.equal(
        (await graph(many.id)).edges.filter(
          (edge) => edge.dependent_id === many.id,
        ).length,
        13,
      );
      await capture(
        "picker-fourteenth-refused",
        "The attempted 14th Dependency is refused with count 14 advice and the actual exit pair; all 13 committed links remain",
        "compact",
        page.getByTestId("dependency-error"),
      );
    }
  }
  await closePicker();
  const pathA = add("redundant path A");
  const pathB = add("redundant path B", "--depends-on", pathA.id);
  const pathRoot = add("redundant root", "--depends-on", pathB.id);
  await openPicker(pathRoot);
  await page.getByTestId("dependency-search").fill(pathA.title);
  await page.getByTestId(`dependency-choice-${pathA.id}`).check();
  await expect(page.getByTestId("dependency-warning")).toContainText(
    "This Dependency is already implied by the path below. The Dependency was kept.",
  );
  const redundant = await graph(pathRoot.id);
  assert.deepEqual(
    new Set(
      redundant.edges
        .filter((edge) => edge.dependent_id === pathRoot.id)
        .map((edge) => edge.blocker_id),
    ),
    new Set([pathA.id, pathB.id]),
  );
  await capture(
    "picker-redundant-kept",
    "A redundant edge is retained and the warning shows the server's implying path",
    "compact",
    page.getByTestId("dependency-warning"),
  );
  await closePicker();
  const quietRoot = add("quiet no-op root");
  const quietCandidate = add("quiet no-op candidate");
  await openPicker(quietRoot);
  await page.getByTestId("dependency-search").fill(quietCandidate.title);
  const quietChoice = page.getByTestId(
    `dependency-choice-${quietCandidate.id}`,
  );
  await expect(quietChoice).not.toBeChecked();
  const noops = [];
  for (const checked of [true, false]) {
    await holdUpdates(true);
    pause("relation");
    await quietChoice.setChecked(checked);
    await expect.poll(pending).toBe(true);
    const current = await show(quietRoot.id);
    const result = await run(
      (checked ? client.tasks.depend : client.tasks.undepend)({
        params: { profile, task: quietRoot.id },
        payload: {
          blocker_id: quietCandidate.id,
          from_version: current.row_version,
        },
      }),
    );
    assert.equal(result.outcome, checked ? "added" : "removed");
    const before = await show(quietRoot.id);
    const historyBefore = await run(
      client.reads.history({ params: { profile, task: quietRoot.id } }),
    );
    resume();
    await expect(
      page.getByText(checked ? "Already linked" : "Already removed", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.getByTestId("dependency-error")).toHaveCount(0);
    const after = await show(quietRoot.id);
    assert.equal(after.row_version, before.row_version);
    assert.deepEqual(
      await run(
        client.reads.history({ params: { profile, task: quietRoot.id } }),
      ),
      historyBefore,
    );
    await capture(
      checked ? "picker-already-linked" : "picker-already-removed",
      "A valid stale no-op is quiet and changes neither Version nor History",
    );
    noops.push({
      checked,
      fromVersion: current.row_version,
      version: after.row_version,
      history: historyBefore,
    });
    await holdUpdates(false);
  }
  await closePicker();
  await openPicker(quietRoot);
  await page.getByTestId("dependency-search").fill("zqxnoresult fixture");
  await expect(
    page.getByText("No matching Tasks", { exact: true }),
  ).toBeVisible();
  await capture(
    "picker-no-matches",
    "A Profile-wide search with no links or candidates shows the existing Empty pattern",
  );
  await notify({ _tag: "connection", profile, state: "offline" });
  await expect(
    page.getByText(
      "Dependencies are read-only while offline or writes are unavailable.",
      { exact: true },
    ),
  ).toBeVisible();
  await page.getByTestId("dependency-search").fill(quietCandidate.title);
  await expect(
    page.getByTestId(`dependency-choice-${quietCandidate.id}`),
  ).toBeDisabled();
  await capture(
    "picker-offline",
    "The offline picker retains search and explains disabled writes",
  );
  await closePicker();
  await notify({ _tag: "connection", profile, state: "connected" });
  const deleteRoot = add(
    "delete changed to empty",
    "--depends-on",
    quietCandidate.id,
  );
  await select(deleteRoot);
  pause("preview");
  await page
    .getByRole("button", {
      name: `Task actions for ${deleteRoot.title}`,
      exact: true,
    })
    .click();
  await page
    .getByRole("menuitem", { name: "Delete task", exact: true })
    .click();
  await expect.poll(pending).toBe(true);
  await expect(
    page.getByText("Loading Delete preview…", { exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId("dependency-delete-confirm")).toBeDisabled();
  await expect(page.getByTestId("dependency-delete-cancel")).toBeFocused();
  await capture(
    "delete-loading-preview",
    "The normal row menu opens the shared Delete preview with Cancel focused and confirmation unavailable until reviewed data arrives",
  );
  resume();
  await expect(page.getByTestId("dependency-delete-confirm")).toBeEnabled();
  await holdUpdates(true);
  await run(
    client.tasks.undepend({
      params: { profile, task: deleteRoot.id },
      payload: {
        blocker_id: quietCandidate.id,
        from_version: (await show(deleteRoot.id)).row_version,
      },
    }),
  );
  const writesBefore = requests.filter(
    (request) => request._tag === "delete" && !request.query.dry_run,
  ).length;
  await page.getByTestId("dependency-delete-confirm").click();
  await expect(
    page.getByTestId("dependency-delete-changed").locator("p").first(),
  ).toHaveText(
    "This Task has no Dependencies now. Confirm again to delete it.",
  );
  await expect(
    page.getByTestId("dependency-delete-changed").locator("p").last(),
  ).toHaveText("error 2 - validation or usage");
  const changedResponse = responses
    .filter(
      ({ request }) =>
        request._tag === "delete" &&
        request.task === deleteRoot.id &&
        !request.query.dry_run,
    )
    .at(-1);
  assert.ok(changedResponse);
  assert.equal(changedResponse.reply._tag, "error");
  assert.ok(changedResponse.reply._tag === "error");
  assert.equal(changedResponse.reply.dependency?.code, "has_dependencies");
  assert.equal(changedResponse.reply.dependency?.exit_code, 2);
  assert.equal(
    changedResponse.reply.dependency?.exit_meaning,
    "validation or usage",
  );
  await expect(page.getByTestId("dependency-delete-cancel")).toBeFocused();
  await expect(page.getByTestId("dependency-delete-confirm")).toHaveText(
    "Delete Task",
  );
  assert.equal(
    requests.filter(
      (request) => request._tag === "delete" && !request.query.dry_run,
    ).length,
    writesBefore + 1,
  );
  assert.equal((await show(deleteRoot.id)).status, "open");
  await capture(
    "delete-changed-to-empty",
    "A stale confirmation refreshes an empty incident set and requires a new explicit confirmation; the Task remains present",
  );
  await expect(page.getByTestId("dependency-delete-dialog")).toContainText(
    "error 2 - validation or usage",
  );
  await notify({ _tag: "connection", profile, state: "offline" });
  await expect(page.getByTestId("dependency-delete-confirm")).toBeDisabled();
  await expect(
    page.getByText(
      "Deleting Tasks is unavailable while offline or read-only.",
      { exact: true },
    ),
  ).toBeVisible();
  await capture(
    "delete-offline",
    "A reviewed empty Delete stays read-only offline and cannot send confirmation",
  );
  await notify({ _tag: "connection", profile, state: "connected" });
  await page.getByTestId("dependency-delete-confirm").click();
  await expect(page.getByTestId("dependency-delete-dialog")).toHaveCount(0);
  assert.equal(
    (
      await run(
        client.tasks.list({
          params: { profile },
          query: { prefix: deleteRoot.id },
        }),
      )
    ).length,
    0,
  );
  assert.equal(
    requests.filter(
      (request) => request._tag === "delete" && !request.query.dry_run,
    ).length,
    writesBefore + 2,
  );
  await holdUpdates(false);
  const nonemptyRoot = add(
    "delete changed nonempty",
    "--depends-on",
    quietCandidate.id,
  );
  await select(nonemptyRoot);
  await page
    .getByRole("button", {
      name: `Task actions for ${nonemptyRoot.title}`,
      exact: true,
    })
    .click();
  await page
    .getByRole("menuitem", { name: "Delete task", exact: true })
    .click();
  await expect(page.getByTestId("dependency-delete-confirm")).toBeEnabled();
  await holdUpdates(true);
  await run(
    client.tasks.depend({
      params: { profile, task: nonemptyRoot.id },
      payload: {
        blocker_id: quietRoot.id,
        from_version: (await show(nonemptyRoot.id)).row_version,
      },
    }),
  );
  await page.getByTestId("dependency-delete-confirm").click();
  await expect(
    page.getByTestId("dependency-delete-changed").locator("p").first(),
  ).toHaveText(
    "Dependencies changed. Review the current list and confirm again.",
  );
  await expect(
    page.getByTestId("dependency-delete-changed").locator("p").last(),
  ).toHaveText("error 2 - validation or usage");
  await expect(
    page.getByTestId("dependency-delete-depends-on").locator("h3"),
  ).toHaveText("Depends on · 2");
  await expect(page.getByTestId("dependency-delete-cancel")).toBeFocused();
  assert.equal((await show(nonemptyRoot.id)).depends_on?.length, 2);
  await capture(
    "delete-changed-nonempty",
    "A has_dependencies refusal with a current non-empty preview keeps the Dependency-change status and actual pair; Cancel remains the initial action",
  );
  await page.getByTestId("dependency-delete-cancel").click();
  await holdUpdates(false);
  const versionConflict = add("delete Version Conflict");
  await select(versionConflict);
  await page
    .getByRole("button", {
      name: `Task actions for ${versionConflict.title}`,
      exact: true,
    })
    .click();
  await page
    .getByRole("menuitem", { name: "Delete task", exact: true })
    .click();
  await expect(page.getByTestId("dependency-delete-confirm")).toBeEnabled();
  await holdUpdates(true);
  cli(
    "edit",
    versionConflict.id,
    "--title",
    "Edge fixture changed outside the Delete dialog",
    "--expected-version",
    "1",
  );
  await page.getByTestId("dependency-delete-confirm").click();
  await expect(page.getByTestId("dependency-delete-changed")).toContainText(
    "error 4 - Conflict",
  );
  await expect(
    page.getByTestId("dependency-delete-changed").locator("p").first(),
  ).toHaveText("This Task changed. Confirm again to delete it.");
  const conflictResponse = responses
    .filter(
      ({ request }) =>
        request._tag === "delete" &&
        request.task === versionConflict.id &&
        !request.query.dry_run,
    )
    .at(-1);
  assert.ok(conflictResponse);
  assert.equal(conflictResponse.reply._tag, "conflict");
  assert.ok(conflictResponse.reply._tag === "conflict");
  assert.equal(conflictResponse.reply.exit_detail, "error 4 - Conflict");
  assert.equal((await show(versionConflict.id)).status, "open");
  await expect(page.getByTestId("dependency-delete-cancel")).toBeFocused();
  await capture(
    "delete-conflict-reloaded",
    "An unchanged empty fingerprint with a stale Version carries the actual Conflict pair into its refreshed preview and still requires another explicit confirmation",
  );
  await page.getByTestId("dependency-delete-cancel").click();
  await holdUpdates(false);
  const context = add("context Delete confirmation");
  await select(context);
  await page
    .locator(`[data-task-id="${context.id}"] .task-content`)
    .click({ button: "right" });
  await page
    .getByRole("menuitem", { name: "Delete task", exact: true })
    .click();
  await expect(page.getByTestId("dependency-delete-confirm")).toBeEnabled();
  await expect(page.getByTestId("dependency-delete-cancel")).toBeFocused();
  await capture(
    "delete-context-empty",
    "Right-click uses the same no-edge Delete confirmation, with Cancel as its initial focus",
  );
  await page.getByTestId("dependency-delete-cancel").click();
  assert.equal((await show(context.id)).status, "open");
  await search.fill("");
  return {
    many: await graph(many.id),
    redundant,
    noops,
    changedToEmpty: { id: deleteRoot.id, confirmationRequests: 2 },
    changedResponse,
    conflictResponse,
    cancelledContextTask: context,
  };
}
