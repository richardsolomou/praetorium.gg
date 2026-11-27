import { spacetimedbModuleTestPlugin } from 'spacetimedb/server/test-utils/vitest'
import { defineConfig } from 'vitest/config'
import path from 'node:path'
import { chunkImportMapPlugin } from './scripts/lib/chunkImportMapPlugin.ts'
import { stubServerAppPlugin } from './scripts/lib/stubServerAppPlugin.ts'

const clientTests = ['src/client/**/*.test.{ts,tsx}', 'src/routes/**/*.test.{ts,tsx}']

export default defineConfig({
  plugins: [spacetimedbModuleTestPlugin(), chunkImportMapPlugin()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  assetsInclude: ['**/*.wasm'],
  test: {
    environment: 'node',
    pool: 'forks',
    // `spacetimedbModuleTestPlugin` sets this from a `config` hook, which a project sharing this file's Vite server skips.
    server: { deps: { inline: ['spacetimedb'] } },
    // Inline projects extend this file, and Vite concatenates their arrays with its own, so `include` lives only here.
    projects: [
      {
        test: {
          name: 'server',
          include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts', 'mobile/src/**/*.test.ts', 'spacetimedb/src/**/*.test.ts'],
          exclude: clientTests,
        },
      },
      { plugins: [stubServerAppPlugin()], test: { name: 'client', include: clientTests } },
    ],
  },
})
