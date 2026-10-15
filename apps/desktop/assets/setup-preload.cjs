const { contextBridge, ipcRenderer } = require('electron')

// Minimal bridge for the first-run setup page (M13): it only hands main the server address. No Node access.
contextBridge.exposeInMainWorld('setup', {
  save: (address) => ipcRenderer.invoke('setup:save', address),
  finish: () => ipcRenderer.send('setup:done'),
})
