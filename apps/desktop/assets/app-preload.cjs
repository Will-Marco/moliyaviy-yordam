const { contextBridge, ipcRenderer } = require('electron')

// Desktop-only bridge for the app window (M8). Whitelisted calls only; no Node access reaches the page.
contextBridge.exposeInMainWorld('desktop', {
  platform: process.platform,
  eri: {
    listKeys: (tins) => ipcRenderer.invoke('eri:list-keys', tins),
    setPassword: (tin, password) => ipcRenderer.invoke('eri:set-password', { tin, password }),
    removePassword: (tin) => ipcRenderer.invoke('eri:remove-password', tin),
  },
  // M8b: the app drives Didox in its own window; it never signs or sends. Progress arrives as events.
  didox: {
    checkLogin: (tin) => ipcRenderer.invoke('didox:check-login', tin),
    createDrafts: (opts) => ipcRenderer.invoke('didox:create-drafts', opts),
    status: () => ipcRenderer.invoke('didox:status'),
    listRuns: (opts) => ipcRenderer.invoke('didox:list-runs', opts ?? {}),
    getRun: (runId) => ipcRenderer.invoke('didox:get-run', runId),
    invoiceFlags: (month) => ipcRenderer.invoke('didox:invoice-flags', month),
    skipInvoice: (opts) => ipcRenderer.invoke('didox:skip-invoice', opts),
    resolveNeedsCheck: (opts) => ipcRenderer.invoke('didox:resolve-needs-check', opts),
    openDiagnostics: () => ipcRenderer.invoke('didox:open-diagnostics'),
    cancel: () => ipcRenderer.invoke('didox:cancel'),
    onProgress: (callback) => {
      const listener = (_event, progress) => callback(progress)
      ipcRenderer.on('didox:progress', listener)
      return () => ipcRenderer.removeListener('didox:progress', listener)
    },
  },
  backups: {
    status: () => ipcRenderer.invoke('backups:status'),
    openFolder: () => ipcRenderer.invoke('backups:open-folder'),
  },
})
