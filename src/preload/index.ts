import { contextBridge, ipcRenderer } from 'electron'
import type { ElectronAPI, TrayAction } from '../shared/ipc-types'
import type { AppState, WindowBounds } from '../shared/state-types'

const api = {
  loadState: (): Promise<AppState | null> => ipcRenderer.invoke('state:load'),
  saveState: (state: AppState): Promise<void> => ipcRenderer.invoke('state:save', state),
  moveWindow: (delta: { dx: number; dy: number }): void => {
    ipcRenderer.send('window:move', delta)
  },
  setBounds: (bounds: WindowBounds): void => {
    ipcRenderer.send('window:setBounds', bounds)
  },
  onTrayAction: (cb: (action: TrayAction) => void): (() => void) => {
    const handler = (_e: Electron.IpcRendererEvent, action: TrayAction): void => cb(action)
    ipcRenderer.on('tray:action', handler)
    return () => {
      ipcRenderer.removeListener('tray:action', handler)
    }
  },
  notify: (title: string, body: string): void => {
    ipcRenderer.send('pet-notify', { title, body })
  },
} satisfies ElectronAPI

contextBridge.exposeInMainWorld('electronAPI', api)
