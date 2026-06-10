const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  onAction: (callback) => ipcRenderer.on('action', (_event, action) => callback(action)),
  moveWindow: (dx, dy) => ipcRenderer.send('window-move', { dx, dy }),
  notify: (title, body) => ipcRenderer.send('pet-notify', { title, body }),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),
  openSettings: () => ipcRenderer.send('settings:open'),
  onSettingsUpdated: (callback) => ipcRenderer.on('settings:updated', (_event, settings) => callback(settings)),
});
