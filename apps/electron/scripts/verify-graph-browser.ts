import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium, expect } from "@playwright/test";
import { Schema } from "effect";
import {
  type GraphHostRender,
  GraphHostReply,
} from "../graph-browser/protocol.ts";
import {
  buildGraphBrowser,
  checkGraphBrowserOutput,
} from "./build-graph-browser.ts";

const evidence = resolve(process.argv[2] ?? "");
assert.ok(process.argv[2] && !existsSync(evidence));
mkdirSync(evidence, { recursive: true });
const output = await buildGraphBrowser();
const changed = join(output, "graph.js");
const original = readFileSync(changed);
let rejected = false;
try {
  writeFileSync(changed, Buffer.concat([original, Buffer.from("\n")]));
  try {
    checkGraphBrowserOutput();
  } catch {
    rejected = true;
  }
  assert.equal(rejected, true, "A changed output byte must fail the lock");
} finally {
  writeFileSync(changed, original);
}
checkGraphBrowserOutput();
const browser = await chromium.launch({
  headless: true,
  ...(process.env.TODO_HEADLESS_CHROMIUM
    ? { executablePath: process.env.TODO_HEADLESS_CHROMIUM }
    : {}),
  args: ["--password-store=basic"],
});
const messages: (typeof GraphHostReply.Type)[] = [];
const remote: string[] = [];
try {
  const page = await browser.newPage({
    viewport: { width: 393, height: 426 },
    offline: true,
  });
  page.on("request", (request) => {
    if (/^https?:/u.test(request.url())) remote.push(request.url());
  });
  await page.exposeFunction("graphProofReply", (reply: unknown) => {
    messages.push(Schema.decodeUnknownSync(GraphHostReply)(reply));
  });
  await page.addInitScript(() => {
    Object.defineProperty(window, "webkit", {
      value: {
        messageHandlers: {
          todoGraph: {
            postMessage: (reply: unknown) =>
              Reflect.get(window, "graphProofReply")(reply),
          },
        },
      },
    });
  });
  await page.goto(pathToFileURL(join(output, "index.html")).href);
  const command: GraphHostRender = {
    v: 1,
    type: "render",
    root_id: "task-a",
    identity: {
      root: "task-a",
      credentialEpoch: 21,
      request: "opaque",
      extra: { retained: [1, true, null] },
    },
    nodes: [
      { mermaid_id: "n0", task_id: "task-a" },
      { mermaid_id: "n1", task_id: "task-b" },
    ],
    mermaid: 'flowchart TD\nn0["A"]-->n1["B"]',
    visible_ids: ["task-a", "task-b"],
    selected_id: "task-a",
    focused_id: "task-a",
    theme: { mode: "light", tokens: {} },
    reduced_motion: true,
  };
  await page.evaluate((command) => window.todoGraph.receive(command), command);
  await expect
    .poll(
      () =>
        messages.filter(
          (reply) =>
            Schema.is(GraphHostReply)(reply) && reply.type === "rendered",
        ).length,
    )
    .toBe(1);
  const fitted = await page.evaluate(() => {
    const boxes = [...document.querySelectorAll(".pele-node, .pele-edge")].map(
      (node) => node.getBoundingClientRect(),
    );
    const left = Math.min(...boxes.map((box) => box.left));
    const top = Math.min(...boxes.map((box) => box.top));
    const right = Math.max(...boxes.map((box) => box.right));
    const bottom = Math.max(...boxes.map((box) => box.bottom));
    return {
      left,
      top,
      right,
      bottom,
      centerX: (left + right) / 2,
      centerY: (top + bottom) / 2,
    };
  });
  assert.ok(Math.abs(fitted.centerX - 393 / 2) < 1);
  assert.ok(Math.abs(fitted.centerY - 426 / 2) < 1);
  assert.ok(
    fitted.left >= 15 &&
      fitted.top >= 15 &&
      fitted.right <= 378 &&
      fitted.bottom <= 411,
  );
  const initialViewports = messages.filter(
    (reply) => reply.type === "viewport",
  );
  assert.equal(initialViewports.length, 1);
  assert.ok(
    initialViewports[0]?.type === "viewport" && initialViewports[0].scale <= 1,
  );
  await page.evaluate(
    (command) =>
      window.todoGraph.receive({
        ...command,
        viewport: { x: 30, y: 31, scale: 0.75 },
      }),
    command,
  );
  await expect
    .poll(() => messages.filter((reply) => reply.type === "rendered").length)
    .toBe(2);
  assert.equal(messages.filter((reply) => reply.type === "viewport").length, 1);
  await expect(page.locator(".graph-content")).toHaveCSS(
    "transform",
    "matrix(0.75, 0, 0, 0.75, 30, 31)",
  );
  await page.locator('[data-task-id="task-a"]').click();
  await page.mouse.move(300, 300);
  await page.mouse.wheel(0, -100);
  await page.locator('[data-task-id="task-a"]').click();
  await expect
    .poll(
      () =>
        messages.filter(
          (reply) =>
            Schema.is(GraphHostReply)(reply) && reply.type === "activate",
        ).length,
    )
    .toBe(2);
  await page.evaluate(() => {
    const button = document.createElement("button");
    button.textContent = "Reset";
    button.id = "proof-reset";
    button.onclick = () => {
      button.hidden = true;
    };
    document.querySelector("#graph")?.append(button);
    button.focus();
  });
  await page.locator("#proof-reset").press("Enter");
  await expect(page.locator('[data-task-id="task-a"]')).toBeFocused();
  await page.locator('[data-task-id="task-a"]').press("ArrowRight");
  await expect
    .poll(
      () =>
        messages.filter(
          (reply) =>
            Schema.is(GraphHostReply)(reply) && reply.type === "expand",
        ).length,
    )
    .toBe(1);
  await page.evaluate(
    (command) =>
      window.todoGraph.receive({
        ...command,
        theme: {
          mode: "dark",
          tokens: {
            "muted-text": "#AFBDB1",
            paper: "#171D19",
            ink: "#F0F3EF",
            card: "#1D2620",
            border: "#82978A",
            primary: "#A6D7B8",
          },
        },
      }),
    command,
  );
  await expect(page.locator(".pele-edge path").first()).toHaveCSS(
    "stroke",
    "rgb(175, 189, 177)",
  );
  const stateCommand = {
    ...command,
    root_id: "task-root",
    nodes: [
      {
        mermaid_id: "n0",
        task_id: "task-root",
        title: "Root",
        state: "blocked",
      },
      {
        mermaid_id: "n1",
        task_id: "task-ready",
        title: "Ready Task",
        state: "ready",
      },
      {
        mermaid_id: "n2",
        task_id: "task-blocked",
        title: "Blocked Task",
        state: "blocked",
      },
      {
        mermaid_id: "n3",
        task_id: "task-done",
        title: "Done Task",
        state: "done",
      },
      { mermaid_id: "n4", task_id: "task-cancelled", state: "cancelled" },
      { mermaid_id: "n5", task_id: "task-unknown", state: "unknown-state" },
    ],
    mermaid:
      'flowchart TD\nn0["Label intentionally different"]-->n1["One"]-->n2["Two"]-->n3["Three"]-->n4["Four"]-->n5["Five"]',
    visible_ids: [
      "task-root",
      "task-ready",
      "task-blocked",
      "task-done",
      "task-cancelled",
      "task-unknown",
    ],
    selected_id: "task-ready",
    focused_id: "task-root",
    theme: {
      mode: "light",
      tokens: {
        primary: "#285D46",
        border: "#7B897E",
        warning: "#76550B",
        "muted-text": "#546359",
      },
    },
  };
  await page.evaluate(
    (command) => window.todoGraph.receive(command),
    stateCommand,
  );
  for (const [id, color, name] of [
    ["task-root", "rgb(40, 93, 70)", "Root, blocked"],
    ["task-ready", "rgb(123, 137, 126)", "Ready Task, ready"],
    ["task-blocked", "rgb(118, 85, 11)", "Blocked Task, blocked"],
    ["task-done", "rgb(84, 99, 89)", "Done Task, done"],
    ["task-cancelled", "rgb(84, 99, 89)", "task-cancelled, cancelled"],
    ["task-unknown", "rgb(123, 137, 126)", "task-unknown"],
  ]) {
    const node = page.locator(`[data-task-id="${id}"]`);
    await expect(node).toHaveAccessibleName(name ?? "");
    await expect(node.locator(":scope > :first-child")).toHaveCSS(
      "stroke",
      color ?? "",
    );
  }
  await expect(page.locator('[data-task-id="task-done"] text')).toHaveCSS(
    "fill",
    "rgb(84, 99, 89)",
  );
  const stateBorders = await page.locator(".pele-node").evaluateAll((nodes) =>
    nodes.map((node) => ({
      id: node.getAttribute("data-task-id"),
      name: node.getAttribute("aria-label"),
      border: getComputedStyle(node.firstElementChild ?? node).stroke,
    })),
  );
  const errors = messages.filter(
    (reply) => reply.type === "renderError",
  ).length;
  const { root_id: _root, ...missingRoot } = command;
  await page.evaluate(
    (command) => window.todoGraph.receive(command),
    missingRoot,
  );
  await page.evaluate(
    (command) => window.todoGraph.receive({ ...command, root_id: "foreign" }),
    command,
  );
  await expect
    .poll(() => messages.filter((reply) => reply.type === "renderError").length)
    .toBe(errors + 2);
  assert.ok(
    messages.every(
      (reply) =>
        Schema.is(GraphHostReply)(reply) &&
        JSON.stringify(reply.identity) === JSON.stringify(command.identity),
    ),
  );
  assert.deepEqual(remote, []);
  writeFileSync(
    join(evidence, "result.json"),
    JSON.stringify(
      {
        exit: 0,
        lockChangedByteRejected: rejected,
        issue130: "Real pointer activation before and after app-owned zoom",
        issue131:
          "Injected Reset control hiding returns focus through production adapter observer",
        identityEcho:
          "Every actual reply byte-equivalent to submitted identity JSON",
        remoteRequests: remote,
        initialViewportReplies: initialViewports,
        suppliedViewport: { x: 30, y: 31, scale: 0.75 },
        suppliedViewportExtraReplies: 0,
        fittedBounds: fitted,
        stateBorders,
        invalidRootRenderErrors: 2,
        nativeAccessibility: "unproven",
        replies: messages,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
