const { app, BrowserWindow, Tray, Menu, screen, nativeImage, ipcMain, Notification } = require('electron');
const path = require('path');
const settingsStore = require('./src/main/settings-store');

let mainWindow;
let tray;
let settingsWindow = null;

function createWindow() {
  const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;

  mainWindow = new BrowserWindow({
    width: 200,
    height: 250,
    x: screenWidth - 250,
    y: screenHeight - 280,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile('src/index.html');
  mainWindow.setIgnoreMouseEvents(false);

  // Allow dragging the pet around the screen
  ipcMain.on('window-move', (_event, { dx, dy }) => {
    const [x, y] = mainWindow.getPosition();
    mainWindow.setPosition(x + dx, y + dy);
  });

  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

function createSettingsWindow() {
  if (settingsWindow) {
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 360,
    height: 360,
    title: 'Pet Settings',
    resizable: false,
    minimizable: false,
    maximizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    autoHideMenuBar: true,
    backgroundColor: '#1e1e28',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  settingsWindow.removeMenu();
  settingsWindow.loadFile('src/settings.html');

  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
}

function createTray() {
  // 16x16 simple icon (fallback circle)
  const icon = nativeImage.createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAARklEQVQ4T2NkoBAwUqifYdAY8B8Xhw0bNjDgkkdXQ9ALDAwMjLgMIMcLNAkDYgwgJgyJ8wIxYUi0F4gJQ7yaKQ5DUsIQAOx0IRFBXBQ1AAAAAElFTkSuQmCC'
  );

  tray = new Tray(icon);
  tray.setToolTip('Desktop Pet');

  const contextMenu = Menu.buildFromTemplate([
    { label: '🍖 Feed', click: () => mainWindow.webContents.send('action', 'feed') },
    { label: '🎾 Play', click: () => mainWindow.webContents.send('action', 'play') },
    { label: '💤 Sleep', click: () => mainWindow.webContents.send('action', 'sleep') },
    { label: '⚙️ Settings…', click: () => createSettingsWindow() },
    { type: 'separator' },
    { label: '📊 Stats', click: () => mainWindow.webContents.send('action', 'stats') },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]);

  tray.setContextMenu(contextMenu);
}

ipcMain.on('pet-notify', (_event, { title, body }) => {
  new Notification({ title, body }).show();
});

ipcMain.handle('settings:get', () => settingsStore.load());

ipcMain.handle('settings:save', (_event, payload) => {
  const normalized = settingsStore.save(payload);
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('settings:updated', normalized);
  }
  return normalized;
});

ipcMain.on('settings:open', () => createSettingsWindow());

app.whenReady().then(() => {
  settingsStore.ensureExists();
  createWindow();
  createTray();
});

app.on('window-all-closed', () => app.quit());
