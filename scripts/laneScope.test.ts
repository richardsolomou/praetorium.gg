import fs from 'node:fs'
import path from 'node:path'
import { expect, it } from 'vitest'
import { browserSpecs, laneNeeded, type Selection } from './laneScope'

const closures = new Map([
  ['scripts/catalogueCoverage.ts', ['scripts/catalogueCoverage.ts', 'src/server/catalogueIndex.ts']],
  ['scripts/browserTestBuild.ts', ['scripts/browserTestBuild.ts', 'scripts/lib/localStack.ts']],
  ['src/routes/rosters.tsx', ['src/routes/rosters.tsx', 'src/client/features/rosters/SavedPage.tsx']],
  [
    'src/client/features/rosters/SavedPage.tsx',
    ['src/client/features/rosters/SavedPage.tsx', 'src/client/features/rosters/RosterCard.tsx'],
  ],
  ['src/client/features/battle/Setup.tsx', ['src/client/features/battle/Setup.tsx', 'src/client/features/rosters/RosterCard.tsx']],
  ['src/client/home.ts', ['src/client/home.ts', 'src/client/features/battle/Summary.tsx']],
])
const reached = new Set([...closures.values()].flat())
const selection: Selection = {
  anyFeature: ['navigation.spec.ts'],
  catalogue: ['faction-rules.spec.ts'],
  features: { rosters: ['saved.spec.ts'], battle: ['battle.spec.ts'], shell: 'all' },
}

it('skips a change to code a lane never imports', () => {
  expect(laneNeeded('coverage', ['src/client/features/battle/setup/ReservesStep.tsx', 'CHANGELOG.md'], reached)).toBe(false)
})

it('runs a lane for a change to code it imports', () => {
  expect(laneNeeded('points', ['src/server/catalogueIndex.ts'], reached)).toBe(true)
})

it.each([
  'catalogue.json',
  'catalogue/patches/rules.json',
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'mise.toml',
  'tsconfig.json',
  '.github/workflows/ci.yml',
  '.github/workflows/ci-coverage.yml',
  '.github/workflows/ci-e2e.yml',
  '.github/workflows/ci-browser-build.yml',
  '.github/actions/catalogue-sync/action.yml',
])('runs the coverage lane for %s, which it reads outside its imports', (file) => {
  expect(laneNeeded('coverage', [file], reached)).toBe(true)
})

it('runs no browser specs for a script the browser stack never imports', () => {
  expect(browserSpecs(['scripts/importCorpus.ts', 'docs/development/battles.md'], closures, selection)).toEqual([])
})

it('runs no browser specs for a unit test', () => {
  expect(browserSpecs(['src/core/combat.test.ts'], closures, selection)).toEqual([])
})

it('runs every browser spec for a script the browser stack imports', () => {
  expect(browserSpecs(['scripts/lib/localStack.ts'], closures, selection)).toBe('all')
})

it('runs every browser spec for shared application code', () => {
  expect(browserSpecs(['src/core/combat.ts'], closures, selection)).toBe('all')
})

it('runs every browser spec for a browser-test helper', () => {
  expect(browserSpecs(['e2e/account.ts'], closures, selection)).toBe('all')
})

it('runs only a changed spec', () => {
  expect(browserSpecs(['e2e/saved.spec.ts'], closures, selection)).toEqual(['saved.spec.ts'])
})

it('runs no browser specs for a deleted spec', () => {
  expect(browserSpecs(['e2e/retired.spec.ts'], closures, selection)).toEqual([])
})

it('runs no browser specs for a docs screenshot spec, which CI never lists', () => {
  expect(browserSpecs(['e2e/docs-screenshots.readme.spec.ts'], closures, selection)).toEqual([])
})

it('runs the spec whose screenshot baseline changed', () => {
  expect(browserSpecs(['e2e/phone-layout.spec.ts-snapshots/home.png'], closures, selection)).toEqual(['phone-layout.spec.ts'])
})

it("runs a client feature's specs and those every feature affects", () => {
  expect(browserSpecs(['src/client/features/rosters/SavedPage.tsx'], closures, selection)).toEqual(['navigation.spec.ts', 'saved.spec.ts'])
})

it('runs the specs of every feature that imports a feature file', () => {
  expect(browserSpecs(['src/client/features/rosters/RosterCard.tsx'], closures, selection)).toEqual([
    'battle.spec.ts',
    'navigation.spec.ts',
    'saved.spec.ts',
  ])
})

it('runs every browser spec for a feature file that code outside the features imports', () => {
  expect(browserSpecs(['src/client/features/battle/Summary.tsx'], closures, selection)).toBe('all')
})

it('runs every browser spec for a feature mapped to all of them', () => {
  expect(browserSpecs(['src/client/features/shell/AppShell.tsx'], closures, selection)).toBe('all')
})

it('runs every browser spec for a feature the selection does not list', () => {
  expect(browserSpecs(['src/client/features/newThing/Page.tsx'], closures, selection)).toBe('all')
})

it('runs the catalogue specs for catalogue data', () => {
  expect(browserSpecs(['catalogue/patches/rules.json', 'catalogue.json'], closures, selection)).toEqual(['faction-rules.spec.ts'])
})

it('runs every browser spec when a dependency changes', () => {
  expect(browserSpecs(['e2e/saved.spec.ts', 'pnpm-lock.yaml'], closures, selection)).toBe('all')
})

const repository = path.join(import.meta.dirname, '..')
const committed = JSON.parse(fs.readFileSync(path.join(repository, 'e2e/selection.json'), 'utf8')) as Selection
const listed = [committed.anyFeature, committed.catalogue, ...Object.values(committed.features)].flatMap((specs) =>
  specs === 'all' ? [] : specs,
)

it.each(fs.readdirSync(path.join(repository, 'src/client/features')))('lists the %s feature in e2e/selection.json', (feature) => {
  expect(committed.features).toHaveProperty(feature)
})

it.each([...new Set(listed)])('lists %s, which exists', (spec) => {
  expect(fs.existsSync(path.join(repository, 'e2e', spec))).toBe(true)
})

const specs = fs
  .readdirSync(path.join(repository, 'e2e'))
  .filter((file) => file.endsWith('.spec.ts') && !file.startsWith('docs-screenshots.'))

it.each(specs)('lists %s for at least one change in e2e/selection.json', (spec) => {
  expect(listed).toContain(spec)
})
