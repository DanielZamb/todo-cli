import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { TodoApi } from "@todo/api";
import { Effect, Fiber, Schema, Stream } from "effect";
import { FetchHttpClient, HttpClient, HttpClientRequest } from "effect/http";
import { HttpApiClient } from "effect/http-api";
import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  Notification,
  nativeImage,
  safeStorage,
  shell,
  Tray,
} from "electron";
import {
  isNativeAttachmentRequest,
  nativeAttachmentRequest,
} from "./attachment-native.ts";
import { createDiagnosticsWindow } from "./diagnostics-window.ts";
import { type Notice, Reply, Request } from "./protocol.ts";
import {
  restoreStreamState,
  StreamState,
  streamHeaders,
} from "./stream-cursor.ts";
import { taskRequest } from "./task-client.ts";
import { createWindowLayout } from "./window-layout.ts";

if (process.env.TODO_ELECTRON_DATA)
  app.setPath("userData", process.env.TODO_ELECTRON_DATA);
const server = new URL(process.env.TODO_SERVER_URL ?? "http://127.0.0.1:4310");
if (
  server.protocol !== "http:" ||
  server.hostname !== "127.0.0.1" ||
  server.username ||
  server.password ||
  server.pathname !== "/"
)
  throw new Error("Expected a loopback Todo server URL");
let credential: string | undefined;
let window: BrowserWindow;
let layout: ReturnType<typeof createWindowLayout>;
let tray: Tray;
let diagnosticsWindow: ReturnType<typeof createDiagnosticsWindow>;
let stream: Fiber.Fiber<void, unknown> | undefined;
let generation = 0;
let quitting = false;
const notifications = new Map<number, Notification>();
const directory = app.getPath("userData");
const sessionFile = join(directory, "session.enc");
const stateFile = join(directory, "state.json");
const State = Schema.Struct({
  drafts: Schema.Record(Schema.String, Schema.String),
  ...StreamState.fields,
});
let state: typeof State.Type = { drafts: {}, cursors: {} };
const persist = () => {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  writeFileSync(`${stateFile}.tmp`, JSON.stringify(state), { mode: 0o600 });
  renameSync(`${stateFile}.tmp`, stateFile);
};
const send = (notice: Notice) => {
  if (!window.isDestroyed()) window.webContents.send("todo:notice", notice);
  diagnosticsWindow?.notify(notice);
};
const setWindowMode = (compact: boolean) => {
  layout.setCompact(compact);
  const item = Menu.getApplicationMenu()?.getMenuItemById("compact-mode");
  if (item) item.checked = layout.compact;
  send({ _tag: "windowMode", compact: layout.compact });
};
const client = () =>
  HttpApiClient.make(TodoApi, {
    baseUrl: server.origin,
    transformClient: (http) =>
      HttpClient.mapRequest(http, (request) =>
        credential
          ? HttpClientRequest.bearerToken(request, credential)
          : request,
      ),
  });
const run = <A, E>(effect: Effect.Effect<A, E, HttpClient.HttpClient>) =>
  Effect.runPromise(effect.pipe(Effect.provide(FetchHttpClient.layer)));
