import path from 'node:path'
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { build, type Plugin } from 'vite'

export function offlineAppPlugin(): Plugin {
  return {
    name: 'offline-reference-app',
    enforce: 'post',
    apply: 'build',
    async writeBundle(_options, bundle) {
      if (this.environment.name !== 'client') return
      const entry = Object.values(bundle).find((chunk) => chunk.type === 'chunk' && chunk.isEntry && chunk.name === 'index')
      if (!entry) throw new Error('Offline app entry missing')
      const outDir = this.environment.config.build.outDir
      const css = Object.values(bundle).find((asset) => asset.type === 'asset' && /^assets\/styles-.*\.css$/.test(asset.fileName))
      if (!css) throw new Error('Offline app styles missing')
      await build({
        configFile: false,
        publicDir: false,
        plugins: [
          {
            name: 'offline-preload-hints',
            transform(code, id) {
              if (!id.includes('/assets/')) return
              // The rebundled app has no separate chunks to preload.
              return code.replace(/__vite__mapDeps\(\[[\d,]+\]\)/g, '[]')
            },
          },
        ],
        logLevel: 'warn',
        build: {
          emptyOutDir: false,
          chunkSizeWarningLimit: 3_000,
          outDir,
          lib: { entry: path.resolve(outDir, entry.fileName), formats: ['es'], fileName: () => 'offline-app.js' },
          rolldownOptions: { output: { codeSplitting: false } },
        },
      })
      const script = await readFile(path.resolve(outDir, 'offline-app.js'))
      await writeFile(
        path.resolve(outDir, 'offline-app-version.json'),
        JSON.stringify({ revision: createHash('sha256').update(script).digest('hex'), css: '/' + css.fileName }),
      )
    },
  }
}
