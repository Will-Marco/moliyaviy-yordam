const { contextBridge, ipcRenderer } = require('electron')

/*
 * Desktop-only bridge for the app window, which shows the shared server's page (M13). Whitelisted calls only; no Node
 * access reaches the page, and nothing here carries a secret: the ERI password is typed in a local window, and every
 * Didox login the page asks for is confirmed in a native dialog first (CONSTITUTION §13).
 */
contextBridge.exposeInMainWorld('desktop', {
  platform: process.platform,
  /** Who this computer is on the server — the page tells "my" needs-checks from another computer's. */
  install: () => ipcRenderer.invoke('app:install'),
  eri: {
    listKeys: (tins) => ipcRenderer.invoke('eri:list-keys', tins),
    openPasswordWindow: (tin) => ipcRenderer.invoke('eri:open-password-window', tin),
    removePassword: (tin) => ipcRenderer.invoke('eri:remove-password', tin),
  },
  // M8b/M8c: the app drives Didox in its own window; it never signs or sends. Progress arrives as events.
  didox: {
    checkLogin: (tin) => ipcRenderer.invoke('didox:check-login', tin),
    createDrafts: (opts) => ipcRenderer.invoke('didox:create-drafts', opts),
    status: () => ipcRenderer.invoke('didox:status'),
    listRuns: (opts) => ipcRenderer.invoke('didox:list-runs', opts ?? {}),
    getRun: (runId) => ipcRenderer.invoke('didox:get-run', runId),
    openDiagnostics: () => ipcRenderer.invoke('didox:open-diagnostics'),
    cancel: () => ipcRenderer.invoke('didox:cancel'),
    onProgress: (callback) => {
      const listener = (_event, progress) => callback(progress)
      ipcRenderer.on('didox:progress', listener)
      return () => ipcRenderer.removeListener('didox:progress', listener)
    },
  },
})
