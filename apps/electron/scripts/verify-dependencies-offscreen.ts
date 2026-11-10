import assert from "node:assert/strict";
import {
  type ChildProcess,
  execFileSync,
  spawn,
  spawnSync,
} from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { chromium, expect, type Locator } from "@playwright/test";
import { CONTRACT_ID } from "@todo/api";
import { DependencyError, ProfileId } from "@todo/domain";
import { Effect, Fiber, Schema, Stream } from "effect";
import { FetchHttpClient, type HttpClient } from "effect/http";
import { build } from "vite";
import {
  repositoryInput,
  repositoryPath,
  verificationRoot,
} from "../../../scripts/verification-inputs.ts";
import { errorReply, exitDetail } from "../src/error-reply.ts";
import { taskHttpClient } from "../src/http-client.ts";
import { Reply, Request } from "../src/protocol.ts";
import {
  restoreStreamState,
  type StreamState,
  streamHeaders,
} from "../src/stream-cursor.ts";
import { taskRequest } from "../src/task-client.ts";
import {
  dependencyAgentMessage,
  dependencyRefusals,
} from "../test/fixtures/dependency-errors.ts";
import { openImport } from "./appearance.ts";
import { buildGraphBrowser } from "./build-graph-browser.ts";
import { assertDagCaptureInventory } from "./dag-capture-inventory.ts";
import { writeDagCaptureManifest } from "./dag-capture-manifest.ts";
import { settleRenderer } from "./settle-renderer.ts";
import { verifyDependencyEdgeCases } from "./verify-dependency-edge-cases.ts";
import { verifyDependencyGraphs } from "./verify-dependency-graphs.ts";
import { verifyDependencyLifecycle } from "./verify-dependency-lifecycle.ts";
import { verifyDependencyPickerRecovery } from "./verify-dependency-picker-recovery.ts";
import { verifyDependencyReadiness } from "./verify-dependency-readiness.ts";
import {
  createDependencyReadProbe,
  verifyDependencyRecovery,
} from "./verify-dependency-recovery.ts";
import { verifyDependencyReviewRecovery } from "./verify-dependency-review-recovery.ts";
import {
  createDependencySearchProbe,
  verifyDependencySearchRecovery,
} from "./verify-dependency-search-recovery.ts";
import { verifyDependencyTitleDrag } from "./verify-dependency-title-drag.ts";

const root = verificationRoot(import.meta.dirname);
const evidence = repositoryPath(
  root,
  process.argv[2] ?? "",
  "Dependency evidence",
);
assert.ok(
  process.argv[2] && !existsSync(evidence),
  "Choose a fresh evidence directory",
);
mkdirSync(evidence, { recursive: true });
const scratch = mkdtempSync(join(tmpdir(), "todo-dag-e-"));
const home = join(scratch, "home");
mkdirSync(home);
const binaries = Schema.decodeUnknownSync(
  Schema.Struct({
    source_hash: Schema.String,
    head: Schema.String,
    cli: Schema.String,
    server: Schema.String,
    seed: Schema.String,
    cli_sha256: Schema.String,
    server_sha256: Schema.String,
    seed_sha256: Schema.String,
    version: Schema.String,
  }),
)(
  JSON.parse(
    readFileSync(
      repositoryInput(root, ".scratch/bin/build.json", "compiled DAG cache"),
      "utf8",
    ),
  ),
);
for (const key of ["cli", "server", "seed"] as const) {
  const input = repositoryInput(
    root,
    relative(root, binaries[key]),
    `compiled ${key}`,
  );
  assert.equal(
    createHash("sha256").update(readFileSync(input)).digest("hex"),
    binaries[`${key}_sha256`],
    `Compiled ${key} hash changed`,
  );
}
const env = {
  ...process.env,
  HOME: home,
  TODO_DB: join(scratch, "todo.db"),
  TODO_PORT: "0",
};
const actualVersion = spawnSync(binaries.cli, ["--version"], {
  env,
  encoding: "utf8",
});
assert.equal(actualVersion.status, 0, actualVersion.stderr);
assert.equal(actualVersion.stdout.trim(), binaries.version);
let server: ChildProcess | undefined;
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
let stream: Fiber.Fiber<void, unknown> | undefined;
let streamState: typeof StreamState.Type = { cursors: {} };
const streamReads: {
  profile: typeof ProfileId.Type;
  headers: ReturnType<typeof streamHeaders>;
  operations: number[];
  reloads: number[];
  ready: number;
}[] = [];
let searchProbe:
  | Awaited<ReturnType<typeof createDependencySearchProbe>>
  | undefined;
let readProbe:
  | Awaited<ReturnType<typeof createDependencyReadProbe>>
  | undefined;
