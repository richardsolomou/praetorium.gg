import path from 'node:path'
import { createHash } from 'node:crypto'
import { readFile, writeFile, rename } from 'node:fs/promises'
import { build, type Plugin } from 'vite'
import { writeReferenceBundle } from './offlineReferenceBundle'

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
      const styles = await readFile(path.resolve(outDir, css.fileName))
      const revision = createHash('sha256').update(script).update(styles).digest('hex')
      const scriptPath = `/assets/offline-app-${revision}.js`
      await rename(path.join(outDir, 'offline-app.js'), path.join(outDir, scriptPath))
      await writeFile(
        path.resolve(outDir, 'offline-app-version.json'),
        JSON.stringify({ revision, css: '/' + css.fileName, script: scriptPath }),
      )
      await writeReferenceBundle(outDir)
    },
  }
}
