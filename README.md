# Desktop Pet

A tiny Tamagotchi-style desktop companion built with Electron and TypeScript.

## Preview

Four swappable pet types:

```
Pixel:  (＾▽＾)   Tama:  (●'◡'●)   Bot:  [⌐■_■]   Ghost:  👻
```

## Requirements

- Node.js 20+ (Electron 35 ships its own Node).
- npm 10+.
- macOS, Windows, or Linux desktop.

## Quick start

```
npm install
npm start
```

## Development

```
npm run dev          # esbuild watch + Electron launch
npm run build        # one-shot bundle to dist/
npm run typecheck    # tsc --noEmit
npm run lint         # ESLint (typescript-eslint, type-checked)
npm run lint:fix     # ESLint with auto-fixes
npm run format       # Prettier write
npm run format:check # Prettier check (no writes)
```

In development mode (`npm run dev`), main process changes require relaunching `npm run dev` (Ctrl-C then re-run); renderer changes apply on `Cmd+R` with devtools open. Pass `--dev` to Electron to auto-open devtools detached.

## Project structure

```
desktop-pet/
├── src/
│   ├── main/
│   │   ├── index.ts          BrowserWindow, tray, IPC, lifecycle
│   │   └── state-store.ts    atomic JSON persistence + debounce + sync flush
│   ├── preload/
│   │   └── index.ts          contextBridge.exposeInMainWorld
│   ├── renderer/
│   │   ├── index.ts          orchestrator
│   │   ├── pet.ts            Pet state machine (pure logic)
│   │   ├── animation-queue.ts sprite animation sequences
│   │   ├── drag.ts           rAF-throttled draggable helper
│   │   ├── keyboard.ts       F/P/S keyboard shortcuts
│   │   ├── sticky-reveal.ts  critical-state observer
│   │   ├── settings-ui.ts    in-app settings overlay
│   │   └── global.d.ts       window.electronAPI type
│   ├── shared/
│   │   ├── state-types.ts    PetState, Settings, AppState
│   │   ├── ipc-types.ts      IpcChannels, ElectronAPI
│   │   ├── pet-types.ts      pet sprite catalog (4 types)
│   │   ├── config.ts         tunable constants
│   │   └── typed-emitter.ts  generic typed event emitter
│   ├── index.html
│   └── styles.css
├── scripts/
│   ├── build.ts
│   └── dev.ts
└── dist/                     build output (gitignored)
```

## Architecture

The Electron app builds into three esbuild bundles: main (Node, CJS), preload (Node, CJS), and renderer (browser, IIFE). The renderer owns the pet state machine in memory and emits typed events (`change`, `notify`, `death`) through a generic `TypedEmitter`.

Persistence flows renderer → main: the renderer sends snapshots via `ipcRenderer.invoke('state:save', ...)` with a 500ms debounce. The main process writes JSON to a `.tmp.PID` sibling file and renames atomically over the destination. On `before-quit`, any pending state is flushed synchronously.

The `Pet` class in `src/renderer/pet.ts` contains zero DOM and zero Electron imports — it runs in plain Node and could be unit-tested in isolation. Notifications, IPC, and DOM updates are wired in the renderer orchestrator.

The hover-only UI uses a small "hot zone" wrapping just the sprite and name. JavaScript adds a `.is-hovered` class to `#pet-container` on `mouseenter` of `#hover-zone` and removes it on `mouseleave` of the full container, so users can move from the sprite to the action buttons without losing hover. The settings overlay suppresses the hide while open. The renderer also applies a `.sticky-reveal` class to individual stat rows whose value drops below `CONFIG.THRESHOLDS.stickyRevealAt`. IPC channels are typed once in `src/shared/ipc-types.ts` and enforced on the preload side with a `satisfies ElectronAPI` clause.

## Configuration

All tunable values (decay rates, thresholds, window size, animation frames, notification cooldown) live in `src/shared/config.ts` as a single `CONFIG` constant. The four pet types and their sprite maps live in `src/shared/pet-types.ts`. Edit these two files to retune or add pet types — no other code change required.

## Pet types

| ID      | Display name | Sample sprites               |
| ------- | ------------ | ---------------------------- |
| `pixel` | Pixel        | `(＾▽＾)` `(・ω・)` `(╥﹏╥)` |
| `tama`  | Tama         | `(●'◡'●)` `(◕‿◕)` `(｡•́︿•̀｡)` |
| `bot`   | Bot          | `[◕‿◕]` `[⌐■_■]` `[×_×]`     |
| `ghost` | Ghost        | `👻✨` `👻` `👻💧`           |

Switch pet type from the in-app settings panel — click the gear icon when hovering the pet.

## Keyboard shortcuts

- `F` — Feed
- `P` — Play
- `S` — Sleep / wake toggle

Shortcuts only fire when the pet window is focused, no modifier keys are pressed, and the focus is not inside an `<input>`, `<textarea>`, or `<select>`. The settings overlay suppresses shortcuts globally while open.

## State file location

State persists to `<userData>/desktop-pet/state.json` where `<userData>` is Electron's `app.getPath('userData')`:

- macOS: `~/Library/Application Support/desktop-pet/`
- Windows: `%APPDATA%\desktop-pet\`
- Linux: `~/.config/desktop-pet/`

Delete `state.json` to reset persisted state. Corrupted JSON or any unknown `schemaVersion` (anything other than `1`) falls back to defaults automatically and the file is rewritten on the next save.

## Tooling

- TypeScript 5 (strict mode, `--noEmit`)
- esbuild bundler (3 entries)
- ESLint v9 flat config with `typescript-eslint` recommendedTypeChecked
- Prettier 3 (2-space, single quote, trailing comma, 100 width)
- `.editorconfig` for editor-agnostic settings

No test framework in this version. The pet state machine is intentionally a pure module so it can be unit-tested when a runner is added later.

## License

Not currently licensed.
