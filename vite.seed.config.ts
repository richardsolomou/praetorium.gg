import { defineConfig } from 'vite'
import path from 'node:path'

export default defineConfig({
  ssr: { noExternal: true },
  build: {
    ssr: true,
    outDir: path.join(process.env.LOCAL_BUILD_DIR ?? '.output', 'server'),
    emptyOutDir: false,
    rolldownOptions: {
      input: { 'seed-preview': 'scripts/seedPreview.ts', 'combat-calculation-worker': 'src/server/combatCalculation.worker.ts' },
      output: { entryFileNames: '[name].mjs' },
    },
  },
})
