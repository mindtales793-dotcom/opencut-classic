const { contextBridge, ipcRenderer } = require("electron");

// Only user gestures can start a locally selected Dark Miner executable.
// This preload exposes no generic shell, file-system or command execution.
contextBridge.exposeInMainWorld("darkCutMinerDesktop", Object.freeze({
  chooseAndStart: () => ipcRenderer.invoke("darkcut:darkminer:choose-and-start"),
  startSaved: () => ipcRenderer.invoke("darkcut:darkminer:start-saved"),
  connection: () => ipcRenderer.invoke("darkcut:darkminer:connection"),
}));
