**English** | [Português (Brasil)](README.pt-BR.md)

# Desktop Pet

A Tamagotchi-style desktop companion built with [Electron](https://www.electronjs.org/). A small, transparent, always-on-top window sits in the corner of your screen with an ASCII art pet that you need to feed, play with, and put to sleep — or it will die.

## About Electron

[Electron](https://www.electronjs.org/) is a framework for building cross-platform desktop applications using web technologies (HTML, CSS, JavaScript). It bundles Chromium for rendering and Node.js for system access, letting a single codebase run on macOS, Windows, and Linux.

### A short history

Electron began on **March 13, 2013** as **Atom Shell**, the runtime [GitHub](https://github.com/) built to power the [Atom](https://github.blog/news-insights/product-news/sunsetting-atom/) text editor. It was created by Cheng Zhao (`zcbenz`) and the Atom team, open-sourced alongside Atom in 2014, and **renamed Electron in April 2015**. Electron 1.0 shipped in 2016. In **December 2019**, Electron joined the [OpenJS Foundation](https://openjsf.org/) as an incubation project, and graduated to **Impact Project** status in June 2020 — where it lives today, no longer formally owned by GitHub or Microsoft.

### Why it was created

GitHub needed a way to ship Atom — a single web codebase — as a real native app on macOS, Windows, and Linux. The options at the time (NW.js, Chromium Embedded Framework) didn't give the team the Node-plus-Chromium combination they wanted in one developer-friendly package. Atom Shell embedded both: web devs got full OS access through Node.js while keeping Chromium for the UI. One team, one stack, every desktop platform.

### Process model

Electron applications are split into two kinds of processes:

- **Main process** — a Node.js process that controls the application lifecycle, creates windows, and accesses native OS APIs (tray, notifications, file system).
- **Renderer process** — a Chromium process that runs the UI (the HTML/JS/CSS).

A **preload script** acts as a secure bridge between them, exposing a minimal API to the renderer via `contextBridge`. With context isolation enabled and Node integration disabled (the modern defaults), the renderer can only call what the preload chose to expose — it has no direct OS access.

### Notable apps in the wild

Beyond the household names — **VS Code**, **Slack**, **Discord** — Electron also powers:

- **GitHub Desktop** — Git GUI, one of the first non-Atom Electron apps
- **Figma Desktop** — design tool, with a WebAssembly editing engine layered on top
- **Notion**, **Obsidian** — note-taking and knowledge management
- **Signal Desktop**, **1Password 8** — security-sensitive apps that have publicly invested in Electron hardening
- **Spotify Desktop**

(Worth flagging: **WhatsApp Desktop** moved off Electron in December 2025 onto a native WebView2 wrapper — the ecosystem is healthy, not monolithic.)

### Tradeoffs to consider

Electron is famously contested, and the tradeoffs are real:

- **Memory** — each Electron app ships its own Chromium and Node runtime; nothing is shared between apps. Idle RAM per app is typically **150–400 MB**.
- **Bundle size** — installers usually weigh in at **80–250 MB** because Chromium and Node are bundled per app.
- **CPU / battery** — multi-process Chromium has measurable overhead at idle; lighter alternatives like Tauri report ~75% lower idle CPU.
- **Security surface** — the renderer runs web content while the main process has full OS access. If `nodeIntegration` is left on and the renderer has an XSS bug, the attacker effectively gets a shell.
- **Outdated Chromium** — apps that don't keep Electron updated ship known CVEs. A [USENIX Security 2024 study](https://www.usenix.org/system/files/usenixsecurity24-ali.pdf) found ~62% of audited Electron apps were running a version with known vulnerabilities.

Mitigations Electron has shipped over the years: `contextIsolation: true` default (v12, 2021), `nodeIntegration: false` default (v5, 2019), renderer sandbox by default (v20, 2022), ASAR integrity enforcement (v34+, 2026), and an 8-week release cadence aligned with Chromium Stable.

**Alternatives** in the same space: [Tauri](https://tauri.app/) (Rust backend + OS WebView; far smaller binaries, no bundled Chromium) and the older [NW.js](https://nwjs.io/).

### Bundler? No bundler.

Electron itself does not bundle JavaScript. There is no Webpack, Vite, or esbuild built in — the renderer loads `.html` and `.js` files like a browser, and Node sees `.js` files like Node. For packaging the *app* (not the JS), the official tooling is **[Electron Forge](https://www.electronforge.io/)**: it wraps `electron-packager`, produces platform-specific installers (Squirrel, DMG, deb/rpm, zip), and ships plugins for native module rebuilds, ASAR support, and security fuses. This project uses Electron Forge for packaging and intentionally skips a JS bundler entirely — see [Tech Stack](#tech-stack) and [Building a Distributable](#building-a-distributable) below.

## About This Project

`desktop-pet` is a minimal example of a stateful Electron app that lives in a frameless, transparent, always-on-top window in the bottom-right corner of your screen.

### Design choices

The project leans deliberately on Electron's bare-bones APIs to keep the code legible end-to-end:

- **No bundler** — renderers load plain `.js` modules with `<script>` tags; no Webpack, Vite, or build step. The whole `src/` tree is what runs.
- **No UI framework** — no React, Vue, or Svelte. The pet's state machine in `src/pet.js` writes directly to the DOM; CSS variables handle live re-theming.
- **Shared pure modules via UMD** — `src/settings-schema.js` and `src/utils/color.js` are loaded by both Node (main process, tests) and the browser renderer. A tiny UMD wrapper lets the same file work in both worlds without a build step.
- **Built-in `fs` for persistence** — no `electron-store` or `lowdb`; just `fs.readFile` / `fs.writeFile` on a JSON file in `app.getPath('userData')`. Validation handles corrupted input.
- **Node's built-in test runner** — `node --test` runs the suite; no Jest, Mocha, or Vitest. Only the pure modules are tested; Electron-touching code is verified by running the app.
- **Two windows, one preload** — the pet window and settings window share `preload.js`, so the `electronAPI` shape is identical in both renderers.

The ceiling is intentionally low so the architecture stays legible.

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

### Electron features used

What this project actually touches in the Electron API surface:

**Main process (`main.js`):**

- `app` — lifecycle (`whenReady`, `window-all-closed`, `quit`) and `app.getPath('userData')` for the settings file location
- `BrowserWindow` — frameless, transparent, always-on-top pet window + a separate settings window
- `screen.getPrimaryDisplay().workAreaSize` — positions the pet window in the bottom-right corner of the primary display
- `Tray` + `Menu.buildFromTemplate` — system tray icon with Feed / Play / Sleep / Settings / Stats / Quit
- `nativeImage.createFromDataURL` — builds the 16×16 tray icon from an inline data URL (no external icon file)
- `Notification` — native OS notifications when the pet is hungry, lonely, wakes up, or dies (throttled in the renderer)
- `ipcMain.on` and `ipcMain.handle` — IPC endpoints for `window-move`, `pet-notify`, `settings:get`, `settings:save`, `settings:open`
- `webContents.send` — broadcasts `settings:updated` to every open renderer after a save
- `webContents.openDevTools({ mode: 'detach' })` — detached DevTools when launched with `--dev`

**Preload (`preload.js`):**

- `contextBridge.exposeInMainWorld('electronAPI', { … })` — the only bridge between renderers and main
- `ipcRenderer.send` / `invoke` / `on` — wrapped to expose a small, typed-ish API surface

**Security defaults (both windows):**

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox` left at its default (true in Electron 20+) — renderers have no direct Node access

**Electron Forge plugins (`forge.config.js`):**

- `@electron-forge/plugin-fuses` — bakes Electron Fuses into the binary: `RunAsNode: false`, `EnableCookieEncryption: true`, `EnableNodeOptionsEnvironmentVariable: false`, `EnableNodeCliInspectArguments: false`, `EnableEmbeddedAsarIntegrityValidation: true`, `OnlyLoadAppFromAsar: true`
- `@electron-forge/plugin-auto-unpack-natives` — handles native modules at runtime (none are bundled today, but the plugin is wired in)

**Not used** (deliberately): `dialog`, `shell`, `clipboard`, `autoUpdater`, `remote` (deprecated). The project's surface area in Electron is just the pieces above.

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
