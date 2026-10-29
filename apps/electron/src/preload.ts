import { contextBridge, ipcRenderer, webUtils } from "electron";
import type { Desktop } from "./protocol.ts";

const desktop: Desktop = {
  filePath: (file) => webUtils.getPathForFile(file),
  request: (request) => ipcRenderer.invoke("todo:request", request),
  subscribe: (listener) => {
    const receive = (
      _event: Electron.IpcRendererEvent,
      notice: Parameters<typeof listener>[0],
    ) => listener(notice);
    ipcRenderer.on("todo:notice", receive);
    return () => ipcRenderer.removeListener("todo:notice", receive);
  },
};
contextBridge.exposeInMainWorld("desktop", desktop);
