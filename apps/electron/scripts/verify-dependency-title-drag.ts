import assert from "node:assert/strict";
import { expect, type Page } from "@playwright/test";
import { TaskId } from "@todo/domain";
import { Schema } from "effect";
import { settleRenderer } from "./settle-renderer.ts";

const Created = Schema.Struct({
  task: Schema.Struct({ id: TaskId, title: Schema.String }),
});
export async function verifyDependencyTitleDrag({
  page,
  cli,
  capture,
  notify,
  record,
}: {
  page: Page;
  cli: (...args: string[]) => unknown;
  capture: (
    state: string,
    description: string,
    layout?: string,
  ) => Promise<void>;
  notify: (notice: unknown) => Promise<unknown>;
  record: (receipt: unknown) => void;
}) {
  const groups = [];
  for (const linked of [false, true]) {
    for (const long of [false, true]) {
      const prefix = `Title-only ${linked ? "linked" : "allowed"} ${long ? "long" : "short"}`;
      const add = (title: string, ...args: string[]) =>
        Schema.decodeUnknownSync(Created)(cli("add", title, ...args)).task;
      const source = add(`${prefix} source`);
      if (linked) cli("done", source.id, "--expected-version", "1");
      const tasks = [source];
      for (let index = 1; index <= 3; index++) {
        const title = `${prefix} target ${index}${long ? " with a deliberately long title that uses the available title line and keeps every word in the accessible name while the visible title is truncated near the trailing controls" : ""}`;
        const task = add(title, ...(linked ? ["--depends-on", source.id] : []));
        if (linked) cli("done", task.id, "--expected-version", "1");
        tasks.push(task);
      }
      groups.push({ linked, long, prefix, source, tasks });
    }
  }
  await page.getByRole("button", { name: "More filters", exact: true }).click();
  await page.locator("#filter-status").selectOption("");
  await page
    .getByRole("button", { name: "Apply filters", exact: true })
    .click();
  await page.locator("#task-order").selectOption("topo");
  for (const compact of [true, false]) {
    await page.setViewportSize(
      compact ? { width: 393, height: 426 } : { width: 1100, height: 720 },
    );
    await notify({ _tag: "windowMode", compact });
    for (const group of groups) {
      await page
        .getByRole("textbox", { name: "Search tasks", exact: true })
        .fill(group.prefix);
      const rows = page.locator(".task-row[data-task-id]");
      await expect
        .poll(async () =>
          (
            await rows.evaluateAll((elements) =>
              elements.map((element) => element.getAttribute("data-task-id")),
            )
          ).sort(),
        )
        .toEqual(group.tasks.map((task) => task.id).sort());
      await settleRenderer(page);
      const ordered = await rows.evaluateAll((elements) =>
        elements.map((element) => element.getAttribute("data-task-id")),
      );
      assert.equal(ordered[0], group.source.id);
      for (const [position, index] of [
        ["adjacent", 1],
        ["last", 3],
      ] as const) {
        const target = group.tasks.find((task) => task.id === ordered[index]);
        assert.ok(target);
        const targetRow = page.getByTestId(
          `dependency-drop-target-${target.id}`,
        );
        await targetRow.scrollIntoViewIfNeeded();
        await expect(targetRow.locator(".compact-row-metadata")).toHaveCount(0);
        assert.equal(
          (await targetRow.locator(".task-meta").count())
            ? await targetRow.locator(".task-meta").innerText()
            : "",
          "",
        );
        const before = await rows.evaluateAll((elements) =>
          elements.map((element) => ({
            id: element.getAttribute("data-task-id"),
            box: element.getBoundingClientRect().toJSON(),
          })),
        );
        const transfer = await page.evaluateHandle(() => new DataTransfer());
        const source = page.getByTestId(
          `dependency-drag-source-${group.source.id}`,
        );
        await source.dispatchEvent("dragstart", { dataTransfer: transfer });
        await targetRow.dispatchEvent("dragover", { dataTransfer: transfer });
        const status = page.getByTestId("dependency-drop-status");
        const visible = `${group.linked ? "Already depends on" : "Will depend on"} ${group.source.title}`;
        await expect(status).toHaveText(visible);
        await expect(status).toHaveAttribute(
          "aria-label",
          `${target.title} ${group.linked ? "already depends on" : "will depend on"} ${group.source.title}`,
        );
        await expect(status).toHaveAttribute("data-ready", "true");
        for (const dark of [false, true]) {
          await page.evaluate((dark) => {
            if (document.documentElement.classList.contains("dark") !== dark)
              window.dispatchEvent(
                new CustomEvent("dag-notice", {
                  detail: { _tag: "toggleTheme" },
                }),
              );
          }, dark);
          await expect
            .poll(() =>
              page
                .locator("html")
                .evaluate((element) => element.classList.contains("dark")),
            )
            .toBe(dark);
          await settleRenderer(page);
          const geometry = await page.evaluate(() => {
            const status = document.querySelector(
              '[data-testid="dependency-drop-status"]',
            );
            const target = status?.closest(".task-row");
            const heading = target?.querySelector(".task-title");
            if (
              !(status instanceof HTMLElement) ||
              !(target instanceof HTMLElement) ||
              !(heading instanceof HTMLElement)
            )
              throw new Error("Missing title-only drag target");
            const box = status.getBoundingClientRect(),
              row = target.getBoundingClientRect(),
              titleBox = heading.getBoundingClientRect();
            const intersects = (other: DOMRect) =>
              box.left < other.right &&
              box.right > other.left &&
              box.top < other.bottom &&
              box.bottom > other.top;
            const textFrames = [];
            for (const element of document.querySelectorAll(
              ".task-row .task-title, .task-row .task-meta, .task-row .task-dates, .task-row .task-status, .task-row .compact-row-metadata",
            )) {
              const walker = document.createTreeWalker(
                element,
                NodeFilter.SHOW_TEXT,
              );
              while (walker.nextNode()) {
                const node = walker.currentNode,
                  parent = node.parentElement;
                if (
                  !parent ||
                  !node.textContent?.trim() ||
                  parent.closest(
                    '[data-testid="dependency-drop-status"], .sr-only, .tag-measure',
                  )
                )
                  continue;
                const style = getComputedStyle(parent);
                if (style.visibility !== "visible" || style.display === "none")
                  continue;
                const range = document.createRange();
                range.selectNodeContents(node);
                for (const frame of range.getClientRects())
                  if (frame.width > 0 && frame.height > 0)
                    textFrames.push({
                      task: element
                        .closest(".task-row")
                        ?.getAttribute("data-task-id"),
                      text: node.textContent,
                      box: frame.toJSON(),
                      intersects: intersects(frame),
                    });
              }
            }
            const controls = [
              ...target.querySelectorAll(
                "button:not(.task-content), .priority, .task-dates, .task-jira-marker, .task-external-id",
              ),
            ].map((element) => ({
              name: element.getAttribute("aria-label") ?? element.className,
              box: element.getBoundingClientRect().toJSON(),
              intersects: intersects(element.getBoundingClientRect()),
            }));
            const titleRange = document.createRange();
            titleRange.selectNodeContents(heading);
            const titleText = titleRange.getBoundingClientRect();
            const style = getComputedStyle(status);
            return {
              viewport: { width: innerWidth, height: innerHeight },
              status: box.toJSON(),
              row: row.toJSON(),
              title: titleText.toJSON(),
              titleBox: titleBox.toJSON(),
              placement: status.dataset.placement,
              availableHeight: Number(status.dataset.availableHeight),
              font: style.fontSize,
              lineHeight: style.lineHeight,
              visiblyRendered:
                status.checkVisibility({
                  checkOpacity: true,
                  checkVisibilityCSS: true,
                }) &&
                box.width > 0 &&
                box.height > 0 &&
                document.elementFromPoint(
                  box.left + 2,
                  box.top + box.height / 2,
                ) !== null,
              insideWindow:
                box.left >= 0 &&
                box.top >= 0 &&
                box.right <= innerWidth &&
                box.bottom <= innerHeight,
              insideOwnRow:
                box.left >= row.left &&
                box.right <= row.right &&
                box.top >= row.top &&
                box.bottom <= row.bottom,
              textFrames,
              controls,
            };
          });
          const after = await rows.evaluateAll((elements) =>
            elements.map((element) => ({
              id: element.getAttribute("data-task-id"),
              box: element.getBoundingClientRect().toJSON(),
            })),
          );
          record({
            compact,
            dark,
            linked: group.linked,
            long: group.long,
            position,
            source: group.source,
            target,
            before,
            after,
            geometry,
          });
          assert.deepEqual(
            after,
            before,
            "Every row frame must remain identical before and during hover",
          );
          assert.equal(geometry.font, "12px", "Use the existing caption font");
          assert.equal(
            geometry.visiblyRendered,
            true,
            "Status must visibly render",
          );
          assert.equal(
            geometry.insideWindow,
            true,
            "Status must stay inside the window",
          );
          assert.equal(
            geometry.insideOwnRow,
            true,
            "Status must stay inside its own row",
          );
          assert.deepEqual(
            geometry.textFrames.filter((frame) => frame.intersects),
            [],
            "Status must intersect no row's title or metadata text",
          );
          assert.deepEqual(
            geometry.controls.filter((control) => control.intersects),
            [],
            "Status must not overlap trailing controls",
          );
          assert.equal(
            geometry.placement,
            compact || group.long ? "under-title" : "inline-title",
          );
          if (!compact && !group.long)
            assert.ok(
              Math.abs(geometry.status.left - geometry.title.right - 12) < 0.5,
              "Inline status starts 12 px after title text",
            );
          if (!compact && group.long)
            assert.ok(
              Number.parseFloat(geometry.lineHeight) >= 12 &&
                Number.parseFloat(geometry.lineHeight) <=
                  geometry.availableHeight + 0.1,
              "Fallback line box uses the available padding without shrinking its font",
            );
        }
        await capture(
          `drag-title-only-${group.linked ? "linked" : "allowed"}-${group.long ? "long" : "short"}-${position}`,
          "Production title-only rows keep every frame unchanged; caption stays visible in its own row without intersecting any title, metadata or trailing control",
          compact ? "compact" : "full",
        );
        await source.dispatchEvent("dragend", { dataTransfer: transfer });
        await expect(status).toHaveCount(0);
        await transfer.dispose();
      }
    }
  }
  const short = groups.find((group) => !group.long && !group.linked);
  assert.ok(short);
  const target = short.tasks[1];
  assert.ok(target);
  await page
    .getByRole("textbox", { name: "Search tasks", exact: true })
    .fill(short.prefix);
  const targetRow = page.getByTestId(`dependency-drop-target-${target.id}`);
  await expect(targetRow).toBeVisible();
  const transfer = await page.evaluateHandle(() => new DataTransfer());
  const source = page.getByTestId(`dependency-drag-source-${short.source.id}`);
  await source.dispatchEvent("dragstart", { dataTransfer: transfer });
  await targetRow.dispatchEvent("dragover", { dataTransfer: transfer });
  for (const [free, expected] of [
    [159.75, "under-title"],
    [160.75, "inline-title"],
  ] as const) {
    const current = await targetRow.evaluate((row) => {
      const title = row.querySelector(".task-title"),
        controls = row.querySelector("button[aria-haspopup]");
      if (!title || !controls)
        throw new Error("Missing title or trailing control");
      const range = document.createRange();
      range.selectNodeContents(title);
      return {
        width: innerWidth,
        free:
          controls.getBoundingClientRect().left -
          range.getBoundingClientRect().right,
      };
    });
    await page.setViewportSize({
      width: Math.floor(current.width - current.free + free),
      height: 720,
    });
    await settleRenderer(page);
    await expect(page.getByTestId("dependency-drop-status")).toHaveAttribute(
      "data-placement",
      expected,
    );
    const observed = await targetRow.evaluate((row) => {
      const title = row.querySelector(".task-title"),
        controls = row.querySelector("button[aria-haspopup]");
      if (!title || !controls)
        throw new Error("Missing title or trailing control");
      const range = document.createRange();
      range.selectNodeContents(title);
      return (
        controls.getBoundingClientRect().left -
        range.getBoundingClientRect().right
      );
    });
    assert.ok(observed >= Math.floor(free) && observed < Math.floor(free) + 1);
    record({ kind: "placement-threshold", free: observed, expected });
  }
  await page.setViewportSize({ width: 1100, height: 720 });
  await targetRow.dispatchEvent("drop", { dataTransfer: transfer });
  await source.dispatchEvent("dragend", { dataTransfer: transfer });
  await expect(page.getByTestId(`dependency-state-${target.id}`)).toHaveText(
    "Blocked · 1",
  );
  const saved = Schema.decodeUnknownSync(
    Schema.Struct({
      task: Schema.Struct({
        row_version: Schema.Number,
        depends_on: Schema.Array(TaskId),
      }),
    }),
  )(cli("show", target.id)).task;
  assert.equal(saved.row_version, 2);
  assert.deepEqual(saved.depends_on, [short.source.id]);
  record({ kind: "row-padding-drop", source: short.source, target, saved });
  await transfer.dispose();
}
