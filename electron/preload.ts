import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("litreview", {
  getVersion: (): Promise<string> => ipcRenderer.invoke("app:getVersion"),
  isElectron: (): Promise<boolean> => ipcRenderer.invoke("app:isElectron"),
  quit: (): Promise<void> => ipcRenderer.invoke("app:quit"),
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke("shell:openExternal", url),
});
