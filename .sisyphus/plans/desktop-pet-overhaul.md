# Desktop Pet — TypeScript & UX Overhaul

> Refactor of an Electron 35 desktop pet from pure JavaScript to strict TypeScript with esbuild,
> hover-only UI, decoupled pet state machine, multiple pet-type catalog, in-app settings panel,
> persistent state, animation sequences, and modernized tooling.
>
> **Verification model:** No automated test framework is in scope (user picked "Standard" tooling
> = TS + ESLint + Prettier + EditorConfig only). Every acceptance criterion is observable via
> the running Electron app or via static file inspection. Each task's Manual QA section lists
> the concrete UI interactions or shell commands that exercise the code paths it introduces.

---

## 0. Executive Summary

**Goal.** Replace ~321 LOC of plain JS with a strict-TypeScript, esbuild-bundled, modular
Electron app while delivering the user-confirmed UX overhaul (hover-only chrome, sticky-reveal
pulse on critical stats, in-app settings panel, multiple pet types, animation sequences,
state persistence, keyboard shortcuts, drag polish).

**Approach.** 18 atomic tasks organized into 6 waves with parallel widths up to 7.
Single feature branch `refactor/typescript-overhaul`. One commit per task. The branch is
expected to leave the running app temporarily broken during intermediate commits (specifically
between W3-A and W4-A) and is not merged to `main` until the W5 manual QA gate passes.

**Numbers.**
- **18 tasks** · **6 waves**
- **Critical path:** `W0-A → W1-A → W2-A → W3-F → W4-A → W5-A` (6 hops)
- **Widest wave:** Wave 3 (7 parallel tasks)
- **Expected commits:** 17–22 (one per task + 0–4 fixup commits as QA may surface)

---

## 1. Project Snapshot (Pre-refactor)

| File | LOC | Role |
|---|---:|---|
| `main.js` | 74 | Electron main: window, tray, 2 IPC handlers (`window-move`, `pet-notify`) |
| `preload.js` | 7 | `contextBridge` exposing `onAction` / `moveWindow` / `notify` |
| `src/index.html` | 41 | Container with sprite, name, 3 stat bars, 3 buttons, status message |
| `src/pet.js` | 126 | `Pet` class — mood derivation, decay, actions, notification cooldown |
| `src/renderer.js` | 114 | DOM updates, drag, button/tray-action handlers |
| `src/styles.css` | 138 | Dark chrome, bounce/sway animations, color-coded stat bars |
| `package.json` | 13 | One devDep (`electron@^35.0.0`), two scripts (`start`, `dev`) |
| `.gitignore` | 3 | `node_modules/`, `dist/`, `.DS_Store` (already correct) |

Git state: clean working tree, branch `main`, single commit `b537e6c Initial commit`.

### Magic-numbers catalog (all extracted into `src/shared/config.ts`)

~~~
WINDOW.width=200  WINDOW.height=250  WINDOW.marginRight=250  WINDOW.marginBottom=280
DECAY_INTERVAL_MS=30_000
DECAY_RATES.hunger=3  .happiness=2  .energy=1
DECAY_RATES.sleepingEnergyGain=5  .sleepingHungerLoss=1
ACTION_EFFECTS.feed.hunger=+25  .feed.happiness=+5
ACTION_EFFECTS.play.happiness=+20  .play.energy=-10  .play.hunger=-5
NOTIFICATION_COOLDOWN_MS=60_000
THRESHOLDS.notifyAt=15  .stickyRevealAt=15  .critical=20
MOOD_THRESHOLDS.hungry=20  .sad=20  .happyHappiness=60  .happyHunger=40
INITIAL_STATS.hunger=80  .happiness=80  .energy=80
ANIMATION.frameMs=300
ANIMATION.feedFrames=['🤤','😋','😊']
ANIMATION.playFrames=['😄','🎾','😆']
ANIMATION.sleepFrames=['😴','💤']
DRAG.maxFps=60
~~~

---

## 2. Target Architecture

### 2.1 Final directory layout

~~~
desktop-pet/
├── src/
│   ├── main/
│   │   ├── index.ts                # BrowserWindow, tray, IPC, lifecycle
│   │   └── state-store.ts          # atomic JSON read/write + debounce
│   ├── preload/
│   │   └── index.ts                # contextBridge.exposeInMainWorld
│   ├── renderer/
│   │   ├── index.ts                # orchestrator (Wave 4)
│   │   ├── pet.ts                  # state machine (decoupled)
│   │   ├── animation-queue.ts      # sprite animation sequences
│   │   ├── drag.ts                 # rAF-throttled draggable helper
│   │   ├── keyboard.ts             # F/P/S shortcuts
│   │   ├── sticky-reveal.ts        # per-stat <15 pulse observer
│   │   ├── settings-ui.ts          # in-app settings overlay
│   │   └── global.d.ts             # window.electronAPI typing
│   ├── shared/
│   │   ├── state-types.ts          # PetState, Settings, AppState
│   │   ├── ipc-types.ts            # IpcChannels, ElectronAPI surface
│   │   ├── pet-types.ts            # PetTypeDefinition catalog (4 types)
│   │   ├── config.ts               # all magic numbers
│   │   └── typed-emitter.ts        # generic typed EventEmitter
│   ├── index.html                  # restructured for hover + overlay + ⚙
│   └── styles.css                  # hover-only refactor
├── scripts/
│   ├── build.ts                    # esbuild one-shot + copy HTML/CSS
│   └── dev.ts                      # esbuild watch + copy HTML/CSS + spawn Electron
├── dist/                           # build output, gitignored
│   ├── main.js
│   ├── preload.js
│   ├── renderer.js
│   ├── index.html                  # copied from src
│   └── styles.css                  # copied from src
├── eslint.config.mjs               # ESLint v9 flat config, projectService:true
├── .prettierrc                     # 2sp, single-quote, trailing-comma, 100w
├── .prettierignore
├── .editorconfig                   # utf-8, lf, 2sp
├── tsconfig.json                   # strict, noEmit
└── package.json                    # new scripts + devDeps
~~~

There is no `test/` directory and no test runner in scope.

### 2.2 Build pipeline (esbuild 0.20+ context API)

| Bundle | platform | format | target | external | outfile |
|---|---|---|---|---|---|
| main | `node` | `cjs` | `node20` | `['electron']` | `dist/main.js` |
| preload | `node` | `cjs` | `node20` | `['electron']` | `dist/preload.js` |
| renderer | `browser` | `iife` | `chrome130` | `[]` | `dist/renderer.js` |

`scripts/build.ts` performs a one-shot build of all three entries, then copies
`src/index.html` and `src/styles.css` into `dist/` so the packaged main process can
load them relatively.

`scripts/dev.ts`:
1. Creates the three esbuild contexts with `sourcemap: 'inline'`.
2. Calls `.watch()` on all three.
3. Copies `index.html` and `styles.css` to `dist/` initially.
4. Uses `fs.watch` on `src/index.html` and `src/styles.css` to re-copy on change.
5. Spawns `electron dist/main.js --dev` after the initial build completes.
6. On `SIGINT`, disposes the contexts and kills the Electron child process.

Limitations (documented for the team):
- Main and preload changes require closing the Electron process and re-running `npm run dev`.
- Renderer changes apply on a window reload (`Cmd+R` with devtools open in dev mode).

`package.json` scripts (final state, post Wave 0):

~~~
"build"        : "tsx scripts/build.ts"
"dev"          : "tsx scripts/dev.ts"
"start"        : "npm run build && electron ."   (set in W3-A)
"typecheck"    : "tsc --noEmit"
"lint"         : "eslint ."
"lint:fix"     : "eslint . --fix"
"format"       : "prettier --write ."
"format:check" : "prettier --check ."
~~~

`"main"` in `package.json` switches from `main.js` to `dist/main.js` in W3-A. Before W3-A
it remains `main.js` so the legacy app keeps running.

### 2.3 IPC contract

~~~typescript
// src/shared/ipc-types.ts
import type { AppState } from './state-types'

export interface IpcChannels {
  'state:load':  { request: void;                        response: AppState | null }
  'state:save':  { request: AppState;                    response: void }
  'window:move': { request: { dx: number; dy: number };  response: void }
  // main → renderer broadcast for tray actions:
  'tray:action': { broadcast: 'feed' | 'play' | 'sleep' | 'stats' }
}

export type TrayAction = IpcChannels['tray:action']['broadcast']

export interface ElectronAPI {
  loadState:    () => Promise<AppState | null>
  saveState:    (state: AppState) => Promise<void>
  moveWindow:   (delta: { dx: number; dy: number }) => void
  onTrayAction: (cb: (action: TrayAction) => void) => () => void
  notify:       (title: string, body: string) => void
}
~~~

- `state:load`, `state:save` → `ipcRenderer.invoke` / `ipcMain.handle` (typed Promise reply).
- `window:move` → `ipcRenderer.send` (fire-and-forget; high frequency).
- `tray:action` → `webContents.send` from main to renderer.
- `notify` keeps the existing fire-and-forget `pet-notify` channel name internally for backwards compatibility with main-process notification handling.

### 2.4 State persistence flow

~~~
renderer Pet.tick() / Pet.action()
  → renderer debounce (500ms)
  → ipcRenderer.invoke('state:save', state)
  → main: cachedState = state; scheduleAtomicWrite()
                          ↓
                   fs.writeFile(tmp) → fs.rename(tmp, state.json)

app.on('before-quit', e):
  if (saveInFlight || cachedState dirty):
    e.preventDefault()
    flushSync(cachedState)
    app.exit(0)

renderer startup:
  → ipcRenderer.invoke('state:load')
  → main: fs.readFile + JSON.parse + schemaVersion check → AppState | null
  → renderer: new Pet(loaded ?? defaults)
~~~

State file location: `path.join(app.getPath('userData'), 'desktop-pet', 'state.json')`.

### 2.5 Event flow (renderer)

~~~
Pet (TypedEmitter<PetEvents>)
  ├─ emit 'change' { state, mood }       ← every tick, every action, every load
  ├─ emit 'notify' { title, body, key }  ← internal 60s cooldown enforced
  └─ emit 'death'  { state }             ← all stats reach 0

renderer/index.ts subscribes:
  on 'change' → updateUI(), debouncedSave(), stickyReveal.evaluate()
  on 'notify' → electronAPI.notify(title, body)
  on 'death'  → applyDeathClass(), allow click-to-reset
~~~

`pet.ts` imports zero Electron APIs and never touches the DOM. Notifications are routed
exclusively through the renderer orchestrator.

### 2.6 Hover-only UI behavior (approved micro-decisions baked in)

| Element | Idle state | On `#pet-container:hover` | On `.sticky-reveal` (per-row) |
|---|---|---|---|
| `#sprite`, `#name` | always visible | always visible | unchanged |
| `#pet-container` bg + border | transparent / no border | `rgba(30,30,40,0.88)` + 2px border, 200ms ease | unchanged |
| `#stats` | `opacity: 0` | `opacity: 1`, 200ms | unchanged at parent level |
| individual `.stat` | inherits 0 | inherits 1 | own micro-backdrop pill + pulse 1.5s (overrides parent opacity) |
| `#buttons` | `opacity: 0` | `opacity: 1`, 200ms | unchanged |
| `#status-message` | `opacity: 0` | `opacity: 1`, 200ms | unchanged |
| `#settings-overlay` | `hidden` attribute | `hidden` attribute (toggled by ⚙) | unchanged |
| cursor on container | `grab` | `grab` | unchanged |
| cursor during drag | `grabbing` (via `html.dragging` class) | n/a | unchanged |

