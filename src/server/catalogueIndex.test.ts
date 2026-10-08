import { expect, it } from 'vitest'
import { catalogueRevision } from './catalogueIndex'

it('changes the catalogue revision when either definitions or MFM data moves', () => {
  const base = { definitions: 'base', points: 'mfm' }
  expect(
    new Set([
      catalogueRevision(base),
      catalogueRevision({ ...base, definitions: 'new-base' }),
      catalogueRevision({ ...base, points: 'new-mfm' }),
    ]).size,
  ).toBe(3)
})
