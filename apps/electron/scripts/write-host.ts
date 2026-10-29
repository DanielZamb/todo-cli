import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { TodoApi } from "@todo/api";
import { Effect, Fiber, Schema, Stream } from "effect";
import { FetchHttpClient, HttpClient, HttpClientRequest } from "effect/http";
import { HttpApiClient } from "effect/http-api";
import { app, BrowserWindow, ipcMain, Menu, shell } from "electron";
import {
  isNativeAttachmentRequest,
  nativeAttachmentRequest,
} from "../src/attachment-native.ts";
import { createDiagnosticsWindow } from "../src/diagnostics-window.ts";
import { Reply, Request } from "../src/protocol.ts";
import {
  restoreStreamState,
  type StreamState,
  streamHeaders,
} from "../src/stream-cursor.ts";
import { taskRequest } from "../src/task-client.ts";
import { createWindowLayout } from "../src/window-layout.ts";

if (
  process.env.TODO_ELECTRON_VERIFY_HOST !== "1" ||
  !process.env.TODO_ELECTRON_DATA?.includes("todo-s01-verify-")
)
  throw new Error("Scratch host verification only");
const url = new URL(process.env.TODO_SERVER_URL ?? "");
if (url.protocol !== "http:" || url.hostname !== "127.0.0.1")
  throw new Error("Loopback server required");
