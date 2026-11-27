import path from 'node:path'
import { chunkImportMapPlugin } from './scripts/lib/chunkImportMapPlugin.ts'
import { configDefaults, defineConfig } from 'vitest/config'

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
    // Most suites load a whole catalogue snapshot before their tests, which takes longer than the default on a busy runner.
    hookTimeout: 60_000,
    // `--changed` follows imports, and suites read these from disk or run them as processes, so a change to one runs every suite.
    forceRerunTriggers: [
      ...configDefaults.forceRerunTriggers,
      ...[
        'catalogue.json',
        'catalogue/**',
        'spacetimedb/**',
        'drizzle-auth/**',
        'scripts/**',
        'mobile/**',
        '.github/**',
        'src/**/*.worker.ts',
      ].map((pattern) => path.join(import.meta.dirname, pattern)),
    ],
  },
})