**Critical implementation note:** `#pet-container` must remain solid for hit-testing. Use
`background: transparent` plus `border: none` in the idle state — never `pointer-events: none`,
because that would break hover detection on the transparent zone.

**Sticky-reveal pill (per-row backdrop, approved):**

~~~css
.stat.sticky-reveal {
  opacity: 1;
  background: rgba(30, 30, 40, 0.70);
  border-radius: 10px;
  padding: 2px 6px;
  animation: sticky-pulse 1.5s ease-in-out infinite;
}

@keyframes sticky-pulse {
  0%, 100% { transform: scale(1.00); filter: brightness(1.0); }
  50%      { transform: scale(1.04); filter: brightness(1.2); }
}
~~~

### 2.7 Canonical type contracts

~~~typescript
// src/shared/state-types.ts
export type Mood     = 'happy' | 'idle' | 'sad' | 'hungry' | 'sleeping' | 'dead'
export type PetTypeId = 'pixel' | 'tama' | 'bot' | 'ghost'

export interface PetState {
  hunger: number      // 0..100
  happiness: number   // 0..100
  energy: number      // 0..100
  alive: boolean
  isSleeping: boolean
}

export interface Settings {
  petName: string
  decayMultiplier: number   // 0.5..2
  petTypeId: PetTypeId
}

export interface AppState {
  schemaVersion: 1
  pet: PetState
  settings: Settings
}

// src/shared/pet-types.ts
export interface SpriteMap {
  happy: string; idle: string; sad: string
  hungry: string; sleeping: string; dead: string
}
export interface PetTypeDefinition {
  id: PetTypeId
  displayName: string
  sprites: SpriteMap
  decayProfileMultiplier: number
}

// src/shared/typed-emitter.ts events for Pet
export interface PetEvents {
  change: { state: PetState; mood: Mood }
  notify: { title: string; body: string; key: string }
  death:  { state: PetState }
}
~~~

**Pet type catalog (approved IDs and sprite sets):**

| ID | Display name | happy | idle | sad | hungry | sleeping | dead |
|---|---|---|---|---|---|---|---|
| `pixel` | Pixel | `(＾▽＾)` | `(・ω・)` | `(╥﹏╥)` | `(；⌣̀_⌣́)` | `(－ω－) zzZ` | `(✖╭╮✖)` |
| `tama` | Tama | `(●'◡'●)` | `(◕‿◕)` | `(｡•́︿•̀｡)` | `(｡>﹏<｡)` | `(-‿-) Zzz` | `(×﹏×)` |
| `bot` | Bot | `[◕‿◕]` | `[⌐■_■]` | `[×_×]` | `[O_O]` | `[-‿-] zZ` | `[✗_✗]` |
| `ghost` | Ghost | `👻✨` | `👻` | `👻💧` | `👻🍽️` | `👻💤` | `💀` |

All four entries use `decayProfileMultiplier: 1.0` in v1 (field wired but value uniform;
later versions can differentiate without breaking shape).

---

## 3. File-Level Migration Map

| Old | New | Notes |
|---|---|---|
| `main.js` | `src/main/index.ts` + `src/main/state-store.ts` | Persistence split into its own module. Tray, window, IPC stay together. |
| `preload.js` | `src/preload/index.ts` + `src/renderer/global.d.ts` | Typed `ElectronAPI` exposure. `Window` augmented in the global declaration. |
| `src/index.html` | `src/index.html` (restructured) | `data-stat` attrs added; `#settings-overlay`, `#btn-settings`; `pet.js` script tag removed; only bundled `renderer.js` loaded. |
| `src/pet.js` | `src/renderer/pet.ts` | Decoupled from `window.electronAPI`. Emits events via TypedEmitter. Reads everything from `config.ts`. |
| `src/renderer.js` | `src/renderer/index.ts` + `animation-queue.ts` + `drag.ts` + `keyboard.ts` + `sticky-reveal.ts` + `settings-ui.ts` | Modularized. |
| `src/styles.css` | `src/styles.css` (rewritten) | Hover-only chrome, sticky-pulse keyframe, settings overlay, `grabbing` cursor. |
| (new) | `src/shared/{config,state-types,ipc-types,pet-types,typed-emitter}.ts` | Shared layer. |
| (new) | `scripts/{build,dev}.ts` | esbuild orchestration. |
| (new) | `tsconfig.json`, `eslint.config.mjs`, `.prettierrc`, `.prettierignore`, `.editorconfig` | Tooling. |
| `package.json` | `package.json` (updated) | New scripts, devDeps, `"main": "dist/main.js"` (set in W3-A). |

Files removed at the end of Wave 4 (W4-A cleanup): `main.js`, `preload.js`, `src/pet.js`, `src/renderer.js`.

---

## 4. Wave-by-Wave Task Graph

~~~
W0-A (foundation)
   │
   ├──> W1-A (shared types)
   ├──> W1-B (config + pet types)
   └──> W1-C (TypedEmitter)
                │
                ├──> W2-A (Pet state machine)        ◄── needs W1-A, W1-B, W1-C
                ├──> W2-B (state-store)              ◄── needs W1-A
                ├──> W2-C (animation queue)          ◄── needs W1-B
                └──> W2-D (drag helper)              ◄── needs W1-A
                              │
                              ├──> W3-A (main process)     ◄── W2-B
                              ├──> W3-B (preload)          ◄── W1-A
                              ├──> W3-C (HTML)             ◄── W1-A/B (contract only)
                              ├──> W3-D (CSS)              ◄── W3-C structure
                              ├──> W3-E (keyboard)         ◄── W2-A
                              ├──> W3-F (sticky-reveal)    ◄── W2-A
                              └──> W3-G (settings UI)      ◄── W2-A, W1-B
                                            │
                                            └──> W4-A (renderer orchestrator) ◄── all W3
                                                          │
                                                          ├──> W5-A (E2E QA)
                                                          └──> W5-B (README)
~~~

| Wave | Parallel width | Sequential time | Blocker for |
|---|---:|---|---|
| W0 | 1 | bootstrap | all |
| W1 | 3 | shared contracts | W2 |
| W2 | 4 | domain logic | W3 |
| W3 | 7 | integration shell | W4 |
| W4 | 1 | orchestrator | W5 |
| W5 | 2 | QA + docs | merge to main |

---

## 5. Per-Task Specifications

Every task is dispatched via `task(category=..., load_skills=[...], description=..., prompt=..., run_in_background=...)`. Each commit must pass `tsc --noEmit && eslint . && prettier --check . && npm run build` (build artifact exists) before being pushed. Commits follow the Conventional Commits style.

---

### Wave 0 — Foundation

#### W0-A · Bootstrap TypeScript + esbuild + lint + Prettier

- **Depends on:** —
- **Files (create):**
  `tsconfig.json`, `eslint.config.mjs`, `.prettierrc`, `.prettierignore`, `.editorconfig`,
  `scripts/build.ts`, `scripts/dev.ts`,
  stub TS entries `src/main/index.ts`, `src/preload/index.ts`, `src/renderer/index.ts` (each containing `export {}`)
- **Files (modify):** `package.json`
- **Files (delete):** none — legacy JS stays untouched.
- **DevDeps to add:**
  `typescript@^5.6`, `esbuild@^0.24`, `tsx@^4`, `@types/node@^22`,
  `eslint@^9`, `typescript-eslint@^8`, `@eslint/js@^9`,
  `prettier@^3`, `eslint-config-prettier@^9`
- **DevDeps NOT to add:** `@types/electron` (Electron 35 ships its own .d.ts; adding `@types/electron` would shadow them with stale definitions). No test framework, no `electronmon`.
- **`tsconfig.json`** highlights:
  `"strict": true`, `"noEmit": true`, `"target": "ES2022"`, `"module": "CommonJS"`,
  `"moduleResolution": "bundler"`, `"esModuleInterop": true`,
  `"noUnusedLocals": true`, `"noUnusedParameters": true`, `"noImplicitOverride": true`,
  `"skipLibCheck": false`, `"include": ["src/**/*", "scripts/**/*"]`
- **`eslint.config.mjs`** highlights:
  Flat config; uses `tseslint.configs.recommendedTypeChecked` with
  `parserOptions.projectService: true`; disables type-checked rules on `.{js,mjs,cjs}`;
  ends with `eslint-config-prettier` to silence stylistic conflicts.
- **`.prettierrc`:** `{ "semi": false, "singleQuote": true, "trailingComma": "all", "printWidth": 100, "tabWidth": 2 }`
- **`.editorconfig`:** `root = true`, `[*]` → `charset=utf-8`, `end_of_line=lf`, `indent_style=space`, `indent_size=2`, `insert_final_newline=true`, `trim_trailing_whitespace=true`.
- **`package.json` changes:**
  - Add scripts: `build`, `dev`, `typecheck`, `lint`, `lint:fix`, `format`, `format:check`.
  - Keep `"start": "electron ."` and `"main": "main.js"` (they switch in W3-A).
  - Keep existing `"dev"` value will be overwritten by the new script.
- **Acceptance criteria:**
  - `npm install` exits 0.
  - `npm run typecheck` exits 0 with the three `export {}` stubs.
  - `npm run lint` exits 0.
  - `npm run format:check` exits 0.
  - `npm run build` produces `dist/main.js`, `dist/preload.js`, `dist/renderer.js`, `dist/index.html`, `dist/styles.css`.
  - `npm run dev` enters watch mode; touching `src/main/index.ts` causes esbuild to rebuild within ~1 second; Ctrl-C disposes contexts and kills Electron cleanly.
  - `npm start` still launches the original pet (legacy `main.js`) and behavior is unchanged from `main` branch.
- **Manual QA via the running app:**
  1. After `npm install`, run `npm start` — pet appears bottom-right; feed/play/sleep buttons work; tray menu present; drag works; OS notification fires below threshold. Confirms the bootstrap did not regress the legacy app.
  2. Run `npm run build` — list `dist/` contents and confirm all 5 files present, each non-empty.
  3. Run `npm run dev` in one terminal — touch `src/renderer/index.ts` with a no-op edit — observe esbuild rebuild line.
- **task() invocation:**
  `category="deep", load_skills=["git-master"], description="Bootstrap TS + esbuild + lint", run_in_background=false`
- **Commit:** `chore: bootstrap TypeScript, esbuild, ESLint, Prettier tooling`

---

### Wave 1 — Shared Contracts (3 parallel)

#### W1-A · Shared type contracts

- **Depends on:** W0-A
- **Files (create):** `src/shared/state-types.ts`, `src/shared/ipc-types.ts`
- **Acceptance criteria:**
  - Exports `Mood`, `PetTypeId`, `PetState`, `Settings`, `AppState` exactly as in §2.7.
  - Exports `IpcChannels`, `TrayAction`, `ElectronAPI` exactly as in §2.3.
  - Files contain types only — zero runtime code, zero imports from `electron`.
  - `npm run typecheck` exits 0.