app.setPath("userData", process.env.TODO_ELECTRON_DATA);
async function boot() {
  await app.whenReady();
  let credential = "";
  const run = <A, E>(effect: Effect.Effect<A, E, HttpClient.HttpClient>) =>
    Effect.runPromise(effect.pipe(Effect.provide(FetchHttpClient.layer)));
  const client = await run(
    HttpApiClient.make(TodoApi, {
      baseUrl: url.origin,
      transformClient: (http) =>
        HttpClient.mapRequest(http, (request) =>
          HttpClientRequest.bearerToken(request, credential),
        ),
    }),
  );
  credential = (
    await run(
      client.signIn.signIn({
        payload: { passphrase: "scratch verification passphrase" },
      }),
    )
  ).credential;
  const page = join(import.meta.dirname, "../renderer/index.html");
  const diagnosticsWindow = createDiagnosticsWindow(
    page,
    join(import.meta.dirname, "../preload.cjs"),
  );
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: "Window",
        submenu: [
          {
            label: "Diagnostics",
            accelerator: "CommandOrControl+Shift+D",
            click: () => diagnosticsWindow.show(),
          },
        ],
      },
    ]),
  );
  const window = new BrowserWindow({
    width: 1280,
    height: 927,
    title: "Todo",
    webPreferences: {
      preload: join(import.meta.dirname, "../preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  const authentication = (tag: "signedIn" | "signedOut") => {
    window.webContents.send("todo:notice", { _tag: tag });
    diagnosticsWindow.notify({ _tag: tag });
  };
  const layout = createWindowLayout(
    window,
    join(app.getPath("userData"), "window.json"),
  );
  let stream: Fiber.Fiber<void, unknown> | undefined;
  let generation = 0;
  let streamState: typeof StreamState.Type = { cursors: {} };
  const operations: Array<{ profile: string; seq: number; kind: string }> = [];
  const stopStream = () => {
    generation++;
    if (stream) Effect.runFork(Fiber.interrupt(stream));
  };
  const watch = (profile: Extract<Request, { _tag: "watch" }>["profile"]) => {
    stopStream();
    const current = generation;
    const headers = streamHeaders(streamState, profile);
    writeFileSync(
      join(app.getPath("userData"), "watch.json"),
      JSON.stringify({ profile, ...headers }),
    );
    const notice = (state: "connected" | "offline") => {
      if (generation === current && !window.isDestroyed())
        window.webContents.send("todo:notice", { _tag: "connection", state });
    };
    stream = Effect.runFork(
      Effect.gen(function* () {
        const response = yield* client.changes.stream({
          params: { profile },
          headers: { ...headers, "x-todo-client": "electron" },
        });
        yield* Stream.runForEach(response.body, (frame) =>
          Effect.sync(() => {
            if (frame.event === "ready") notice("connected");
            if (
              frame.event === "reload" &&
              generation === current &&
              !window.isDestroyed()
            ) {
              streamState = restoreStreamState(profile, frame.data);
              writeFileSync(
                join(app.getPath("userData"), "reload.json"),
                JSON.stringify(frame.data),
              );
              window.webContents.send("todo:notice", { _tag: "reload" });
            }
            if (
              frame.event === "operation" &&
              generation === current &&
              !window.isDestroyed()
            ) {
              streamState = {
                ...streamState,
                cursors: { ...streamState.cursors, [profile]: frame.id },
              };
              operations.push({
                profile,
                seq: frame.data.seq,
                kind: frame.data.event.kind,
              });
              writeFileSync(
                join(app.getPath("userData"), "operations.json"),
                JSON.stringify(operations),
              );
              window.webContents.send(
                "todo:notice",
                frame.data.event.kind === "ProfileDeleted"
                  ? {
                      _tag: "profileDeleted",
                      profile,
                      name: frame.data.event.profile.name,
                    }
                  : { _tag: "changed", profile },
              );
            }
          }),
        );
      }).pipe(
        Effect.provide(FetchHttpClient.layer),
        Effect.onExit(() => Effect.sync(() => notice("offline"))),
      ),
    );
  };
  app.on("before-quit", stopStream);
  let failNextList = false;
  process.on("todo:verify-list-failure", () => {
    failNextList = true;
  });
  ipcMain.handle(
    "todo:request",
    async (event, input: unknown): Promise<Reply> => {
      if (
        !diagnosticsWindow.accepts(event) &&
        (event.sender !== window.webContents ||
          event.senderFrame?.url !== pathToFileURL(page).href)
      )
        return { _tag: "error", message: "Untrusted window" };
      const request = Schema.decodeUnknownSync(Request)(input);
      if (diagnosticsWindow.accepts(event) && request._tag !== "diagnostics")
        return { _tag: "error", message: "Diagnostics is read only" };
      if (request._tag === "list" && failNextList) {
        failNextList = false;
        return { _tag: "error", message: "Scratch list read failed." };
      }
      if (isNativeAttachmentRequest(request))
        return nativeAttachmentRequest(request);
      switch (request._tag) {
        case "openDiagnostics":
          diagnosticsWindow.show();
          return { _tag: "ok" };
        case "snapshotReveal": {
          const snapshot = await run(
            client.snapshots.show({ params: { snapshot: request.id } }),
          );
          shell.showItemInFolder(snapshot.path);
          return { _tag: "ok" };
        }
        case "windowMode":
          return { _tag: "windowMode", compact: layout.compact };
        case "setWindowMode":
          layout.setCompact(request.compact);
          window.webContents.send("todo:notice", {
            _tag: "windowMode",
            compact: layout.compact,
          });
          return { _tag: "windowMode", compact: layout.compact };
        case "restore":
          if (!credential) return { _tag: "signedOut" };
          return {
            _tag: "signedIn",
            profiles: await run(client.reads.profiles()),
          };
        case "watch":
          watch(request.profile);
          return { _tag: "ok" };
        case "draft":
          return { _tag: "ok" };
        case "signOut":
          await run(client.credentials.signOut());
          credential = "";
          authentication("signedOut");
          return { _tag: "signedOut" };
        case "signIn":
          credential = (
            await run(
              client.signIn.signIn({
                payload: { passphrase: request.passphrase },
              }),
            )
          ).credential;
          authentication("signedIn");
          return {
            _tag: "signedIn",
            profiles: await run(client.reads.profiles()),
          };
        default:
          return run(
            taskRequest(client, request).pipe(
              Effect.catch((error) => {
                if (
                  error &&
                  typeof error === "object" &&
                  "_tag" in error &&
                  error._tag === "Unauthorized"
                ) {
                  stopStream();
                  credential = "";
                  authentication("signedOut");
                  return Effect.succeed<Reply>({ _tag: "signedOut" });
                }
                if (
                  error &&
                  typeof error === "object" &&
                  "_tag" in error &&
                  error._tag === "Conflict" &&
                  "latest" in error
                )
                  return Effect.succeed(
                    Schema.decodeUnknownSync(Reply)({
                      _tag: "conflict",
                      latest: error.latest,
                    }),
                  );
                return Effect.succeed<Reply>({
                  _tag: "error",
                  message:
                    error && typeof error === "object" && "message" in error
                      ? String(error.message)
                      : "Could not reach the Todo server. Your draft is saved. Retry when connected.",
                });
              }),
            ),
          ).then((reply) => {
            if (request._tag === "list")
              process.emit("todo:verify-list-result", reply._tag);
            return reply;
          });
      }
    },
  );
  await window.loadFile(page);
  app.on("window-all-closed", () => app.quit());
}
void boot();
