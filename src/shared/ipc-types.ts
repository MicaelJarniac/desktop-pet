import type { AppState, WindowBounds } from './state-types'

export type { AppState, WindowBounds }

export interface IpcChannels {
  'state:load': { request: void; response: AppState | null }
  'state:save': { request: AppState; response: void }
  'window:move': { request: { dx: number; dy: number }; response: void }
  'window:setBounds': { request: WindowBounds; response: void }
  // main → renderer broadcasts:
  'tray:action': { broadcast: 'feed' | 'play' | 'sleep' | 'stats' }
  'window:resized': { broadcast: void }
  'system:idle': { broadcast: void }
  'system:active': { broadcast: void }
}

export type TrayAction = IpcChannels['tray:action']['broadcast']

export interface ElectronAPI {
  loadState: () => Promise<AppState | null>
  saveState: (state: AppState) => Promise<void>
  moveWindow: (delta: { dx: number; dy: number }) => void
  setBounds: (bounds: WindowBounds) => void
  onTrayAction: (cb: (action: TrayAction) => void) => () => void
  onResized: (cb: () => void) => () => void
  notify: (title: string, body: string) => void
  onSystemIdle: (cb: () => void) => () => void
  onSystemActive: (cb: () => void) => () => void
}
