const { contextBridge, ipcRenderer } = require("electron");

// Only user gestures can start a locally selected Dark Miner executable.
// This preload exposes no generic shell, file-system or command execution.
contextBridge.exposeInMainWorld("darkCutMinerDesktop", Object.freeze({
  chooseAndStart: () => ipcRenderer.invoke("darkcut:darkminer:choose-and-start"),
  startSaved: () => ipcRenderer.invoke("darkcut:darkminer:start-saved"),
  connection: () => ipcRenderer.invoke("darkcut:darkminer:connection"),
}));

contextBridge.exposeInMainWorld("darkCutGroqKeys", Object.freeze({
  status: () => ipcRenderer.invoke("darkcut:srt:key-status"),
  save: (secret) => ipcRenderer.invoke("darkcut:srt:key-save", secret),
  load: () => ipcRenderer.invoke("darkcut:srt:key-load"),
  remove: () => ipcRenderer.invoke("darkcut:srt:key-delete"),
}));
