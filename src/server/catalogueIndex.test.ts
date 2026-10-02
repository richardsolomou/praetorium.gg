import { expect, it } from 'vitest'
import { catalogueRevision } from './catalogueIndex'

it('changes the catalogue revision when either Marine or MFM data moves', () => {
  const base = { definitions: 'base', marineCodex: 'codex', points: 'mfm' }
  expect(
    new Set([
      catalogueRevision(base),
      catalogueRevision({ ...base, marineCodex: 'new-codex' }),
      catalogueRevision({ ...base, points: 'new-mfm' }),
    ]).size,
  ).toBe(3)
})