- **Manual QA via the running app:**
  - This module has no runtime surface. Verification happens implicitly when downstream tasks consume the types and `tsc --noEmit` passes.
  - Static spot-check: open both files and verify field names/types verbatim against §2.7 and §2.3.
- **task():** `category="deep", load_skills=[], description="Shared type contracts", run_in_background=true` (parallel-safe)
- **Commit:** `feat(types): add shared IPC and state type contracts`

#### W1-B · Config + pet types catalog

- **Depends on:** W0-A, W1-A
- **Files (create):** `src/shared/config.ts`, `src/shared/pet-types.ts`
- **Acceptance criteria — `config.ts`:**
  - Exports a single `as const` object `CONFIG` containing every entry from §1 catalog under nested keys (`WINDOW`, `DECAY_INTERVAL_MS`, `DECAY_RATES`, `ACTION_EFFECTS`, `THRESHOLDS`, `MOOD_THRESHOLDS`, `INITIAL_STATS`, `ANIMATION`, `NOTIFICATION_COOLDOWN_MS`, `DRAG`).
  - All numeric values match the legacy values byte-for-byte (no rounding, no recalibration).
  - Animation frame arrays are `readonly` (`as const`).
  - File contains zero imports.
- **Acceptance criteria — `pet-types.ts`:**
  - Exports `PET_TYPES: Readonly<Record<PetTypeId, PetTypeDefinition>>` populated with the 4 entries from §2.7 table.
  - Exports `getPetType(id: PetTypeId): PetTypeDefinition`.
  - Exports `PET_TYPE_LIST: readonly PetTypeDefinition[]` (used by settings UI dropdown).
  - `getPetType('pixel')` returns the original kaomoji set, byte-for-byte preserving the legacy `src/pet.js` values.
- **Manual QA via the running app:**
  - Verified once W4-A integrates: launch app → pet shows the original Pixel kaomoji on first run with default settings, confirming `pixel` sprite map matches the legacy values.
  - Static spot-check: open both files, eyeball each value against §1 catalog and §2.7 table.
  - `npm run typecheck` exits 0 — confirms `as const` narrowings.
- **task():** `category="deep", load_skills=[], description="Config + pet type catalog", run_in_background=true`
- **Commit:** `feat(config): centralize magic numbers and pet type catalog`

#### W1-C · TypedEmitter

- **Depends on:** W0-A
- **Files (create):** `src/shared/typed-emitter.ts`
- **Acceptance criteria:**
  - Exports `class TypedEmitter<Events extends Record<string, unknown>>`.
  - Public API: `on(event, handler): this`, `off(event, handler): this`, `once(event, handler): this`, `emit(event, payload): void`, `removeAllListeners(event?): void`.
  - Internal storage uses `Map<keyof Events, Set<Handler>>`.
  - `emit` wraps each handler call in try/catch and `console.error`s thrown errors so one bad handler cannot suppress siblings.
  - Strict typing: `emit('change', wrongShape)` is a compile error.
  - Zero runtime dependencies.
- **Manual QA via the running app:**
  - Verified once W4-A wires it into Pet:
    1. Trigger feed → observe sprite + bars update in lockstep → confirms `change` handler chain works.
    2. Let hunger drop below 15 → notification fires once → confirms `notify` payload routing.
    3. Force all stats to 0 (use console: open devtools → set `pet.hunger = pet.happiness = pet.energy = 0` then await next tick) → death sprite applied once, no second death notification → confirms `death` emission and that the orchestrator's once-style handling works.
    4. Reset pet → app continues to update correctly → confirms no stale once-listener pollution.
  - Static spot-check: verify API matches §2.5 PetEvents shape.
- **task():** `category="ultrabrain", load_skills=[], description="TypedEmitter generic", run_in_background=true`
- **Commit:** `feat(emitter): add generic TypedEmitter for renderer event flow`

---

### Wave 2 — Domain Logic (4 parallel)

#### W2-A · Pet state machine

- **Depends on:** W1-A, W1-B, W1-C
- **Files (create):** `src/renderer/pet.ts`
- **Files (delete in W4-A cleanup):** `src/pet.js`
- **Acceptance criteria:**
  - `class Pet extends TypedEmitter<PetEvents>` (or composes one as `private events`).
  - Constructor signature: `constructor(initial?: AppState)`. With no argument, hydrates from `CONFIG.INITIAL_STATS` plus default settings (`petName: 'Pixel'`, `decayMultiplier: 1`, `petTypeId: 'pixel'`).
  - With an `AppState` argument, hydrates every persisted field including settings.
  - Public methods: `feed()`, `play()`, `sleep()`, `reset()`, `tick()`, `start()`, `stop()`, `snapshot(): AppState`, `applySettings(partial: Partial<Settings>): void`.
  - Public readonly accessors: `mood`, `sprite`, `state`, `settings`.
  - `sprite` resolves via `getPetType(settings.petTypeId).sprites[mood]`.
  - Mood derivation order: `!alive → dead`, `isSleeping → sleeping`, `hunger < 20 → hungry`, `happiness < 20 → sad`, `happiness > 60 && hunger > 40 → happy`, else `idle`. Byte-identical to legacy.
  - `start()` begins `setInterval(this.tick, CONFIG.DECAY_INTERVAL_MS / settings.decayMultiplier)`. `stop()` clears it.
  - `applySettings()` that changes `decayMultiplier` must `stop()` and `start()` to apply the new rate; other field changes never restart the interval.
  - Notification cooldown: per `key`, suppress repeats within `CONFIG.NOTIFICATION_COOLDOWN_MS`. Keys used: `'hunger-low'`, `'happiness-low'`, `'wake'`, `'death'`.
  - `change` is emitted after every state-mutating operation (action, tick, reset, applySettings) and once on construction (or in `start()` — pick one and document; recommended: `start()` so handlers can be attached before first emission).
  - `death` is emitted exactly once at the alive→dead transition; subsequent ticks do not re-emit.
  - **Hard rule:** zero references to `window`, `document`, `electron`, `ipcRenderer`, `Notification`. File is portable to a Node REPL.
- **Manual QA via the running app (verified after W4-A integration):**
  1. **All 6 moods reachable.** Launch fresh. Sprite is `pixel` happy initially. Open devtools, run `(window as any).__pet.state.happiness = 10` then click play (or wait for a tick) → sprite changes to SAD. Set `hunger = 10` → sprite changes to HUNGRY (hungry wins because it comes first in derivation). Click sleep → SLEEPING. Force all to zero → DEAD.
  2. **Action clamps at 100.** Click feed repeatedly until hunger bar visibly maxed; click feed once more → bar stays at 100 (no overshoot or visual glitch).
  3. **Actions ignored when dead.** With dead sprite, click feed/play/sleep → no visible change. Click feed twice in succession → on the second click the orchestrator triggers reset (this is the W4 reset-on-click behavior, not the Pet method).
  4. **Actions ignored when sleeping.** Toggle sleep, then click feed → no change.
  5. **Play deltas correct.** Note exact bar widths (use devtools to read `pet.state`); click play; verify `happiness +20`, `energy −10`, `hunger −5`.
  6. **Decay observed.** Idle the app for one full decay interval; hunger drops by exactly 3, happiness by 2, energy by 1.
  7. **decayMultiplier applied.** Open settings → set decay to `2.0` → time the next decay tick — fires roughly every 15 seconds. Set back to `1.0` → confirms restart logic.
  8. **Sleeping recovery + auto-wake.** Force `pet.state.energy = 50` and click sleep → wait two ticks → energy increases by 10, hunger decreases by 2. Continue until energy reaches 100 → app emits the `Good morning!` notification, `isSleeping` flips to false. The wake notification appears exactly once.
  9. **Threshold notification dedup.** Drop hunger to 14 → "I'm hungry!" notification fires. Keep ticking — no further notification for 60 seconds. After 60 seconds, the notification fires again (as long as still <15).
  10. **Death emission.** Force all stats to 0 → death notification appears once and `dead` sprite renders. Continue ticking → no further death notifications.
  11. **Reset semantics.** Call `pet.reset()` from devtools (or click after death) → stats return to `INITIAL_STATS`, `alive=true`, `isSleeping=false`, sprite returns to mood (happy/idle).
  12. **Snapshot integrity.** Run `JSON.stringify(pet.snapshot()) === JSON.stringify(pet.snapshot())` twice in devtools — strings equal. Mutate `pet.snapshot().pet.hunger = 0` — `pet.state.hunger` unchanged (confirms deep clone).
- **task():** `category="deep", load_skills=[], description="Pet state machine port", run_in_background=true`
- **Commit:** `feat(pet): port pet state machine to TypeScript with event emitter`

#### W2-B · State store (main process)

- **Depends on:** W1-A
- **Files (create):** `src/main/state-store.ts`
- **Acceptance criteria:**
  - `export async function loadState(userDataDir: string): Promise<AppState | null>`:
    - Reads `${userDataDir}/desktop-pet/state.json`.
    - Returns `null` on `ENOENT`.
    - Returns `null` if `JSON.parse` throws (and `console.warn`s the corruption).
    - Returns `null` if `schemaVersion !== 1` (and `console.warn`s the mismatch).
    - Otherwise returns the parsed `AppState`.
  - `export async function saveStateAtomic(userDataDir: string, state: AppState): Promise<void>`:
    - `mkdir -p` the parent directory.
    - Writes to `${path}.tmp.${process.pid}` then `fs.rename` to the final path.
    - On any error, attempts to clean up the temp file and rethrows.
  - `export function makeDebouncedSaver(userDataDir: string, debounceMs = 500)`:
    - Returns `{ schedule(state), flushSync(state), cancel(), isPending() }`.
    - `schedule` resets the timer on each call.
    - `flushSync` uses `fs.writeFileSync` + `fs.renameSync` for the `before-quit` path.
    - `cancel` aborts the pending timer.
  - **Hard rule:** `userDataDir` is injected as a parameter (not read from `app.getPath` inside this module) so it can be substituted in any environment.
- **Manual QA via the running app (verified after W4-A integration):**
  1. **Persistence across runs.** Launch app, click feed, note new hunger value, quit. Relaunch — hunger reflects the post-feed value, not 80.
  2. **Persistence across decay.** Launch, leave idle for one decay tick, quit. Relaunch — hunger reflects the post-decay value.
  3. **Sync flush on quit.** Open settings → change name to "Buddy" → press Cmd+Q (macOS) within 200ms of the edit (before debounce). Relaunch — name is "Buddy". Confirms `before-quit` flushSync.
  4. **No temp files left.** Locate `~/Library/Application Support/desktop-pet/state.json` (macOS) or platform equivalent. List the directory after several writes — only `state.json` should be present, no `.tmp.*` siblings.
  5. **Missing file → defaults.** Quit app. Delete `state.json`. Relaunch — pet starts with default values, no crash.
  6. **Corrupted file → defaults.** Quit. Manually truncate `state.json` to garbage (e.g., `echo 'not json' > state.json` — but use a real editor for the QA; the plan does not authorize destructive bash). Relaunch — pet starts with defaults; devtools console shows the warn.
  7. **Wrong schemaVersion → defaults.** Edit `state.json` and change `"schemaVersion": 1` to `99`. Relaunch — defaults loaded; warn logged.
  8. **Atomic write under load.** Spam the feed button for 10 seconds. Inspect the state file in another terminal — at any instant the file is either fully readable or absent for a microsecond (rename atomicity).
