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
