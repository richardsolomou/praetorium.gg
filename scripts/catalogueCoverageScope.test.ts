import { expect, it } from 'vitest'
import { needsCatalogueCoverage } from './catalogueCoverageScope'

const reached = new Set(['scripts/catalogueCoverage.ts', 'src/server/catalogueIndex.ts'])

it('skips a change to code the snapshot never imports', () => {
  expect(needsCatalogueCoverage(['src/client/features/battle/setup/ReservesStep.tsx', 'CHANGELOG.md'], reached)).toBe(false)
})

it('runs for a change to code the snapshot imports', () => {
  expect(needsCatalogueCoverage(['src/server/catalogueIndex.ts'], reached)).toBe(true)
})

it.each([
  'catalogue.json',
  'catalogue/patches/rules.json',
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'mise.toml',
  '.github/workflows/ci.yml',
])('runs for %s, which the snapshot reads outside its imports', (file) => {
  expect(needsCatalogueCoverage([file], reached)).toBe(true)
})
