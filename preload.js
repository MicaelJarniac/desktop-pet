const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  onAction: (callback) => ipcRenderer.on('action', (_event, action) => callback(action)),
  moveWindow: (dx, dy) => ipcRenderer.send('window-move', { dx, dy }),
  notify: (title, body) => ipcRenderer.send('pet-notify', { title, body }),
});
