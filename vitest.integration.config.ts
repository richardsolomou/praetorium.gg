import path from 'node:path'
import { chunkImportMapPlugin } from './scripts/lib/chunkImportMapPlugin.ts'
import { configDefaults, defineConfig } from 'vitest/config'

const clientText = 'scripts/clientText.integration.test.ts'
// Suites that only read `sharedSnapshot`: they share their worker's module state, so none may mock, stub, set a flag or
// write to the snapshot. A suite left off this list runs isolated, which is always correct, only slower.
const sharedSnapshotSuites = [
  'abilityReminders',
  'appDefaultLoadouts',
  'attachmentRoles',
  'battleScribeRoster',
  'bridgeheadStrike',
  'cardLimits',
  'crucibleTacticusLeaders',
  'custodesAttachments',
  'detachmentKeywords',
  'detachmentNames',
  'exclusiveDetachments',
  'libraryDetachmentRoutes',
  'marineDetachments',
  'perModelWargear',
  'replacedTextSummaries',
  'rosterGrades',
  'rosterMigrations',
  'rosterTextImports',
  'simulatorCatalogue',
  'statlineText',
  'titanLists',
  'unitChoices',
  'unitHeldWargear',
  'unitKeywords',
  'vsPicks',
].map((name) => `scripts/${name}.integration.test.ts`)

export default defineConfig({
  plugins: [chunkImportMapPlugin()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  assetsInclude: ['**/*.wasm'],
  test: {
    environment: 'node',
    pool: 'forks',
    // Most suites load a whole catalogue snapshot before their tests, which takes longer than the default on a busy runner.
    hookTimeout: 60_000,
    // `--changed` follows imports, and suites read these from disk or run them as processes, so a change to one runs every suite.
    forceRerunTriggers: [
      ...configDefaults.forceRerunTriggers,
      ...[
        'pnpm-lock.yaml',
        'pnpm-workspace.yaml',
        'mise.toml',
        'tsconfig.json',
        'vitest.integration.config.ts',
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
    // A project inherits this config and concatenates its arrays, so `include` lives only on the projects.
    projects: [
      // Vitest queues files by project name first, so this name sorts ahead of `isolated` to start the longest suites early.
      { extends: true, test: { name: 'catalogue-readers', include: sharedSnapshotSuites, isolate: false } },
      {
        extends: true,
        test: {
          name: 'isolated',
          include: [
            'src/**/*.integration.test.ts',
            'scripts/**/*.integration.test.ts',
            'mobile/src/**/*.integration.test.ts',
            'spacetimedb/src/**/*.integration.test.ts',
          ],
          exclude: [...configDefaults.exclude, ...sharedSnapshotSuites, clientText],
        },
      },
      // Builds every published payload single-threaded, so CI runs it as its own job beside the rest.
      { extends: true, test: { name: 'client-text', include: [clientText] } },
    ],
  },
})
