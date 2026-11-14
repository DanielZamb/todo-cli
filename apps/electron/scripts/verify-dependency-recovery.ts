import assert from "node:assert/strict";
import { expect, type Locator, type Page } from "@playwright/test";
import { InternalError } from "@todo/api";
import { ProfileId, TaskId, Version } from "@todo/domain";
import { Effect, Schema } from "effect";
import { FetchHttpClient, type HttpClient } from "effect/http";
import { taskHttpClient } from "../src/http-client.ts";
import type { Reply, Request } from "../src/protocol.ts";
import { settleRenderer } from "./settle-renderer.ts";

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
const agentFailure =
  "AGENT GRAPH READ FAILURE: raw route and CLI advice must never be visible";
export async function createDependencyReadProbe(
  credential: () => string | undefined,
) {
  let target: TaskId | null = null;
  const receipts: {
    path: string;
    status: number;
    hasAuthorization: boolean;
    body: unknown;
  }[] = [];
  const host = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      assert.equal(request.method, "GET");
      const path = new URL(request.url).pathname;
      assert.match(path, /^\/profiles\/work\/tasks\/[a-f0-9-]+\/graph$/);
      const body = Schema.encodeSync(InternalError)(
        new InternalError({ message: agentFailure }),
      );
      receipts.push({
        path,
        status: 500,
        hasAuthorization: request.headers.has("Authorization"),
        body,
      });
      return Response.json(body, { status: 500 });
    },
  });
  const http = await run(taskHttpClient(host.url.origin, credential));
  return {
    http,
    receipts,
    enabled(id: TaskId) {
      return target === id;
    },
    failNext(id: TaskId) {
      target = id;
    },
    consume() {
      target = null;
    },
    close() {
      host.stop(true);
    },
  };
}
export async function verifyDependencyRecovery({
  page,
  client,
  cli,
  capture,
  notify,
  pauseGraph,
  pending,
  resume,
  probe,
  deliveries,
  signOut,
  prepareOtherProfile,
  holdUpdates,
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
  pauseGraph: () => void;
  pending: () => boolean;
  resume: () => void;
  probe: Awaited<ReturnType<typeof createDependencyReadProbe>>;
  deliveries: readonly { request: Request; reply: Reply["_tag"] }[];
  signOut: () => Promise<void>;
  prepareOtherProfile: () => void;
  holdUpdates: (hold: boolean) => Promise<void>;
}) {
  const add = (title: string, ...args: string[]) =>
    Schema.decodeUnknownSync(Created)(
      cli("add", `Recovery fixture ${title}`, ...args),
    ).task;
  const prerequisite = add("a prerequisite");
  const root = add("current graph root", "--depends-on", prerequisite.id);
  const older = add("older private root");
  prepareOtherProfile();
  await holdUpdates(true);
  const search = page.getByRole("textbox", {
    name: "Search tasks",
    exact: true,
  });
  const open = async (
    task: Schema.Schema.Type<typeof Created>["task"],
    loading = false,
  ) => {
    await search.fill(task.title);
    await expect(page.locator(`[data-task-id="${task.id}"]`)).toBeVisible();
    await page
      .getByRole("button", {
        name: `Task actions for ${task.title}`,
        exact: true,
      })
      .click();
    await page
      .getByRole("menuitem", { name: "View Dependencies", exact: true })
      .click();
    await expect(page.getByTestId("dependency-graph")).toBeVisible();
    await expect(
      page
        .getByTestId("dependency-graph")
        .locator('[data-slot="dialog-description"]'),
    ).toHaveText(task.title);
    if (!loading)
      await expect(page.getByTestId("dependency-graph-details")).toBeVisible();
  };
  const close = () => page.getByTestId("dependency-graph-close").click();
  const layout = async (compact: boolean) => {
    await page.setViewportSize(
      compact ? { width: 393, height: 426 } : { width: 1100, height: 720 },
    );
    await notify({ _tag: "windowMode", compact });
    await settleRenderer(page);
  };
  const layouts = async (state: string, description: string) => {
    await capture(state, description);
    await layout(false);
    await capture(state, description, "full");
    await layout(true);
  };
  pauseGraph();
  await open(root, true);
  await expect.poll(pending).toBe(true);
  await expect(
    page.getByText("Loading Dependencies…", { exact: true }),
  ).toBeVisible();
  await layouts(
    "graph-loading",
    "The production graph controller retains Close and mode controls while its real server read is pending",
  );
  resume();
  await expect(page.getByTestId("dependency-graph-details")).toBeVisible();
  await notify({ _tag: "connection", profile, state: "offline" });
  await expect(
    page.getByText("Offline. The last Dependencies are read-only.", {
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByTestId(`dependency-graph-actions-depends-on-${prerequisite.id}`)
    .click();
  await expect(
    page.getByRole("menuitem", { name: "Add dependency…", exact: true }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  await layouts(
    "graph-offline",
    "The last authorized graph stays readable offline; relation editing is explicitly disabled",
  );
  await notify({ _tag: "connection", profile, state: "connected" });
  await close();
  probe.failNext(root.id);
  await open(root, true);
  await expect(page.getByTestId("dependency-error")).toContainText(
    "Couldn't update Dependencies. Try again.",
  );
  await expect(page.getByTestId("dependency-error")).toContainText(
    "error 1 - runtime failure",
  );
  await expect(page.locator("body")).not.toContainText(agentFailure);
  await layouts(
    "graph-backend-failure",
    "A controlled valid HTTP 500 crosses the production SDK decoder and uses human recovery with its actual exit pair",
  );
  await page.getByTestId("dependency-graph-retry").click();
  await expect(
    page
      .frameLocator('[data-testid="dependency-graph-diagram"]')
      .locator(".pele-node:not(.graph-hidden)"),
  ).toHaveCount(2);
  await page.getByRole("button", { name: "List", exact: true }).click();
  await layouts(
    "graph-backend-recovered",
    "Explicit Retry reads the real compiled scratch server and restores the accessible graph data",
  );
  await close();
  const stale = [];
  for (const failure of [false, true]) {
    const before = deliveries.filter(
      ({ request }) => request._tag === "graph" && request.task === older.id,
    ).length;
    pauseGraph();
    await open(older, true);
    await expect.poll(pending).toBe(true);
    await close();
    await open(root);
    if (failure) probe.failNext(older.id);
    resume();
    await expect
      .poll(
        () =>
          deliveries.filter(
            ({ request }) =>
              request._tag === "graph" && request.task === older.id,
          ).length,
      )
      .toBe(before + 1);
    await expect(
      page
        .getByTestId("dependency-graph")
        .locator('[data-slot="dialog-description"]'),
    ).toHaveText(root.title);
    await expect(page.getByTestId("dependency-error")).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText(agentFailure);
    await layouts(
      failure ? "graph-obsolete-error" : "graph-obsolete-success",
      "A closed older root read has actually returned through the SDK and cannot replace the newer authorized graph or publish an obsolete notice",
    );
    stale.push({
      failure,
      delivered: deliveries
        .filter(
          ({ request }) =>
            request._tag === "graph" && request.task === older.id,
        )
        .at(-1),
    });
    await close();
  }
  const beforeProfile = deliveries.filter(
    ({ request }) => request._tag === "graph" && request.task === older.id,
  ).length;
  pauseGraph();
  await open(older, true);
  await expect.poll(pending).toBe(true);
  await close();
  await page.getByRole("button", { name: "Profile", exact: true }).click();
  await page
    .locator('[role="menuitemradio"][data-profile-id="recovery-other"]')
    .click();
  await expect(
    page.getByRole("button", { name: "Profile", exact: true }),
  ).toHaveAttribute("data-profile-id", "recovery-other");
  resume();
  await expect
    .poll(
      () =>
        deliveries.filter(
          ({ request }) =>
            request._tag === "graph" && request.task === older.id,
        ).length,
    )
    .toBe(beforeProfile + 1);
  await expect(page.getByTestId("dependency-graph")).toHaveCount(0);
  await expect(page.locator(`[data-task-id="${older.id}"]`)).toHaveCount(0);
  await capture(
    "dependency-profile-reset",
    "A real Profile change retains the existing search query but clears old graph data; the previous Profile's delayed SDK reply cannot publish",
  );
  await page.getByRole("button", { name: "Profile", exact: true }).click();
  await page.locator('[role="menuitemradio"][data-profile-id="work"]').click();
  await expect(
    page.getByRole("button", { name: "Profile", exact: true }),
  ).toHaveAttribute("data-profile-id", "work");
  const beforeAuth = deliveries.filter(
    ({ request }) => request._tag === "graph" && request.task === older.id,
  ).length;
  pauseGraph();
  await open(older, true);
  await expect.poll(pending).toBe(true);
  await signOut();
  await expect(
    page.getByRole("textbox", { name: "Owner passphrase", exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId("dependency-graph")).toHaveCount(0);
  resume();
  await expect
    .poll(
      () =>
        deliveries.filter(
          ({ request }) =>
            request._tag === "graph" && request.task === older.id,
        ).length,
    )
    .toBe(beforeAuth + 1);
  await expect(
    page.getByRole("heading", { name: "Welcome to Todo", exact: true }),
  ).toBeVisible();
  await expect(page.locator("body")).not.toContainText(older.title);
  assert.equal(
    deliveries
      .filter(
        ({ request }) => request._tag === "graph" && request.task === older.id,
      )
      .at(-1)?.reply,
    "error",
  );
  await capture(
    "dependency-auth-reset",
    "A real scratch Session sign-out plus the normal host notice clears scoped graph/display state before its old read returns; no native storage is involved",
  );
  await page
    .getByRole("textbox", { name: "Owner passphrase", exact: true })
    .fill("scratch verification passphrase");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(search).toBeVisible();
  await open(root);
  const afterAuth = await run(
    client.tasks.graph({ params: { profile, task: root.id } }),
  );
  assert.equal(afterAuth.task_id, root.id);
  await layouts(
    "graph-after-resign-in",
    "The same retained HttpApi client reads authorized Dependencies after a replacement scratch Session signs in",
  );
  await close();
  await search.fill("");
  await holdUpdates(false);
  assert.equal(probe.receipts.length, 2);
  return {
    stale,
    probe: probe.receipts,
    auth: {
      afterAuth,
      oldRead: deliveries
        .filter(
          ({ request }) =>
            request._tag === "graph" && request.task === older.id,
        )
        .at(-1),
      resignedIn: true,
    },
    limits: [
      "Controlled HTTP500 body; ordinary data and Session operations use compiled scratch server",
      "Renderer/transport only, no safeStorage or native Session restoration",
      "SSE operation notices are held during deterministic delayed reads; camera/focus preservation through actual SSE is proved separately",
    ],
  };
}
