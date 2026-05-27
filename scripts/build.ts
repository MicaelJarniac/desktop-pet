import { copyFile } from 'node:fs/promises'

import { build, type BuildOptions } from 'esbuild'

const sharedNodeOptions = {
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  external: ['electron'],
} satisfies Partial<BuildOptions>

const main = async () => {
  await Promise.all([
    build({
      ...sharedNodeOptions,
      entryPoints: ['src/main/index.ts'],
      outfile: 'dist/main.js',
    }),
    build({
      ...sharedNodeOptions,
      entryPoints: ['src/preload/index.ts'],
      outfile: 'dist/preload.js',
    }),
    build({
      bundle: true,
      platform: 'browser',
      format: 'iife',
      target: 'chrome130',
      entryPoints: ['src/renderer/index.ts'],
      outfile: 'dist/renderer.js',
    }),
  ])

  await Promise.all([
    copyFile('src/index.html', 'dist/index.html'),
    copyFile('src/styles.css', 'dist/styles.css'),
  ])
}

void main()
