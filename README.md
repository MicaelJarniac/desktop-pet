# Desktop Pet

A Tamagotchi-style desktop companion built with [Electron](https://www.electronjs.org/). A small, transparent, always-on-top window sits in the corner of your screen with an ASCII art pet that you need to feed, play with, and put to sleep — or it will die.

## About Electron

[Electron](https://www.electronjs.org/) is a framework for building cross-platform desktop applications using web technologies (HTML, CSS, JavaScript). It bundles Chromium for rendering and Node.js for system access, letting a single codebase run on macOS, Windows, and Linux. Apps like VS Code, Slack, and Discord are built on it.

Electron applications are split into two kinds of processes:

- **Main process** — a Node.js process that controls the application lifecycle, creates windows, and accesses native OS APIs (tray, notifications, file system).
- **Renderer process** — a Chromium process that runs the UI (the HTML/JS/CSS).

A **preload script** acts as a secure bridge between them, exposing a minimal API to the renderer via `contextBridge`.

## About This Project

`desktop-pet` is a minimal example of a stateful Electron app that lives in a frameless, transparent, always-on-top window in the bottom-right corner of your screen.

### Features

- **A pet with moods** — rendered as Unicode emoticons that change based on its state:
  - `(＾▽＾)` happy
  - `(・ω・)` idle
  - `(╥﹏╥)` sad
  - `(；⌣̀_⌣́)` hungry
  - `(－ω－) zzZ` sleeping
  - `(✖╭╮✖)` dead
- **Three stats** (0–100) that decay every 30 seconds:
  - **Hunger** — drops by 3 per tick (1 while sleeping)
  - **Happiness** — drops by 2 per tick
  - **Energy** — drops by 1 per tick, restored while sleeping
- **Three actions**, available from both the in-window buttons and the system tray menu:
  - 🍖 **Feed** — +25 hunger, +5 happiness
  - 🎾 **Play** — +20 happiness, −10 energy, −5 hunger
  - 💤 **Sleep** — toggles sleep mode; the pet auto-wakes when fully rested
- **System tray icon** with Feed / Play / Sleep / Stats / Quit menu items
- **Native OS notifications** when the pet is hungry, lonely, wakes up, or dies (throttled to once per minute per message)
- **Drag-to-move** — click and drag the pet window anywhere on screen
- **Death and revival** — if all three stats hit 0 the pet dies; clicking any action button revives it with fresh stats

### Architecture

| File | Process | Role |
| --- | --- | --- |
| `main.js` | Main | Creates the frameless transparent window, sets up the tray menu, handles `window-move` and `pet-notify` IPC messages |
| `preload.js` | Preload | Exposes `electronAPI` (`onAction`, `moveWindow`, `notify`) to the renderer via `contextBridge` |
| `src/index.html` | Renderer | DOM layout — pet sprite, stat bars, action buttons, status text |
| `src/pet.js` | Renderer | The `Pet` class — state machine, stat decay, mood logic, action handlers |
| `src/renderer.js` | Renderer | Wires the DOM to the `Pet` instance, handles tray actions, implements drag-to-move |
| `src/styles.css` | Renderer | Transparent container, sprite animations (bounce/sway), stat-bar coloring |

Window flags set in `main.js`:

```js
transparent: true,
frame: false,
alwaysOnTop: true,
resizable: false,
skipTaskbar: true,
hasShadow: false,
```

The renderer never has Node.js access directly — `contextIsolation: true` and `nodeIntegration: false` keep it sandboxed, and the preload script is the only bridge.

## Requirements

- [Node.js](https://nodejs.org/) (any reasonably current LTS)
- npm (ships with Node)

## How to Run

Clone the repo and install dependencies:

```bash
git clone <this-repo-url>
cd desktop-pet
npm install
```

Start the app:

```bash
npm start
```

The pet will appear in the bottom-right corner of your primary display.

### Development mode

```bash
npm run dev
```

This launches with `--dev`, which opens Chromium DevTools in a detached window so you can inspect the renderer.

### Quitting

Right-click the tray icon and choose **Quit**. Closing the pet window also exits the app.

## Building a Distributable

Packaging is handled by [Electron Forge](https://www.electronforge.io/), configured in `forge.config.js`.

### Package only (unpacked app)

```bash
npm run package
```

Produces a runnable unpacked build in `out/desktop-pet-<platform>-<arch>/` (e.g. `desktop-pet.app` on macOS, `desktop-pet.exe` on Windows, or a binary on Linux). Fast — best for local testing.

### Make distributables (installers / single-file outputs)

```bash
npm run make
```

Produces platform-native distributables in `out/make/`:

| Platform | Outputs | Notes |
|---|---|---|
| **macOS** | `.dmg`, `.zip` | The `.dmg` is the single-file installer you'd ship; the `.zip` contains the portable `.app` |
| **Windows** | `.exe` (Squirrel installer), `.zip` | Squirrel handles install + auto-update; the `.zip` is a portable build |
| **Linux** | `.deb`, `.rpm`, `.zip` | Package-manager installers, plus a portable `.zip` |

Verified locally on `darwin/arm64`: `npm run make` produces a ~100 MB `desktop-pet-0.1.0-arm64.dmg`.

### Configured makers

In `forge.config.js`:

- `@electron-forge/maker-dmg` — macOS `.dmg`
- `@electron-forge/maker-squirrel` — Windows installer
- `@electron-forge/maker-zip` — portable `.zip` for all platforms
- `@electron-forge/maker-deb`, `@electron-forge/maker-rpm` — Linux package installers

For a true single-file executable on Linux (`AppImage`), add a community maker such as [`@reforged/maker-appimage`](https://github.com/reforged/maker-appimage).

### Cross-platform builds

Each OS can only build its own targets natively. To produce builds for all platforms, run `npm run make` on each OS or set up CI with one job per platform (GitHub Actions is the typical setup).

### Code signing / notarization

For shipping to end users without OS security warnings:

- **macOS** — Apple Developer ID certificate + notarization (configure under `packagerConfig.osxSign` and `osxNotarize`).
- **Windows** — code-signing certificate (configure in the Squirrel maker).
- **Linux** — no signing required.

Both are optional for personal / development use.

## Tech Stack

- [Electron](https://www.electronjs.org/) `^35.0.0`
- [Electron Forge](https://www.electronforge.io/) `^7.11.2` for packaging and distribution
- Vanilla JavaScript, HTML, and CSS — no bundler, no UI framework

## Project Layout

```
desktop-pet/
├── main.js           # Electron main process
├── preload.js        # contextBridge API
├── forge.config.js   # Electron Forge config (packagers, makers, fuses)
├── package.json
├── src/
│   ├── index.html    # Renderer HTML
│   ├── pet.js        # Pet state machine
│   ├── renderer.js   # UI + IPC wiring
│   └── styles.css    # Styling and animations
└── out/              # Build output (gitignored)
```
