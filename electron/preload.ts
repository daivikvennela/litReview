import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("litreview", {
  getVersion: (): Promise<string> => ipcRenderer.invoke("app:getVersion"),
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke("shell:openExternal", url),
});
