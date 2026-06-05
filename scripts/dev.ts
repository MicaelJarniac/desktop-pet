import { copyFile, mkdir } from 'node:fs/promises'
import { spawn, type ChildProcess } from 'node:child_process'
import { watch, type FSWatcher } from 'node:fs'
import { setTimeout as delay } from 'node:timers/promises'

import { context, type BuildOptions, type BuildContext, type Plugin } from 'esbuild'

const staticFiles = ['src/index.html', 'src/styles.css'] as const

const watchLogPlugin = (name: string): Plugin => ({
  name: `watch-log-${name}`,
  setup(build) {
    build.onEnd((result) => {
      if (result.errors.length === 0) {
        console.log(`[watch] rebuilt ${name}`)
      }
    })
  },
})

const sharedNodeOptions = {
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  external: ['electron'],
  sourcemap: 'inline',
} satisfies Partial<BuildOptions>

const runtime: { electronProcess?: ChildProcess } = {}
let shuttingDown = false

let contexts: BuildContext[] = []

const copyStaticFiles = async () => {
  await mkdir('dist', { recursive: true })
  await Promise.all([
    copyFile('src/index.html', 'dist/index.html'),
    copyFile('src/styles.css', 'dist/styles.css'),
  ])
}

const watchers: FSWatcher[] = []
const timers = new Map<string, NodeJS.Timeout>()

const disposeAll = async () => {
  watchers.splice(0).forEach((watcher) => watcher.close())
  for (const timer of timers.values()) {
    clearTimeout(timer)
  }
  timers.clear()

  await Promise.all(contexts.map((buildContext) => buildContext.dispose()))
}

const shutdown = async (exitCode = 0) => {
  if (shuttingDown) {
    return
  }

  shuttingDown = true
  runtime.electronProcess?.kill()
  await disposeAll()
  process.exit(exitCode)
}

const main = async () => {
  contexts = await Promise.all([
    context({
      ...sharedNodeOptions,
      entryPoints: ['src/main/index.ts'],
      outfile: 'dist/main.js',
      plugins: [watchLogPlugin('main')],
    }),
    context({
      ...sharedNodeOptions,
      entryPoints: ['src/preload/index.ts'],
      outfile: 'dist/preload.js',
      plugins: [watchLogPlugin('preload')],
    }),
    context({
      bundle: true,
      platform: 'browser',
      format: 'iife',
      target: 'chrome130',
      entryPoints: ['src/renderer/index.ts'],
      outfile: 'dist/renderer.js',
      sourcemap: 'inline',
      plugins: [watchLogPlugin('renderer')],
    }),
  ])

  await Promise.all(contexts.map((buildContext) => buildContext.watch()))
  await copyStaticFiles()

  for (const file of staticFiles) {
    watchers.push(
      watch(file, () => {
        const pending = timers.get(file)
        if (pending) {
          clearTimeout(pending)
        }

        timers.set(
          file,
          setTimeout(() => {
            timers.delete(file)
            void copyStaticFiles()
          }, 50),
        )
      }),
    )
  }

  await delay(500)

  console.log('[dev] starting Electron')

  runtime.electronProcess = spawn('electron', ['dist/main.js', '--dev'], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })

  process.on('SIGINT', () => {
    void shutdown(0)
  })

  runtime.electronProcess.on('exit', (code) => {
    void shutdown(code ?? 0)
  })
}

void main()
