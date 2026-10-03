import { defineConfig } from 'vite'
import path from 'node:path'

export default defineConfig({
  ssr: { noExternal: true },
  build: {
    ssr: 'scripts/seedPreview.ts',
    outDir: path.join(process.env.LOCAL_BUILD_DIR ?? '.output', 'server'),
    emptyOutDir: false,
    rolldownOptions: {
      output: { entryFileNames: 'seed-preview.mjs' },
    },
  },
})
