import assert from "node:assert/strict";
import { expect, type Locator, type Page } from "@playwright/test";
import { ProfileId, TaskId, Version } from "@todo/domain";
import { Effect, Schema } from "effect";
import { FetchHttpClient, type HttpClient } from "effect/http";
import type { taskHttpClient } from "../src/http-client.ts";
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
export async function verifyDependencyGraphs({
  page,
  client,
  cli,
  capture,
  notify,
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
}) {
  await page.addInitScript(() => {
    const renders: unknown[] = [];
    Reflect.set(window, "dagRenderObservations", renders);
    window.addEventListener("message", (event: MessageEvent<unknown>) => {
      if (
        event.data &&
        typeof event.data === "object" &&
        "type" in event.data &&
        event.data.type === "render"
      )
        renders.push({
          time: performance.now(),
          width: innerWidth,
          height: innerHeight,
          hasViewport: "viewport" in event.data,
          viewport: Reflect.get(event.data, "viewport"),
        });
    });
  });
  await page.evaluate(() => {
    Reflect.set(window, "dagViewportReplies", 0);
    window.addEventListener("message", (event: MessageEvent<unknown>) => {
      const frame = document.querySelector(
        '[data-testid="dependency-graph-diagram"]',
      );
      if (
        frame instanceof HTMLIFrameElement &&
        event.source === frame.contentWindow &&
        event.data &&
        typeof event.data === "object" &&
        "type" in event.data &&
        event.data.type === "viewport"
      )
        Reflect.set(
          window,
          "dagViewportReplies",
          Number(Reflect.get(window, "dagViewportReplies")) + 1,
        );
    });
  });
  const add = (title: string, ...args: string[]) =>
    Schema.decodeUnknownSync(Created)(
      cli("add", `Graph fixture ${title}`, ...args),
    ).task;
  const edge = async (dependent: TaskId, blocker: TaskId) => {
    const current = await run(
      client.tasks.show({ params: { profile, task: dependent } }),
    );
    const result = await run(
      client.tasks.depend({
        params: { profile, task: dependent },
        payload: { blocker_id: blocker, from_version: current.row_version },
      }),
    );
    assert.equal(result.outcome, "added");
  };
  const report = (id: TaskId) =>
    run(client.tasks.graph({ params: { profile, task: id } }));
  const layout = async (compact: boolean) => {
    await page.setViewportSize(
      compact ? { width: 393, height: 426 } : { width: 1100, height: 720 },
    );
    await notify({ _tag: "windowMode", compact });
    await settleRenderer(page);
  };
  const open = async (task: Schema.Schema.Type<typeof Created>["task"]) => {
    await page
      .getByRole("textbox", { name: "Search tasks", exact: true })
      .fill(task.title);
    const row = page.locator(`[data-task-id="${task.id}"] .task-content`);
    await expect(row).toBeVisible();
    await row.click();
    await page
      .getByRole("button", { name: "Task actions", exact: true })
      .click();
    await page
      .getByRole("menuitem", { name: "View Dependencies", exact: true })
      .click();
    await expect(page.getByTestId("dependency-graph-details")).toBeVisible();
    await expect(
      page
        .getByTestId("dependency-graph")
        .locator('[data-slot="dialog-description"]'),
    ).toHaveText(task.title);
  };
  const close = async () => {
    await page.getByTestId("dependency-graph-close").click();
    await page
      .getByRole("button", { name: "Back to tasks", exact: true })
      .click();
  };
  const captureLayouts = async (
    state: string,
    description: string,
    target?: Locator,
  ) => {
    await capture(state, description, "compact", target);
    await layout(false);
    await expect(page.getByTestId("dependency-graph-diagram")).toBeVisible();
    await capture(state, description, "full", target);
    await layout(true);
  };
  const diagram = () =>
    page.frameLocator('[data-testid="dependency-graph-diagram"]');
  const shown = () => diagram().locator(".pele-node:not(.graph-hidden)");
  const bounds = () =>
    diagram()
      .locator("#graph")
      .evaluate((frame) => {
        const outer = frame.getBoundingClientRect();
        const boxes = [
          ...frame.querySelectorAll(
            ".pele-node:not(.graph-hidden), .pele-edge:not(.graph-hidden)",
          ),
        ].map((element) => element.getBoundingClientRect());
        const left = Math.min(...boxes.map((box) => box.left));
        const right = Math.max(...boxes.map((box) => box.right));
        const top = Math.min(...boxes.map((box) => box.top));
        const bottom = Math.max(...boxes.map((box) => box.bottom));
        return {
          frame: { width: outer.width, height: outer.height },
          left,
          right,
          top,
          bottom,
          xError: (left + right) / 2 - outer.width / 2,
          yError: (top + bottom) / 2 - outer.height / 2,
          style: frame.querySelector(".graph-content")?.getAttribute("style"),
        };
      });
  const scope = page.locator(".dependency-graph-controls small");
  const sets: unknown[] = [];
  const fixtures = [];
  for (const orientation of ["converging", "diverging", "mixed"] as const) {
    const root = add(`${orientation} tree root`);
    const a = add(`${orientation} tree A`);
    const b = add(`${orientation} tree B`);
    await edge(
      orientation === "diverging" ? a.id : root.id,
      orientation === "diverging" ? root.id : a.id,
    );
    await edge(
      orientation === "diverging" ? b.id : root.id,
      orientation === "diverging" ? root.id : b.id,
    );
    if (orientation === "mixed") {
      const c = add("mixed tree C");
      const d = add("mixed tree D");
      await edge(c.id, root.id);
      await edge(d.id, root.id);
    }
    const data = await report(root.id);
    assert.equal(data.shape, "tree");
    assert.ok(data.shape === "tree");
    assert.equal(data.orientation, orientation);
    fixtures.push({
      root,
      data,
      label: `${orientation} tree`,
      details:
        orientation === "diverging"
          ? ["0", "0", "2"]
          : orientation === "converging"
            ? ["1", "2", "0"]
            : ["1", "2", "2"],
    });
  }
  const diamondA = add("DAG shared prerequisite", "--energy", "2");
  const diamondB = add("DAG branch B", "--depends-on", diamondA.id);
  const diamondC = add("DAG branch C", "--depends-on", diamondA.id);
  const diamondRoot = add(
    "DAG diamond root",
    "--depends-on",
    diamondB.id,
    "--depends-on",
    diamondC.id,
  );
  const diamond = await report(diamondRoot.id);
  assert.equal(diamond.shape, "dag");
  fixtures.push({
    root: diamondRoot,
    data: diamond,
    label: "DAG",
    details: ["2", "2", "0"],
  });
  for (const { root, data, label, details: expectedDetails } of fixtures) {
    await open(root);
    await expect(page.getByTestId("dependency-graph-diagram")).toHaveCount(0);
    await capture(
      `graph-${label.replaceAll(" ", "-")}-list`,
      "Compact opens the accessible list for the server-reported graph shape",
    );
    await page
      .getByRole("button", { name: "Graph details", exact: true })
      .click();
    await expect(
      page.locator(".dependency-graph-section dd").first(),
    ).toHaveText(label);
    await expect(page.locator(".dependency-graph-section dd")).toHaveText([
      label,
      ...expectedDetails,
    ]);
    const details = page.locator(".dependency-graph-section dl");
    await capture(
      `graph-${label.replaceAll(" ", "-")}-details`,
      "Shape and orientation come from the typed server report",
      "compact",
      details,
    );
    await page.getByRole("button", { name: "Diagram", exact: true }).click();
    const expected = label === "DAG" ? 3 : data.nodes.length;
    await expect(shown()).toHaveCount(expected);
    await capture(
      `graph-${label.replaceAll(" ", "-")}-diagram`,
      "Explicit Compact Diagram mode keeps the fixed footer and fitted local Pele output",
    );
    await layout(false);
    await expect(shown()).toHaveCount(expected);
    await expect(page.getByTestId("dependency-graph-details")).toBeVisible();
    await capture(
      `graph-${label.replaceAll(" ", "-")}-full`,
      "Full window shows diagram and accessible details side by side",
      "full",
    );
    const centring = await bounds();
    assert.ok(
      Math.abs(centring.xError) < 2 && Math.abs(centring.yError) < 2,
      `Graph must fit and centre after a layout change: ${JSON.stringify(centring)}`,
    );
    if (label === "converging tree") {
      await page.getByRole("button", { name: "Zoom in", exact: true }).click();
      await expect
        .poll(async () => (await bounds()).style)
        .not.toBe(centring.style);
      const toolbarZoom = (await bounds()).style;
      await diagram()
        .locator("#graph")
        .dispatchEvent("wheel", { deltaY: -100 });
      await expect
        .poll(async () => (await bounds()).style)
        .not.toBe(toolbarZoom);
      const manual = (await bounds()).style;
      await layout(true);
      await page.getByRole("button", { name: "Diagram", exact: true }).click();
      await expect(shown()).toHaveCount(expected);
      assert.equal((await bounds()).style, manual);
      await capture(
        "graph-manual-camera-compact",
        "A person's zoom survives a full-to-Compact layout change",
      );
      await layout(false);
      assert.equal((await bounds()).style, manual);
      await page.setViewportSize({ width: 1000, height: 650 });
      await settleRenderer(page);
      assert.equal((await bounds()).style, manual);
      await capture(
        "graph-manual-camera-full",
        "A person's camera survives Compact-to-full and a window resize",
        "full",
      );
      await page.getByTestId("dependency-graph-reset").click();
      await expect
        .poll(async () => {
          const value = await bounds();
          return Math.max(Math.abs(value.xError), Math.abs(value.yError));
        })
        .toBeLessThan(2);
      await capture(
        "graph-reset-centred-full",
        "Reset fits and centres the current frame after a preserved manual camera",
        "full",
      );
      const repliesBeforeResize = await page.evaluate(() =>
        Number(Reflect.get(window, "dagViewportReplies")),
      );
      await page.setViewportSize({ width: 1100, height: 720 });
      await expect
        .poll(async () => {
          const value = await bounds();
          return Math.max(Math.abs(value.xError), Math.abs(value.yError));
        })
        .toBeLessThan(2);
      await settleRenderer(page);
      assert.equal(
        (await page.evaluate(() =>
          Number(Reflect.get(window, "dagViewportReplies")),
        )) - repliesBeforeResize,
        1,
        `A settled frame resize sends one refit and stores one resolved viewport reply: ${JSON.stringify(
          await diagram()
            .locator("#graph")
            .evaluate(() => Reflect.get(window, "dagRenderObservations")),
        )}`,
      );
      sets.push({
        automaticFit: centring,
        manualViewport: manual,
        resetFit: await bounds(),
      });
    }
    await layout(true);
    await close();
    sets.push(data);
  }
  const chainA = add("chain start");
  const chainB = add("chain middle", "--depends-on", chainA.id);
  const chainRoot = add("chain root", "--depends-on", chainB.id);
  const chain = await report(chainRoot.id);
  assert.equal(chain.shape, "chain");
  assert.deepEqual(chain.ancestors, [chainA.id, chainB.id]);
  assert.deepEqual(chain.descendants, []);
  await open(chainRoot);
  await expect(scope).toHaveText("2 of 3 Tasks shown");
  await page.getByRole("button", { name: "Diagram", exact: true }).click();
  await expect(shown()).toHaveCount(2);
  await diagram().locator(`[data-task-id="${chainB.id}"]`).focus();
  await diagram().locator(`[data-task-id="${chainB.id}"]`).press("ArrowRight");
  await expect(shown()).toHaveCount(3);
  await expect(scope).toHaveText("3 of 3 Tasks shown");
  await expect(page.getByTestId("dependency-graph-overview")).toHaveCount(0);
  await capture(
    "graph-one-level-expanded",
    "ArrowRight expands one level, retaining the root and complete direct neighbours",
  );
  const beforeZoom = await diagram()
    .locator(".graph-content")
    .evaluate((element) => element.getAttribute("style"));
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect
    .poll(() =>
      diagram()
        .locator(".graph-content")
        .evaluate((element) => element.getAttribute("style")),
    )
    .not.toBe(beforeZoom);
  const camera = await diagram()
    .locator(".graph-content")
    .evaluate((element) => element.getAttribute("style"));
  await diagram().locator(`[data-task-id="${chainB.id}"]`).focus();
  const renamed = "Graph fixture chain middle updated by SSE";
  const middle = await run(
    client.tasks.show({ params: { profile, task: chainB.id } }),
  );
  cli(
    "edit",
    chainB.id,
    "--title",
    renamed,
    "--expected-version",
    String(middle.row_version),
  );
  await expect(
    diagram().locator(`[data-task-id="${chainB.id}"]`),
  ).toHaveAttribute("aria-label", `${renamed}, blocked`);
  await expect(shown()).toHaveCount(3);
  assert.equal(
    await diagram()
      .locator(".graph-content")
      .evaluate((element) => element.getAttribute("style")),
    camera,
  );
  await expect(
    diagram().locator(`[data-task-id="${chainB.id}"]`),
  ).toBeFocused();
  await capture(
    "graph-sse-preserved",
    "A public CLI edit and real SSE replace graph data while preserving expansion, camera and surviving keyboard focus",
  );
  await page.getByTestId("dependency-graph-reset").click();
  await expect(
    diagram().locator(`[data-task-id="${chainRoot.id}"]`),
  ).toBeFocused();
  await capture(
    "graph-keyboard-reset",
    "Reset returns focus to the selected root through the canonical host",
  );
  await close();
  sets.push(chain);
  const weighted = add("weighted Ready heavy", "--energy", "5");
  const light = add("weighted Ready light", "--energy", "1");
  const unknown = add("weighted Ready unknown");
  const weightedRoot = add(
    "weighted root",
    "--energy",
    "4",
    "--depends-on",
    weighted.id,
    "--depends-on",
    light.id,
    "--depends-on",
    unknown.id,
  );
  const energy = await report(weightedRoot.id);
  const energyRoot = energy.nodes.find(
    (node) => node.task.id === weightedRoot.id,
  );
  assert.ok(energyRoot);
  assert.deepEqual(energyRoot.remaining_energy, { energy: 10, unweighted: 1 });
  assert.deepEqual(energy.lightest_next, [light.id, weighted.id, unknown.id]);
  await open(weightedRoot);
  await expect(
    page.getByText("Energy left: 10 · 1 Task without Energy", { exact: true }),
  ).toBeVisible();
  assert.deepEqual(
    await page
      .locator(
        '[data-section="lightest-next"] > ul > li > button[data-testid^="dependency-graph-related-"]',
      )
      .evaluateAll((elements) =>
        elements.map((element) => element.getAttribute("data-testid")),
      ),
    [light.id, weighted.id, unknown.id].map(
      (id) => `dependency-graph-related-lightest-next-${id}`,
    ),
  );
  await captureLayouts(
    "graph-energy-unknown-last",
    "Lightest next follows the server's own-Energy order with unknown Energy last; remaining Energy includes the root",
    page.locator('[data-section="lightest-next"]'),
  );
  await close();
  sets.push(energy);
  const shared = add("shared unresolved ancestor", "--energy", "2");
  const branch = add("unweighted branch", "--depends-on", shared.id);
  const behind = add("ancestor behind cancelled Task", "--energy", "5");
  const cancelled = add(
    "cancelled pruning boundary",
    "--depends-on",
    behind.id,
  );
  cli("cancel", cancelled.id, "--expected-version", "1");
  const prunedRoot = add(
    "pruned remaining root",
    "--energy",
    "4",
    "--depends-on",
    shared.id,
    "--depends-on",
    branch.id,
    "--depends-on",
    cancelled.id,
  );
  const pruned = await report(prunedRoot.id);
  assert.deepEqual(
    pruned.nodes.find((node) => node.task.id === prunedRoot.id)
      ?.remaining_energy,
    { energy: 6, unweighted: 1 },
  );
  assert.deepEqual(pruned.lightest_next, [shared.id]);
  await open(prunedRoot);
  await expect(
    page.getByText("Energy left: 6 · 1 Task without Energy", { exact: true }),
  ).toBeVisible();
  await captureLayouts(
    "graph-energy-pruned-shared",
    "The server counts a shared ancestor once and stops through a cancelled Task; the cancelled endpoint is labelled once",
  );
  await close();
  cli("cancel", prunedRoot.id, "--expected-version", "1");
  const terminal = await report(prunedRoot.id);
  assert.deepEqual(terminal.lightest_next, []);
  await open(prunedRoot);
  await expect(page.locator('[data-section="lightest-next"]')).toHaveText(
    "Lightest next · 0None",
  );
  await captureLayouts(
    "graph-terminal-no-next",
    "A terminal root has no Lightest next Tasks even while its blockers remain unresolved",
  );
  await close();
  sets.push(pruned, terminal);
  const large: ReturnType<typeof add>[] = [];
  for (let index = 0; index < 52; index++) {
    const previous = large.at(-1);
    large.push(
      add(
        `large chain ${String(index + 1).padStart(2, "0")}`,
        ...(previous ? ["--depends-on", previous.id] : []),
      ),
    );
  }
  const largeRoot = large[25];
  assert.ok(largeRoot);
  const largeData = await report(largeRoot.id);
  assert.equal(largeData.nodes.length, 52);
  await open(largeRoot);
  await expect(scope).toHaveText("3 of 52 Tasks shown");
  await expect(
    page.getByText("Use the list and search to choose a Task.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Tasks in diagram · 3", exact: true }),
  ).toHaveAttribute("aria-expanded", "true");
  await captureLayouts(
    "graph-large-nearby",
    "A group above 50 Tasks opens list-first with only the root and its direct neighbours",
  );
  await page.getByTestId("dependency-graph-overview").click();
  await expect(scope).toHaveText("52 of 52 Tasks shown");
  await expect(page.getByTestId("dependency-graph-overview")).toHaveText(
    "Show nearby Tasks",
  );
  const search = page.getByRole("textbox", {
    name: "Search these Tasks",
    exact: true,
  });
  await search.fill("Graph fixture large chain 52");
  const last = large.at(-1);
  assert.ok(last);
  await expect(
    page.getByTestId(`dependency-graph-task-${last.id}`),
  ).toBeVisible();
  await expect(page.locator('[data-section="shown"] > ul > li')).toHaveCount(1);
  await page.locator(".dependency-graph-body").evaluate((element) => {
    element.scrollTop = 0;
  });
  await expect(search).toBeInViewport({ ratio: 1 });
  await captureLayouts(
    "graph-large-query",
    "The explicit whole-group search shows the current query and the list emphasis for 52 Tasks",
  );
  await captureLayouts(
    "graph-large-overview-search",
    "Explicit whole-group scope is reversible and current-Profile server Task search narrows the accessible list",
    page.getByTestId(`dependency-graph-task-${last.id}`),
  );
  await search.fill("");
  await expect(page.locator('[data-section="shown"] > ul > li')).toHaveCount(
    52,
  );
  await page.getByTestId("dependency-graph-overview").click();
  await expect(scope).toHaveText("3 of 52 Tasks shown");
  await expect(search).toHaveCount(0);
  await close();
  sets.push(largeData);
  await page
    .getByRole("textbox", { name: "Search tasks", exact: true })
    .fill("");
  return { reports: sets, largeCount: 52 };
}
