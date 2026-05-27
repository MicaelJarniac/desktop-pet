import type { AppState } from './state-types'

export type { AppState }

export interface IpcChannels {
  'state:load': { request: void; response: AppState | null }
  'state:save': { request: AppState; response: void }
  'window:move': { request: { dx: number; dy: number }; response: void }
  // main → renderer broadcast for tray actions:
  'tray:action': { broadcast: 'feed' | 'play' | 'sleep' | 'stats' }
}

export type TrayAction = IpcChannels['tray:action']['broadcast']

export interface ElectronAPI {
  loadState: () => Promise<AppState | null>
  saveState: (state: AppState) => Promise<void>
  moveWindow: (delta: { dx: number; dy: number }) => void
  onTrayAction: (cb: (action: TrayAction) => void) => () => void
  notify: (title: string, body: string) => void
}
