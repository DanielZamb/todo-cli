import assert from "node:assert/strict";
import { expect, type Locator, type Page } from "@playwright/test";
import {
  ProfileId,
  searchTooBroadMessage,
  type Task,
  TaskId,
  Version,
} from "@todo/domain";
import { Effect, Schema } from "effect";
import { FetchHttpClient, type HttpClient } from "effect/http";
import { taskHttpClient } from "../src/http-client.ts";
import type { Reply } from "../src/protocol.ts";
import { settleRenderer } from "./settle-renderer.ts";

const run = <A, E>(effect: Effect.Effect<A, E, HttpClient.HttpClient>) =>
  Effect.runPromise(effect.pipe(Effect.provide(FetchHttpClient.layer)));
export const broadDependencyQuery = "broad dependency probe";
export const oldDependencyQuery = "older broad dependency probe";
export async function createDependencySearchProbe(
  client: Effect.Success<ReturnType<typeof taskHttpClient>>,
  credential: () => string | undefined,
) {
  const receipts: {
    query: string;
    status: number;
    ids?: readonly string[];
    body?: unknown;
  }[] = [];
  const delivered: { query: string; tag: Reply["_tag"]; code?: string }[] = [];
  let release: (() => void) | null = null;
  let enabled = false;
  const host = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const url = new URL(request.url);
      const profile = Schema.decodeUnknownSync(ProfileId)(
        url.pathname.split("/")[2],
      );
      assert.equal(request.method, "GET");
      assert.equal(url.pathname, `/profiles/${profile}/tasks`);
      const query = url.searchParams.get("text") ?? "";
      if (query === broadDependencyQuery || query === oldDependencyQuery) {
        if (query === oldDependencyQuery)
          await new Promise<void>((done) => {
            release = done;
          });
        const body = {
          generated_at: "2026-11-10T00:00:00Z",
          code: "search_too_broad",
          message: searchTooBroadMessage,
          exit_code: 2,
          exit_meaning: "validation or usage",
        };
        receipts.push({ query, status: 422, body });
        return Response.json(body, { status: 422 });
      }
      const tasks = await run(
        client.tasks.list({
          params: { profile },
          query: query ? { text: query } : {},
        }),
      );
      receipts.push({ query, status: 200, ids: tasks.map((task) => task.id) });
      return Response.json(tasks);
    },
  });
  const http = await run(taskHttpClient(host.url.origin, credential));
  return {
    http,
    receipts,
    delivered,
    record(query: string, reply: Reply) {
      delivered.push({
        query,
        tag: reply._tag,
        ...(reply._tag === "error" && reply.code ? { code: reply.code } : {}),
      });
    },
    get enabled() {
      return enabled;
    },
    set enabled(value: boolean) {
      enabled = value;
    },
    get pending() {
      return release !== null;
    },
    release() {
      const done = release;
      release = null;
      done?.();
    },
    close() {
      const done = release;
      release = null;
      done?.();
      host.stop(true);
    },
  };
}
type Probe = Awaited<ReturnType<typeof createDependencySearchProbe>>;
type TaskName = Pick<Task, "id" | "title">;
export async function verifyDependencySearchRecovery({
  page,
  root,
  blocker,
  cli,
  capture,
  probe,
  holdUpdates,
  only = "all",
}: {
  page: Page;
  root: TaskName;
  blocker: TaskName;
  cli: (...args: string[]) => unknown;
  capture: (
    state: string,
    description: string,
    layout?: string,
    target?: Locator,
  ) => Promise<void>;
  probe: Probe;
  holdUpdates: (hold: boolean) => Promise<void>;
  only?: "all" | "picker" | "graph";
}) {
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
  const cycle = readTask(
    cli("add", "Search recovery cycle candidate", "--depends-on", root.id),
  );
  for (let index = 0; index < 12; index++)
    cli("add", `Search recovery scope ${index + 1}`, "--depends-on", root.id);
  await expect(
    page.locator(`[data-task-id="${root.id}"] .task-content`),
  ).toBeVisible();
  await page.locator(`[data-task-id="${root.id}"] .task-content`).click();
  probe.enabled = true;
  const search = async (input: Locator, query: string) => {
    const count = probe.delivered.length;
    await input.fill(query);
    await expect
      .poll(() =>
        probe.delivered.slice(count).some((receipt) => receipt.query === query),
      )
      .toBe(true);
    await settleRenderer(page);
  };
  const broadNotice = page
    .getByRole("status")
    .filter({ hasText: "Search is too broad." });
  if (only !== "graph") {
    await page.getByTestId("dependency-add").click();
    const input = page.getByTestId("dependency-search");
    await search(input, cycle.title);
    await page.getByTestId(`dependency-choice-${cycle.id}`).check();
    await expect(page.getByTestId("dependency-error")).toContainText(
      "This Dependency would create a loop.",
    );
    await search(input, broadDependencyQuery);
    await expect(broadNotice).toBeVisible();
    await capture(
      "picker-search-broad",
      "Controlled valid public 422 through the real HttpApi client retains narrow-query recovery beside the mutation refusal",
    );
    await search(input, blocker.title);
    await expect(page.getByTestId(`dependency-choice-${cycle.id}`)).toHaveCount(
      0,
    );
    await expect(broadNotice).toHaveCount(0);
    await capture(
      "picker-search-narrow-before-assert",
      "Current real-server results replace the broad search; the mutation refusal must survive",
    );
    await expect(page.getByTestId("dependency-error")).toContainText(
      "This Dependency would create a loop.",
    );
    await search(input, "");
    await expect(
      page.getByTestId(`dependency-choice-${cycle.id}`),
    ).not.toBeChecked();
    await expect(page.getByTestId("dependency-error")).toContainText(
      "This Dependency would create a loop.",
    );
    await expect(broadNotice).toHaveCount(0);
    const olderDeliveries = probe.delivered.filter(
      (reply) => reply.query === oldDependencyQuery,
    ).length;
    await input.fill(oldDependencyQuery);
    await expect.poll(() => probe.pending).toBe(true);
    await search(input, blocker.title);
    probe.release();
    await expect
      .poll(
        () =>
          probe.delivered.filter((reply) => reply.query === oldDependencyQuery)
            .length,
      )
      .toBe(olderDeliveries + 1);
    await settleRenderer(page);
    await expect(broadNotice).toHaveCount(0);
    await expect(page.getByTestId("dependency-error")).toContainText(
      "This Dependency would create a loop.",
    );
    await capture(
      "picker-search-recovered",
      "Narrow, clear and delayed older-error recovery preserve the attempted cycle refusal",
    );
    await search(input, "");
    await page
      .getByTestId("dependency-error")
      .getByRole("button", { name: "Dismiss", exact: true })
      .click();
    await holdUpdates(true);
    const current = readTask(cli("show", root.id));
    cli(
      "edit",
      root.id,
      "--expected-version",
      String(current.row_version),
      "--desc",
      "Concurrent edit for Dependency search Conflict",
    );
    await page.getByTestId(`dependency-choice-${cycle.id}`).check();
    await expect(page.getByTestId("dependency-error")).toContainText(
      "error 4 - Conflict",
    );
    await search(input, broadDependencyQuery);
    await expect(broadNotice).toBeVisible();
    await search(input, blocker.title);
    await expect(broadNotice).toHaveCount(0);
    await expect(page.getByTestId("dependency-reload")).toBeEnabled();
    await expect(
      page.getByTestId(`dependency-choice-${blocker.id}`),
    ).toBeDisabled();
    await search(input, "");
    await expect(broadNotice).toHaveCount(0);
    await expect(page.getByTestId("dependency-error")).toContainText(
      "error 4 - Conflict",
    );
    await capture(
      "picker-search-conflict-recovered",
      "Search-owned notices clear while the real stale-Version Conflict and explicit Reload gate remain",
    );
    await page.getByTestId("dependency-picker-close").click();
    await holdUpdates(false);
  }
  if (only !== "picker") {
    await page
      .getByRole("button", { name: "Task actions", exact: true })
      .click();
    await page
      .getByRole("menuitem", { name: "View Dependencies", exact: true })
      .click();
    const input = page.getByRole("textbox", {
      name: "Search these Tasks",
      exact: true,
    });
    await expect(input).toBeVisible();
    const blocks = page
      .getByTestId("dependency-graph-details")
      .locator('[data-section="blocks"] li');
    const count = await blocks.count();
    assert.ok(count > 10);
    await search(input, broadDependencyQuery);
    await expect(broadNotice).toBeVisible();
    await capture(
      "graph-search-broad",
      "Controlled valid public 422 retains the existing narrow-query recovery and known graph region",
    );
    await search(input, blocker.title);
    await expect(blocks).toHaveCount(0);
    await expect(broadNotice).toHaveCount(0);
    await capture(
      "graph-search-narrow",
      "Current successful graph search publishes matching Tasks and removes the older search notice",
    );
    await search(input, broadDependencyQuery);
    await expect(broadNotice).toBeVisible();
    await input.fill("");
    await expect(broadNotice).toHaveCount(0);
    await expect(blocks).toHaveCount(count);
    const olderDeliveries = probe.delivered.filter(
      (reply) => reply.query === oldDependencyQuery,
    ).length;
    await input.fill(oldDependencyQuery);
    await expect.poll(() => probe.pending).toBe(true);
    await search(input, blocker.title);
    probe.release();
    await expect
      .poll(
        () =>
          probe.delivered.filter((reply) => reply.query === oldDependencyQuery)
            .length,
      )
      .toBe(olderDeliveries + 1);
    await settleRenderer(page);
    await expect(broadNotice).toHaveCount(0);
    await expect(blocks).toHaveCount(0);
    await input.fill("");
    await expect(blocks).toHaveCount(count);
    await expect(broadNotice).toHaveCount(0);
    await capture(
      "graph-search-cleared",
      "Clearing the query restores the known region and a delayed older error cannot republish its notice",
    );
    await page.getByTestId("dependency-graph-close").click();
  }
  probe.enabled = false;
  return {
    only,
    publicResponses: probe.receipts,
    delivered: probe.delivered,
    threshold:
      "controlled valid public 422; normal 200 Tasks originate from the compiled scratch server",
    mutationRefusal: only !== "graph" ? "PASS" : "not run",
    conflictReload: only !== "graph" ? "PASS" : "not run",
    graph: only !== "picker" ? "PASS" : "not run",
  };
}
