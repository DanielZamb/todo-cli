import { pathToFileURL } from "node:url";
import { BrowserWindow, type IpcMainInvokeEvent } from "electron";
import type { Notice } from "./protocol.ts";

export function createDiagnosticsWindow(page: string, preload: string) {
  let window: BrowserWindow | null = null;
  const url = new URL(pathToFileURL(page));
  url.searchParams.set("view", "diagnostics");
  return {
    notify(notice: Notice) {
      if (window && !window.isDestroyed())
        window.webContents.send("todo:notice", notice);
    },
    show() {
      if (window && !window.isDestroyed()) {
        window.show();
        window.focus();
        return;
      }
      window = new BrowserWindow({
        width: 1180,
        height: 860,
        minWidth: 393,
        minHeight: 426,
        title: "Diagnostics",
        backgroundColor: "#F7F8F5",
        webPreferences: {
          preload,
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
        },
      });
      window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      window.webContents.on("will-navigate", (event, next) => {
        if (next !== url.href) event.preventDefault();
      });
      window.on("closed", () => {
        window = null;
      });
      void window.loadURL(url.href);
    },
    accepts(event: IpcMainInvokeEvent) {
      return (
        !!window &&
        !window.isDestroyed() &&
        event.sender === window.webContents &&
        event.senderFrame?.url === url.href
      );
    },
  };
}