const stopStream = () => {
  generation++;
  if (stream) Effect.runFork(Fiber.interrupt(stream));
  stream = undefined;
};
const watch = (profile: typeof Request.Type & { _tag: "watch" }) => {
  stopStream();
  const current = generation;
  const follow = Effect.gen(function* () {
    const http = yield* client();
    while (current === generation && credential) {
      send({ _tag: "connection", state: "reconnecting" });
      const result = yield* Effect.exit(
        Effect.gen(function* () {
          yield* Effect.logInfo("Todo stream connecting", {
            profile: profile.profile,
            cursor: streamHeaders(state, profile.profile)["last-event-id"],
          });
          const response = yield* http.changes.stream({
            params: { profile: profile.profile },
            headers: {
              ...streamHeaders(state, profile.profile),
              "x-todo-client": "electron",
            },
          });
          yield* Stream.runForEach(response.body, (frame) =>
            Effect.sync(() => {
              if (current !== generation) return;
              if (frame.event === "ready")
                send({ _tag: "connection", state: "connected" });
              else if (frame.event === "reload") {
                state = {
                  ...state,
                  ...restoreStreamState(profile.profile, frame.data),
                };
                for (const notification of notifications.values())
                  notification.close();
                notifications.clear();
                persist();
                send({ _tag: "reload" });
              } else {
                if (
                  Number(frame.id) <=
                  Number(streamHeaders(state, profile.profile)["last-event-id"])
                )
                  return;
                if (frame.data.event.kind === "ReminderFired") {
                  const seq = frame.data.seq;
                  const notification = new Notification({
                    title: "Task reminder",
                    body: frame.data.event.title,
                  });
                  notifications.set(seq, notification);
                  notification.once("show", () =>
                    Effect.runFork(
                      Effect.logInfo("Todo native notification shown", {
                        seq,
                        profile: profile.profile,
                      }),
                    ),
                  );
                  notification.once("failed", (_event, error) => {
                    notifications.delete(seq);
                    send({
                      _tag: "notificationError",
                      message: `Could not show reminder. Enable Todo notifications in macOS settings. ${error}`,
                    });
                  });
                  notification.once("close", () => notifications.delete(seq));
                  notification.once("click", () => {
                    window.show();
                    window.focus();
                  });
                  notification.show();
                }
                state = {
                  ...state,
                  cursors: { ...state.cursors, [profile.profile]: frame.id },
                };
                persist();
                send(
                  frame.data.event.kind === "ProfileDeleted"
                    ? {
                        _tag: "profileDeleted",
                        profile: profile.profile,
                        name: frame.data.event.profile.name,
                      }
                    : { _tag: "changed", profile: profile.profile },
                );
              }
            }),
          );
        }),
      );
      if (current !== generation) return;
      send({ _tag: "connection", state: "offline" });
      if (result._tag === "Failure")
        yield* Effect.logWarning("Todo stream disconnected");
      yield* Effect.sleep("2 seconds");
    }
  }).pipe(Effect.provide(FetchHttpClient.layer));
  stream = Effect.runFork(follow);
};
const handle = (
  request: typeof Request.Type,
): Effect.Effect<Reply, unknown, HttpClient.HttpClient> =>
  Effect.gen(function* () {
    if (isNativeAttachmentRequest(request))
      return yield* Effect.tryPromise(() => nativeAttachmentRequest(request));
    const http = yield* client();
    switch (request._tag) {
      case "openDiagnostics":
        diagnosticsWindow.show();
        return { _tag: "ok" };
      case "snapshotReveal": {
        const snapshot = yield* http.snapshots.show({
          params: { snapshot: request.id },
        });
        shell.showItemInFolder(snapshot.path);
        return { _tag: "ok" };
      }
      case "windowMode":
        return { _tag: "windowMode", compact: layout.compact };
      case "setWindowMode":
        setWindowMode(request.compact);
        return { _tag: "windowMode", compact: layout.compact };
      case "restore":
        return credential
          ? { _tag: "signedIn", profiles: yield* http.reads.profiles() }
          : { _tag: "signedOut" };
      case "signIn": {
        if (
          !(yield* Effect.tryPromise(() =>
            safeStorage.isAsyncEncryptionAvailable(),
          ))
        )
          return {
            _tag: "error",
            message:
              "macOS secure storage is unavailable. Unlock your keychain and retry.",
          };
        const session = yield* http.signIn.signIn({
          payload: { passphrase: request.passphrase },
        });
        const encrypted = yield* Effect.tryPromise(() =>
          safeStorage.encryptStringAsync(session.credential),
        );
        yield* Effect.try(() => {
          mkdirSync(directory, { recursive: true, mode: 0o700 });
          writeFileSync(sessionFile, encrypted, { mode: 0o600 });
        });
        credential = session.credential;
        send({ _tag: "signedIn" });
        return { _tag: "signedIn", profiles: yield* http.reads.profiles() };
      }
      case "signOut": {
        yield* http.credentials.signOut();
        stopStream();
        credential = undefined;
        rmSync(sessionFile, { force: true });
        send({ _tag: "signedOut" });
        return { _tag: "signedOut" };
      }
      case "watch":
        watch(request);
        return { _tag: "ok" };
      case "draft":
        state = {
          ...state,
          drafts: { ...state.drafts, [request.profile]: request.text },
        };
        persist();
        return { _tag: "ok" };
      default:
        return yield* taskRequest(
          http,
          request,
          "profile" in request ? (state.drafts[request.profile] ?? "") : "",
        );
    }
  });
