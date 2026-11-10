import assert from "node:assert/strict";
import { lstatSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname } from "node:path";
import { expect, type Locator, type Page } from "@playwright/test";
import { ProfileId, Task, TaskId, Version } from "@todo/domain";
import { openStore } from "@todo/domain/store";
import { Effect, Schema } from "effect";
import { FetchHttpClient, type HttpClient } from "effect/http";
import type { taskHttpClient } from "../src/http-client.ts";

const run = <A, E>(effect: Effect.Effect<A, E, HttpClient.HttpClient>) =>
  Effect.runPromise(effect.pipe(Effect.provide(FetchHttpClient.layer)));
const profile = Schema.decodeUnknownSync(ProfileId)("work");
const readTask = (value: unknown) =>
  Schema.decodeUnknownSync(
    Schema.Struct({
      task: Schema.Struct({
        id: TaskId,
        title: Schema.String,
        row_version: Version,
      }),
    }),
  )(value).task;
async function seedSnoozed(path: string) {
  const parent = realpathSync(dirname(path));
  assert.equal(dirname(parent), realpathSync(tmpdir()));
  assert.ok(basename(parent).startsWith("todo-dag-e-"));
  assert.equal(lstatSync(path).isSymbolicLink(), false);
  return Effect.runPromise(
    Effect.acquireUseRelease(
      openStore({ path }),
      (store) =>
        Effect.gen(function* () {
          const { credential } = yield* store.auth.signIn(
            "scratch verification passphrase",
          );
          const now = "2026-11-10T00:00:00Z";
          const tasks = [
            [
              "de000000-0000-4000-8000-000000000001",
              "DAG readiness Snoozed prerequisite",
            ],
            [
              "de000000-0000-4000-8000-000000000002",
              "DAG readiness Snoozed blocked Task",
            ],
            [
              "de000000-0000-4000-8000-000000000003",
              "DAG readiness Snoozed ready Task",
            ],
          ].map(([id, title]) =>
            Schema.decodeUnknownSync(Task)({
              id,
              title,
              profile_id: profile,
              entity_version: 1,
              row_version: 1,
              description: null,
              status: "snoozed",
              project_id: null,
              priority: "P3",
              scheduled_at: {
                kind: "instant",
                utc: "2099-01-01T00:00:00Z",
                time_zone: "UTC",
              },
              due_at: null,
              energy: null,
              estimate_min: null,
              source: "verification",
              tags: [],
              occurrence: null,
              created_at: now,
              updated_at: now,
              completed_at: null,
              deleted_at: null,
            }),
          );
          for (const task of tasks) {
            const result = yield* store.auth.append({
              credential,
              profile,
              event: {
                kind: "TaskCreated",
                entity_version: 1,
                occurred_at: now,
                task,
                series: null,
                project: null,
                tags: [],
              },
            });
            assert.equal(result.outcome, "committed");
          }
          return tasks;
        }),
      (store) => store.close(),
    ),
  );
}
export async function verifyDependencyReadiness({
  page,
  client,
  cli,
  database,
  capture,
}: {
  page: Page;
  client: Effect.Success<ReturnType<typeof taskHttpClient>>;
  cli: (...args: string[]) => unknown;
  database: string;
  capture: (
    state: string,
    description: string,
    layout?: string,
    target?: Locator,
  ) => Promise<void>;
}) {
  const add = (title: string, ...args: string[]) =>
    readTask(cli("add", `DAG readiness ${title}`, ...args));
  const open = add("Open prerequisite", "--energy", "3");
  const done = add("Done prerequisite");
  cli("done", done.id, "--expected-version", "1");
  const cancelled = add("Cancelled prerequisite");
  cli("cancel", cancelled.id, "--expected-version", "1");
  const metadata = [
    "--project",
    "DAG readiness Project",
    "--tag",
    "dag readiness tag",
  ];
  const ready = add(
    "Ready open Task",
    "--depends-on",
    done.id,
    "--depends-on",
    cancelled.id,
    ...metadata,
  );
  const blocked = add(
    "Blocked open Task",
    "--depends-on",
    open.id,
    ...metadata,
  );
  const plain = add("Independent ready Task");
  const terminalDone = add(
    "Done Task with resolved Dependencies",
    "--depends-on",
    done.id,
  );
  cli("done", terminalDone.id, "--expected-version", "1");
  const terminalCancelled = add(
    "Cancelled Task with an open Dependency",
    "--depends-on",
    open.id,
  );
  cli("cancel", terminalCancelled.id, "--expected-version", "1");
  const snoozed = await seedSnoozed(database);
  const prerequisite = snoozed[0],
    snoozedBlocked = snoozed[1],
    snoozedReady = snoozed[2];
  assert.ok(prerequisite && snoozedBlocked && snoozedReady);
  for (const [task, blockers] of [
    [snoozedBlocked, [open.id, prerequisite.id]],
    [snoozedReady, [done.id, cancelled.id]],
  ] as const) {
    let version = 1;
    for (const blocker_id of blockers) {
      const report = await run(
        client.tasks.depend({
          params: { profile, task: task.id },
          payload: {
            blocker_id,
            from_version: Schema.decodeUnknownSync(Version)(version),
          },
        }),
      );
      assert.equal(report.outcome, "added");
      version++;
    }
  }
  const server = await run(
    client.tasks.list({
      params: { profile },
      query: { text: "DAG readiness" },
    }),
  );
  for (const [task, readyValue, blockedValue] of [
    [ready, true, false],
    [blocked, false, true],
    [plain, true, false],
    [snoozedReady, true, false],
    [snoozedBlocked, false, true],
    [terminalDone, false, false],
    [terminalCancelled, false, false],
  ] as const) {
    const actual = server.find((value) => value.id === task.id);
    assert.ok(actual);
    assert.equal(actual.ready, readyValue);
    assert.equal(actual.blocked, blockedValue);
  }
  const input = page.getByRole("textbox", {
    name: "Search tasks",
    exact: true,
  });
  await input.fill("DAG readiness");
  const filters = async (
    readyValue: boolean,
    blockedValue: boolean,
    prefix = "",
  ) => {
    await page
      .getByRole("button", { name: "More filters", exact: true })
      .click();
    await page.locator("#filter-status").selectOption("");
    await page.getByTestId("filter-ready").setChecked(readyValue);
    await page.getByTestId("filter-blocked").setChecked(blockedValue);
    await page.locator("#filter-prefix").fill(prefix);
    await page
      .getByRole("button", { name: "Apply filters", exact: true })
      .click();
  };
  const ids = () =>
    page
      .locator(".task-row[data-task-id]")
      .evaluateAll((rows) =>
        rows.map((row) => row.getAttribute("data-task-id")),
      );
  await filters(false, false);
  for (const task of [
    ready,
    blocked,
    plain,
    snoozedReady,
    snoozedBlocked,
    terminalDone,
    terminalCancelled,
  ])
    await expect(page.locator(`[data-task-id="${task.id}"]`)).toBeAttached();
  await expect(page.getByTestId(`dependency-state-${ready.id}`)).toHaveText(
    "Ready",
  );
  await expect(
    page.getByTestId(`dependency-state-${snoozedReady.id}`),
  ).toHaveText("Ready");
  await expect(page.getByTestId(`dependency-state-${blocked.id}`)).toHaveText(
    "Blocked · 1",
  );
  await expect(
    page.getByTestId(`dependency-state-${snoozedBlocked.id}`),
  ).toHaveText("Blocked · 2");
  for (const task of [plain, terminalDone, terminalCancelled])
    await expect(page.getByTestId(`dependency-state-${task.id}`)).toHaveCount(
      0,
    );
  await page
    .locator(`[data-task-id="${snoozedBlocked.id}"]`)
    .scrollIntoViewIfNeeded();
  await capture(
    "rows-snoozed-blocked",
    "Production rows show two unresolved direct blockers for a snoozed Task; the reserved snoozed states are seeded through the existing authenticated event-store fixture boundary",
    "compact",
    page.locator(`[data-task-id="${snoozedBlocked.id}"]`),
  );
  await capture(
    "rows-snoozed-ready",
    "A snoozed Ready Task with resolved blockers uses the same calm metadata line",
    "compact",
    page.locator(`[data-task-id="${snoozedReady.id}"]`),
  );
  await capture(
    "rows-terminal-linked",
    "A done Task with Dependencies has no Ready or Blocked badge",
    "compact",
    page.locator(`[data-task-id="${terminalDone.id}"]`),
  );
  await filters(true, false);
  const readyIds = [
    open.id,
    prerequisite.id,
    ready.id,
    plain.id,
    snoozedReady.id,
  ].sort();
  await expect.poll(async () => [...(await ids())].sort()).toEqual(readyIds);
  await expect(page.getByTestId(`dependency-state-${plain.id}`)).toHaveCount(0);
  await capture(
    "filter-ready-results",
    "Ready includes open and snoozed Tasks plus a no-blocker Task with no badge; terminal Tasks are excluded",
  );
  await filters(false, true);
  await expect
    .poll(async () => [...(await ids())].sort())
    .toEqual([blocked.id, snoozedBlocked.id].sort());
  await capture(
    "filter-blocked-results",
    "Blocked includes open and snoozed Tasks and preserves the unresolved direct-blocker counts",
  );
  await page
    .getByRole("combobox", { name: "Filter by Project", exact: true })
    .selectOption({ label: "DAG readiness Project" });
  await page
    .getByRole("combobox", { name: "Filter by Tag", exact: true })
    .selectOption({ label: "dag readiness tag" });
  await filters(true, false, ready.id.slice(0, 8));
  await expect.poll(ids).toEqual([ready.id]);
  await capture(
    "filter-ready-combined",
    "Ready combines with server text, id prefix, Project and Tag in the existing filter flow",
  );
  await filters(false, true, blocked.id.slice(0, 8));
  await expect.poll(ids).toEqual([blocked.id]);
  await capture(
    "filter-blocked-combined",
    "Blocked combines with server text, id prefix, Project and Tag in the existing filter flow",
  );
  await filters(true, true);
  await expect(
    page.getByText("No matching tasks", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Clear filters", exact: true }).last(),
  ).toBeVisible();
  for (const locator of [
    page.getByText("No matching tasks", { exact: true }),
    page.getByRole("button", { name: "Clear filters", exact: true }).last(),
  ]) {
    const box = await locator.boundingBox();
    assert.ok(box);
    assert.ok(box.y >= 0 && box.y + box.height <= 426);
  }
  await capture(
    "filters-empty-results",
    "The Task list, rather than the dialog, shows an empty combined Ready and Blocked result with Clear filters",
  );
  await page
    .getByRole("button", { name: "Clear filters", exact: true })
    .last()
    .click();
  await page.locator("#task-order").selectOption("topo");
  const topo = await run(
    client.tasks.list({
      params: { profile },
      query: { text: "DAG readiness", order: "topo" },
    }),
  );
  await expect.poll(ids).toEqual(topo.map((task) => task.id));
  await capture(
    "order-dependency-filtered",
    "Dependency order comes from the whole Profile before the current text filter and retains server order",
  );
  await page.locator("#task-order").selectOption("lightest");
  const lightest = await run(
    client.tasks.list({
      params: { profile },
      query: { text: "DAG readiness", order: "lightest" },
    }),
  );
  await expect.poll(ids).toEqual(lightest.map((task) => task.id));
  await capture(
    "order-lightest-filtered",
    "Lightest first retains the server's whole-Profile remaining-Energy order under the current text filter",
  );
  await input.fill("");
  await page.locator("#task-order").selectOption("default");
  return {
    server,
    topo: topo.map((task) => task.id),
    lightest: lightest.map((task) => task.id),
    snoozedSetup:
      "Authenticated production-store TaskCreated v1 fixture, matching the existing client-reads seed; all edges, filters and assertions use public HTTP and production UI.",
  };
}
