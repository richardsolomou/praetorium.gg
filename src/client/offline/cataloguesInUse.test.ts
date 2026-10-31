import { QueryClient } from '@tanstack/react-query'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cataloguesIn, cataloguesInUse } from './cataloguesInUse'

beforeEach(() => vi.stubGlobal('localStorage', { getItem: () => null }))
afterEach(() => vi.unstubAllGlobals())

it('finds the catalogues saved rosters name', () => {
  expect([
    ...cataloguesIn([{ catalogueId: 'legacy~necrons' }, { catalogueId: 'necrons' }, { nested: { catalogueId: 'preview~orks' } }]),
  ]).toEqual(['legacy~necrons', 'necrons', 'preview~orks'])
})

it('ignores catalogues only named by reference data', () => {
  const client = new QueryClient()
  client.setQueryData(['faction-index'], { factions: [{ catalogueId: 'legacy~necrons' }] })
  client.setQueryData(['saved-roster-summaries'], [{ catalogueId: 'preview~orks' }])
  expect([...cataloguesInUse(client)]).toEqual(['preview~orks'])
})