app.setName("Todo");
async function boot() {
  await app.whenReady();
  if (existsSync(stateFile))
    state = Schema.decodeUnknownSync(State)(
      JSON.parse(readFileSync(stateFile, "utf8")),
    );
  if (
    existsSync(sessionFile) &&
    (await safeStorage.isAsyncEncryptionAvailable())
  ) {
    try {
      credential = (
        await safeStorage.decryptStringAsync(readFileSync(sessionFile))
      ).result;
    } catch {
      rmSync(sessionFile, { force: true });
    }
  }
  const page = join(app.getAppPath(), "dist/renderer/index.html");
  const pageUrl = pathToFileURL(page).href;
  diagnosticsWindow = createDiagnosticsWindow(
    page,
    join(app.getAppPath(), "dist/preload.cjs"),
  );
  window = new BrowserWindow({
    width: 1280,
    height: 927,
    minWidth: 960,
    minHeight: 640,
    title: "Todo",
    backgroundColor: "#F7F8F5",
    webPreferences: {
      preload: join(app.getAppPath(), "dist/preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  layout = createWindowLayout(window, join(directory, "window.json"));
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event, url) => {
    if (url !== pageUrl) event.preventDefault();
  });
  ipcMain.handle(
    "todo:request",
    async (event, input: unknown): Promise<Reply> => {
      if (
        !diagnosticsWindow.accepts(event) &&
        (event.sender !== window.webContents ||
          event.senderFrame?.url !== pageUrl)
      )
        return { _tag: "error", message: "Untrusted window" };
      const parsed = Schema.decodeUnknownExit(Request)(input);
      if (parsed._tag === "Failure")
        return { _tag: "error", message: "Invalid request" };
      if (
        diagnosticsWindow.accepts(event) &&
        parsed.value._tag !== "diagnostics"
      )
        return { _tag: "error", message: "Diagnostics is read only" };
      return run(
        handle(parsed.value).pipe(
          Effect.catch((error) => {
            if (error && typeof error === "object" && "_tag" in error) {
              if (error._tag === "Conflict" && "latest" in error)
                return Effect.succeed(
                  Schema.decodeUnknownSync(Reply)({
                    _tag: "conflict",
                    latest: error.latest,
                  }),
                );
              if (
                error._tag === "Unauthorized" &&
                parsed.value._tag === "signIn"
              )
                return Effect.succeed<Reply>({
                  _tag: "error",
                  message: "Incorrect owner passphrase.",
                });
              if (error._tag === "Unauthorized") {
                stopStream();
                credential = undefined;
                rmSync(sessionFile, { force: true });
                send({ _tag: "signedOut" });
                return Effect.succeed<Reply>({ _tag: "signedOut" });
              }
              if ("message" in error && typeof error.message === "string")
                return Effect.succeed<Reply>({
                  _tag: "error",
                  message: error.message,
                });
            }
            return Effect.succeed<Reply>({
              _tag: "error",
              message:
                "Could not reach the Todo server. Your draft is saved. Retry when connected.",
            });
          }),
        ),
      );
    },
  );
  const quickAdd = () => {
    window.show();
    window.focus();
    send({ _tag: "quickAdd" });
  };
  tray = new Tray(
    nativeImage.createFromDataURL(
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAIElEQVQ4T2NkYGD4z0ABYBw1gGE0DBg1gGE0DBg1gAEAAI0CEfHiV2IAAAAASUVORK5CYII=",
    ),
  );
  tray.setTitle("＋");
  tray.setToolTip("Todo quick add");
  tray.on("click", quickAdd);
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: "Todo",
        submenu: [
          {
            label: "Quick add",
            accelerator: "CommandOrControl+Shift+N",
            click: quickAdd,
          },
          { label: "Show Todo", click: () => window.show() },
          {
            label: "Settings…",
            accelerator: "CommandOrControl+,",
            click: () => {
              window.show();
              send({ _tag: "settings" });
            },
          },
          { type: "separator" },
          { role: "quit" },
        ],
      },
      { role: "editMenu" },
      {
        role: "viewMenu",
        submenu: [
          {
            id: "compact-mode",
            label: "Compact mode",
            type: "checkbox",
            accelerator: "CommandOrControl+Shift+M",
            checked: layout.compact,
            click: (item) => setWindowMode(item.checked),
          },
          {
            label: "Toggle appearance",
            accelerator: "CommandOrControl+Shift+L",
            click: () => send({ _tag: "toggleTheme" }),
          },
          { type: "separator" },
          { role: "reload" },
          { role: "forceReload" },
          { role: "toggleDevTools" },
          { type: "separator" },
          { role: "resetZoom" },
          { role: "zoomIn" },
          { role: "zoomOut" },
          { type: "separator" },
          { role: "togglefullscreen" },
        ],
      },
      {
        role: "windowMenu",
        submenu: [
          {
            label: "Diagnostics",
            accelerator: "CommandOrControl+Shift+D",
            click: () => diagnosticsWindow.show(),
          },
          { type: "separator" },
          { role: "minimize" },
          { role: "front" },
        ],
      },
    ]),
  );
  window.on("close", (event) => {
    if (!quitting) {
      event.preventDefault();
      window.hide();
    }
  });
  app.on("before-quit", () => {
    quitting = true;
    stopStream();
  });
  app.on("activate", () => window.show());
  await window.loadFile(page);
}
void boot();
