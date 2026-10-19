/*
  SABAWOON ACADEMY — Electron preload

  Runs with contextIsolation enabled. Exposes only a tiny, read-only bridge
  (application info) to the renderer. No Node.js APIs, no filesystem, no
  process access. The existing frontend needs no changes: it keeps calling
  the same relative /api URLs, whether served by Electron or a browser.
*/

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("sabawoonDesktop", {
  isDesktop: true,
  getInfo: () => ipcRenderer.invoke("app:get-info"),
});
