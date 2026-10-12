const { contextBridge, ipcRenderer } = require('electron')

// Minimal bridge for the first-run setup page (M9b). No Node access reaches the page.
contextBridge.exposeInMainWorld('setup', {
  save: (username, password) => ipcRenderer.invoke('setup:save', { username, password }),
  finish: () => ipcRenderer.send('setup:done'),
})
