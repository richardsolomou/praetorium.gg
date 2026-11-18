import { spacetimedbModuleTestPlugin } from 'spacetimedb/server/test-utils/vitest'
import { defineConfig } from 'vitest/config'
import path from 'node:path'
import { chunkImportMapPlugin } from './scripts/lib/chunkImportMapPlugin.ts'

export default defineConfig({
  plugins: [spacetimedbModuleTestPlugin(), chunkImportMapPlugin()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  assetsInclude: ['**/*.wasm'],
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts', 'mobile/src/**/*.test.ts', 'spacetimedb/src/**/*.test.ts'],
    pool: 'forks',
  },
})
