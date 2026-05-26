const { app, BrowserWindow, Tray, Menu, screen, nativeImage, ipcMain, Notification } = require('electron');
const path = require('path');

let mainWindow;
let tray;

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
    { type: 'separator' },
    { label: '📊 Stats', click: () => mainWindow.webContents.send('action', 'stats') },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]);

  tray.setContextMenu(contextMenu);
}

// Pet notifications
ipcMain.on('pet-notify', (_event, { title, body }) => {
  new Notification({ title, body }).show();
});

app.whenReady().then(() => {
  createWindow();
  createTray();
});

app.on('window-all-closed', () => app.quit());
