import { expect, it } from 'vitest'
import { catalogueRevision } from './catalogueIndex'

it('changes the validation revision when definitions, points, or game rules move', () => {
  const base = { definitions: 'base', points: 'mfm', datacards: 'rules' }
  expect(
    new Set([
      catalogueRevision(base),
      catalogueRevision({ ...base, definitions: 'new-base' }),
      catalogueRevision({ ...base, points: 'new-mfm' }),
      catalogueRevision({ ...base, datacards: 'new-rules' }),
    ]).size,
  ).toBe(4)
})
