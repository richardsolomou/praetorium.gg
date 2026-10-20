import { defineConfig } from 'vite'
import path from 'node:path'
import { compilerFingerprint, treeFingerprint } from './scripts/lib/compilerSources.ts'

const catalogueKey = await compilerFingerprint()
const authoring = treeFingerprint(process.cwd(), ['catalogue'])

export default defineConfig({
  ssr: { noExternal: true },
  plugins: [
    {
      name: 'catalogue-compiler-key',
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'catalogue-compiler.json', source: JSON.stringify({ key: catalogueKey, authoring }) })
      },
    },
  ],
  build: {
    ssr: true,
    outDir: path.join(process.env.LOCAL_BUILD_DIR ?? '.output', 'server'),
    emptyOutDir: false,
    rolldownOptions: {
      input: {
        'seed-preview': 'scripts/seedPreview.ts',
        'combat-calculation-worker': 'src/server/combatCalculation.worker.ts',
        'catalogue-refresh': 'scripts/catalogueRefresh.ts',
      },
      output: { entryFileNames: '[name].mjs' },
    },
  },
})