- **task():** `category="deep", load_skills=[], description="Atomic state-store with debounce", run_in_background=true`
- **Commit:** `feat(persistence): atomic JSON state store with debounce + sync flush`

#### W2-C · Animation queue

- **Depends on:** W1-B
- **Files (create):** `src/renderer/animation-queue.ts`
- **Acceptance criteria:**
  - `class AnimationQueue` with constructor `(setSprite: (s: string) => void, baseSpriteGetter: () => string)`.
  - Method `play(frames: readonly string[], frameMs?: number): void` where `frameMs` defaults to `CONFIG.ANIMATION.frameMs`.
  - On call: cancels any active sequence (calls `clearTimeout`), starts a new one. While running, calls `setSprite(frame)` for each frame at the configured cadence.
  - After the last frame's `frameMs` elapses, calls `setSprite(baseSpriteGetter())` to restore the mood sprite.
  - Method `cancel(): void` — clears the active timer and immediately calls `setSprite(baseSpriteGetter())`.
  - No memory leaks: when a sequence completes, no timers remain (`vi`-less verification — see manual QA below).
- **Manual QA via the running app (verified after W4-A integration):**
  1. **Feed sequence.** Click feed. Watch the sprite slot — `🤤` then `😋` then `😊` then back to the mood sprite. Total visible cycle ≈ 1.2s with default frameMs=300.
  2. **Play sequence.** Click play — `😄`, `🎾`, `😆`, then back.
  3. **Sleep entry sequence.** Click sleep (while awake) — `😴`, `💤`, then sleeping sprite.
  4. **Mid-sequence cancel.** Click feed, then within 200ms click play. The feed sequence stops at whatever frame was showing; play sequence starts at `😄`. No leftover feed frames bleed into the play cycle.
  5. **Stable settle.** Click each action button 5 times in rapid succession. Stop clicking. After ~1.5s the sprite settles to the current mood sprite — no flicker, no stuck frame.
  6. **No timer leak.** Open devtools Performance tab → record 30 seconds of normal idle (no clicks) → confirm no setTimeout/setInterval callbacks beyond Pet's single decay interval.
- **task():** `category="deep", load_skills=[], description="Animation queue for actions", run_in_background=true`
- **Commit:** `feat(animations): queued sprite animation system`

#### W2-D · Drag helper

- **Depends on:** W1-A
- **Files (create):** `src/renderer/drag.ts`
- **Acceptance criteria:**
  - `export function makeDraggable(target: HTMLElement, onMove: (delta: { dx: number; dy: number }) => void): () => void`.
  - Returns a cleanup function that removes all listeners and cancels any pending rAF.
  - On `mousedown` on `target` (left button only, `e.button === 0`):
    - Ignores if `e.target.tagName === 'BUTTON'` or `'INPUT'` or if the target has `data-no-drag` ancestor.
    - Records initial `screenX`/`screenY`.
    - Adds `dragging` class to `document.documentElement`.
    - Registers a `mousemove` listener on `window` and a `mouseup` listener on `window` with `{ once: true }`.
  - On `mousemove`: stores latest delta, schedules a single rAF if none pending. rAF callback calls `onMove({ dx, dy })` and clears the pending flag.
  - On `mouseup`: removes the move listener, removes `dragging` class, cancels any pending rAF.
- **Manual QA via the running app (verified after W4-A integration):**
  1. **Basic drag.** Mousedown on the transparent container area (anywhere not on a button) → drag → window follows the cursor.
  2. **Cursor states.** Hover container without dragging → cursor is `grab`. Mousedown + drag → cursor is `grabbing`. Mouseup → back to `grab`.
  3. **Throttling smoothness.** Drag in rapid circles for 5 seconds. Window position updates fluidly — no perceptible lag, no jitter. Open devtools Performance — `window:move` IPC calls clamped to ~60/s, not the OS mousemove rate.
  4. **Button no-drag.** Mousedown directly on the feed button → window does NOT start moving; release triggers feed.
  5. **Input no-drag.** Open settings → mousedown in the name input → input gains focus, window does NOT move.
  6. **Mouseup stops drag.** Drag, release the mouse button, then move the mouse without buttons → window stays in place.
  7. **Cleanup.** Devtools → `getEventListeners(window)` after closing and reopening the window (in dev, via reload): no orphaned `mousemove` listeners attached to `window`.
- **task():** `category="deep", load_skills=[], description="rAF-throttled drag helper", run_in_background=true`
- **Commit:** `feat(drag): rAF-throttled draggable helper with grabbing cursor`

---

### Wave 3 — Integration Shell (7 parallel)

> Between W3-A and W4-A, the running app may not display correctly because preload/main/HTML
> contracts diverge from the legacy renderer. This is expected — see §6 Atomic Commit Strategy.

#### W3-A · Main process

- **Depends on:** W2-B, W1-A, W1-B
- **Files (create):** `src/main/index.ts`
- **Files (modify):** `package.json` (set `"main": "dist/main.js"` and `"start": "npm run build && electron ."`)
- **Files (delete in W4-A cleanup):** `main.js`
- **Acceptance criteria:**
  - `app.whenReady().then(...)` creates `BrowserWindow` using `CONFIG.WINDOW` — `width: 200`, `height: 250`, position `screenWidth - CONFIG.WINDOW.marginRight`, `screenHeight - CONFIG.WINDOW.marginBottom`.
  - Window properties identical to legacy: `transparent: true`, `frame: false`, `alwaysOnTop: true`, `resizable: false`, `skipTaskbar: true`, `hasShadow: false`, `webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false }`.
  - Loads `path.join(__dirname, 'index.html')` (because `index.html` is copied into `dist/`).
  - Builds the tray icon and menu identical to legacy: 🍖 Feed / 🎾 Play / 💤 Sleep / separator / 📊 Stats / separator / Quit. Each item calls `mainWindow.webContents.send('tray:action', '<action>')` except Quit which calls `app.quit()`.
  - Registers `ipcMain.handle('state:load', () => loadState(userDataDir))`.
  - Registers `ipcMain.handle('state:save', (_e, state) => { saver.schedule(state); cachedState = state })`.
  - Registers `ipcMain.on('window:move', (_e, { dx, dy }) => { const [x,y] = mainWindow.getPosition(); mainWindow.setPosition(x+dx, y+dy) })`.
  - Registers `ipcMain.on('pet-notify', (_e, { title, body }) => { new Notification({ title, body }).show() })`.
  - `app.on('before-quit', e)` — if saver has pending writes or `cachedState` was modified after last flush, call `e.preventDefault()`, run `saver.flushSync(cachedState)`, then call `app.exit(0)`. Guard against re-entry.
  - `app.on('window-all-closed', () => app.quit())`.
  - `--dev` flag opens devtools detached.
  - No `console.log` left in committed code (only `console.warn`/`console.error` for diagnostics).
- **Manual QA via the running app:**
  1. After commit: `npm start` builds and launches. Window appears bottom-right, transparent + frameless + always-on-top, not in dock taskbar.
  2. Tray icon visible in system menu bar; right-click reveals the 5-item menu.
  3. Click 🍖 Feed in tray — devtools console (if renderer is mid-refactor) shows the `'tray:action'` event reception (or for the legacy renderer still running, no error in main process).
  4. Open devtools (dev mode) — console shows no errors during startup.
  5. In devtools console: `await window.electronAPI.loadState()` returns `null` on first run (no state file yet), `AppState` on subsequent runs.
  6. In devtools console: `await window.electronAPI.saveState({ schemaVersion:1, pet:{hunger:50,happiness:50,energy:50,alive:true,isSleeping:false}, settings:{petName:'Test',decayMultiplier:1,petTypeId:'pixel'} })` resolves. Inspect the state file on disk — contents match exactly within 500ms.
  7. Close the window → app process exits (verify via `ps aux | grep -i electron` returning no rows).
  8. `--dev` flag: relaunch with `npm run dev` or `electron dist/main.js --dev` (after rebuild) → devtools opens detached.
- **task():** `category="deep", load_skills=[], description="Main process port", run_in_background=true`
- **Commit:** `feat(main): port main process to TypeScript with state persistence`

#### W3-B · Preload

- **Depends on:** W1-A
- **Files (create):** `src/preload/index.ts`, `src/renderer/global.d.ts`
- **Files (delete in W4-A cleanup):** `preload.js`
- **Acceptance criteria — `preload/index.ts`:**
  - `contextBridge.exposeInMainWorld('electronAPI', api)` where `api` exactly satisfies the `ElectronAPI` interface from §2.3.
  - `loadState` → `ipcRenderer.invoke('state:load')`.
  - `saveState` → `ipcRenderer.invoke('state:save', state)`.
  - `moveWindow` → `ipcRenderer.send('window:move', delta)`.
  - `notify` → `ipcRenderer.send('pet-notify', { title, body })`.
  - `onTrayAction(cb)` → registers `ipcRenderer.on('tray:action', (_e, action) => cb(action))` and returns a function that calls `ipcRenderer.removeListener` with the same handler.
  - The exported `api` object is declared as `satisfies ElectronAPI` (compile-time guarantee).
- **Acceptance criteria — `global.d.ts`:**
  - `declare global { interface Window { electronAPI: ElectronAPI } }`.
  - `export {}` to ensure module status.
  - `import type { ElectronAPI } from './../shared/ipc-types'` at the top.
- **Manual QA via the running app:**
  1. After commit, `npm run build && electron .` (or `npm start`) launches.
  2. Open devtools console: `window.electronAPI` is defined and `Object.keys(window.electronAPI)` returns `['loadState','saveState','moveWindow','onTrayAction','notify']` in any order.
  3. `window.require` is `undefined`, `window.process` is `undefined`, `window.global` is `undefined` (confirms context isolation is intact).
  4. Console call: `window.electronAPI.notify('Hello','test')` → OS notification appears.
  5. Console call: `const off = window.electronAPI.onTrayAction(a => console.log('tray',a)); /* click 🍖 Feed in tray */` → logs `tray feed`. Calling `off()` then clicking again → no further log.
  6. Static spot-check: confirm the file ends with the `satisfies` assertion (compile-time API check).
- **task():** `category="quick", load_skills=[], description="Typed preload bridge", run_in_background=true`
- **Commit:** `feat(preload): typed contextBridge surface`

#### W3-C · HTML restructure

- **Depends on:** W1-A, W1-B (contract only; no code import)
- **Files (modify):** `src/index.html`
- **Acceptance criteria — final structure:**

~~~html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Desktop Pet</title>
  <link rel="stylesheet" href="styles.css" />
