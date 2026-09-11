import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts', 'mobile/src/**/*.test.ts'],
    exclude: ['src/db/**/*.test.ts', 'src/server/auth.test.ts', 'src/server/service*.test.ts', 'scripts/catalogueSnapshot.test.ts'],
    pool: 'forks',
  },
})
