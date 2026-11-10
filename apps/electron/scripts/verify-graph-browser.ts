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
const messages: unknown[] = [];
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
    viewport: { x: 30, y: 30, scale: 1 },
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