</head>
<body>
  <div id="pet-container">
    <div id="sprite"></div>
    <div id="name">Pixel</div>

    <div id="stats">
      <div class="stat" data-stat="hunger">
        <span class="stat-label">🍖</span>
        <div class="stat-bar"><div id="hunger-bar" class="stat-fill"></div></div>
      </div>
      <div class="stat" data-stat="happiness">
        <span class="stat-label">💛</span>
        <div class="stat-bar"><div id="happiness-bar" class="stat-fill"></div></div>
      </div>
      <div class="stat" data-stat="energy">
        <span class="stat-label">⚡</span>
        <div class="stat-bar"><div id="energy-bar" class="stat-fill"></div></div>
      </div>
    </div>

    <div id="buttons">
      <button id="btn-feed" title="Feed (F)">🍖</button>
      <button id="btn-play" title="Play (P)">🎾</button>
      <button id="btn-sleep" title="Sleep (S)">💤</button>
      <button id="btn-settings" title="Settings" data-no-drag>⚙</button>
    </div>

    <div id="status-message"></div>

    <div id="settings-overlay" hidden data-no-drag>
      <button id="settings-close" type="button" aria-label="Close">×</button>
      <h2>Settings</h2>
      <label>
        <span>Name</span>
        <input id="setting-name" type="text" maxlength="20" autocomplete="off" />
      </label>
      <label>
        <span>Decay speed</span>
        <input id="setting-decay" type="range" min="0.5" max="2" step="0.1" />
        <output id="setting-decay-out"></output>
      </label>
      <label>
        <span>Pet type</span>
        <select id="setting-type">
          <option value="pixel">Pixel</option>
          <option value="tama">Tama</option>
          <option value="bot">Bot</option>
          <option value="ghost">Ghost</option>
        </select>
      </label>
      <button id="setting-reset" type="button">Reset Pet</button>
    </div>
  </div>

  <script src="renderer.js"></script>
</body>
</html>
~~~

  - The legacy `<script src="pet.js"></script>` tag is removed.
  - Only the bundled `renderer.js` is loaded.
  - All legacy IDs preserved (`#sprite`, `#name`, `#hunger-bar`, `#happiness-bar`, `#energy-bar`, `#btn-feed`, `#btn-play`, `#btn-sleep`, `#status-message`).
  - New IDs added: `#btn-settings`, `#settings-overlay`, `#settings-close`, `#setting-name`, `#setting-decay`, `#setting-decay-out`, `#setting-type`, `#setting-reset`.
  - `data-stat` attribute on each `.stat` row for sticky-reveal targeting.
  - `data-no-drag` on the settings button and overlay so the drag helper can ignore them.
  - `hidden` attribute on the overlay by default.
- **Manual QA via the running app:**
  1. Run `npm start`. Browser source view (devtools → Elements) shows all required nodes and attributes.
  2. No console errors on load.
  3. Settings overlay is hidden by default (no UI visible until W3-G wires the toggle).
  4. Sprite + name visible.
  5. Stat rows present (will look correct after W3-D ships the CSS; for this commit alone the visual may be partially broken).
- **task():** `category="visual-engineering", load_skills=["frontend-ui-ux"], description="HTML restructure for hover+overlay", run_in_background=true`
- **Commit:** `feat(ui): restructure HTML for hover-only chrome and settings overlay`

#### W3-D · CSS hover-only refactor

