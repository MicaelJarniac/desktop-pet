import * as fs from 'node:fs'
import * as path from 'node:path'

import type { AppState } from '../shared/state-types'

interface NodeFsError extends Error {
  code?: string
}

interface DebouncedSaver {
  schedule(state: AppState): void
  flushSync(state: AppState): void
  cancel(): void
  isPending(): boolean
}

function getStatePath(userDataDir: string): string {
  return path.join(userDataDir, 'desktop-pet', 'state.json')
}

function getTmpPath(finalPath: string): string {
  return `${finalPath}.tmp.${process.pid}`
}

function stringifyState(state: AppState): string {
  return JSON.stringify(state)
}

function isNodeFsError(err: unknown): err is NodeFsError {
  return err instanceof Error
}

function warnMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

export async function loadState(userDataDir: string): Promise<AppState | null> {
  const statePath = getStatePath(userDataDir)

  let rawState: string
  try {
    rawState = await fs.promises.readFile(statePath, 'utf8')
  } catch (err) {
    if (isNodeFsError(err) && err.code === 'ENOENT') {
      return null
    }
    throw err
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(rawState)
  } catch (err) {
    console.warn('[state-store] corrupted state.json, ignoring:', warnMessage(err))
    return null
  }

  const candidate = parsed as Partial<AppState>
  if (candidate.schemaVersion !== 1) {
    console.warn('[state-store] unsupported schemaVersion, ignoring:', candidate.schemaVersion)
    return null
  }

  return parsed as AppState
}

export async function saveStateAtomic(userDataDir: string, state: AppState): Promise<void> {
  const statePath = getStatePath(userDataDir)
  const stateDir = path.dirname(statePath)
  const tmpPath = getTmpPath(statePath)

  try {
    await fs.promises.mkdir(stateDir, { recursive: true })
    await fs.promises.writeFile(tmpPath, stringifyState(state))
    await fs.promises.rename(tmpPath, statePath)
  } catch (err) {
    await fs.promises.unlink(tmpPath).catch(() => {})
    throw err
  }
}

export function makeDebouncedSaver(userDataDir: string, debounceMs = 500): DebouncedSaver {
  let pendingTimer: ReturnType<typeof setTimeout> | null = null
  let latestState: AppState | null = null

  function clearPendingTimer(): void {
    if (pendingTimer === null) {
      return
    }

    clearTimeout(pendingTimer)
    pendingTimer = null
  }

  return {
    schedule(state: AppState): void {
      clearPendingTimer()
      latestState = state
      pendingTimer = setTimeout(() => {
        const stateToSave = latestState
        if (stateToSave === null) {
          pendingTimer = null
          return
        }

        void saveStateAtomic(userDataDir, stateToSave)
          .catch((err: unknown) => {
            console.error('[state-store] save failed:', err)
          })
          .finally(() => {
            pendingTimer = null
          })
      }, debounceMs)
    },

    flushSync(state: AppState): void {
      clearPendingTimer()
      latestState = state

      const statePath = getStatePath(userDataDir)
      const stateDir = path.dirname(statePath)
      const tmpPath = getTmpPath(statePath)

      try {
        fs.mkdirSync(stateDir, { recursive: true })
        fs.writeFileSync(tmpPath, stringifyState(latestState))
        fs.renameSync(tmpPath, statePath)
      } catch (err) {
        try {
          fs.unlinkSync(tmpPath)
        } catch {
          // Ignore temp cleanup failures; preserve the original write/rename error.
        }
        throw err
      }
    },

    cancel(): void {
      clearPendingTimer()
    },

    isPending(): boolean {
      return pendingTimer !== null
    },
  }
}
