import { QueryClient } from '@tanstack/react-query'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { rulesVersionsIn, rulesVersionsInUse } from './rulesVersionsInUse'

beforeEach(() => vi.stubGlobal('localStorage', { getItem: () => null }))
afterEach(() => vi.unstubAllGlobals())

it('finds the rules versions saved rosters pin', () => {
  expect([
    ...rulesVersionsIn([{ catalogueId: 'legacy~necrons' }, { catalogueId: 'necrons' }, { nested: { catalogueId: 'preview~orks' } }]),
  ]).toEqual(['legacy', 'preview'])
})

it('ignores rules versions only named by reference data', () => {
  const client = new QueryClient()
  client.setQueryData(['faction-index'], { factions: [{ catalogueId: 'legacy~necrons' }] })
  client.setQueryData(['saved-roster-summaries'], [{ catalogueId: 'preview~orks' }])
  expect([...rulesVersionsInUse(client)]).toEqual(['preview'])
})