- **Depends on:** W3-C (uses the new IDs/attrs as a contract)
- **Files (modify):** `src/styles.css`
- **Acceptance criteria — Idle state (no hover, no sticky-reveal):**
  - `#pet-container`: `background: transparent`, no border, no shadow, retains `width: 200px`, `height: 250px`, `padding: 12px`, `border-radius: 20px` (radius doesn't visually matter when transparent but kept for layout stability).
  - `#sprite`, `#name`: fully opaque (no opacity rule needed; they're never hidden).
  - `#stats`, `#buttons`, `#status-message`: `opacity: 0; pointer-events: none; transition: opacity 200ms ease`.
- **Acceptance criteria — Hover state (`#pet-container:hover`):**
  - `#pet-container`: `background: rgba(30, 30, 40, 0.88)`, `border: 2px solid rgba(255, 255, 255, 0.12)`, transitioned `200ms ease` on `background` and `border-color`.
  - `#stats`, `#buttons`, `#status-message`: `opacity: 1; pointer-events: auto`.
- **Acceptance criteria — Sticky-reveal (`.stat.sticky-reveal`):**
  - Overrides the parent `#stats` opacity for that single row.
  - Gets the micro-backdrop pill (per approved micro-decision):
    `background: rgba(30, 30, 40, 0.70); border-radius: 10px; padding: 2px 6px; opacity: 1; pointer-events: auto;`
  - Adds `animation: sticky-pulse 1.5s ease-in-out infinite;` as defined in §2.6.
  - During hover, the pill blends with the container — no visual conflict; the row remains visible and animated, but the pulse continues even on hover.
- **Acceptance criteria — Cursor:**
  - `#pet-container` default cursor: `grab`.
  - When `documentElement` has class `dragging`: `* { cursor: grabbing !important; }` to win over child cursors during drag.
- **Acceptance criteria — Settings overlay:**
  - `#settings-overlay` positioned `absolute; inset: 6px; background: rgba(30,30,40,0.96); border-radius: 14px; padding: 10px; display: flex; flex-direction: column; gap: 6px; z-index: 10;` — covers everything inside the container including stats/buttons.
  - When the overlay is visible (hidden attribute removed) it should be fully visible regardless of hover state — overlay open means user is interacting.
  - `#settings-close`: absolute top-right of overlay, `width: 22px; height: 22px; border-radius: 50%; background: rgba(255,255,255,0.15); color: #fff;`.
  - Labels: `font-size: 11px; color: #ddd; display: flex; align-items: center; gap: 6px;`.
  - Inputs and selects: `flex: 1; font-size: 11px; background: rgba(255,255,255,0.08); color: #fff; border: 1px solid rgba(255,255,255,0.15); border-radius: 4px; padding: 2px 4px;`.
  - `#setting-reset`: `margin-top: auto; background: rgba(248,113,113,0.25); color: #fff; border: 1px solid rgba(248,113,113,0.5); border-radius: 6px; padding: 4px;`.
- **Acceptance criteria — preserved legacy styles:**
  - `bounce` and `sway` keyframes kept verbatim.
  - `.stat-fill` colors `#4ade80` / `.warning #facc15` / `.danger #f87171` kept.
  - `#sprite.sleeping` / `#sprite.dead` rules kept (sway, opacity 0.7; no-anim, opacity 0.4, grayscale 1).
  - Body `background: transparent; overflow: hidden;` kept.
- **Hard constraint:** never set `pointer-events: none` on `#pet-container` itself — that would break hover detection on the transparent zone. The transparent container must remain solid for hit-testing.
- **Manual QA via the running app:**
  1. Launch. **Idle:** only sprite (centered) and name (below sprite) visible against the desktop wallpaper. Container background completely invisible.
  2. **Hover.** Move cursor over the container — chrome fades in over 200ms with the dark `rgba(30,30,40,0.88)` background, border, stat bars, three action buttons + gear button, and any status message all becoming visible.
  3. **Hover-out.** Move cursor off — chrome fades back to transparent over 200ms. Sprite and name remain visible throughout.
  4. **Cursor states.** Idle: cursor over container shows `grab`. Mousedown + drag: `grabbing` for all child elements. Mouseup: `grab` again.
  5. **Sticky-reveal idle.** Drop hunger below 15 (devtools: `__pet.state.hunger = 10; __pet.emit('change', {state: __pet.state, mood: __pet.mood})` — or wait for natural decay). Move cursor off container — only the hunger row remains visible with its rounded backdrop pill, gently pulsing. Other rows stay hidden.
  6. **Multiple sticky rows.** Force `hunger=10, happiness=10` → both rows visible with pills, both pulsing.
  7. **Sticky clears.** Click feed (or via devtools `__pet.feed()`) until hunger ≥ 15 → the hunger row hides again. Happiness row continues to pulse independently.
  8. **Settings overlay.** Click ⚙ — overlay appears immediately covering stats/buttons. Stats/buttons no longer pokes through. Click × — overlay hides.
  9. **No layout shift.** Hover-in/hover-out does not cause sprite or name to jump (use a screen ruler if curious).
- **task():** `category="visual-engineering", load_skills=["frontend-ui-ux"], description="Hover-only CSS + sticky pulse + settings overlay", run_in_background=true`
- **Commit:** `feat(ui): hover-only chrome, sticky-reveal pill, settings overlay styling`


#### W3-E · Keyboard module

- **Depends on:** W2-A (Pet class shape)
- **Files (create):** `src/renderer/keyboard.ts`
- **Acceptance criteria:**
  - `export function attachKeyboardShortcuts(pet: Pet, getIsSettingsOpen: () => boolean): () => void`.
  - Returns a cleanup function that removes the keydown listener.
  - Listens on `document` for `keydown`.
  - For each keydown event:
    - If `e.ctrlKey || e.metaKey || e.altKey || e.shiftKey` → ignore (return early).
    - If the active element (`document.activeElement`) is an `<input>`, `<textarea>`, or `<select>` → ignore.
    - If `getIsSettingsOpen()` returns true AND the active element is inside `#settings-overlay` → ignore.
    - Otherwise: match `e.key.toLowerCase()`:
      - `'f'` → `pet.feed()`
      - `'p'` → `pet.play()`
      - `'s'` → `pet.sleep()`
      - any other → no-op
  - Calls `e.preventDefault()` only when a shortcut matched (so other letters propagate normally to inputs we missed).
  - **Hard rule:** the module does not read settings, does not touch the DOM beyond `document.activeElement` inspection, and does not call `electronAPI` directly. All side-effects go through the `pet` argument.
  - The handler is attached to `document`, not `window`, so it does not fire when Electron is unfocused.
- **Manual QA via the running app (verified after W4-A integration):**
  1. **F triggers feed.** App focused (click the sprite first to ensure focus). Press `f` → hunger bar grows by 25, feed animation runs, status flashes the feed message.
  2. **P triggers play.** Press `p` → happiness +20, energy -10, hunger -5, play animation runs.
  3. **S toggles sleep.** Press `s` → sprite enters sleeping state. Press `s` again → wakes.
  4. **Modifier guard.** Press `Cmd+F` (macOS) or `Ctrl+F` → no feed action; the OS may show a Find dialog or nothing (depends on platform).
  5. **Shift guard.** Press `Shift+F` (capital F) → no feed action.
  6. **Alt guard.** Press `Alt+F` → no feed action.
  7. **Input guard.** Click ⚙ to open settings → click into the name input → type `food` → input receives `food`, no feed action.
  8. **Other letters ignored.** Press `q`, `a`, `1`, arrow keys → no app reaction.
  9. **Unfocused window.** Click a different app to defocus the pet window. Press `f` → no feed action in the pet (verify by checking hunger bar unchanged when refocusing).
  10. **Key repeat.** Hold `f` for 2 seconds → multiple feed actions fire at OS key-repeat rate. No crash. Hunger eventually caps at 100.
  11. **Dead state.** Force pet to dead state. Press `f` → no visible change (Pet's own guard blocks the action; renderer's click-to-reset behavior only activates on button clicks, not keys).
- **task():** `category="quick", load_skills=[], description="Keyboard shortcuts F/P/S", run_in_background=true`
- **Commit:** `feat(ui): add F/P/S keyboard shortcuts with modifier and input guards`

#### W3-F · Sticky-reveal observer

- **Depends on:** W2-A (Pet emits `change`)
- **Files (create):** `src/renderer/sticky-reveal.ts`
- **Acceptance criteria:**
  - `export function attachStickyReveal(pet: Pet, statRows: { hunger: HTMLElement; happiness: HTMLElement; energy: HTMLElement }): () => void`.
  - Returns a cleanup function that unsubscribes the pet listener.
  - Subscribes to `pet.on('change', ...)`.
  - On each change event:
    - If `state.alive === false` → remove `.sticky-reveal` from all three rows and return early.
    - For each of `hunger`, `happiness`, `energy`:
      - If `state[stat] < CONFIG.THRESHOLDS.stickyRevealAt` → add `.sticky-reveal` class.
      - Otherwise → remove `.sticky-reveal` class.
  - Uses `classList.add` / `classList.remove` (idempotent, no flicker from re-adding existing class).
  - Calls the evaluation once immediately on attachment so initial state is reflected even before the first `change`.
  - **Hard rule:** the module never touches `style.opacity` directly — only the class. All visual treatment lives in CSS (W3-D).
- **Manual QA via the running app (verified after W4-A integration):**
  1. **Below threshold reveals.** Defocus the pet window so hover doesn't interfere. Open devtools, run `__pet.state.hunger = 10; __pet.emit('change', { state: __pet.state, mood: __pet.mood })` (or wait for natural decay). The hunger row appears with the pill backdrop and pulse, while happiness/energy rows stay hidden.
  2. **Above threshold hides.** With cursor not over the container, click feed (via keyboard `f` since the buttons are hidden when no hover) → hunger climbs above 15 → the row hides again. Pulse stops.
  3. **Three independent rows.** Force `hunger=10, happiness=10, energy=10` → all three rows visible with pills and pulse, each independently behaved.
  4. **Mixed.** With hunger=10, happiness=80, energy=80 → only hunger row visible.
  5. **Death clears all.** Force `hunger=0, happiness=0, energy=0` → pet dies → all three rows hide (sticky-reveal class removed on dead state).
  6. **Sleeping respected.** Click sleep with `energy=10` → energy is < 15, but sleeping state increases energy over ticks; once energy ≥ 15 the energy row hides. Sticky-reveal does not interfere with sleep behavior.
  7. **Hover compatibility.** With hunger=10 and one row sticky-revealed, hover over container → all rows become visible; hunger row still pulses. Un-hover → hunger row remains visible and pulsing, others hide.
  8. **Initial evaluation.** Quit the app with a state that has hunger=10 saved to disk. Relaunch. Without ever hovering, the hunger row should appear immediately on app load (confirms the initial evaluation on attach).
- **task():** `category="deep", load_skills=[], description="Sticky-reveal observer for critical stats", run_in_background=true`
- **Commit:** `feat(ui): sticky-reveal observer for critical stats`

#### W3-G · Settings UI

- **Depends on:** W2-A, W1-B
- **Files (create):** `src/renderer/settings-ui.ts`
- **Acceptance criteria:**
  - `export function attachSettingsUI(pet: Pet, elements: { overlay, openBtn, closeBtn, nameInput, decayInput, decayOutput, typeSelect, resetBtn }): { cleanup: () => void; isOpen: () => boolean }`.
  - Returns `isOpen` so the keyboard module can query the open state.
  - **Open / close behavior:**
    - Clicking `openBtn` (`#btn-settings`) removes the `hidden` attribute from `overlay` and sets `isOpen` to true.
    - Clicking `closeBtn` (`#settings-close`) re-adds the `hidden` attribute and sets `isOpen` to false.
    - Pressing `Escape` while the overlay is open closes it (handled inside this module, not in keyboard.ts).
  - **On open:** sync each input from `pet.settings` and `pet.state`:
    - `nameInput.value = pet.settings.petName`
    - `decayInput.value = String(pet.settings.decayMultiplier)`
    - `decayOutput.value = pet.settings.decayMultiplier.toFixed(1) + '×'`
    - `typeSelect.value = pet.settings.petTypeId`
  - **Input bindings:**
    - `nameInput`: on `'change'` (blur or Enter), call `pet.applySettings({ petName: nameInput.value.trim() || 'Pixel' })`.
    - `decayInput`: on `'input'`, parse `parseFloat`, clamp to `[0.5, 2.0]`, call `pet.applySettings({ decayMultiplier })`, update `decayOutput`.
    - `typeSelect`: on `'change'`, validate value ∈ `PetTypeId`, call `pet.applySettings({ petTypeId: value as PetTypeId })`.
    - `resetBtn`: on `'click'`, call `pet.reset()` then close the overlay.
  - **Hard rules:**
    - The module does not call `electronAPI.saveState` directly — `pet.applySettings` triggers a `change` event which the orchestrator catches and routes to the debounced save.
    - The module does not subscribe to `pet.on('change', ...)` because the inputs are only synced when the overlay is opened (avoids fighting the user mid-edit).
- **Manual QA via the running app (verified after W4-A integration):**
  1. **Open / close.** Hover container → click ⚙ → overlay slides in covering stats/buttons. Click × → overlay hides.
  2. **Escape closes.** Open settings → press `Escape` → overlay hides.
  3. **Click outside.** Open settings → click outside the overlay (in the visible chrome) → overlay stays open (per spec — clicking outside is NOT a close trigger; only × or Escape closes).
  4. **Initial sync.** Edit state file on disk to set `petName: 'Test', decayMultiplier: 1.5, petTypeId: 'tama'`. Relaunch app. Open settings → inputs show `Test`, slider at 1.5 (output `1.5×`), select shows `Tama`.
  5. **Name edit.** Change name to `Buddy`. Tab out of the input (blur). The `#name` element in the container updates to `Buddy`. Close settings, quit app, relaunch — name is still `Buddy`.
  6. **Empty name fallback.** Clear the name input and blur → name resets to `Pixel`. UI updates accordingly.
  7. **Decay slider.** Drag slider to `2.0`. `decayOutput` shows `2.0×`. Close settings. Time the next decay tick — fires every ~15 seconds (30s base ÷ 2). Set slider back to `1.0` → ticks return to 30s cadence.
  8. **Pet type change.** Open settings → change select to `Bot` → close. Sprite immediately updates to `[⌐■_■]` (or current mood's `bot` sprite). Quit and relaunch — sprite still `bot`.
  9. **Reset button.** With pet at `hunger=20, happiness=10, energy=30`, click Reset Pet → overlay closes → sprite is `idle`, all stats restored to `INITIAL_STATS` (80/80/80), `alive=true`, `isSleeping=false`.
  10. **Persistence on every change.** Change name → wait 600ms (debounce window) → kill the app via Activity Monitor (simulating crash). Relaunch → name persisted (confirms debounced save fires within 500ms of the change).
  11. **No keyboard interference.** Open settings → click name input → type `feed` → input receives `feed`, no feed action fires (W3-E handles this guard).
- **task():** `category="visual-engineering", load_skills=["frontend-ui-ux"], description="In-app settings overlay", run_in_background=true`
- **Commit:** `feat(ui): in-app settings panel (name, decay, type, reset)`

---

### Wave 4 — Renderer Orchestrator

#### W4-A · Renderer orchestrator + legacy cleanup

- **Depends on:** every W3 task
- **Files (create):** `src/renderer/index.ts` (orchestrator)
- **Files (delete):** `main.js`, `preload.js`, `src/pet.js`, `src/renderer.js`
- **Acceptance criteria — orchestrator structure (`src/renderer/index.ts`):**
  ~~~typescript
  // High-level shape — implementation must match this contract.
  import { Pet } from './pet'
  import { AnimationQueue } from './animation-queue'
  import { makeDraggable } from './drag'
  import { attachKeyboardShortcuts } from './keyboard'
  import { attachStickyReveal } from './sticky-reveal'
  import { attachSettingsUI } from './settings-ui'
  import { CONFIG } from '../shared/config'
  import { getPetType } from '../shared/pet-types'
  import type { AppState } from '../shared/state-types'

  async function bootstrap(): Promise<void> {
    // 1. Load persisted state (or null on first run).
    const loaded = await window.electronAPI.loadState()

    // 2. Construct pet.
    const pet = new Pet(loaded ?? undefined)

    // 3. Resolve DOM refs (typed, asserted non-null).
    const refs = resolveDomRefs()

    // 4. Wire up animation queue.
    const animations = new AnimationQueue(
      (sprite) => { refs.spriteEl.textContent = sprite },
      () => pet.sprite,
    )

    // 5. Subscribe to pet events.
    pet.on('change', ({ state, mood }) => {
      updateUI(state, mood, refs, pet)
      debouncedSave(pet.snapshot())
    })
    pet.on('notify', ({ title, body }) => {
      window.electronAPI.notify(title, body)
    })
    pet.on('death', () => {
      refs.statusMsg.textContent = 'Click to try again...'
    })

    // 6. Wire up buttons (with action animations).
    refs.btnFeed.addEventListener('click', () => {
      if (!pet.state.alive) { pet.reset(); return }
      pet.feed()
      animations.play(CONFIG.ANIMATION.feedFrames)
    })
    refs.btnPlay.addEventListener('click', () => {
      if (!pet.state.alive) { pet.reset(); return }
      pet.play()
      animations.play(CONFIG.ANIMATION.playFrames)
    })
    refs.btnSleep.addEventListener('click', () => {
      if (!pet.state.alive) { pet.reset(); return }
      const wasSleeping = pet.state.isSleeping
      pet.sleep()
      if (!wasSleeping) animations.play(CONFIG.ANIMATION.sleepFrames)
    })

    // 7. Wire up tray actions (parallel routing).
    const offTray = window.electronAPI.onTrayAction((action) => {
      if (action === 'feed')  refs.btnFeed.click()
      if (action === 'play')  refs.btnPlay.click()
      if (action === 'sleep') refs.btnSleep.click()
      if (action === 'stats') {
        const { hunger, happiness, energy } = pet.state
        refs.statusMsg.textContent = `🍖${hunger} 💛${happiness} ⚡${energy}`
        setTimeout(() => { refs.statusMsg.textContent = '' }, 1500)
      }
    })

    // 8. Wire up sub-modules.
    const offDrag = makeDraggable(refs.container, ({ dx, dy }) => {
      window.electronAPI.moveWindow({ dx, dy })
    })
    const settings = attachSettingsUI(pet, settingsRefs(refs))
    const offKeys  = attachKeyboardShortcuts(pet, () => settings.isOpen())
    const offSticky = attachStickyReveal(pet, statRowRefs(refs))

    // 9. Start the decay loop.
    pet.start()

    // 10. Cleanup on unload.
    window.addEventListener('beforeunload', () => {
      offTray(); offDrag(); offKeys(); offSticky(); settings.cleanup()
      pet.stop()
    })

    // Expose for devtools convenience in dev only (guard with __DEV__ flag if desired).
    ;(window as unknown as { __pet?: Pet }).__pet = pet
  }

  void bootstrap()
  ~~~

- **Acceptance criteria — `updateUI`:**
  - Sets `spriteEl.textContent` only if no animation is currently playing — when an animation is running, the AnimationQueue owns the sprite slot. Pragmatic approach: `updateUI` always sets the sprite to the resolved mood sprite, and `AnimationQueue.play()` overwrites it during the sequence, then restores via `baseSpriteGetter`. Either approach works; document the chosen one in the file header.
  - Toggles `#sprite.sleeping` and `#sprite.dead` classes based on state.
  - Calls `setBar(barEl, value)` for each of hunger/happiness/energy, applying `.warning` (<45) and `.danger` (<20) classes per legacy thresholds.
  - Sets `#name.textContent = settings.petName`.
  - Sets `#status-message.textContent` based on mood: `'Sleeping...'` when sleeping, `'So hungry...'` when mood=hungry, `'Play with me!'` when mood=sad, `'Click to try again...'` when dead, `''` otherwise.
- **Acceptance criteria — debounced save:**
  - Implemented inline (~10 lines): a single `setTimeout` reference, reset on each call; calls `electronAPI.saveState(snapshot)` after 500ms of inactivity.
- **Acceptance criteria — DOM ref resolution:**
  - A single `resolveDomRefs()` function returns a typed object with all required `HTMLElement` references.
  - Each `document.getElementById` call is wrapped in a non-null assertion or throws a descriptive error if the element is missing.
- **Acceptance criteria — legacy file deletion:**
  - `main.js` (root), `preload.js` (root), `src/pet.js`, `src/renderer.js` are deleted in the same commit as W4-A.
  - `git status` after the commit shows these four files as deleted, plus `src/renderer/index.ts` as added.
  - `npm run typecheck && npm run lint && npm run format:check && npm run build` all pass.
- **Manual QA via the running app — full end-to-end smoke:**
  1. **Cold launch.** Run `npm start`. App appears bottom-right. Only sprite + name visible. No console errors.
  2. **First-run state.** No state file exists. Pet starts with defaults (Pixel, 80/80/80, decay 1×).
  3. **Hover reveals chrome.** Hover → chrome fades in within 200ms. Stats show 80/80/80.
  4. **Feed via button.** Click 🍖 → animation cycles, hunger climbs to maxed (clamps at 100 since 80+25=105→100), status flashes.
  5. **Feed via keyboard.** Press `f` → feed action fires, animation runs.
  6. **Feed via tray.** Right-click tray → 🍖 Feed → feed action fires.
  7. **Play action.** Click 🎾 → happiness +20, energy −10, hunger −5; animation runs.
  8. **Sleep action.** Click 💤 → sprite enters sleeping; animation runs once. Click 💤 again → wakes. Repeat with `s` key.
  9. **Stats tray action.** Tray → 📊 Stats → status message shows `🍖80 💛80 ⚡80` for 1.5 seconds then clears.
  10. **Drag.** Click-and-hold on transparent container area → drag → window moves smoothly. Cursor is `grabbing`. Release.
  11. **Settings open.** Click ⚙ → overlay covers stats/buttons. Inputs show current values.
  12. **Settings — name change.** Edit name to `Doggo`, blur. `#name` updates to `Doggo`. Close settings.
  13. **Settings — decay multiplier.** Set to `2.0`. Close. Wait — next decay tick fires after ~15s.
  14. **Settings — pet type.** Set to `Bot`. Sprite updates to `[⌐■_■]` (idle bot). Other moods also use bot sprites when reached.
  15. **Reset.** Open settings → Reset Pet → stats restored, sprite back to mood for `pixel` (or whichever type is now selected — uses current `petTypeId`, NOT 'pixel' literal). Overlay closes.
  16. **Sticky-reveal.** Move cursor off container. Force hunger<15 via devtools or wait. Hunger row appears with pill + pulse against the desktop background.
  17. **Notification.** Let hunger drop below 15 → OS notification appears. Wait 60s → second notification fires (only if still below 15).
  18. **Death.** Force all stats to 0 → death notification once, dead sprite, status "Click to try again...". Click any action button → pet resets.
  19. **Persistence — graceful quit.** Change name to `Test`, click feed, immediately Cmd+Q. Relaunch → state matches.
  20. **Persistence — force kill.** Change name, wait 600ms, force-kill via Activity Monitor. Relaunch → state matches (proves debounce + flushSync window is correct).
  21. **No regressions.** Old behaviors preserved: window dimensions 200×250, position bottom-right, alwaysOnTop, transparent, frameless, not in dock.
  22. **No console errors** during any of the above interactions.
- **task():** `category="deep", load_skills=["git-master"], description="Renderer orchestrator + legacy cleanup", run_in_background=false`
- **Commit:** `feat(renderer): orchestrate modules in renderer entrypoint and remove legacy JS`

---

### Wave 5 — QA + Docs

#### W5-A · End-to-end manual QA + fix-forward pass

- **Depends on:** W4-A
- **Files (modify):** any file that the QA pass surfaces as broken (typically zero, expected one or two CSS or wiring tweaks).
- **Acceptance criteria:**
  - Every item in §8 Manual QA Checklist passes on the QA host machine.
  - Any failure surfaces a fixup commit on the same feature branch using the appropriate Conventional Commits scope (`fix(ui): ...`, `fix(pet): ...`, etc.). Each fixup must be atomic and not roll multiple unrelated fixes into one commit.
  - `npm run typecheck && npm run lint && npm run format:check && npm run build` all pass at the tip of the branch.
  - `npm start` launches cleanly on the QA host with no console errors.
- **Manual QA via the running app:** Run §8 in order, top to bottom. Mark each item pass/fail. For failures, produce a minimal repro note for the fixer.
- **task():** `category="deep", load_skills=["git-master"], description="End-to-end QA + fixups", run_in_background=false`
- **Commit(s):** zero to several `fix(...)` commits, one per discrete fix.

#### W5-B · README + architecture notes

- **Depends on:** W4-A (so the doc reflects final state)
- **Files (create):** `README.md`
- **Acceptance criteria — README sections (in order):**
  1. **Title and one-line description.**
  2. **Screenshot or kaomoji preview** (optional; text-only OK).
  3. **Requirements:** Node 20+ (Electron 35 bundles Node 22 internally), npm 10+, macOS / Windows / Linux notes if any.
  4. **Quick start:**
     ~~~
     npm install
     npm start
     ~~~
  5. **Development workflow:**
     ~~~
     npm run dev          # esbuild watch + Electron launch
     npm run typecheck    # tsc --noEmit
     npm run lint         # ESLint
     npm run format       # Prettier
     ~~~
  6. **Project structure** — terse tree listing matching §2.1.
  7. **Architecture** — 8–12 lines explaining: 3 esbuild bundles, IPC contract location, state persistence flow, event flow from Pet to renderer.
  8. **Configuration** — pointer to `src/shared/config.ts` for all tunable values; note that pet types and animation sequences also live there / in `src/shared/pet-types.ts`.
  9. **Pet types catalog** — table of the 4 pet IDs and their kaomoji/emoji sprite sets (copy from §2.7).
  10. **Keyboard shortcuts** — `F` Feed, `P` Play, `S` Sleep. Note: modifier keys and input focus suppress shortcuts.
  11. **State file location** — `app.getPath('userData')/desktop-pet/state.json`. Delete this file to reset persisted state.
  12. **License** — match whatever license was in the legacy repo (or leave unspecified if none; do not invent a license).
- **Hard rule:** no emoji in section headers unless they were already present in the legacy README (there is no legacy README); pet kaomoji and emoji appear only inside the pet types table.
- **Manual QA via the running app:**
  - Render the README on GitHub (or with a local previewer): no broken tables, no orphan code fences.
  - Follow the Quick Start instructions on a fresh clone — `npm install && npm start` works.
  - Every CLI command in the README produces the documented output.
- **task():** `category="writing", load_skills=[], description="README + architecture notes", run_in_background=true`
- **Commit:** `docs: add README with architecture overview and usage`

---

## 6. Atomic Commit Strategy

### 6.1 Branch model

- **Feature branch:** `refactor/typescript-overhaul`, branched from `main` at `b537e6c`.
- **Never push directly to `main`.** The feature branch is merged after the W5-A QA gate passes.
- **No rebases that rewrite shared history** once any reviewer is looking at the branch. Local rebases before the first push are fine.
- **No force-pushes** after the branch is opened for review.

### 6.2 One commit per task

Each of the 18 task specs corresponds to exactly one commit on the branch, with the message specified in that task's "Commit:" line. Optional fixup commits during W5-A are additional, scoped, and atomic.

### 6.3 Conventional Commits

- `chore:` — tooling, deps, config (W0-A)
- `feat(types):` — type definitions (W1-A)
- `feat(config):` — constants and catalogs (W1-B)
- `feat(emitter):` — event emitter (W1-C)
- `feat(pet):` — pet state machine (W2-A)
- `feat(persistence):` — state store (W2-B)
- `feat(animations):` — animation queue (W2-C)
- `feat(drag):` — drag helper (W2-D)
- `feat(main):` — main process (W3-A)
- `feat(preload):` — preload (W3-B)
- `feat(ui):` — HTML/CSS/UX behavior (W3-C, W3-D, W3-E, W3-F, W3-G)
- `feat(renderer):` — orchestrator (W4-A)
- `fix(...):` — W5-A fixups
- `docs:` — README (W5-B)

### 6.4 Per-commit gate

Before pushing each commit, the implementer runs:
~~~
npm run typecheck
npm run lint
npm run format:check
npm run build
~~~
All four must exit 0. The commit is rejected (amend or follow-up fix) if any fail.

### 6.5 Intermediate breakage policy

- W0-A through W2-D: every commit MUST leave the legacy app runnable via `npm start` (legacy `main.js`, `preload.js`, JS sources untouched).
- W3-A through W3-G: commits MAY leave the runtime broken because the preload/main/renderer contracts are mid-migration. The four-command gate (above) still applies, but `npm start` runtime smoke is NOT required.
- W4-A: must restore full runtime functionality. The commit before W4-A is the LAST point at which the branch tip is allowed to be broken at runtime. After W4-A, every subsequent commit must again pass an `npm start` smoke test in addition to the four-command gate.
- W5-A fixups: each one independently must pass the gate AND smoke.

### 6.6 Commit hygiene

- No commits include `node_modules/`, `dist/`, or `state.json`. `.gitignore` already excludes the first two; the third lives outside the repo (in user-data dir).
- No `console.log` statements left in committed code (allowed: `console.warn` and `console.error` for genuine diagnostics).
- No commented-out code blocks in committed files.
- No `// TODO` or `// FIXME` markers in committed code. If a known issue surfaces during a task, file it as a follow-up task or fixup commit, not a comment.
- Each commit's diff should be inspectable in under 5 minutes by a reviewer. If a task naturally produces a diff larger than ~500 lines, the task spec should be re-checked for an accidental scope expansion before the commit is pushed.

### 6.7 Squash policy

- **No squash on merge.** The branch is merged with `--no-ff` to preserve the linear history of one-commit-per-task. This is what makes the plan auditable post-hoc.

---

## 7. Risk Register

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | esbuild does not copy `index.html` / `styles.css` automatically; they get out of sync between `src/` and `dist/`. | High | App fails to load styles or HTML in built form. | `scripts/build.ts` and `scripts/dev.ts` perform explicit file copies and a `fs.watch` in dev mode. W3-A's `mainWindow.loadFile` uses `path.join(__dirname, 'index.html')` which resolves to `dist/index.html` — confirm in W3-A manual QA. |
| R2 | IPC schema drift between preload (`ElectronAPI`) and main (`ipcMain.handle` channels). | Medium | Runtime "channel not found" errors at action time. | Both sides import the same `src/shared/ipc-types.ts`. The preload uses `satisfies ElectronAPI` to enforce shape. W3-A's manual QA item 5 verifies each invoke channel works end-to-end via devtools. |
| R3 | `before-quit` race: app exits before pending debounced save flushes, state lost. | Medium | User-visible loss of recent settings/state. | W3-A's `before-quit` handler calls `e.preventDefault()`, runs `flushSync`, then `app.exit(0)`. W2-B's `flushSync` uses `fs.writeFileSync` + `fs.renameSync`. Verified by Manual QA item §8 row "Persistence — graceful quit within 200ms of edit". |
| R4 | Transparent `#pet-container` accidentally gets `pointer-events: none`, breaking hover detection on the wallpaper. | Medium | Hover-only UI never reveals chrome; app appears broken. | W3-D explicit hard constraint forbids `pointer-events: none` on the container. The container uses `background: transparent` while staying solid for hit-testing. Verified by Manual QA "Hover reveals chrome" item. |
| R5 | Sticky-reveal flickers at threshold boundary (stat oscillating around 15). | Low | Annoying visual jitter. | The threshold `CONFIG.THRESHOLDS.stickyRevealAt = 15` is a strict `<`, so 15 itself does not reveal. The pulse animation duration is 1.5s, long enough that brief class adds-and-removes during rapid decay are visually smoothed. If real flicker surfaces in QA, add a 1-unit hysteresis (reveal at <15, hide at ≥17) as a fixup; otherwise leave as-is. |
| R6 | `decayMultiplier` change does not restart `setInterval`, so the new rate never takes effect until next launch. | High if not coded right | Settings UI appears broken. | W2-A spec mandates that `applySettings` restarts the interval when `decayMultiplier` changes. Verified by Manual QA "Decay multiplier" item — timing of next tick must reflect the new multiplier. |
| R7 | `fs.rename` is not atomic across volumes — `userData` dir is on a network-mounted home directory and tmp is on local disk. | Low (default `userData` is local) | Atomic write degrades to non-atomic; crashes mid-write may corrupt the file. | The temp file is written in the SAME directory as the destination (`${dest}.tmp.${pid}`), so the rename stays on the same filesystem. W2-B spec explicitly uses `path.dirname(STATE_PATH)` for the temp file. |
| R8 | Pet-type sprite widths overflow the 200px container (especially ghost emoji combinations like `👻🍽️`). | Medium | Sprite clips or wraps to next line. | `#sprite` keeps `font-size: 32px` and `height: 50px` with `overflow: hidden` on body. If a specific sprite overflows in QA, swap it for a single-character variant in `pet-types.ts` (e.g., drop `🍽️` from ghost-hungry, use `👻💧` instead). Fixable in a focused fixup commit. |
| R9 | Keyboard handler still fires while user is typing in the settings name input. | Medium | Pressing `f` while typing "food" inadvertently feeds the pet. | W3-E spec checks `document.activeElement.tagName` for `INPUT`/`TEXTAREA`/`SELECT` and also checks the settings-open state. Verified by Manual QA "Input guard" item. |
| R10 | Devtools auto-open in production (`--dev` flag check fails or is bypassed). | Low | Released app shows devtools to end users. | W3-A's check uses `process.argv.includes('--dev')` — same as legacy. In a packaged app, `--dev` is never passed unless the user invokes it manually. Verified by Manual QA "`--dev` opens devtools" item AND by running `electron dist/main.js` without flags and confirming devtools stay closed. |
| R11 | esbuild watch mode does not detect `index.html`/`styles.css` changes. | Medium | Dev workflow requires manual restart to see HTML/CSS changes. | `scripts/dev.ts` adds an explicit `fs.watch` on the two files and re-copies them. Verified by manual smoke during W0-A (touch `src/index.html`, observe `dist/index.html` updates). |
| R12 | TypeScript `projectService: true` ESLint config slows IDE / CI to a crawl on small refactor. | Low (project is tiny) | Slow lint feedback. | Project is < 1k LOC total. If lint exceeds ~3 seconds, disable type-checked rules per-file with `tseslint.configs.disableTypeChecked` overrides as a fixup. |

---

## 8. Manual QA Checklist (W5-A acceptance gate)

> Run this checklist sequentially on a fresh clone after W4-A is committed. Every item must pass. Document any failures in the W5-A fixup commits.

### 8.1 Tooling and build

- [ ] `git clone` + `npm install` exits 0 with no warnings beyond peer-dep notices.
- [ ] `npm run typecheck` exits 0.
- [ ] `npm run lint` exits 0.
- [ ] `npm run format:check` exits 0.
- [ ] `npm run build` produces `dist/main.js`, `dist/preload.js`, `dist/renderer.js`, `dist/index.html`, `dist/styles.css` (all non-empty).
- [ ] `npm run dev` enters watch mode, spawns Electron with devtools open, and exits cleanly on Ctrl-C.
- [ ] `npm start` builds and launches the packaged-shape app.

### 8.2 Window and chrome

- [ ] Window appears at bottom-right of primary display with dimensions 200×250.
- [ ] Window is transparent, frameless, always-on-top, hidden from taskbar/dock.
- [ ] System tray icon visible with tooltip "Desktop Pet".
- [ ] Idle state: only sprite + name visible against the desktop wallpaper. Container background invisible.
- [ ] Hover-in: chrome fades in over ~200ms — dark background, border, stat bars, buttons, status message.
- [ ] Hover-out: chrome fades out over ~200ms.
- [ ] Cursor over container without dragging shows `grab`.
- [ ] Mousedown + drag shows `grabbing`; mouseup returns to `grab`.

### 8.3 Pet behavior — actions

- [ ] Click 🍖 Feed: hunger +25 (clamped at 100), happiness +5, feed animation cycle runs (🤤 → 😋 → 😊 → mood).
- [ ] Click 🎾 Play: happiness +20, energy -10, hunger -5, play animation cycle runs (😄 → 🎾 → 😆 → mood).
- [ ] Click 💤 Sleep: sprite transitions to sleeping (😴 → 💤 → sleeping sprite). Click again: wakes (no entry animation on wake).
- [ ] Keyboard `f` triggers feed; `p` triggers play; `s` toggles sleep.
- [ ] Modifier keys (`Cmd+F`, `Ctrl+F`, `Shift+F`, `Alt+F`) do NOT trigger feed.
- [ ] Typing `f` inside the settings name input does NOT trigger feed.
- [ ] Tray menu items 🍖 Feed / 🎾 Play / 💤 Sleep behave identically to the buttons.
- [ ] Tray menu 📊 Stats flashes `🍖x 💛y ⚡z` in the status message for ~1.5s.

### 8.4 Pet behavior — decay and notifications

- [ ] Idle for one decay tick (~30s at multiplier 1.0): hunger -3, happiness -2, energy -1.
- [ ] Setting decay multiplier to 2.0 makes ticks fire every ~15s. Setting back to 1.0 restores 30s.
- [ ] Hunger dropping below 15 (with hunger > 0) fires OS notification "I'm hungry!" exactly once.
- [ ] Second notification fires only after 60s cooldown.
- [ ] Happiness dropping below 15 fires "I'm lonely..." notification with same cooldown semantics.
- [ ] Sleeping with energy < 100 ticks energy +5 and hunger -1 per interval.
- [ ] Sleeping pet auto-wakes at energy = 100 with "Good morning!" notification.
- [ ] All stats reaching 0 fires "Oh no..." death notification exactly once; sprite shows DEAD; status shows "Click to try again...".
- [ ] Clicking any action button after death resets the pet to defaults.

### 8.5 Sticky-reveal

- [ ] With cursor NOT over container, drop hunger to <15 → hunger row appears with backdrop pill and gentle pulse animation. Other rows stay invisible.
- [ ] Feeding hunger back above 15 → row hides; pulse stops.
- [ ] Multiple stats below 15 simultaneously → multiple rows visible, each pulsing independently.
- [ ] Hovering with sticky-reveal active → all rows visible; affected rows still pulse.
- [ ] Un-hovering with sticky-reveal active → un-affected rows hide; sticky rows remain visible and pulsing.
- [ ] Death state clears all sticky-reveal classes (no pulse on dead pet).
- [ ] Cold launch with persisted state having hunger=10 shows the sticky hunger row immediately, no hover required.

### 8.6 Settings panel

- [ ] Clicking ⚙ opens overlay covering stats and buttons. Inputs reflect current persisted values.
- [ ] Clicking × closes overlay. Pressing `Escape` while overlay is open also closes it.
- [ ] Clicking outside the overlay does NOT close it (verify the agreed UX).
- [ ] Editing name and blurring updates the `#name` element in real time. Empty input falls back to "Pixel".
- [ ] Decay slider value reflects in `#setting-decay-out` (e.g., `1.5×`). Closing settings + waiting through next tick shows new decay rate active.
- [ ] Changing pet type select updates sprite within one tick. Saved across relaunch.
- [ ] Reset Pet button restores defaults, closes overlay.
- [ ] All settings persist across quit + relaunch.

### 8.7 Drag

- [ ] Drag from the transparent container area (not a button) moves the window smoothly.
- [ ] Drag rapidly in circles for 5s — smooth, no jitter, no ghosting.
- [ ] Mousedown on a button (feed/play/sleep/settings) does NOT initiate drag; release triggers the button's action.
- [ ] Mousedown on the name input inside settings does NOT initiate drag; input receives focus.
- [ ] Mouseup ends drag; subsequent mouse movement without button pressed does not move the window.

### 8.8 Persistence

- [ ] First launch (no state file): pet starts with defaults (name "Pixel", 80/80/80, decay 1.0, type "pixel").
- [ ] Click feed → quit via window close → relaunch: hunger reflects post-feed value.
- [ ] Change name to "Buddy", immediately press Cmd+Q (within 200ms): relaunch shows "Buddy".
- [ ] Idle through one decay tick, then quit: relaunch shows post-decay values.
- [ ] Delete `state.json` between runs: app launches with defaults, no crash.
- [ ] Corrupt `state.json` (e.g., truncate to garbage) between runs: app launches with defaults; devtools console shows a warn message.
- [ ] Edit `state.json` to set `schemaVersion: 99`: app launches with defaults; warn logged.
- [ ] State file location confirmed: `app.getPath('userData')/desktop-pet/state.json`. No `.tmp.*` siblings persist after writes.

### 8.9 Multi-pet types

- [ ] Switching to "Tama" updates idle/happy/sad/hungry/sleeping/dead sprites to the Tama set across all moods.
- [ ] Switching to "Bot" updates to bot brackets.
- [ ] Switching to "Ghost" updates to ghost emoji; sprite does not overflow the container.
- [ ] Switching back to "Pixel" restores the original legacy kaomoji set byte-for-byte.

### 8.10 Hygiene

- [ ] No console errors during any of the above.
- [ ] No commented-out code or `// TODO` markers in any file at branch tip.
- [ ] `git log --oneline refactor/typescript-overhaul ^main` shows one commit per task (18 minimum + 0–N fixups + 1 docs).
- [ ] Branch is rebased onto current `main` and merges cleanly.
- [ ] Final `npm start` smoke on the branch tip after any fixups passes all of 8.1–8.9.

---

*End of plan.*
