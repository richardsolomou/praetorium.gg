import { defineConfig } from 'vite'

export default defineConfig({
  ssr: { noExternal: true },
  build: {
    ssr: 'scripts/seedPreview.ts',
    outDir: '.output/server',
    emptyOutDir: false,
    rolldownOptions: {
      output: { entryFileNames: 'seed-preview.mjs' },
    },
  },
})
