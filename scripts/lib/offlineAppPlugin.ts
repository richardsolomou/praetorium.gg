import path from 'node:path'
import { createHash } from 'node:crypto'
import { readFile, realpath, writeFile, rename } from 'node:fs/promises'
import { tsImport } from 'tsx/esm/api'
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
      const importMap = bundle['importmap.json']
      if (importMap?.type !== 'asset') throw new Error('Chunk import map missing')
      const { imports } = JSON.parse(String(importMap.source)) as { imports: Record<string, string> }
      // Rolldown hands over importers by their real path, which differs from outDir under a symlinked temporary directory.
      const root = await realpath(outDir)
      await build({
        configFile: false,
        publicDir: false,
        plugins: [
          {
            // Chunks import each other by the stable names the import map resolves in the browser.
            name: 'offline-chunk-import-map',
            resolveId(source, importer) {
              if (!importer || !source.startsWith('.')) return
              const real = imports['/' + path.relative(root, path.resolve(path.dirname(importer), source))]
              return real ? path.join(root, real) : undefined
            },
          },
          {
            name: 'offline-preload-hints',
            transform(code, id) {
              if (!id.includes('/assets/')) return
              // The rebundled app has no separate chunks to preload, and PostHog's random chunk ids name symbol sets for
              // the original chunks, so they would mismap its stack traces and change its revision on every build.
              return code
                .replace(/__vite__mapDeps\(\[[\d,]+\]\)/g, '[]')
                .replace(/!function\(\)\{try\{[^\n]*?_posthogChunkIds\[n\]="[0-9a-f-]{36}"\)\}catch\(e\)\{\}\}\(\);/g, '')
                .replace(/\n\/\/# chunkId=[0-9a-f-]{36}/g, '')
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
      // tsx loads the reference compiler at build time, so the Vite config does not load application modules.
      if (process.env.CATALOGUE_RUNTIME_FETCH !== 'true') {
        const reference: typeof import('./offlineReferenceCache.ts') = await tsImport('./offlineReferenceCache.ts', import.meta.url)
        const { checkoutReferenceKey }: typeof import('./checkoutReferenceKey.ts') = await tsImport(
          './checkoutReferenceKey.ts',
          import.meta.url,
        )
        const { catalogueDataDirectory }: typeof import('./catalogueFiles.ts') = await tsImport('./catalogueFiles.ts', import.meta.url)
        const directory = catalogueDataDirectory()
        const key = await checkoutReferenceKey(directory)
        console.log(`Prepared the offline reference (${await reference.prepareReferenceBundle(outDir, key, directory)})`)
      }
    },
  }
}
