const { contextBridge, ipcRenderer } = require('electron')

// Desktop-only bridge for the app window (M8). Whitelisted calls only; no Node access reaches the page.
contextBridge.exposeInMainWorld('desktop', {
  platform: process.platform,
  eri: {
    listKeys: (tins) => ipcRenderer.invoke('eri:list-keys', tins),
    setPassword: (tin, password) => ipcRenderer.invoke('eri:set-password', { tin, password }),
    removePassword: (tin) => ipcRenderer.invoke('eri:remove-password', tin),
  },
  backups: {
    status: () => ipcRenderer.invoke('backups:status'),
    openFolder: () => ipcRenderer.invoke('backups:open-folder'),
  },
})
