import path from 'node:path'
import { chunkImportMapPlugin } from './scripts/lib/chunkImportMapPlugin.ts'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [chunkImportMapPlugin()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  assetsInclude: ['**/*.wasm'],
  test: {
    environment: 'node',
    include: [
      'src/**/*.integration.test.ts',
      'scripts/**/*.integration.test.ts',
      'mobile/src/**/*.integration.test.ts',
      'spacetimedb/src/**/*.integration.test.ts',
    ],
    pool: 'forks',
  },
})
