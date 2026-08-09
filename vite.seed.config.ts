import { defineConfig } from 'vite'

export default defineConfig({
  ssr: { noExternal: true },
  build: {
    ssr: 'scripts/seedPreview.ts',
    outDir: '.output/server',
    emptyOutDir: false,
    rollupOptions: {
      external: ['better-sqlite3'],
      output: { entryFileNames: 'seed-preview.mjs' },
    },
  },
})
