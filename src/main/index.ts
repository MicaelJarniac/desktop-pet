import {
  app,
  BrowserWindow,
  Tray,
  Menu,
  ipcMain,
  Notification,
  nativeImage,
  screen,
} from 'electron'
import * as path from 'node:path'

import { CONFIG } from '../shared/config'
import { loadState, makeDebouncedSaver } from './state-store'
import type { AppState, WindowBounds } from '../shared/state-types'
import type { TrayAction } from '../shared/ipc-types'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null

const userDataDir = app.getPath('userData')
const saver = makeDebouncedSaver(userDataDir)
let cachedState: AppState | null = null
let dirtyAfterFlush = false
let quitting = false

function sendTrayAction(action: TrayAction): void {
  mainWindow?.webContents.send('tray:action', action)
}

function createWindow(): void {
  const display = screen.getPrimaryDisplay()
  const { width: sw, height: sh } = display.workAreaSize

  mainWindow = new BrowserWindow({
    width: CONFIG.WINDOW.width,
    height: CONFIG.WINDOW.height,
    x: sw - CONFIG.WINDOW.marginRight,
    y: sh - CONFIG.WINDOW.marginBottom,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    hasShadow: false,
    show: false, // hide until renderer measures + shrinks to idle size
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  void mainWindow.loadFile(path.join(__dirname, 'index.html')).catch((err: unknown) => {
    console.error('[main] failed to load index.html:', err)
  })

  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function createTray(): void {
  const icon = nativeImage.createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAARklEQVQ4T2NkoBAwUqifYdAY8B8Xhw0bNjDgkkdXQ9ALDAwMjLgMIMcLNAkDYgwgJgyJ8wIxYUi0F4gJQ7yaKQ5DUsIQAOx0IRFBXBQ1AAAAAElFTkSuQmCC',
  )

  tray = new Tray(icon)

  const menu = Menu.buildFromTemplate([
    { label: '🍖 Feed', click: () => sendTrayAction('feed') },
    { label: '🎾 Play', click: () => sendTrayAction('play') },
    { label: '💤 Sleep', click: () => sendTrayAction('sleep') },
    { type: 'separator' },
    { label: '📊 Stats', click: () => sendTrayAction('stats') },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ])

  tray.setToolTip('Desktop Pet')
  tray.setContextMenu(menu)
}

function registerIpc(): void {
  ipcMain.handle('state:load', async () => {
    return loadState(userDataDir)
  })

  ipcMain.handle('state:save', (_e, state: AppState) => {
    cachedState = state
    dirtyAfterFlush = true
    saver.schedule(state)
  })

  ipcMain.on('window:move', (_e, { dx, dy }: { dx: number; dy: number }) => {
    if (mainWindow === null) return
    const [x, y] = mainWindow.getPosition()
    mainWindow.setPosition(x + dx, y + dy)
  })

  ipcMain.on('window:setBounds', (_e, bounds: WindowBounds) => {
    if (mainWindow === null) return
    const target = mainWindow
    target.once('resize', () => {
      target.webContents.send('window:resized')
    })
    target.setBounds({
      x: Math.round(bounds.x),
      y: Math.round(bounds.y),
      width: Math.round(bounds.width),
      height: Math.round(bounds.height),
    })
    if (!target.isVisible()) {
      target.show()
    }
  })

  ipcMain.on('pet-notify', (_e, { title, body }: { title: string; body: string }) => {
    new Notification({ title, body }).show()
  })
}

void app
  .whenReady()
  .then(() => {
    createWindow()
    createTray()
    registerIpc()
  })
  .catch((err: unknown) => {
    console.error('[main] app initialization failed:', err)
  })

app.on('window-all-closed', () => app.quit())

app.on('activate', () => {
  if (!mainWindow) createWindow()
})

app.on('before-quit', (e) => {
  if (quitting) return
  if (!dirtyAfterFlush && !saver.isPending()) return
  e.preventDefault()
  quitting = true
  try {
    if (cachedState !== null) saver.flushSync(cachedState)
  } catch (err) {
    console.error('[main] flushSync failed during before-quit:', err)
  }
  app.exit(0)
})
