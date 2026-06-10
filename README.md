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
- **System tray icon** with Feed / Play / Sleep / Settings / Stats / Quit menu items
- **Native OS notifications** when the pet is hungry, lonely, wakes up, or dies (throttled to once per minute per message)
- **Drag-to-move** — click and drag the pet window anywhere on screen
- **Death and revival** — if all three stats hit 0 the pet dies; clicking any action button revives it with fresh stats
- **Customizable name and colors** — open the settings window from the tray menu or the ⚙️ button to rename the pet and pick three colors (pet sprite, background, accent). Changes apply live and persist across restarts in a JSON file under the OS app-data directory.

### Architecture

| File | Process | Role |
| --- | --- | --- |
| `main.js` | Main | Creates the pet window and the settings window, sets up the tray menu, handles `window-move`, `pet-notify`, and the `settings:get` / `settings:save` / `settings:open` IPC channels |
| `preload.js` | Preload | Exposes `electronAPI` (`onAction`, `moveWindow`, `notify`, `getSettings`, `saveSettings`, `openSettings`, `onSettingsUpdated`) to both renderers via `contextBridge` |
| `src/index.html` | Renderer (pet) | DOM layout — pet sprite, stat bars, Feed/Play/Sleep/Settings buttons, status text |
| `src/pet.js` | Renderer (pet) | The `Pet` class — state machine, stat decay, mood logic, action handlers |
| `src/renderer.js` | Renderer (pet) | Wires the DOM to the `Pet` instance, applies settings (CSS variables + pet name) on startup and on live updates, handles tray actions, implements drag-to-move |
| `src/styles.css` | Renderer (both) | Theme variables (`--color-pet`, `--color-bg`, `--color-accent`), pet container, sprite animations, stat-bar coloring, and scoped `.settings-window` styles for the settings form |
| `src/settings.html` | Renderer (settings) | DOM layout for the settings window — name input, three color pickers, Reset / Cancel / Save buttons |
| `src/settings.js` | Renderer (settings) | Loads current settings via IPC, populates the form, handles Save / Cancel / Reset, subscribes to live updates |
| `src/settings-schema.js` | Shared | Pure module: exports `SETTINGS_DEFAULTS` and a `validate()` function that normalizes input and falls back to defaults per field. Loaded in both Node (main + tests) and the browser renderer |
| `src/utils/color.js` | Renderer (pet) | Pure `hexToRgba(hex, alpha)` helper used to apply the user's background color while preserving the 88% alpha |
| `src/main/settings-store.js` | Main | Safe load / save / `ensureExists` for `<userData>/settings.json` — corrupt or missing files fall back to defaults without crashing |

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

### Settings persistence

Settings live in a JSON file at:

- **macOS** — `~/Library/Application Support/desktop-pet/settings.json`
- **Windows** — `%APPDATA%\desktop-pet\settings.json`
- **Linux** — `~/.config/desktop-pet/settings.json`

Shape:

```json
{
  "name": "Pixel",
  "colors": {
    "pet": "#ffffff",
    "background": "#1e1e28",
    "accent": "#4ade80"
  }
}
```

The file is created on first launch with defaults. On every load it's run through `validate()` from `src/settings-schema.js`, which fills in any missing or invalid fields. A corrupt file logs a warning and falls back to defaults — the app never crashes on bad input. The next save rewrites the file cleanly. No third-party dependency is used for storage; just built-in `fs` and `path`.

When the user saves in the settings window, the main process broadcasts `settings:updated` to every renderer, which then re-applies the three CSS variables and updates the pet's displayed name — no restart needed.

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

## Tests

Unit tests for the pure modules (`settings-schema.js`, `utils/color.js`) use Node's built-in test runner — no test framework or other dependency required.

```bash
npm test
```

This runs every `test/*.test.js` file and prints a TAP summary. The suite covers schema defaults, validation (name length, color hex format, partial / null / garbage input), and the `hexToRgba` helper (valid conversions, case insensitivity, invalid inputs throw).

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
├── main.js                       # Electron main process (pet + settings windows, tray, IPC)
├── preload.js                    # contextBridge API exposed to both renderers
├── forge.config.js               # Electron Forge config (packagers, makers, fuses)
├── package.json
├── src/
│   ├── index.html                # Pet window markup
│   ├── pet.js                    # Pet state machine
│   ├── renderer.js               # Pet renderer — applies settings, wires UI, drag-to-move
│   ├── styles.css                # Theme variables + pet styles + scoped settings styles
│   ├── settings.html             # Settings window markup
│   ├── settings.js               # Settings renderer — form logic
│   ├── settings-schema.js        # Pure defaults + validator (shared, UMD)
│   ├── main/
│   │   └── settings-store.js     # Main-process load/save (JSON in userData)
│   └── utils/
│       └── color.js              # Pure hexToRgba helper (shared, UMD)
├── test/
│   ├── settings-schema.test.js   # node:test suite for the schema validator
│   └── color.test.js             # node:test suite for hexToRgba
└── out/                          # Build output (gitignored)
```
