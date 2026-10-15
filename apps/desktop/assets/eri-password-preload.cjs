const { contextBridge, ipcRenderer } = require('electron')

// Bridge for the local ERI password window (FR-8.2, CONSTITUTION §13). The password goes to main and nowhere else.
contextBridge.exposeInMainWorld('eriPassword', {
  info: () => ipcRenderer.invoke('eri-window:info'),
  save: (password) => ipcRenderer.invoke('eri-window:save', password),
  close: () => ipcRenderer.send('eri-window:close'),
})