let log = "";
const actions: unknown[] = [];
const requests: Request[] = [];
const responses: { request: Request; reply: Reply }[] = [];
const deliveries: { request: Request; reply: Reply["_tag"] }[] = [];
const sdkFailures: { request: Request; tag: string; detail?: string }[] = [];
const manifest: {
  png: string;
  receipt: string;
  state: string;
  layout: string;
  appearance: string;
  [key: string]: unknown;
}[] = [];
const cliInProfile = (profile: string, ...args: string[]) => {
  const result = spawnSync(
    binaries.cli,
    ["--profile", profile, "--format", "json", ...args],
    {
      env,
      encoding: "utf8",
      input: "scratch verification passphrase\n",
      timeout: 60000,
    },
  );
  actions.push({ cli: args, profile, exit: result.status });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  return JSON.parse(result.stdout);
};
const cli = (...args: string[]) => cliInProfile("work", ...args);
try {
  cli("init", "--password-stdin");
  cli("login", "--password-stdin");
  const blocker = cli(
    "add",
    "Confirm the API contract",
    "--priority",
    "P4",
  ).task;
  const blocked = cli(
    "add",
    "Ship the client",
    "--priority",
    "P1",
    "--depends-on",
    blocker.id,
  ).task;
  const resolved = cli(
    "add",
    "Cancelled prerequisite",
    "--priority",
    "P4",
  ).task;
  cli("cancel", resolved.id, "--expected-version", "1");
  const ready = cli(
    "add",
    "Prepare release notes",
    "--priority",
    "P1",
    "--depends-on",
    resolved.id,
  ).task;
  const done = cli("add", "Resolved checklist", "--priority", "P4").task;
  cli("done", done.id, "--expected-version", "1");
  const untouched = cli(
    "add",
    "Independent Task without Dependencies",
    "--priority",
    "P4",
  ).task;
  const plain = cli("add", "Review tomorrow", "--priority", "P1").task;
  server = spawn(binaries.server, [], {
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  writeFileSync(
    join(evidence, "server.json"),
    JSON.stringify({ pid: server.pid, scratch, binaries }),
  );
  server.stdout?.on("data", (data) => {
    log += data.toString();
  });
  server.stderr?.on("data", (data) => {
    log += data.toString();
  });
  const deadline = Date.now() + 60000;
  while (!/Listening on (http:\/\/127\.0\.0\.1:\d+)/.test(log)) {
    assert.ok(Date.now() < deadline && server.exitCode === null, log);
    await new Promise((done) => setTimeout(done, 40));
  }
  const base = /Listening on (http:\/\/127\.0\.0\.1:\d+)/.exec(log)?.[1];
  assert.ok(base);
  const run = <A, E>(effect: Effect.Effect<A, E, HttpClient.HttpClient>) =>
    Effect.runPromise(effect.pipe(Effect.provide(FetchHttpClient.layer)));
  let credential: string | undefined;
  const client = await run(taskHttpClient(base, () => credential));
  const actualHealth = await run(client.system.health());
  assert.equal(actualHealth.service, "todo-server");
  assert.equal(actualHealth.contract, CONTRACT_ID);
  assert.equal(actualHealth.build, binaries.head);
  writeFileSync(
    join(evidence, "binary-identity.json"),
    JSON.stringify(
      {
        binaries,
        version: {
          exit: actualVersion.status,
          stdout: actualVersion.stdout.trim(),
        },
        health: actualHealth,
      },
      null,
      2,
    ),
  );
  credential = (
    await run(
      client.signIn.signIn({
        payload: { passphrase: "scratch verification passphrase" },
      }),
    )
  ).credential;
  const capturedBlocker = await run(
    client.tasks.show({
      params: {
        profile: Schema.decodeUnknownSync(ProfileId)("work"),
        task: blocker.id,
      },
    }),
  );
  const capturedCompleted = await run(
    client.tasks.show({
      params: {
        profile: Schema.decodeUnknownSync(ProfileId)("work"),
        task: done.id,
      },
    }),
  );
  searchProbe = await createDependencySearchProbe(client, () => credential);
  readProbe = await createDependencyReadProbe(() => credential);
  execFileSync("sh", [join(root, "scripts/disk-guard.sh")], {
    stdio: "inherit",
  });
  const bundle = await build({
    configFile: join(root, "apps/electron/vite.config.ts"),
    root: join(root, "apps/electron"),
    logLevel: "error",
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
    build: {
      write: false,
      cssCodeSplit: false,
      lib: {
        entry: join(root, "apps/electron/src/renderer.tsx"),
        name: "DagApp",
        formats: ["iife"],
      },
    },
  });
  const output = Array.isArray(bundle) ? bundle[0] : bundle;
  assert.ok(output && "output" in output);
  const script = output.output.find((item) => item.type === "chunk");
  assert.ok(script && script.type === "chunk");
  const styles = output.output
    .flatMap((item) =>
      item.type === "asset" && item.fileName.endsWith(".css")
        ? [
            typeof item.source === "string"
              ? item.source
              : new TextDecoder().decode(item.source),
          ]
        : [],
    )
    .join("\n");
  browser = await chromium.launch({
    headless: true,
    ...(process.env.TODO_HEADLESS_CHROMIUM
      ? { executablePath: process.env.TODO_HEADLESS_CHROMIUM }
      : {}),
    env: { ...process.env, HOME: home },
    args: ["--password-store=basic"],
  });
  const page = await browser.newPage({ viewport: { width: 393, height: 426 } });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const graphOutput = await buildGraphBrowser();
  let failRender = false;
  let clipboard = "";
  let delay = false;
  let delayDelete = false;
  let delayPreview = false;
  let delayGraph = false;
  let delayCandidates = false;
  let delayCandidateReply = false;
  let heldCandidateReply: Reply | null = null;
  let reportFixture: "batch" | "batchSelf" | "import" | null = null;
  const projectedError = (index: number) => {
    const error = dependencyRefusals[index]?.error;
    assert.ok(error);
    return Schema.decodeUnknownSync(DependencyError)(
      error.code === "blocked"
        ? {
            ...error,
            details: { ...error.details, blockers: [capturedBlocker] },
          }
        : error.code === "blocks_done_task"
          ? {
              ...error,
              details: {
                ...error.details,
                done_dependents: [capturedCompleted],
                follow_up_depends_on: capturedCompleted.id,
              },
            }
          : error,
    );
  };
  let release: (() => void) | undefined;
  const releasePending = () => {
    const done = release;
    release = undefined;
    done?.();
  };
  const publishReply = async (request: Request, reply: Reply) => {
    if (request._tag === "dependencyCandidates" && delayCandidateReply) {
      delayCandidateReply = false;
      heldCandidateReply = reply;
      await new Promise<void>((done) => {
        release = done;
      });
      heldCandidateReply = null;
    }
    deliveries.push({ request, reply: reply._tag });
    return reply;
  };
  let holdNotices = false;
  let reviewDeleteReply: "preview" | Reply | null = null;
  const heldNotices: unknown[] = [];
  const notify = (notice: unknown) =>
    page.evaluate(
      (notice) =>
        window.dispatchEvent(new CustomEvent("dag-notice", { detail: notice })),
      notice,
    );
  await page.exposeFunction(
    "dagRequest",
    async (raw: unknown): Promise<Reply> => {
      const request = Schema.decodeUnknownSync(Request)(raw);
      actions.push({ request });
      requests.push(request);
      if (
        ((request._tag === "depend" || request._tag === "undepend") && delay) ||
        (request._tag === "delete" && request.query.dry_run && delayPreview) ||
        (request._tag === "graph" && delayGraph) ||
        (request._tag === "dependencyCandidates" && delayCandidates) ||
        (request._tag === "delete" && !request.query.dry_run && delayDelete)
      ) {
        delay = false;
        delayDelete = false;
        delayPreview = false;
        delayGraph = false;
        delayCandidates = false;
        await new Promise<void>((done) => {
          release = done;
        });
      }
      if (
        reviewDeleteReply &&
        request._tag === "delete" &&
        !request.query.dry_run
      ) {
        const controlled = reviewDeleteReply;
        reviewDeleteReply = null;
        const reply: Reply =
          controlled === "preview"
            ? {
                _tag: "task",
                task: await run(
                  client.tasks.delete({
                    params: { profile: request.profile, task: request.task },
                    query: { ...request.query, dry_run: true },
                  }),
                ),
              }
            : controlled;
        responses.push({ request, reply });
        return publishReply(request, reply);
      }
      switch (request._tag) {
        case "restore":
          return {
            _tag: "signedIn",
            profiles: await run(client.reads.profiles({ query: {} })),
          };
        case "windowMode":
          return { _tag: "windowMode", compact: true };
        case "setWindowMode":
          return { _tag: "windowMode", compact: request.compact };
        case "watch": {
          if (stream) await Effect.runPromise(Fiber.interrupt(stream));
          const profile = request.profile;
          const headers = streamHeaders(streamState, profile);
          const observation: (typeof streamReads)[number] = {
            profile,
            headers,
            operations: [],
            reloads: [],
            ready: 0,
          };
          streamReads.push(observation);
          actions.push({ watch: profile, headers });
          stream = Effect.runFork(
            Effect.gen(function* () {
              const response = yield* client.changes.stream({
                params: { profile },
                headers: { ...headers, "x-todo-client": "electron" },
              });
              yield* Stream.runForEach(response.body, (frame) =>
                Effect.promise(async () => {
                  if (frame.event === "ready") observation.ready++;
                  if (frame.event === "reload")
                    observation.reloads.push(frame.data.seq);
                  if (frame.event === "operation")
                    observation.operations.push(frame.data.seq);
                  if (frame.event === "reload")
                    streamState = restoreStreamState(profile, frame.data);
                  if (frame.event === "operation") {
                    if (
                      Number(frame.id) <=
                      Number(
                        streamHeaders(streamState, profile)["last-event-id"],
                      )
                    )
                      return;
                    streamState = {
                      ...streamState,
                      cursors: { ...streamState.cursors, [profile]: frame.id },
                    };
                  }
                  actions.push({
                    sse: frame.event,
                    profile,
                    ...(frame.event === "operation"
                      ? { kind: frame.data.event.kind, seq: frame.data.seq }
                      : {}),
                  });
                  const notice =
                    frame.event === "ready"
                      ? { _tag: "connection", profile, state: "connected" }
                      : frame.event === "reload"
                        ? { _tag: "reload" }
                        : { _tag: "changed", profile };
                  if (holdNotices && frame.event === "operation")
                    heldNotices.push(notice);
                  else await notify(notice);
                }),
              );
            }).pipe(Effect.provide(FetchHttpClient.layer)),
          );
          return { _tag: "ok" };
        }
        case "draft":
        case "copyMermaid":
          clipboard = request.text;
          return { _tag: "ok" };
        case "copyTaskId":
        case "openDiagnostics":
        case "snapshotReveal":
        case "attachmentClipboard":
        case "pickAttachment":
        case "pasteAttachment":
        case "attachmentStatus":
        case "openAttachment":
          return { _tag: "ok" };
        case "signIn":
          credential = (
            await run(
              client.signIn.signIn({
                payload: { passphrase: request.passphrase },
              }),
            )
          ).credential;
          return {
            _tag: "signedIn",
            profiles: await run(client.reads.profiles({ query: {} })),
          };
        case "signOut":
          await run(client.credentials.signOut());
          credential = undefined;
          return { _tag: "signedOut" };
      }
      if (
        (reportFixture === "batch" || reportFixture === "batchSelf") &&
        request._tag === "batchDepend"
      )
        return Schema.decodeUnknownSync(Reply)({
          _tag: "batchDepend",
          report: {
            generated_at: "2026-11-09T00:00:00Z",
            dry_run: request.payload.dry_run === true,
            results: request.payload.items.map((item, index) => ({
              index,
              error:
                reportFixture === "batchSelf" && index === 0
                  ? Schema.decodeUnknownSync(DependencyError)({
                      generated_at: "2026-11-10T00:00:00Z",
                      code: "dependency_cycle",
                      message: dependencyAgentMessage,
                      exit_code: 2,
                      exit_meaning: "validation or usage",
                      details: {
                        dependent_id: item.blocker_id,
                        blocker_id: item.blocker_id,
                        path: [item.blocker_id, item.blocker_id],
                      },
                    })
                  : projectedError(index),
              exit_code: 2,
            })),
          },
        });
      if (reportFixture === "import" && request._tag === "importTasks")
        return Schema.decodeUnknownSync(Reply)({
          _tag: "importReport",
          report: {
            generated_at: "2026-11-09T00:00:00Z",
            dry_run: request.payload.dry_run === true,
            totals: { created: 0, updated: 0, unchanged: 0, rejected: 8 },
            items: request.payload.items.map((_, index) => ({
              external_id: `projection:${index}`,
              outcome: "rejected",
              task_id: null,
              from_version: null,
              changed_fields: [],
              error:
                index < 6
                  ? {
                      exit_code: 2,
                      exit_meaning: "validation or usage",
                      code: "invalid_args",
                      message: dependencyAgentMessage,
                      details: {
                        current_version: null,
                        dependency_error: projectedError(index),
                      },
                    }
                  : {
                      exit_code: 4,
                      exit_meaning: "Conflict",
                      code: index === 6 ? "conflict" : "occ_conflict",
                      message: dependencyAgentMessage,
                    },
            })),
          },
        });
      try {
        const graphFailure =
          request._tag === "graph" && readProbe?.enabled(request.task);
        const http =
          graphFailure && readProbe
            ? readProbe.http
            : request._tag === "dependencyCandidates" && searchProbe?.enabled
              ? searchProbe.http
              : client;
        if (graphFailure) readProbe?.consume();
        const reply = Schema.decodeUnknownSync(Reply)(
          await run(taskRequest(http, request)),
        );
        if (
          request._tag === "delete" ||
          request._tag === "depend" ||
          request._tag === "undepend"
        )
          responses.push({ request, reply });
        if (request._tag === "dependencyCandidates" && searchProbe?.enabled)
          searchProbe.record(request.filters.text ?? "", reply);
        if (reply._tag === "graph" && failRender) {
          failRender = false;
          return publishReply(request, {
            ...reply,
            report: { ...reply.report, mermaid: "flowchart TD\nn0[" },
          });
        }
        return publishReply(request, reply);
      } catch (error) {
        const tagged = Schema.decodeUnknownExit(
          Schema.Struct({ _tag: Schema.String }),
        )(error);
        if (tagged._tag === "Success") {
          const detail = exitDetail(error);
          sdkFailures.push({
            request,
            tag: tagged.value._tag,
            ...(detail ? { detail } : {}),
          });
        }
        if (
          error &&
          typeof error === "object" &&
          "_tag" in error &&
          error._tag === "Conflict" &&
          "latest" in error
        ) {
          const reply = Schema.decodeUnknownSync(Reply)({
            _tag: "conflict",
            latest: error.latest,
            exit_detail: exitDetail(error),
          });
          responses.push({ request, reply });
          return publishReply(request, reply);
        }
        const reply = errorReply(error, request);
        responses.push({ request, reply });
        return publishReply(request, reply);
      }
    },
  );
  await page.route("http://127.0.0.1/", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<html><head><style>${styles}</style></head><body><div id="root"></div></body></html>`,
    }),
  );
  await page.route("http://127.0.0.1/graph-browser/*", (route) => {
    const name = new URL(route.request().url()).pathname.split("/").at(-1);
    assert.ok(name && ["index.html", "graph.js", "graph.css"].includes(name));
    return route.fulfill({
      path: join(graphOutput, name),
      contentType: name.endsWith(".html")
        ? "text/html"
        : name.endsWith(".js")
          ? "text/javascript"
          : "text/css",
    });
  });
  await page.goto("http://127.0.0.1/");
  await page.evaluate(() => {
    window.desktop = {
      request: (request) => Reflect.get(window, "dagRequest")(request),
      filePath: () => "",
      subscribe: (listener) => {
        const receive = (event: Event) => {
          if (event instanceof CustomEvent) listener(event.detail);
        };
        window.addEventListener("dag-notice", receive);
        return () => window.removeEventListener("dag-notice", receive);
      },
    };
  });
  await page.addScriptTag({ content: script.code });
  const captureOne = async (
    state: string,
    description: string,
    layout = "compact",
    target?: Locator,
    appearances: readonly boolean[] = [false, true],
  ) => {
    for (const dark of appearances) {
      await page.evaluate((dark) => {
        if (document.documentElement.classList.contains("dark") !== dark)
          window.dispatchEvent(
            new CustomEvent("dag-notice", { detail: { _tag: "toggleTheme" } }),
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
      if (target) {
        await target.evaluate((element) =>
          element.scrollIntoView({ block: "center" }),
        );
        await settleRenderer(page);
      }
      const subject = target
        ? await target.evaluate((element) => {
            const box = element.getBoundingClientRect();
            let top = 0;
            let bottom = innerHeight;
            let left = 0;
            let right = innerWidth;
            for (
              let parent = element.parentElement;
              parent;
              parent = parent.parentElement
            ) {
              const style = getComputedStyle(parent);
              if (/(auto|scroll|hidden)/u.test(style.overflowY)) {
                const region = parent.getBoundingClientRect();
                top = Math.max(top, region.top);
                bottom = Math.min(bottom, region.bottom);
                left = Math.max(left, region.left);
                right = Math.min(right, region.right);
              }
            }
            return {
              box: box.toJSON(),
              clip: { top, bottom, left, right },
              whole:
                box.top >= top - 0.5 &&
                box.bottom <= bottom + 0.5 &&
                box.left >= left - 0.5 &&
                box.right <= right + 0.5,
              exceedsRegion:
                box.height > bottom - top + 0.5 ||
                box.width > right - left + 0.5,
            };
          })
        : null;
      if (subject && !subject.exceedsRegion)
        assert.equal(
          subject.whole,
          true,
          `Capture subject must be wholly visible: ${JSON.stringify(subject)}`,
        );
      const imageLimits = subject?.exceedsRegion
        ? [
            "The subject is larger than its visible scroll region. This image shows a partial subject; the receipt and other scroll captures establish the complete report.",
          ]
        : [];
      const reviewGeometry: unknown[] = [];
      if (state === "initial-refusal-retains-draft") {
        const notice = await page
          .locator(".quick-dialog [data-testid=dependency-error]")
          .evaluate((element) => {
            const box = element.getBoundingClientRect();
            const region = element
              .closest(".parsed-draft")
              ?.getBoundingClientRect();
            const footer = document
              .querySelector(".quick-dialog .quick-add-footer")
              ?.getBoundingClientRect();
            return {
              box: box.toJSON(),
              region: region?.toJSON(),
              footer: footer?.toJSON(),
              viewport: { width: innerWidth, height: innerHeight },
            };
          });
        assert.ok(notice.region && notice.footer);
        assert.ok(
          notice.box.top >= notice.region.top - 0.5 &&
            notice.box.bottom <= notice.region.bottom + 0.5,
          `Initial Dependency refusal must be visible on appearance: ${JSON.stringify(notice)}`,
        );
        assert.ok(
          notice.box.top >= 0 &&
            notice.box.bottom <= notice.viewport.height &&
            notice.footer.bottom <= notice.viewport.height,
        );
        reviewGeometry.push({ initialRefusal: notice });
      }
      if (state === "picker-long-cycle") {
        const lines = await page
          .locator('.dependency-witness[data-loop="true"] li')
          .evaluateAll((elements) =>
            elements.map((element) => ({
              text: element.textContent?.trim().replace(/^→ /u, ""),
              title: element.getAttribute("title"),
              accessible: element.getAttribute("aria-label"),
              ellipsis: getComputedStyle(element).textOverflow,
              overflow: getComputedStyle(element).overflowX,
            })),
          );
        assert.ok(lines.length > 3);
        for (const line of lines) {
          assert.equal(line.title, line.text);
          assert.equal(line.accessible, line.text);
          assert.equal(line.ellipsis, "ellipsis");
          assert.equal(line.overflow, "hidden");
        }
        reviewGeometry.push({ loopLines: lines });
      }
      if (/^graph-(mixed-tree|DAG)-(diagram|full)$/u.test(state)) {
        const frame = await page
          .getByTestId("dependency-graph-diagram")
          .boundingBox();
        assert.ok(frame);
        const nodes = await page
          .frameLocator('[data-testid="dependency-graph-diagram"]')
          .locator(".pele-node:not(.graph-hidden)")
          .evaluateAll((elements) =>
            elements.map((element) => {
              const box = element.getBoundingClientRect();
              return {
                left: box.left,
                right: box.right,
                top: box.top,
                bottom: box.bottom,
              };
            }),
          );
        const tools = await page
          .locator(".dependency-diagram-tools button")
          .evaluateAll((elements) =>
            elements.map((element) => {
              const box = element.getBoundingClientRect();
              return {
                left: box.left,
                right: box.right,
                top: box.top,
                bottom: box.bottom,
              };
            }),
          );
        assert.ok(nodes.length > 0 && tools.length === 3);
        for (const node of nodes) {
          const pageNode: Pick<DOMRect, "left" | "right" | "top" | "bottom"> = {
            left: node.left + frame.x,
            right: node.right + frame.x,
            top: node.top + frame.y,
            bottom: node.bottom + frame.y,
          };
          assert.ok(
            pageNode.left >= frame.x - 0.5 &&
              pageNode.right <= frame.x + frame.width + 0.5 &&
              pageNode.top >= frame.y - 0.5 &&
              pageNode.bottom <= frame.y + frame.height + 0.5,
            `Automatic fit must keep each node inside the drawing area: ${JSON.stringify({ pageNode, frame })}`,
          );
          for (const tool of tools)
            assert.equal(
              pageNode.left < tool.right &&
                pageNode.right > tool.left &&
                pageNode.top < tool.bottom &&
                pageNode.bottom > tool.top,
              false,
              `Graph node must not intersect a tool after fit: ${JSON.stringify({ pageNode, tool })}`,
            );
        }
        reviewGeometry.push({ fittedGraph: { frame, nodes, tools } });
      }
      const popup = page
        .locator('[data-slot="dialog-content"][data-open]')
        .last();
      if (await popup.count()) {
        await expect(popup).toHaveCSS("opacity", "1");
        await expect(popup).toHaveCSS(
          "background-color",
          dark ? "rgb(36, 47, 39)" : "rgb(255, 255, 255)",
        );
      }
      const png = `${state}-${layout}-${dark ? "dark" : "light"}.png`;
      const geometry = await page.evaluate(() => ({
        viewport: { width: innerWidth, height: innerHeight },
        overflow: document.documentElement.scrollWidth > innerWidth,
        popups: [
          ...document.querySelectorAll(
            '[data-slot="dialog-content"][data-open]',
          ),
        ].map((element) => {
          const style = getComputedStyle(element);
          const box = element.getBoundingClientRect();
          const hit = document.elementFromPoint(box.left + 12, box.top + 12);
          return {
            id: element.getAttribute("data-testid"),
            background: style.backgroundColor,
            color: style.color,
            opacity: style.opacity,
            transition: style.transition,
            containsHit: hit !== null && element.contains(hit),
            hit: hit?.outerHTML.slice(0, 300),
          };
        }),
        actions: [
          ...document.querySelectorAll(
            '[data-testid="dependency-delete-confirm"], [data-testid="dependency-delete-cancel"], [data-testid="dependency-picker-close"], [data-testid="dependency-graph-close"], [data-testid="dependency-graph-mode"], [data-testid="dependency-initial-done"], [data-testid="dependency-initial-cancel"], .dependency-batch-dialog [data-slot="dialog-footer"], .dependency-diagram-tools',
          ),
        ].map((element) => {
          const box = element.getBoundingClientRect();
          return {
            id: element.getAttribute("data-testid"),
            x: box.x,
            y: box.y,
            width: box.width,
            height: box.height,
            visible:
              box.top >= 0 &&
              box.bottom <= innerHeight &&
              box.left >= 0 &&
              box.right <= innerWidth,
          };
        }),
      }));
      assert.equal(geometry.overflow, false);
      assert.ok(
        geometry.actions.every((item) => item.visible),
        JSON.stringify(geometry),
      );
      await page.screenshot({ path: join(evidence, png) });
      const receipt = `${state}-${layout}-${dark ? "dark" : "light"}.json`;
      writeFileSync(
        join(evidence, receipt),
        JSON.stringify(
          {
            state,
            description,
            geometry,
            subject,
            imageLimits,
            reviewGeometry,
            requestCount: actions.length,
            checkboxes: await page
              .getByRole("checkbox")
              .evaluateAll((elements) =>
                elements.map((element) =>
                  element instanceof HTMLInputElement
                    ? {
                        id: element.getAttribute("data-testid"),
                        checked: element.checked,
                        disabled: element.disabled,
                      }
                    : {
                        id: element.getAttribute("data-testid"),
                        checked:
                          element.getAttribute("aria-checked") === "true",
                        disabled:
                          element.hasAttribute("disabled") ||
                          element.getAttribute("aria-disabled") === "true",
                      },
                ),
              ),
            visibleText: await page.locator("body").innerText(),
            scope:
              "production renderer + real compiled scratch HTTP; native Session/safeStorage pending",
          },
          null,
          2,
        ),
      );
      manifest.push({
        client: "electron",
        state,
        layout,
        appearance: dark ? "dark" : "light",
        png,
        receipt,
        geometry,
        subject,
        imageLimits,
        ids: await page
          .locator("[data-testid]")
          .evaluateAll((elements) =>
            elements.map((element) => element.getAttribute("data-testid")),
          ),
      });
    }
  };
  const capture = async (
    state: string,
    description: string,
    layout = "compact",
    target?: Locator,
  ) => {
    await captureOne(state, description, layout, target);
    if (layout !== "compact" || state.startsWith("graph-")) return;
    const scrolls = await page.evaluateHandle(() =>
      [...document.querySelectorAll("*")]
        .filter((element) => element.scrollHeight > element.clientHeight)
        .map((element) => ({
          element,
          top: element.scrollTop,
          left: element.scrollLeft,
        })),
    );
    const focus = await page.evaluateHandle(() => document.activeElement);
    const importIndex = target
      ? await target.evaluate((element) => {
          const row = element.closest(".import-row");
          return row
            ? [...document.querySelectorAll(".import-row")].indexOf(row)
            : -1;
        })
      : -1;
    try {
      await page.setViewportSize({ width: 1100, height: 720 });
      await notify({ _tag: "windowMode", compact: false });
      await settleRenderer(page);
      await captureOne(
        state,
        description,
        "full",
        importIndex >= 0
          ? page.locator(".import-table tbody tr").nth(importIndex)
          : target,
      );
    } finally {
      await page.setViewportSize({ width: 393, height: 426 });
      await notify({ _tag: "windowMode", compact: true });
      await settleRenderer(page);
      await focus.evaluate((element) => {
        if (element instanceof HTMLElement && element.isConnected)
          element.focus({ preventScroll: true });
      });
      await scrolls.evaluate((values) => {
        for (const { element, top, left } of values)
          if (element.isConnected) {
            element.scrollTop = top;
            element.scrollLeft = left;
          }
      });
      await scrolls.dispose();
      await focus.dispose();
    }
  };
  await expect(
    page.getByRole("button", { name: "More filters" }),
  ).toBeVisible();
  await expect(page.locator(`[data-task-id="${blocked.id}"]`)).toBeVisible();
  await expect(page.getByTestId(`dependency-state-${blocked.id}`)).toHaveText(
    "Blocked · 1",
  );
  await expect(page.getByTestId(`dependency-state-${ready.id}`)).toHaveText(
    "Ready",
  );
  await expect(page.getByTestId(`dependency-state-${plain.id}`)).toHaveCount(0);
  await capture(
    "rows",
    "Ready and Blocked metadata badges; no-blocker Task has no badge",
  );
  await page.getByRole("button", { name: "More filters" }).click();
  await expect(page.getByTestId("filter-ready")).toBeVisible();
  await capture(
    "filters",
    "Ready and Blocked controls reuse the existing filter draft/dialog",
  );
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "More filters" }).click();
  await page.locator("#filter-status").selectOption("closed");
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(page.locator(`[data-task-id="${done.id}"]`)).toBeVisible();
  await page.locator(".task-groups").evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(page.getByTestId(`dependency-state-${done.id}`)).toHaveCount(0);
  await expect(page.getByTestId(`dependency-state-${resolved.id}`)).toHaveCount(
    0,
  );
  await capture(
    "rows-terminal",
    "Done and cancelled Tasks have no Dependency badge",
  );
  await page
    .getByRole("button", { name: "Clear filters", exact: true })
    .click();
  await page.locator("#task-order").selectOption("topo");
  await expect(
    page.getByRole("heading", { name: "Dependency order", exact: true }),
  ).toBeVisible();
  await capture(
    "order",
    "Dependency order comes from the whole-Profile server order",
  );
  await page.locator(`[data-task-id="${blocked.id}"] .task-content`).click();
  await page.getByTestId("dependency-add").click();
  await expect(
    page.getByTestId(`dependency-choice-${blocker.id}`),
  ).toBeChecked();
  await capture("picker-depends-on", "Checked existing blockers remain first");
  await page.getByTestId("dependency-blocks").click();
  await capture(
    "picker-blocks",
    "Header states that Ship the client blocks the chosen Task",
  );
  delay = true;
  await page.getByTestId(`dependency-choice-${plain.id}`).check();
  await expect(
    page.getByTestId(`dependency-pending-${plain.id}`),
  ).toBeVisible();
  await capture(
    "picker-pending",
    "Pending candidate disables its immediate write",
  );
  assert.ok(release);
  release();
  await expect(page.getByTestId(`dependency-choice-${plain.id}`)).toBeChecked();
  await page.getByTestId(`dependency-choice-${blocker.id}`).check();
  await expect(page.getByTestId("dependency-error")).toContainText(
    "This Dependency would create a loop.",
  );
  await expect(page.getByTestId("dependency-error")).toContainText(
    "error 2 - validation or usage",
  );
  const visibleCandidates = await page
    .locator(".dependency-choice")
    .evaluateAll(
      (elements) =>
        elements.filter((element) => {
          const box = element.getBoundingClientRect();
          const parent = element
            .closest(".dependency-scroll")
            ?.getBoundingClientRect();
          return parent && box.top >= parent.top && box.bottom <= parent.bottom;
        }).length,
    );
  if (visibleCandidates < 2) {
    await page.screenshot({
      path: join(evidence, "refusal-geometry-incident.png"),
    });
    writeFileSync(
      join(evidence, "refusal-geometry-incident.json"),
      JSON.stringify(
        await page
          .locator('[data-testid="dependency-picker"]')
          .evaluate((root) =>
            [...root.querySelectorAll("*")]
              .filter((element) =>
                element.matches(
                  '[data-slot="dialog-title"], [data-slot="dialog-footer"], [data-testid="dependency-direction"], [data-testid="dependency-search"], .dependency-scroll, .dependency-choice, .dependency-error-region, .dependency-witness',
                ),
              )
              .map((element) => {
                const box = element.getBoundingClientRect();
                const style = getComputedStyle(element);
                return {
                  tag: element.tagName,
                  classes: element.className,
                  text: element.textContent,
                  x: box.x,
                  y: box.y,
                  width: box.width,
                  height: box.height,
                  margin: style.margin,
                  padding: style.padding,
                  lineHeight: style.lineHeight,
                  flexShrink: style.flexShrink,
                  scrollTop: element.scrollTop,
                };
              }),
          ),
        null,
        2,
      ),
    );
  }
  assert.ok(
    visibleCandidates >= 2,
    `Refusal must retain two whole candidate rows, got ${visibleCandidates}`,
  );

  await capture(
    "picker-refusal",
    "Real compiled server cycle refusal retains intent and actual exit pair",
  );
  await page.getByTestId("dependency-picker-close").click();
  const openDelete = async () => {
    await page
      .getByRole("button", { name: "Task actions", exact: true })
      .click();
    await page
      .getByRole("menuitem", { name: "Delete task", exact: true })
      .click();
    await expect(page.getByTestId("dependency-delete-confirm")).toBeEnabled();
    await expect(page.getByTestId("dependency-delete-cancel")).toBeFocused();
  };
  await openDelete();
  await capture(
    "delete-both",
    "Delete previews both incident directions and defaults to Cancel",
  );
  const current = cli("show", plain.id).task;
  cli(
    "undepend",
    plain.id,
    "--from",
    blocked.id,
    "--expected-version",
    String(current.row_version),
  );
  await page.getByTestId("dependency-delete-confirm").click();
  await expect(page.getByTestId("dependency-delete-changed")).toBeVisible();
  await capture(
    "delete-changed",
    "Changed fingerprint refreshes preview and requires new explicit confirmation",
  );
  await page.getByTestId("dependency-delete-cancel").click();
  await page
    .getByRole("button", { name: "Back to tasks", exact: true })
    .click();
  await page.locator(`[data-task-id="${untouched.id}"] .task-content`).click();
  await openDelete();
  await expect(page.getByTestId("dependency-delete-dialog")).toContainText(
    "This Task has no Dependencies.",
  );
  await capture(
    "delete-empty",
    "Every Delete confirms, including no-edge Tasks",
  );
  await page.getByTestId("dependency-delete-cancel").click();
  await page
    .getByRole("button", { name: "Back to tasks", exact: true })
    .click();
  await page.locator(`[data-task-id="${ready.id}"] .task-content`).click();
  await openDelete();
  await capture(
    "delete-blockers",
    "Blockers-only preview explicitly marks a cancelled endpoint",
  );
  await page.getByTestId("dependency-delete-cancel").click();
  await page
    .getByRole("button", { name: "Back to tasks", exact: true })
    .click();
  await page.locator(`[data-task-id="${blocker.id}"] .task-content`).click();
  await openDelete();
  await capture(
    "delete-dependents",
    "Dependents-only preview is reviewed before Delete",
  );
  await page.getByTestId("dependency-delete-cancel").click();
  await page
    .getByRole("button", { name: "Back to tasks", exact: true })
    .click();
  await page.locator(`[data-task-id="${blocked.id}"] .task-content`).click();
  const openGraph = async () => {
    await page
      .getByRole("button", { name: "Task actions", exact: true })
      .click();
    await page
      .getByRole("menuitem", { name: "View Dependencies", exact: true })
      .click();
    await expect(page.getByTestId("dependency-graph-details")).toBeVisible();
  };
  await openGraph();
  await expect(page.getByTestId("dependency-graph-diagram")).toHaveCount(0);
  await expect(page.getByTestId("dependency-graph-overview")).toHaveCount(0);
  await expect(page.locator(".dependency-graph-controls small")).toHaveText(
    "2 of 2 Tasks shown",
  );
  await capture(
    "graph-list",
    "Compact opens on the accessible Depends on, Blocks, Lightest next and root details list",
  );
  await page
    .getByRole("button", { name: "Graph details", exact: true })
    .click();
  await page.getByRole("button", { name: /^Tasks in diagram · / }).click();
  await page.getByTestId("dependency-graph-copy-mermaid").click();
  for (const section of [
    "depends-on",
    "lightest-next",
    "starts-at",
    "ancestors",
  ])
    await expect(
      page.getByTestId(`dependency-graph-related-${section}-${blocker.id}`),
    ).toHaveCount(1);
  await expect(
    page.getByTestId(`dependency-graph-task-${blocker.id}`),
  ).toHaveCount(1);
  const graphIdentifiers = await page
    .getByTestId("dependency-graph")
    .locator("[data-testid]")
    .evaluateAll((elements) =>
      elements.map((element) => element.getAttribute("data-testid")),
    );
  assert.equal(new Set(graphIdentifiers).size, graphIdentifiers.length);
  writeFileSync(
    join(evidence, "graph-section-identifiers.json"),
    JSON.stringify(graphIdentifiers),
  );
  await capture(
    "graph-repeated-sections",
    "The same Task has unique section-scoped row/menu identifiers with Graph details open",
  );
  assert.equal(
    clipboard,
    (
      await run(
        client.tasks.graph({
          params: {
            profile: Schema.decodeUnknownSync(ProfileId)("work"),
            task: blocked.id,
          },
        }),
      )
    ).mermaid,
  );
  await page
    .getByRole("button", { name: "Graph details", exact: true })
    .click();
  await page
    .getByTestId(`dependency-graph-actions-lightest-next-${blocker.id}`)
    .click();
  await page
    .getByRole("menuitem", {
      name: "Show this Task's Dependencies",
      exact: true,
    })
    .click();
  await expect(
    page
      .getByTestId("dependency-graph")
      .locator('[data-slot="dialog-description"]'),
  ).toHaveText("Confirm the API contract");
  await expect
    .poll(() =>
      actions.some((entry) => {
        const parsed = Schema.decodeUnknownExit(
          Schema.Struct({ request: Request }),
        )(entry);
        return (
          parsed._tag === "Success" &&
          parsed.value.request._tag === "graph" &&
          parsed.value.request.task === blocker.id
        );
      }),
    )
    .toBe(true);
  await page.getByTestId("dependency-graph-close").click();
  await openGraph();
  await page.getByRole("button", { name: "Diagram", exact: true }).click();
  await expect(
    page
      .frameLocator('[data-testid="dependency-graph-diagram"]')
      .locator(".pele-node:not(.graph-hidden)"),
  ).toHaveCount(2);
  await capture(
    "graph-diagram",
    "Explicit Diagram toggle draws the canonical local Pele resource",
  );
  await page.setViewportSize({ width: 1100, height: 720 });
  await page.evaluate(() =>
    window.dispatchEvent(
      new CustomEvent("dag-notice", {
        detail: { _tag: "windowMode", compact: false },
      }),
    ),
  );
  await page.getByTestId("dependency-graph-close").click();
  await openGraph();
  await capture(
    "graph-full",
    "Full window diagram has native details beside it",
    "full",
  );
  await page.getByTestId("dependency-graph-close").click();
  await page.setViewportSize({ width: 393, height: 426 });
  await page.evaluate(() =>
    window.dispatchEvent(
      new CustomEvent("dag-notice", {
        detail: { _tag: "windowMode", compact: true },
      }),
    ),
  );
  failRender = true;
  await openGraph();
  await page.getByRole("button", { name: "Diagram", exact: true }).click();
  await expect(
    page.getByRole("status").filter({
      hasText: "Couldn't draw the diagram. The list below is complete.",
    }),
  ).toBeVisible();
  await expect(page.getByTestId("dependency-graph-details")).toBeVisible();
  await capture(
    "graph-pele-fallback",
    "A controlled malformed export reaches real Pele; failure keeps accessible list and Retry",
  );
  await page.getByTestId("dependency-graph-retry").click();
  await expect(
    page
      .frameLocator('[data-testid="dependency-graph-diagram"]')
      .locator(".pele-node:not(.graph-hidden)"),
  ).toHaveCount(2);
  await capture(
    "graph-pele-retried",
    "Explicit Retry redraws the real server export through the same canonical local Pele adapter",
  );
  await page.getByTestId("dependency-graph-close").click();
  let lastDependent = "";
  for (let index = 0; index < 20; index++)
    lastDependent = cli(
      "add",
      `Long Dependency witness ${index + 1}: review the implementation and retain the complete Task title`,
      "--priority",
      "P4",
      "--depends-on",
      blocked.id,
    ).task.id;
  await page
    .getByRole("button", { name: "Back to tasks", exact: true })
    .click();
  await page.locator(`[data-task-id="${blocked.id}"] .task-content`).click();
  await openDelete();
  await page
    .getByTestId("dependency-delete-blocks")
    .locator("li")
    .last()
    .scrollIntoViewIfNeeded();
  await capture(
    "delete-long-last",
    "Longest incident list reaches its last row while Cancel and Delete remain in the Compact viewport",
  );
  await page.getByTestId("dependency-delete-cancel").click();
  await page.getByTestId("dependency-add").click();
  await expect(
    page.getByTestId(`dependency-choice-${lastDependent}`),
  ).toBeAttached();
  const lastChoice = page.locator(".dependency-choice").last();
  await lastChoice.scrollIntoViewIfNeeded();
  const lastChoiceBounds = await lastChoice.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const region = element
      .closest(".dependency-scroll")
      ?.getBoundingClientRect();
    return {
      top: box.top,
      bottom: box.bottom,
      regionTop: region?.top,
      regionBottom: region?.bottom,
    };
  });
  writeFileSync(
    join(evidence, "picker-last-bounds.json"),
    JSON.stringify(lastChoiceBounds),
  );
  assert.ok(
    lastChoiceBounds.regionTop !== undefined &&
      lastChoiceBounds.regionBottom !== undefined &&
      lastChoiceBounds.top >= lastChoiceBounds.regionTop - 0.5 &&
      lastChoiceBounds.bottom <= lastChoiceBounds.regionBottom + 0.5,
    JSON.stringify(lastChoiceBounds),
  );
  await capture(
    "picker-long-last",
    "Profile-wide candidate list reaches its last long row while Close remains in the Compact viewport",
  );
  const cycleNames: readonly [string, string, string] = [
    "Long cycle fixture A: retain the complete authorized Task title in this returned witness",
    "Long cycle fixture B: retain the complete authorized Task title in this returned witness",
    "Long cycle fixture C: retain the complete authorized Task title in this returned witness",
  ];
  const cycleA = cli("add", cycleNames[0], "--depends-on", blocked.id).task;
  const cycleB = cli("add", cycleNames[1], "--depends-on", cycleA.id).task;
  const cycleC = cli("add", cycleNames[2], "--depends-on", cycleB.id).task;
  await page.getByTestId("dependency-depends-on").click();
  await page.getByTestId("dependency-search").fill("Long cycle fixture");
  await page.getByTestId(`dependency-choice-${cycleC.id}`).check();
  await expect(page.getByTestId("dependency-error")).toContainText(
    `Can't add ${cycleC.title}.`,
  );
  await expect(
    page.getByTestId(`dependency-choice-${cycleC.id}`),
  ).not.toBeChecked();
  const chain = await page
    .locator(".dependency-error-region .dependency-witness li")
    .allTextContents();
  const names = chain.map((name) => name.trim().replace(/^→ /u, ""));
  assert.equal(names.length, 5);
  assert.equal(names[0], names.at(-1));
  assert.deepEqual(
    names
      .slice(0, -1)
      .map((name, index) => `${name} blocks ${names[index + 1]}`)
      .sort(),
    [
      `${blocked.title} blocks ${cycleA.title}`,
      `${cycleA.title} blocks ${cycleB.title}`,
      `${cycleB.title} blocks ${cycleC.title}`,
      `${cycleC.title} blocks ${blocked.title}`,
    ].sort(),
  );
  await expect(
    page.locator(".dependency-error-region .dependency-witness"),
  ).toHaveAttribute("aria-label", names.join(" blocks "));
  const loopGeometry = await page
    .locator(".dependency-error-region .dependency-witness")
    .evaluate((list) => {
      const region = list.getBoundingClientRect();
      const rows = [...list.children].map((row) => row.getBoundingClientRect());
      return {
        height: list.clientHeight,
        scrollHeight: list.scrollHeight,
        right: region.right,
        alertRight: list
          .closest(".dependency-error-region")
          ?.getBoundingClientRect().right,
        wholeLines: rows.filter(
          (row) =>
            row.top >= region.top &&
            row.bottom <= region.top + list.clientHeight,
        ).length,
      };
    });
  assert.equal(loopGeometry.wholeLines, 3);
  assert.ok(
    loopGeometry.alertRight !== undefined &&
      loopGeometry.right <= loopGeometry.alertRight,
  );
  assert.ok(loopGeometry.scrollHeight > loopGeometry.height);
  const wholeChoices = await page.locator(".dependency-choice").evaluateAll(
    (rows) =>
      rows.filter((row) => {
        const box = row.getBoundingClientRect(),
          region = row.closest(".dependency-scroll")?.getBoundingClientRect();
        return region && box.top >= region.top && box.bottom <= region.bottom;
      }).length,
  );
  assert.ok(wholeChoices >= 2);
  writeFileSync(
    join(evidence, "long-loop-geometry.json"),
    JSON.stringify({ loopGeometry, wholeChoices, returnedArrowOrder: names }),
  );
  await capture(
    "picker-long-cycle",
    "A real long loop keeps exactly three whole witness lines, two whole candidates, the attempted candidate unchecked and the actual exit pair",
  );
  await page.getByTestId("dependency-picker-close").click();
  await page.evaluate(() =>
    window.dispatchEvent(
      new CustomEvent("dag-notice", { detail: { _tag: "quickAdd" } }),
    ),
  );
  await page
    .getByLabel("Task title", { exact: true })
    .fill("Created with a reviewed Dependency");
  const quickGeometry = async (name: string) => {
    await settleRenderer(page);
    const geometry = await page.locator(".quick-dialog").evaluate((dialog) => {
      const preview = dialog
        .querySelector(".parsed-draft")
        ?.getBoundingClientRect();
      const footer = dialog
        .querySelector(".quick-add-footer")
        ?.getBoundingClientRect();
      const row = dialog
        .querySelector(".dependency-initial-row")
        ?.getBoundingClientRect();
      if (!preview || !footer || !row)
        throw new Error("Missing quick-add metadata geometry");
      return {
        previewFooter: footer.top - preview.bottom,
        footerTop: footer.top,
        rowHeight: row.height,
        footerVisible: footer.top >= 0 && footer.bottom <= innerHeight,
        horizontalOverflow: dialog.scrollWidth > dialog.clientWidth,
      };
    });
    assert.equal(geometry.previewFooter, 16);
    assert.equal(geometry.footerVisible, true);
    assert.equal(geometry.horizontalOverflow, false);
    writeFileSync(
      join(evidence, `${name}-geometry.json`),
      JSON.stringify(geometry),
    );
    return geometry;
  };
  await expect(page.locator(".parsed-draft")).toBeVisible();
  await expect(page.locator(".parsed-draft")).toContainText(
    "Task title: Created with a reviewed Dependency",
  );
  const quickNone = await quickGeometry("quick-dependencies-none");
  assert.equal(quickNone.rowHeight, 32);
  await capture(
    "quick-dependencies-none",
    "Initial Dependencies occupy one metadata row, above the preview's fixed 16px footer gap",
  );
  await page
    .getByRole("button", { name: "Add Dependencies", exact: true })
    .click();
  await page
    .getByTestId("dependency-initial-picker")
    .getByTestId(`dependency-choice-${blocker.id}`)
    .check();
  await page
    .getByTestId("dependency-initial-picker")
    .getByRole("textbox")
    .fill("Independent Task");
  await expect(
    page
      .getByTestId("dependency-initial-picker")
      .getByTestId(`dependency-choice-${blocker.id}`),
  ).toBeChecked();
  await expect(page.getByText("Loading Tasks…", { exact: true })).toHaveCount(
    0,
  );
  await expect(
    page.getByTestId("dependency-initial-picker").locator(".dependency-choice"),
  ).toHaveCount(2);
  assert.equal(
    await page.getByTestId("dependency-initial-picker").evaluate((dialog) => {
      const box = dialog
        .querySelector('[data-slot="dialog-title"]')
        ?.getBoundingClientRect();
      return (
        !!box &&
        dialog.contains(document.elementFromPoint(box.x + 10, box.y + 10))
      );
    }),
    true,
  );
  await capture(
    "initial-dependencies",
    "Initial checked Dependency stays selected while Profile search narrows; no edge write has occurred",
  );
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page
    .getByRole("button", { name: "Add Dependencies", exact: true })
    .click();
  await page
    .getByTestId("dependency-initial-picker")
    .getByRole("textbox")
    .fill(resolved.title);
  await page.getByTestId(`dependency-choice-${resolved.id}`).check();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  assert.equal(
    (await quickGeometry("quick-dependencies-two")).footerTop,
    quickNone.footerTop,
  );
  await capture(
    "quick-dependencies-two",
    "Two removable Dependency chips stay inside scrolling metadata and preserve the fixed footer gap",
  );
  const wrapTasks = Array.from(
    { length: 8 },
    (_, index) =>
      cli(
        "add",
        `Quick wrap fixture ${index + 1} with a long title for the metadata chips`,
      ).task,
  );
  await page
    .getByRole("button", { name: "Add Dependencies", exact: true })
    .click();
  await page
    .getByTestId("dependency-initial-picker")
    .getByRole("textbox")
    .fill("Quick wrap fixture");
  for (const task of wrapTasks)
    await page.getByTestId(`dependency-choice-${task.id}`).check();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.locator(".parsed-draft").evaluate((element) => {
    element.scrollTop = 0;
  });
  const initialChipBounds = await page
    .locator(".dependency-initial-row")
    .evaluate((row) => {
      const region = row.closest(".parsed-draft")?.getBoundingClientRect();
      return {
        region: region?.toJSON(),
        chips: [
          ...row.querySelectorAll('[data-testid^="dependency-initial-"]'),
        ].map((chip) => ({
          id: chip.getAttribute("data-testid"),
          ...chip.getBoundingClientRect().toJSON(),
        })),
      };
    });
  assert.ok(initialChipBounds.region);
  for (const chip of initialChipBounds.chips.slice(0, 2)) {
    assert.ok(
      chip.top >= initialChipBounds.region.top &&
        chip.bottom <= initialChipBounds.region.bottom,
      JSON.stringify(initialChipBounds),
    );
  }
  writeFileSync(
    join(evidence, "quick-many-initial-chips.json"),
    JSON.stringify(initialChipBounds),
  );
  await capture(
    "quick-dependencies-many-initial",
    "The initial metadata scroll position shows whole chosen chips; remaining wrapped chips stay inside the scroll region with fixed footer",
  );
  const lastChip = wrapTasks.at(-1);
  assert.ok(lastChip);
  await page
    .getByTestId(`dependency-initial-${lastChip.id}`)
    .scrollIntoViewIfNeeded();
  const quickMany = await quickGeometry("quick-dependencies-many");
  assert.equal(quickMany.footerTop, quickNone.footerTop);
  assert.ok(quickMany.rowHeight > 32);
  await capture(
    "quick-dependencies-many",
    "Many chips wrap within the scrolling metadata region, with the last chip reachable and fixed footer visible",
  );
  for (const task of [...wrapTasks, resolved])
    await page.getByTestId(`dependency-initial-${task.id}`).click();
  await expect(page.getByLabel("Task title", { exact: true })).toHaveValue(
    "Created with a reviewed Dependency",
  );
  await page.getByRole("button", { name: "Add task", exact: true }).click();
  await expect(page.getByLabel("Task title", { exact: true })).toHaveCount(0);
  const created = (
    await run(
      client.tasks.list({
        params: { profile: Schema.decodeUnknownSync(ProfileId)("work") },
        query: { text: "Created with a reviewed Dependency" },
      }),
    )
  )[0];
  assert.ok(created);
  assert.equal(created.row_version, 1);
  const initialGraph = await run(
    client.tasks.graph({
      params: { profile: created.profile_id, task: created.id },
    }),
  );
  assert.deepEqual(
    initialGraph.edges
      .filter((edge) => edge.dependent_id === created.id)
      .map((edge) => [edge.blocker_id, edge.dependent_id]),
    [[blocker.id, created.id]],
  );
  const initialHistory = await run(
    client.reads.history({
      params: { profile: created.profile_id, task: created.id },
    }),
  );
  assert.equal(initialHistory[0]?.event.kind, "TaskCreated");
  assert.equal(initialHistory[0]?.event.entity_version, 2);
  writeFileSync(
    join(evidence, "initial-create-result.json"),
    JSON.stringify({
      task: created,
      graph: initialGraph,
      history: initialHistory,
    }),
  );
  const donePrerequisite = cli(
    "add",
    "Resolved prerequisite for follow-up",
    "--priority",
    "P4",
  ).task;
  cli("done", donePrerequisite.id, "--expected-version", "1");
  const doneDependent = cli(
    "add",
    "Done delivery that must remain resolved",
    "--priority",
    "P4",
    "--depends-on",
    donePrerequisite.id,
  ).task;
  cli("done", doneDependent.id, "--expected-version", "1");
  await page
    .getByRole("button", { name: "Back to tasks", exact: true })
    .click();
  await page.getByRole("button", { name: "More filters" }).click();
  await page.locator("#filter-status").selectOption("closed");
  await page
    .getByRole("button", { name: "Apply filters", exact: true })
    .click();
  await page
    .locator(`[data-task-id="${donePrerequisite.id}"] .task-content`)
    .click();
  await page
    .getByLabel("Title", { exact: true })
    .fill("Unsaved editor draft remains intact");
  await page.getByRole("button", { name: "Task actions", exact: true }).click();
  await page
    .getByRole("menuitem", { name: "Reopen task", exact: true })
    .click();
  await expect(page.getByTestId("dependency-error")).toContainText(
    "This Task blocks done Tasks and can't be reopened.",
  );
  await expect(page.getByTestId("dependency-error")).toContainText(
    "error 2 - validation or usage",
  );
  await capture(
    "reopen-refused",
    "Actual blocks_done_task refusal keeps the Task resolved and the unsaved editor draft",
  );
  await page.getByTestId("dependency-follow-up").click();
  await expect(
    page.getByTestId(`dependency-initial-${doneDependent.id}`),
  ).toBeVisible();
  await expect(
    page.getByTestId(`dependency-initial-${donePrerequisite.id}`),
  ).toHaveCount(0);
  await page
    .getByLabel("Task title", { exact: true })
    .fill("Follow-up from the done dependent");
  await expect(page.locator(".parsed-draft")).toContainText(
    "Task title: Follow-up from the done dependent",
  );
  await capture(
    "follow-up-preselected",
    "Create follow-up preselects the structured DONE dependent id, preserving the existing editor draft",
  );
  await page.getByRole("button", { name: "Add task", exact: true }).click();
  await expect(page.getByLabel("Task title", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue(
    "Unsaved editor draft remains intact",
  );
  const followUp = (
    await run(
      client.tasks.list({
        params: { profile: Schema.decodeUnknownSync(ProfileId)("work") },
        query: { text: "Follow-up from the done dependent" },
      }),
    )
  )[0];
  assert.ok(followUp);
  assert.equal(followUp.row_version, 1);
  assert.deepEqual(followUp.depends_on, [doneDependent.id]);
  assert.equal(cli("show", donePrerequisite.id).task.status, "done");
  assert.equal(cli("show", doneDependent.id).task.status, "done");
  writeFileSync(
    join(evidence, "follow-up-result.json"),
    JSON.stringify({
      followUp,
      donePrerequisite,
      doneDependent,
      editorDraft: "Unsaved editor draft remains intact",
    }),
  );
  await page
    .getByRole("button", { name: "Back to tasks", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Clear filters", exact: true })
    .click();
  await page.locator(`[data-task-id="${untouched.id}"] .task-content`).click();
  await openDelete();
  delayDelete = true;
  await page.getByTestId("dependency-delete-confirm").click();
  await expect(page.getByTestId("dependency-delete-confirm")).toHaveText(
    "Deleting…",
  );
  await capture(
    "delete-pending",
    "Explicit no-edge confirmation sends a reviewed fingerprint and disables confirmation until the real server reply",
  );
  assert.ok(release);
  release();
  await expect(page.getByTestId("dependency-delete-dialog")).toHaveCount(0);
  assert.equal(
    (
      await run(
        client.tasks.list({
          params: { profile: Schema.decodeUnknownSync(ProfileId)("work") },
          query: { prefix: untouched.id },
        }),
      )
    ).length,
    0,
  );
  await capture(
    "delete-success",
    "The confirmed no-edge Task is absent from a fresh authorized server read",
  );
  const batchRoot = cli("add", "Batch prerequisite", "--priority", "P4").task;
  const batchChanged = cli(
    "add",
    "Batch changed Task",
    "--priority",
    "P4",
  ).task;
  const batchUnchanged = cli(
    "add",
    "Batch already linked",
    "--priority",
    "P4",
    "--depends-on",
    batchRoot.id,
  ).task;
  const batchRefused = cli(
    "add",
    "Batch done candidate",
    "--priority",
    "P4",
  ).task;
  cli("done", batchRefused.id, "--expected-version", "1");
  await page.locator(`[data-task-id="${batchRoot.id}"] .task-content`).click();
  await page
    .getByLabel("Title", { exact: true })
    .fill("Batch root draft remains intact");
  await page.getByTestId("dependency-add").click();
  await page.getByTestId("dependency-blocks").click();
  await page.getByRole("button", { name: "Batch…", exact: true }).click();
  for (const task of [batchChanged, batchUnchanged, batchRefused])
    await page.getByTestId(`dependency-choice-${task.id}`).check();
  await page
    .getByRole("button", { name: "Preview Dependencies", exact: true })
    .click();
  await expect(page.getByTestId("dependency-batch-summary")).toHaveText(
    "Preview: 1 changed · 1 unchanged · 1 refused",
  );
  await expect(page.getByTestId("dependency-batch-row-1")).toContainText(
    "Already linked",
  );
  await expect(page.getByTestId("dependency-batch-row-2")).toContainText(
    "A done Task can only depend on done or cancelled Tasks.",
  );
  await expect(page.getByTestId("dependency-batch-row-2")).toContainText(
    "error 2 - validation or usage",
  );
  assert.equal(cli("show", batchChanged.id).task.row_version, 1);
  await capture(
    "batch-preview",
    "Shared batch dry-run has changed, unchanged and typed refused rows with the actual exit pair and no durable write",
  );
  await page
    .getByTestId("dependency-batch-row-2")
    .locator('[data-testid="dependency-error"] p')
    .last()
    .scrollIntoViewIfNeeded();
  assert.equal(
    await page
      .getByTestId("dependency-batch-row-2")
      .locator('[data-testid="dependency-error"] p')
      .last()
      .evaluate((element) => {
        const box = element.getBoundingClientRect();
        const region = element
          .closest(".dependency-scroll")
          ?.getBoundingClientRect();
        return (
          !!region &&
          box.top >= region.top - 0.5 &&
          box.bottom <= region.bottom + 0.5
        );
      }),
    true,
  );
  await capture(
    "batch-preview-refusal-last",
    "The refused candidate title, witness and muted actual exit pair remain reachable at the end of the batch scroll region",
  );
  await page.getByTestId("dependency-batch-apply").click();
  await expect(page.getByTestId("dependency-batch-summary")).toHaveText(
    "Results: 1 changed · 1 unchanged · 1 refused",
  );
  assert.equal(cli("show", batchChanged.id).task.row_version, 2);
  assert.equal(cli("show", batchUnchanged.id).task.row_version, 1);
  assert.equal(cli("show", batchRefused.id).task.status, "done");
  const batchHistory = await run(
    client.reads.history({
      params: {
        profile: Schema.decodeUnknownSync(ProfileId)("work"),
        task: batchChanged.id,
      },
    }),
  );
  assert.deepEqual(
    batchHistory.map((entry) => entry.event.kind),
    ["TaskCreated", "DependencyAdded"],
  );
  const unchangedHistory = await run(
    client.reads.history({
      params: {
        profile: Schema.decodeUnknownSync(ProfileId)("work"),
        task: batchUnchanged.id,
      },
    }),
  );
  assert.equal(unchangedHistory.length, 1);
  await capture(
    "batch-result",
    "Per-item apply commits the changed edge, keeps the unchanged Version/History, and preserves the refused done Task",
  );
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue(
    "Batch root draft remains intact",
  );
  writeFileSync(
    join(evidence, "batch-result.json"),
    JSON.stringify({
      batchRoot,
      batchChanged,
      batchUnchanged,
      batchRefused,
      batchHistory,
      unchangedHistory,
    }),
  );
  const removeBatchPreview = async () => {
    await page.getByTestId("dependency-add").click();
    await page.getByTestId("dependency-blocks").click();
    await page.getByRole("button", { name: "Batch…", exact: true }).click();
    await page.getByTestId(`dependency-choice-${batchChanged.id}`).check();
    await page
      .getByRole("button", { name: "Preview Dependencies", exact: true })
      .click();
    await expect(page.getByTestId("dependency-batch-summary")).toHaveText(
      "Preview: 0 changed · 1 unchanged · 0 refused",
    );
    await page.getByRole("button", { name: "Remove", exact: true }).click();
    await page.getByRole("button", { name: "Preview", exact: true }).click();
    await expect(page.getByTestId("dependency-batch-summary")).toHaveText(
      "Preview: 1 changed · 0 unchanged · 0 refused",
    );
  };
  await removeBatchPreview();
  holdNotices = true;
  cli(
    "edit",
    batchChanged.id,
    "--title",
    "Concurrent candidate edit",
    "--expected-version",
    "2",
  );
  await page.getByTestId("dependency-batch-apply").click();
  await expect(page.getByTestId("dependency-batch-summary")).toHaveText(
    "Results: 0 changed · 0 unchanged · 1 refused",
  );
  await expect(page.getByTestId("dependency-batch-row-0")).toContainText(
    "error 4 - Conflict",
  );
  await expect(page.getByTestId("dependency-reload")).toBeEnabled();
  await capture(
    "batch-conflict",
    "A real competing CLI edit produces a per-item Conflict with the actual pair; no blind retry occurs",
  );
  while (heldNotices.length) await notify(heldNotices.shift());
  holdNotices = false;
  await page.getByTestId("dependency-reload").click();
  await expect(page.getByTestId("dependency-batch-summary")).toHaveText(
    "Preview: 1 changed · 0 unchanged · 0 refused",
  );
  await expect(page.getByTestId("dependency-batch-row-0")).toContainText(
    "Concurrent candidate edit",
  );
  await capture(
    "batch-reloaded",
    "Explicit Reload refreshes selected dependent Versions and retains selection and root draft; Apply remains a separate action",
  );
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  assert.equal(cli("show", batchChanged.id).task.row_version, 3);
  const cancelledBatch = await run(
    client.tasks.list({
      params: { profile: Schema.decodeUnknownSync(ProfileId)("work") },
      query: { prefix: batchChanged.id },
    }),
  );
  assert.deepEqual(cancelledBatch[0]?.depends_on, [batchRoot.id]);
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue(
    "Batch root draft remains intact",
  );
  await capture(
    "batch-cancelled",
    "Cancel leaves the reviewed edge and dependent Version unchanged, preserving the unsaved editor draft",
  );
  await removeBatchPreview();
  await page.getByTestId("dependency-batch-apply").click();
  await expect(page.getByTestId("dependency-batch-summary")).toHaveText(
    "Results: 1 changed · 0 unchanged · 0 refused",
  );
  await capture(
    "batch-remove-result",
    "The shared batch command removes the reviewed edge using the chosen dependent's latest Version",
  );
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page
    .getByRole("button", { name: "Back to tasks", exact: true })
    .click();
  await expect(
    page.getByTestId(`dependency-state-${batchChanged.id}`),
  ).toHaveCount(0);
  await page
    .locator(`[data-task-id="${batchChanged.id}"] .task-content`)
    .click();
  await page.getByRole("button", { name: "History", exact: true }).click();
  await expect(
    page.getByRole("button", {
      name: "Revert dependency removed change",
      exact: true,
    }),
  ).toBeVisible();
  await capture(
    "history-dependency-deltas",
    "Existing History renders typed DependencyAdded/Removed deltas and exposes the shared Revert action",
  );
  await page
    .getByRole("button", {
      name: "Revert dependency removed change",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("heading", { name: "Task History", exact: true }),
  ).toHaveCount(0);
  const revertedTask = (
    await run(
      client.tasks.list({
        params: { profile: Schema.decodeUnknownSync(ProfileId)("work") },
        query: { prefix: batchChanged.id },
      }),
    )
  )[0];
  assert.equal(revertedTask?.row_version, 5);
  assert.deepEqual(revertedTask?.depends_on, [batchRoot.id]);
  const revertedHistory = await run(
    client.reads.history({
      params: {
        profile: Schema.decodeUnknownSync(ProfileId)("work"),
        task: batchChanged.id,
      },
    }),
  );
  const inverse = revertedHistory.at(-1)?.event;
  assert.ok(inverse?.kind === "TaskReverted" && inverse.entity_version === 2);
  assert.deepEqual(
    inverse.dependencies.added.map((edge) => [
      edge.blocker_id,
      edge.dependent_id,
    ]),
    [[batchRoot.id, batchChanged.id]],
  );
  writeFileSync(
    join(evidence, "batch-conflict-revert-result.json"),
    JSON.stringify({ cancelledBatch, revertedTask, revertedHistory }),
  );
  await page
    .getByRole("button", { name: "Back to tasks", exact: true })
    .click();
  const projectionTasks = dependencyRefusals.map(
    ({ error }) => cli("add", `Report projection ${error.code}`).task,
  );
  await page.locator(`[data-task-id="${batchRoot.id}"] .task-content`).click();
  await page.getByTestId("dependency-add").click();
  await page.getByRole("button", { name: "Batch…", exact: true }).click();
  await page
    .getByTestId("dependency-initial-picker")
    .getByRole("textbox")
    .fill("Report projection");
  for (const task of projectionTasks)
    await page.getByTestId(`dependency-choice-${task.id}`).check();
  reportFixture = "batch";
  await page
    .getByRole("button", { name: "Preview Dependencies", exact: true })
    .click();
  for (const phase of ["preview", "apply"]) {
    for (const [index, fixture] of dependencyRefusals.entries()) {
      const row = page.getByTestId(`dependency-batch-row-${index}`);
      await expect(row).toContainText(fixture.human);
      await expect(row).toContainText(
        `Can't add ${projectionTasks[index]?.title}.`,
      );
      await expect(row).toContainText("error 2 - validation or usage");
      await expect(row).not.toContainText("AGENT ONLY");
      await row.scrollIntoViewIfNeeded();
      await capture(
        `batch-${phase}-${fixture.error.code}`,
        "Controlled typed Dependency report fixture uses the same production projector and excludes agent text; this capture does not claim the server caused this refusal",
        "compact",
        row,
      );
    }
    if (phase === "preview")
      await page.getByTestId("dependency-batch-apply").click();
  }
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByTestId("dependency-add").click();
  await page.getByRole("button", { name: "Batch…", exact: true }).click();
  await page
    .getByTestId("dependency-initial-picker")
    .getByRole("textbox")
    .fill("Report projection");
  for (const task of projectionTasks)
    await page.getByTestId(`dependency-choice-${task.id}`).check();
  reportFixture = "batchSelf";
  await page
    .getByRole("button", { name: "Preview Dependencies", exact: true })
    .click();
  await expect(page.getByTestId("dependency-batch-row-0")).toContainText(
    "A Task can't depend on itself.",
  );
  await expect(page.getByTestId("dependency-batch-row-0")).toContainText(
    "error 2 - validation or usage",
  );
  await expect(page.getByTestId("dependency-batch-row-0")).not.toContainText(
    "AGENT ONLY",
  );
  await capture(
    "batch-self-cycle-projection",
    "Controlled typed self-cycle report exercises the same projector and actual pair; this is not a public self-edge write",
  );
  const batchFollowUp = page
    .getByTestId("dependency-batch-row-3")
    .getByTestId("dependency-follow-up");
  await expect(batchFollowUp).toBeEnabled();
  await batchFollowUp.click();
  reportFixture = null;
  await expect(page.getByTestId(`dependency-initial-${done.id}`)).toBeVisible();
  await page
    .getByLabel("Task title", { exact: true })
    .fill("Follow-up from a captured batch refusal");
  await expect(page.locator(".parsed-draft")).toContainText(
    "Task title: Follow-up from a captured batch refusal",
  );
  await capture(
    "batch-follow-up-preselected",
    "A typed report's Create follow-up opens the existing add flow with the captured DONE Task, without an automatic write",
  );
  await page.getByTestId(`dependency-initial-${done.id}`).click();
  await page
    .locator(".quick-dialog")
    .getByRole("button", { name: "Close", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Back to tasks", exact: true })
    .click();
  await openImport(page);
  const importFile = join(scratch, "dependency-errors.json");
  writeFileSync(
    importFile,
    JSON.stringify(
      Array.from({ length: 8 }, (_, index) => ({
        external_id: `projection:${index}`,
        title: `Import candidate ${index + 1}`,
        ...(index === 2 ? { status: "done" } : {}),
      })),
    ),
  );
  await page.locator('input[type="file"]').setInputFiles(importFile);
  reportFixture = "import";
  await page
    .getByRole("button", { name: "Preview changes", exact: true })
    .click();
  for (let index = 0; index < 8; index++) {
    const row = page.locator(".import-row").nth(index);
    const expected =
      index === 2
        ? "Finish or cancel these Dependencies before marking this Task done."
        : (dependencyRefusals[index]?.human ??
          "This Task changed. Reload its Dependencies before trying again.");
    await expect(row).toContainText(expected);
    await expect(row).not.toContainText("AGENT ONLY");
    await expect(row).toContainText(
      index < 6 ? "error 2 - validation or usage" : "error 4 - Conflict",
    );
    await row.scrollIntoViewIfNeeded();
    await capture(
      `import-dependency-error-${index}`,
      "Controlled nested Dependency or Conflict report fixture uses production Import rows and the shared projector, retaining the actual pair without agent copy",
      "compact",
      row,
    );
  }
  const importBlocker = page
    .locator(".import-row")
    .nth(2)
    .getByRole("button", { name: blocker.title, exact: true });
  await expect(importBlocker).toBeEnabled();
  await importBlocker.click();
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue(
    blocker.title,
  );
  await capture(
    "import-open-blocker",
    "The complete-context nested refusal opens the captured authorized blocker only after the user chooses it",
  );
  await page
    .getByRole("button", { name: "Back to tasks", exact: true })
    .click();
  await openImport(page);
  await page.locator('input[type="file"]').setInputFiles(importFile);
  await page
    .getByRole("button", { name: "Preview changes", exact: true })
    .click();
  const importFollowUp = page
    .locator(".import-row")
    .nth(3)
    .getByTestId("dependency-follow-up");
  await expect(importFollowUp).toBeEnabled();
  await importFollowUp.click();
  reportFixture = null;
  await expect(page.getByTestId(`dependency-initial-${done.id}`)).toBeVisible();
  await page
    .getByLabel("Task title", { exact: true })
    .fill("Follow-up from a captured nested Import refusal");
  await expect(page.locator(".parsed-draft")).toContainText(
    "Task title: Follow-up from a captured nested Import refusal",
  );
  await capture(
    "import-follow-up-preselected",
    "Nested Import recovery reuses the existing follow-up flow with the captured DONE Task and no automatic write",
  );
  await page.getByTestId(`dependency-initial-${done.id}`).click();
  await page
    .locator(".quick-dialog")
    .getByRole("button", { name: "Close", exact: true })
    .click();
  const sameDependent = cli("add", "Same-dependent batch Version fixture").task;
  cli("done", sameDependent.id, "--expected-version", "1");
  await page
    .locator(`[data-task-id="${sameDependent.id}"] .task-content`)
    .click();
  await page.getByTestId("dependency-add").click();
  await page.getByRole("button", { name: "Batch…", exact: true }).click();
  for (const candidate of [blocker, resolved])
    await page.getByTestId(`dependency-choice-${candidate.id}`).check();
  await page
    .getByRole("button", { name: "Preview Dependencies", exact: true })
    .click();
  await expect(page.getByTestId("dependency-batch-summary")).toHaveText(
    "Preview: 0 changed · 0 unchanged · 2 refused",
  );
  await expect(page.getByTestId("dependency-batch-apply")).toBeDisabled();
  await page.getByTestId("dependency-reload").click();
  await expect(page.getByTestId("dependency-batch-summary")).toHaveText(
    "Preview: 1 changed · 0 unchanged · 1 refused",
  );
  assert.equal(cli("show", sameDependent.id).task.row_version, 2);
  const beforeSameApply = await run(
    client.tasks.graph({
      params: {
        profile: Schema.decodeUnknownSync(ProfileId)("work"),
        task: sameDependent.id,
      },
    }),
  );
  assert.equal(
    beforeSameApply.edges.filter(
      (edge) => edge.dependent_id === sameDependent.id,
    ).length,
    0,
  );
  await capture(
    "batch-same-dependent-preview",
    "Explicit Reload uses the server preview's refused-first result; dry-run leaves the done dependent at Version 2 without an edge",
  );
  await page.getByTestId("dependency-batch-apply").click();
  await expect(page.getByTestId("dependency-batch-summary")).toHaveText(
    "Results: 1 changed · 0 unchanged · 1 refused",
  );
  assert.equal(cli("show", sameDependent.id).task.row_version, 3);
  assert.equal(cli("show", sameDependent.id).task.status, "done");
  const afterSameApply = await run(
    client.tasks.graph({
      params: {
        profile: Schema.decodeUnknownSync(ProfileId)("work"),
        task: sameDependent.id,
      },
    }),
  );
  assert.deepEqual(
    afterSameApply.edges
      .filter((edge) => edge.dependent_id === sameDependent.id)
      .map((edge) => edge.blocker_id),
    [resolved.id],
  );
  writeFileSync(
    join(evidence, "batch-same-dependent-versions.json"),
    JSON.stringify({
      beforeSameApply,
      afterSameApply,
      from_version: 2,
      to_version: 3,
      refused_blocker: blocker.id,
      added_blocker: resolved.id,
    }),
  );
  await capture(
    "batch-same-dependent-result",
    "Per-item apply refuses the unresolved blocker, adds only the cancelled blocker and advances the shared dependent once, from 2 to 3",
  );
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page
    .getByRole("button", { name: "Back to tasks", exact: true })
    .click();
  const dragSource = cli("add", "Drag source").task;
  const dragTarget = cli("add", "Drag target", "--due", "2026-11-12").task;
  const sourceButton = page.getByTestId(
    `dependency-drag-source-${dragSource.id}`,
  );
  const targetButton = page.getByTestId(
    `dependency-drag-source-${dragTarget.id}`,
  );
  await expect(sourceButton).toBeVisible();
  const transfer = await page.evaluateHandle(() => new DataTransfer());
  const beginDrag = async () =>
    sourceButton.dispatchEvent("dragstart", { dataTransfer: transfer });
  const hoverTarget = async () => {
    await targetButton.scrollIntoViewIfNeeded();
    await targetButton.dispatchEvent("dragover", { dataTransfer: transfer });
    await targetButton.scrollIntoViewIfNeeded();
  };
  const edgeWrites = () =>
    actions.filter((action) =>
      Schema.is(
        Schema.Struct({
          request: Schema.Struct({ _tag: Schema.Literal("depend") }),
        }),
      )(action),
    ).length;
  const rowFrames = () =>
    page.locator(".task-row[data-task-id]").evaluateAll((rows) =>
      rows.map((row) => ({
        id: row.getAttribute("data-task-id"),
        ...row.getBoundingClientRect().toJSON(),
      })),
    );
  await targetButton.scrollIntoViewIfNeeded();
  const allowedFrames = await rowFrames();
  await beginDrag();
  await hoverTarget();
  await expect(page.getByTestId("dependency-drop-status")).toContainText(
    "Will depend on Drag source",
  );
  const allowedAfter = await rowFrames();
  assert.deepEqual(allowedAfter, allowedFrames);
  const dragBounds = await page
    .getByTestId(`dependency-drop-target-${dragTarget.id}`)
    .evaluate((row) => {
      const statusElement = document.querySelector(
        '[data-testid="dependency-drop-status"]',
      );
      const status = statusElement?.getBoundingClientRect();
      const title = row.querySelector(".task-title")?.getBoundingClientRect();
      const metadataElement = row.querySelector(
        ".compact-row-metadata, .task-meta",
      );
      const metadata = metadataElement?.getBoundingClientRect();
      if (!status || !title || !metadata)
        throw new Error("Missing drag target geometry");
      const overlaps = (box: DOMRect) =>
        status.left < box.right &&
        status.right > box.left &&
        status.top < box.bottom &&
        status.bottom > box.top;
      return {
        titleOverlap: overlaps(title),
        replacesMetadata:
          statusElement !== null && metadataElement?.contains(statusElement),
        fullAccessibleValue: statusElement?.getAttribute("aria-label"),
        status: status.toJSON(),
        title: title.toJSON(),
        metadata: metadata.toJSON(),
      };
    });
  assert.equal(dragBounds.titleOverlap, false);
  assert.equal(dragBounds.replacesMetadata, true);
  assert.equal(
    dragBounds.fullAccessibleValue,
    "Drag target will depend on Drag source",
  );
  writeFileSync(
    join(evidence, "drag-hover-bounds.json"),
    JSON.stringify(dragBounds),
  );
  await capture(
    "drag-hover",
    "Production list drag shows the exact SOURCE to TARGET relation without overlapping the target title or metadata",
    "compact",
    targetButton,
  );
  release = undefined;
  delay = true;
  await targetButton.dispatchEvent("drop", { dataTransfer: transfer });
  await sourceButton.dispatchEvent("dragend", { dataTransfer: transfer });
  await expect(page.getByTestId("dependency-drop-status")).toContainText(
    "Updating Dependencies",
  );
  assert.deepEqual(await rowFrames(), allowedFrames);
  await expect.poll(() => release !== undefined).toBe(true);
  await capture(
    "drag-pending",
    "The target remains pending while the same validated depend request waits; no extra row write is sent",
    "compact",
    targetButton,
  );
  releasePending();
  await expect(page.getByTestId("dependency-drop-status")).toContainText(
    "Dependency added",
  );
  const dragged = await run(
    client.tasks.list({
      params: { profile: Schema.decodeUnknownSync(ProfileId)("work") },
      query: { prefix: dragTarget.id },
    }),
  );
  assert.deepEqual(dragged[0]?.depends_on, [dragSource.id]);
  await capture(
    "drag-result",
    "A fresh authorized read proves TARGET depends on SOURCE",
  );
  await page
    .getByTestId("dependency-drop-status")
    .getByRole("button", { name: "Dismiss", exact: true })
    .click();
  await targetButton.scrollIntoViewIfNeeded();
  const alreadyFrames = await rowFrames();
  await beginDrag();
  await hoverTarget();
  await expect(page.getByTestId("dependency-drop-status")).toContainText(
    "Already depends on Drag source",
  );
  const alreadyAfter = await rowFrames();
  assert.deepEqual(alreadyAfter, alreadyFrames);
  const alreadyCount = edgeWrites();
  await capture(
    "drag-already-linked",
    "An existing relation is guidance and does not send a write",
    "compact",
    targetButton,
  );
  await targetButton.dispatchEvent("drop", { dataTransfer: transfer });
  assert.equal(edgeWrites(), alreadyCount);
  await sourceButton.dispatchEvent("dragend", { dataTransfer: transfer });
  await sourceButton.scrollIntoViewIfNeeded();
  const selfFrames = await rowFrames();
  await beginDrag();
  await sourceButton.dispatchEvent("dragover", { dataTransfer: transfer });
  await expect(page.getByTestId("dependency-drop-status")).toContainText(
    "A Task can't depend on itself.",
  );
  const selfAfter = await rowFrames();
  assert.deepEqual(selfAfter, selfFrames);
  await capture(
    "drag-self",
    "Self-drop is not allowed and cannot commit",
    "compact",
    sourceButton,
  );
  await sourceButton.dispatchEvent("drop", { dataTransfer: transfer });
  assert.equal(edgeWrites(), alreadyCount);
  await sourceButton.dispatchEvent("dragend", { dataTransfer: transfer });
  const foreign = await page.evaluateHandle(() => {
    const data = new DataTransfer();
    data.setData(
      "application/x-todo-task-dependency",
      JSON.stringify({ v: 1, profile: "foreign", task: "foreign-secret" }),
    );
    return data;
  });
  await targetButton.scrollIntoViewIfNeeded();
  const foreignFrames = await rowFrames();
  await targetButton.dispatchEvent("dragover", { dataTransfer: foreign });
  await expect(page.getByTestId("dependency-drop-status")).toContainText(
    "Choose a Task in this Profile.",
  );
  await expect(page.getByTestId("dependency-drop-status")).not.toContainText(
    "foreign-secret",
  );
  const foreignAfter = await rowFrames();
  assert.deepEqual(foreignAfter, foreignFrames);
  writeFileSync(
    join(evidence, "drag-no-row-shifts.json"),
    JSON.stringify({
      allowed: { before: allowedFrames, after: allowedAfter },
      already: { before: alreadyFrames, after: alreadyAfter },
      self: { before: selfFrames, after: selfAfter },
      foreign: { before: foreignFrames, after: foreignAfter },
      unchanged: true,
    }),
  );
  await capture(
    "drag-foreign",
    "An untrusted foreign payload cannot commit or disclose a foreign Task title",
    "compact",
    targetButton,
  );
  await targetButton.dispatchEvent("drop", { dataTransfer: foreign });
  assert.equal(edgeWrites(), alreadyCount);
  await targetButton.dispatchEvent("dragleave", { dataTransfer: foreign });
  const reverse = await page.evaluateHandle(() => new DataTransfer());
  await targetButton.dispatchEvent("dragstart", { dataTransfer: reverse });
  await sourceButton.dispatchEvent("dragover", { dataTransfer: reverse });
  await sourceButton.dispatchEvent("drop", { dataTransfer: reverse });
  await targetButton.dispatchEvent("dragend", { dataTransfer: reverse });
  await expect(page.getByTestId("dependency-drop-status")).toContainText(
    "Can't add Drag target. This Dependency would create a loop.",
  );
  await capture(
    "drag-cycle-refusal",
    "The authoritative server refuses a reverse drag cycle and names the attempted blocker",
  );
  await page
    .getByTestId("dependency-drop-status")
    .getByRole("button", { name: "Dismiss", exact: true })
    .click();
  const dragDone = cli("add", "Drag done target").task;
  cli("done", dragDone.id, "--expected-version", "1");
  await page.getByRole("button", { name: "More filters" }).click();
  await page.locator("#filter-status").selectOption("");
  await page
    .getByRole("button", { name: "Apply filters", exact: true })
    .click();
  const doneButton = page.getByTestId(`dependency-drag-source-${dragDone.id}`);
  await expect(doneButton).toBeVisible();
  await beginDrag();
  await doneButton.dispatchEvent("dragover", { dataTransfer: transfer });
  await doneButton.dispatchEvent("drop", { dataTransfer: transfer });
  await sourceButton.dispatchEvent("dragend", { dataTransfer: transfer });
  await expect(page.getByTestId("dependency-drop-status")).toContainText(
    "A done Task can only depend on done or cancelled Tasks.",
  );
  await expect(page.getByTestId("dependency-drop-status")).toContainText(
    "error 2 - validation or usage",
  );
  assert.equal(cli("show", dragDone.id).task.status, "done");
  await capture(
    "drag-blocked-refusal",
    "The server refuses an unresolved blocker on a done drop target and keeps it done",
  );
  await page
    .getByTestId("dependency-drop-status")
    .getByRole("button", { name: "Dismiss", exact: true })
    .click();
  const conflictTarget = cli("add", "Drag Conflict target").task;
  const conflictButton = page.getByTestId(
    `dependency-drag-source-${conflictTarget.id}`,
  );
  await expect(conflictButton).toBeVisible();
  await beginDrag();
  await conflictButton.dispatchEvent("dragover", { dataTransfer: transfer });
  release = undefined;
  delay = true;
  await conflictButton.dispatchEvent("drop", { dataTransfer: transfer });
  await sourceButton.dispatchEvent("dragend", { dataTransfer: transfer });
  await expect.poll(() => release !== undefined).toBe(true);
  cli(
    "edit",
    conflictTarget.id,
    "--expected-version",
    "1",
    "--desc",
    "Concurrent drag edit",
  );
  releasePending();
  await expect(page.getByTestId("dependency-drop-status")).toContainText(
    "This Task changed. Reload its Dependencies before trying again.",
  );
  await expect(page.getByTestId("dependency-drop-status")).toContainText(
    "error 4 - Conflict",
  );
  await expect(
    page.getByRole("button", { name: "Retry", exact: true }),
  ).toHaveCount(0);
  await capture(
    "drag-conflict",
    "The real stale dependent Version refuses the drop and offers Reload without a blind retry",
  );
  await page.getByTestId("dependency-reload").click();
  await expect(page.getByTestId("dependency-search")).toBeFocused();
  await page.getByTestId("dependency-picker-close").click();
  await expect(conflictButton).toBeFocused();
  await targetButton.click();
  const editorTitle = page.getByLabel("Title", { exact: true });
  await editorTitle.fill("Unsaved keyboard Dependency draft");
  await editorTitle.press("Control+k");
  await expect(page.getByTestId("dependency-picker")).toHaveCount(0);
  await editorTitle.press("Control+Shift+K");
  await expect(page.getByTestId("dependency-search")).toBeFocused();
  await page.getByTestId("dependency-search").press("ArrowDown");
  await expect(
    page.getByTestId(`dependency-choice-${dragSource.id}`),
  ).toBeFocused();
  await page.getByTestId(`dependency-choice-${dragSource.id}`).press("Space");
  await expect(
    page.getByTestId(`dependency-choice-${dragSource.id}`),
  ).not.toBeChecked();
  await capture(
    "keyboard-picker",
    "Control Shift K opens the same picker, ArrowDown moves focus and Space toggles the existing link immediately",
  );
  await page.getByTestId("dependency-picker-close").click();
  await expect(editorTitle).toBeFocused();
  await expect(editorTitle).toHaveValue("Unsaved keyboard Dependency draft");
  await page.getByRole("button", { name: "Task actions", exact: true }).click();
  await page
    .getByRole("menuitem", { name: "Add dependency", exact: true })
    .click();
  await page.getByTestId("dependency-search").fill("Drag source");
  await expect(
    page.getByTestId(`dependency-choice-${dragSource.id}`),
  ).not.toBeChecked();
  await page.getByTestId(`dependency-choice-${dragSource.id}`).press("Space");
  await expect(
    page.getByTestId(`dependency-choice-${dragSource.id}`),
  ).toBeChecked();
  await capture(
    "menu-picker",
    "The existing menu opens the same picker and preserves the editor draft",
  );
  await page.getByTestId("dependency-picker-close").click();
  await expect(editorTitle).toHaveValue("Unsaved keyboard Dependency draft");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Resolve task conflict", exact: true }),
  ).toBeVisible();
  await capture(
    "dependency-editor-version-conflict",
    "Immediate Dependency writes do not blindly advance an unsaved editor's expected Version; Save uses the existing Conflict flow",
  );
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Close", exact: true })
    .click();
  assert.equal(cli("show", plain.id).task.title, "Review tomorrow");
  const removedRoot = cli("add", "A root removed while its graph is open").task;
  await page
    .getByRole("button", { name: "Back to tasks", exact: true })
    .click();
  await page
    .locator(`[data-task-id="${removedRoot.id}"] .task-content`)
    .click();
  await openGraph();
  await expect(page.getByTestId("dependency-graph-overview")).toHaveCount(0);
  await expect(page.locator(".dependency-graph-controls small")).toHaveText(
    "1 of 1 Task shown",
  );
  await capture(
    "graph-singleton",
    "A singleton graph shows its root details, no direct Dependencies and a Ready root in Lightest next",
  );
  await page.getByRole("button", { name: "Diagram", exact: true }).click();
  await expect(
    page
      .frameLocator('[data-testid="dependency-graph-diagram"]')
      .locator(".pele-node:not(.graph-hidden)"),
  ).toHaveCount(1);
  const singletonNode = page
    .frameLocator('[data-testid="dependency-graph-diagram"]')
    .locator(`[data-task-id="${removedRoot.id}"]`);
  await expect(singletonNode).toHaveAttribute(
    "aria-label",
    `${removedRoot.title}, ready`,
  );
  await expect(singletonNode).toHaveAttribute("data-state", "ready");
  await expect(singletonNode).toHaveAttribute("data-root", "true");
  const removedParams = {
    profile: Schema.decodeUnknownSync(ProfileId)("work"),
    task: removedRoot.id,
  };
  const removedPreview = await run(
    client.tasks.delete({
      params: removedParams,
      query: { dry_run: true, from_version: removedRoot.row_version },
    }),
  );
  assert.ok(removedPreview.dependency_fingerprint);
  await run(
    client.tasks.delete({
      params: removedParams,
      query: {
        from_version: removedRoot.row_version,
        with_dependencies: true,
        dependency_fingerprint: removedPreview.dependency_fingerprint,
      },
    }),
  );
  await expect(page.getByTestId("dependency-graph")).toContainText(
    "Task not found",
  );
  await expect(page.getByTestId("dependency-graph-diagram")).toHaveCount(0);
  await expect(page.getByTestId("dependency-graph")).toContainText(
    "error 3 - not found or auth missing",
  );
  await capture(
    "graph-deleted-root",
    "A real root deletion clears stale diagram data, keeps the actual exit pair and offers explicit Find Task by id",
  );
  const lookupReads = () =>
    actions.filter((entry) =>
      Schema.is(
        Schema.Struct({
          request: Schema.Struct({ _tag: Schema.Literal("lookup") }),
        }),
      )(entry),
    ).length;
  const priorLookupReads = lookupReads();
  await page
    .getByRole("button", { name: "Find Task by id", exact: true })
    .click();
  await expect(page.getByTestId("dependency-graph")).toHaveCount(0);
  await expect(page.getByTestId("discovery-prefix")).toHaveValue(
    removedRoot.id,
  );
  assert.equal(lookupReads(), priorLookupReads);
  await capture(
    "graph-deleted-lookup",
    "Find Task by id preselects only the known id and waits for an explicit Find; no automatic cross-Profile lookup",
  );
  await page.getByTestId("discovery-close").click();
  await page.getByRole("button", { name: "Task actions", exact: true }).click();
  await page
    .getByRole("menuitem", { name: "Delete task", exact: true })
    .click();
  await expect(page.getByTestId("dependency-delete-dialog")).toContainText(
    "error 3 - not found or auth missing",
  );
  await expect(page.getByTestId("dependency-delete-confirm")).toBeDisabled();
  await capture(
    "delete-missing-pair",
    "A missing Task Delete preview retains its typed failure and actual exit pair; confirmation remains disabled",
  );
  await page.getByTestId("dependency-delete-cancel").click();
  await page
    .getByRole("button", { name: "Back to tasks", exact: true })
    .click();
  const seriesBase = cli("add", "Recurring initial Dependency fixture").task;
  await page.locator(`[data-task-id="${seriesBase.id}"] .task-content`).click();
  await page.getByRole("button", { name: "Recurrence", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Create Series", exact: true }),
  ).toBeVisible();
  await page
    .locator(".recurrence-dialog")
    .getByRole("button", { name: "Add Dependencies", exact: true })
    .click();
  await page
    .getByTestId("dependency-initial-picker")
    .getByRole("textbox")
    .fill(blocker.title);
  await page.getByTestId(`dependency-choice-${blocker.id}`).check();
  await page.getByTestId("dependency-initial-done").click();
  await expect(
    page.getByTestId(`dependency-initial-${blocker.id}`),
  ).toBeVisible();
  const initialSeriesChip = await page
    .getByTestId(`dependency-initial-${blocker.id}`)
    .evaluate((chip) => {
      const body = chip
        .closest('[data-slot="field-group"]')
        ?.getBoundingClientRect();
      return {
        chip: chip.getBoundingClientRect().toJSON(),
        body: body?.toJSON(),
      };
    });
  assert.ok(
    initialSeriesChip.body &&
      initialSeriesChip.chip.top >= initialSeriesChip.body.top &&
      initialSeriesChip.chip.bottom <= initialSeriesChip.body.bottom,
    JSON.stringify(initialSeriesChip),
  );
  await page
    .locator('.recurrence-dialog > [data-slot="field-group"]')
    .evaluate((body) => {
      body.scrollTop = 0;
    });
  await capture(
    "new-recurring-dependencies",
    "The real Create Series form includes a removable initial Dependency in its scrolling form",
  );
  const recurrenceGeometry = await page
    .locator(".recurrence-dialog")
    .evaluate((dialog) => {
      const footer = dialog
        .querySelector(".recurrence-footer")
        ?.getBoundingClientRect();
      const title = dialog
        .querySelector('[data-slot="dialog-title"]')
        ?.getBoundingClientRect();
      const body = dialog
        .querySelector('[data-slot="field-group"]')
        ?.getBoundingClientRect();
      const firstField = dialog
        .querySelector('[data-slot="field-group"] > [data-slot="field"]')
        ?.getBoundingClientRect();
      const chip = dialog
        .querySelector('[data-testid^="dependency-initial-"]')
        ?.getBoundingClientRect();
      return {
        dialog: dialog.getBoundingClientRect().toJSON(),
        body: body?.toJSON(),
        firstField: firstField?.toJSON(),
        chip: chip?.toJSON(),
        footer: footer?.toJSON(),
        title: title?.toJSON(),
        viewport: innerHeight,
      };
    });
  writeFileSync(
    join(evidence, "recurrence-initial-geometry.json"),
    JSON.stringify(recurrenceGeometry),
  );
  assert.ok(
    recurrenceGeometry.dialog.top >= 8 &&
      recurrenceGeometry.dialog.bottom <= 418 &&
      recurrenceGeometry.footer &&
      recurrenceGeometry.title &&
      recurrenceGeometry.footer.bottom <= 426 &&
      recurrenceGeometry.title.top >= 0,
    JSON.stringify(recurrenceGeometry),
  );
  assert.ok(
    recurrenceGeometry.body &&
      recurrenceGeometry.firstField &&
      recurrenceGeometry.chip,
  );
  for (const row of [recurrenceGeometry.firstField, recurrenceGeometry.chip])
    assert.ok(
      row.top >= recurrenceGeometry.body.top &&
        row.bottom <= recurrenceGeometry.body.bottom,
      JSON.stringify(recurrenceGeometry),
    );
  await page
    .getByRole("button", { name: "Create Series", exact: true })
    .click();
  await expect(page.locator(".recurrence-dialog")).toHaveCount(0);
  const occurrences = await run(
    client.tasks.list({
      params: { profile: Schema.decodeUnknownSync(ProfileId)("work") },
      query: { text: seriesBase.title },
    }),
  );
  const firstOccurrence = occurrences.find((task) => task.occurrence !== null);
  assert.ok(firstOccurrence);
  assert.equal(firstOccurrence.row_version, 1);
  assert.deepEqual(firstOccurrence.depends_on, [blocker.id]);
  await page
    .getByRole("button", { name: "Back to tasks", exact: true })
    .click();
  await page
    .locator(`[data-task-id="${firstOccurrence.id}"]`)
    .getByRole("button", {
      name: `Complete ${firstOccurrence.title}`,
      exact: true,
    })
    .click();
  await expect(page.getByTestId("dependency-error")).toContainText(
    "Finish or cancel these Dependencies before marking this Task done.",
  );
  await expect(page.getByTestId("dependency-error")).toContainText(
    "error 2 - validation or usage",
  );
  assert.equal(cli("show", firstOccurrence.id).task.status, "open");
  await capture(
    "blocked-completion",
    "The real initial Occurrence cannot complete while its blocker is open; the Task stays open with deliberate blocker recovery",
  );
  await page
    .getByTestId("dependency-error")
    .getByRole("button", { name: blocker.title, exact: true })
    .click();
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue(
    blocker.title,
  );
  await capture(
    "blocked-open-blocker",
    "Choosing a captured blocker opens the existing editor without automatically completing or cancelling either Task",
  );
  await page
    .getByRole("button", { name: "Back to tasks", exact: true })
    .click();
  await page
    .locator(`[data-task-id="${firstOccurrence.id}"] .task-content`)
    .click();
  await page.getByRole("button", { name: "Recurrence", exact: true }).click();
  await page
    .getByRole("button", { name: "Skip Occurrence", exact: true })
    .click();
  await expect(page.locator(".recurrence-dialog")).toHaveCount(0);
  const afterSkip = await run(
    client.tasks.list({
      params: { profile: firstOccurrence.profile_id },
      query: { text: seriesBase.title },
    }),
  );
  const successor = afterSkip.find(
    (task) => task.occurrence !== null && task.id !== firstOccurrence.id,
  );
  assert.ok(successor);
  assert.equal(successor.status, "open");
  assert.equal(successor.row_version, 1);
  assert.deepEqual(successor.depends_on, []);
  assert.equal(cli("show", firstOccurrence.id).task.status, "cancelled");
  writeFileSync(
    join(evidence, "initial-occurrence-result.json"),
    JSON.stringify({ seriesBase, firstOccurrence, successor }),
  );
  await page
    .getByRole("button", { name: "Back to tasks", exact: true })
    .click();
  const successorRow = page.locator(`[data-task-id="${successor.id}"]`);
  await successorRow.scrollIntoViewIfNeeded();
  await expect(successorRow).toContainText(successor.title);
  await expect(
    page.getByTestId(`dependency-state-${successor.id}`),
  ).toHaveCount(0);
  await capture(
    "initial-occurrence-successor",
    "Fresh public reads prove that initial Dependencies applied only to the first Occurrence and the open successor inherited none",
    "compact",
    successorRow,
  );
  const searchRecovery = await verifyDependencySearchRecovery({
    page,
    root: blocked,
    blocker,
    cli,
    capture,
    probe: searchProbe,
    holdUpdates: async (hold) => {
      holdNotices = hold;
      if (!hold) while (heldNotices.length) await notify(heldNotices.shift());
    },
  });
  writeFileSync(
    join(evidence, "search-recovery.json"),
    JSON.stringify(searchRecovery, null, 2),
  );
  await page
    .getByRole("button", { name: "Back to tasks", exact: true })
    .click();
  const readiness = await verifyDependencyReadiness({
    page,
    client,
    cli,
    capture,
    database: env.TODO_DB,
  });
  writeFileSync(
    join(evidence, "readiness-results.json"),
    JSON.stringify(readiness, null, 2),
  );
  const graphMatrix = await verifyDependencyGraphs({
    page,
    client,
    cli,
    capture,
    notify,
    readGate: {
      pause: () => {
        delayGraph = true;
      },
      pending: () => release !== undefined,
      resume: releasePending,
    },
  });
  writeFileSync(
    join(evidence, "graph-matrix-results.json"),
    JSON.stringify(graphMatrix, null, 2),
  );
  const edgeCases = await verifyDependencyEdgeCases({
    page,
    client,
    cli,
    capture,
    notify,
    requests,
    responses,
    holdUpdates: async (hold) => {
      holdNotices = hold;
      if (!hold) while (heldNotices.length) await notify(heldNotices.shift());
    },
    pause: (kind) => {
      if (kind === "relation") delay = true;
      else delayPreview = true;
    },
    pending: () => release !== undefined,
    resume: releasePending,
  });
  writeFileSync(
    join(evidence, "edge-cases-results.json"),
    JSON.stringify(edgeCases, null, 2),
  );
  const recovery = await verifyDependencyRecovery({
    page,
    client,
    cli,
    capture,
    notify,
    deliveries,
    holdUpdates: async (hold) => {
      holdNotices = hold;
      if (!hold) while (heldNotices.length) await notify(heldNotices.shift());
    },
    probe: readProbe,
    prepareOtherProfile: () => {
      cliInProfile("recovery-other", "login", "--password-stdin");
      cliInProfile("recovery-other", "add", "Other Profile recovery Task");
    },
    pauseGraph: () => {
      delayGraph = true;
    },
    pending: () => release !== undefined,
    resume: releasePending,
    signOut: async () => {
      await run(client.credentials.signOut());
      credential = undefined;
      if (stream) {
        await Effect.runPromise(Fiber.interrupt(stream));
        stream = undefined;
      }
      await notify({ _tag: "signedOut" });
    },
  });
  writeFileSync(
    join(evidence, "dependency-recovery-results.json"),
    JSON.stringify(recovery, null, 2),
  );
  const pickerRecovery = await verifyDependencyPickerRecovery({
    page,
    client,
    cli,
    capture,
    deliveries,
    failures: sdkFailures,
    readGate: {
      pause: () => {
        delayCandidates = true;
      },
      pending: () => release !== undefined,
      resume: releasePending,
    },
    replyGate: {
      pause: () => {
        delayCandidateReply = true;
      },
      pending: () => heldCandidateReply,
      resume: releasePending,
    },
    signOut: async () => {
      await run(client.credentials.signOut());
      credential = undefined;
      if (stream) {
        await Effect.runPromise(Fiber.interrupt(stream));
        stream = undefined;
      }
      await notify({ _tag: "signedOut" });
    },
  });
  writeFileSync(
    join(evidence, "dependency-picker-recovery.json"),
    JSON.stringify(pickerRecovery, null, 2),
  );
  const lifecycle: unknown[] = [];
  await verifyDependencyLifecycle({
    page,
    client,
    cli,
    capture,
    notify,
    prepareOtherProfile: () => {
      cliInProfile("recovery-other", "login", "--password-stdin");
      cliInProfile("recovery-other", "add", "Other Profile lifecycle Task");
    },
    record: (receipt) => {
      lifecycle.push(receipt);
      writeFileSync(
        join(evidence, "dependency-lifecycle.json"),
        JSON.stringify(lifecycle, null, 2),
      );
    },
  });
  const titleDrag: unknown[] = [];
  await verifyDependencyTitleDrag({
    page,
    cli,
    capture: captureOne,
    notify,
    record: (receipt) => {
      titleDrag.push(receipt);
      writeFileSync(
        join(evidence, "dependency-title-drag.json"),
        JSON.stringify(titleDrag, null, 2),
      );
    },
  });
  const reviewRecovery: unknown[] = [];
  await verifyDependencyReviewRecovery({
    page,
    client,
    cli,
    capture: (state, description, target) =>
      captureOne(state, description, "compact", target, [false]),
    notify,
    holdUpdates: async (hold) => {
      holdNotices = hold;
      if (!hold)
        for (const notice of heldNotices.splice(0)) await notify(notice);
    },
    replaceDelete: (reply) => {
      reviewDeleteReply = reply;
    },
    pauseDelete: () => {
      delayDelete = true;
    },
    resume: releasePending,
    requests,
    deliveries,
    record: (receipt) => {
      reviewRecovery.push(receipt);
      writeFileSync(
        join(evidence, "review-recovery.json"),
        JSON.stringify(reviewRecovery, null, 2),
      );
    },
  });
  assert.ok(
    streamReads.some(
      (read) =>
        read.profile === "work" && Number(read.headers["last-event-id"]) > 0,
    ),
    "A reopened work stream must resume its production Profile cursor",
  );
  for (const read of streamReads)
    assert.ok(
      read.operations.every(
        (seq) => seq > Number(read.headers["last-event-id"]),
      ),
      "A resumed stream must not replay an operation at or before its requested cursor",
    );
  assertDagCaptureInventory(manifest);
  assert.deepEqual(errors, []);
  const proofHead = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim();
  const cleanSource =
    execFileSync("git", ["status", "--porcelain", "--untracked-files=normal"], {
      cwd: root,
      encoding: "utf8",
    }).trim() === "";
  const finalSource = cleanSource && binaries.head === proofHead;
  writeFileSync(
    join(evidence, "result.json"),
    JSON.stringify(
      {
        status: finalSource ? "DAG_MATRIX_PASS" : "DAG_INTERMEDIATE_PARTIAL",
        exit: 0,
        binaries,
        source: {
          head: proofHead,
          clean: cleanSource,
          binaryMatches: binaries.head === proofHead,
        },
        captures: manifest.length,
        fixture: { blocker, blocked, resolved, ready, plain },
        limits: [
          "No native Electron IPC/safeStorage proof",
          "Production renderer with compiled scratch server and real SSE; only literal assertions in this driver are proved. Full client suite exits and coordinator UI review are reported separately.",
          ...(finalSource
            ? []
            : [
                "Intermediate source/cache identity; rebuild at the clean final commit before the end proof.",
              ]),
          "Copy as Mermaid proves the validated host request carries exact server text; native clipboard is unproven here.",
          "All-six batch and nested Import error captures are controlled typed report fixtures. Actual batch changed/unchanged/blocked/Conflict and drag failures use the compiled public surface separately.",
        ],
      },
      null,
      2,
    ),
  );
} finally {
  if (stream) await Effect.runPromise(Fiber.interrupt(stream));
  await browser?.close();
  searchProbe?.close();
  readProbe?.close();
  if (server && server.exitCode === null && server.signalCode === null) {
    const exited = new Promise<void>((done) =>
      server?.once("exit", () => done()),
    );
    server.kill("SIGTERM");
    await Promise.race([exited, new Promise((done) => setTimeout(done, 2000))]);
    if (server.exitCode === null && server.signalCode === null)
      server.kill("SIGKILL");
    await exited;
  }
  writeFileSync(
    join(evidence, "actions.json"),
    JSON.stringify(actions, null, 2),
  );
  writeFileSync(
    join(evidence, "stream-resumption.json"),
    JSON.stringify({ streamReads, streamState }, null, 2),
  );
  writeFileSync(
    join(evidence, "dependency-responses.json"),
    JSON.stringify(responses, null, 2),
  );
  writeFileSync(
    join(evidence, "sdk-deliveries.json"),
    JSON.stringify(deliveries, null, 2),
  );
  writeFileSync(
    join(evidence, "sdk-failures.json"),
    JSON.stringify(sdkFailures, null, 2),
  );
  writeDagCaptureManifest(root, evidence, manifest);
  writeFileSync(join(evidence, "server.log"), log);
  rmSync(scratch, { recursive: true, force: true });
}
