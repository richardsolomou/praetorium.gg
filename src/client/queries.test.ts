import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import * as functions from '../server/functions'
import { gameReferencesRefreshInterval, loadoutDatasheetsQuery, newestBattleScreen, terrainReferencesQuery } from './queries'

describe('battle query ordering', () => {
  it('keeps the newer cached battle when an older refetch finishes late', () => {
    const current = { kind: 'battle', view: { seq: 13, cards: ['a', 'b'] } }
    const stale = { kind: 'battle', view: { seq: 12, cards: ['a'] } }

    expect(newestBattleScreen(current, stale)).toBe(current)
  })

  it('accepts a newer battle screen', () => {
    const current = { kind: 'battle', view: { seq: 12, cards: ['a'] } }
    const next = { kind: 'battle', view: { seq: 13, cards: ['a', 'b'] } }

    expect(newestBattleScreen(current, next)).toEqual(next)
  })

  it('keeps spectator polling monotonic too', () => {
    const current = { kind: 'spectator', view: { seq: 13, cards: ['a', 'b'] } }
    const stale = { kind: 'spectator', view: { seq: 12, cards: ['a'] } }

    expect(newestBattleScreen(current, stale)).toBe(current)
  })
})

describe('roster datasheet queries', () => {
  it('keys a persisted roster by its id and selected pick without including roster contents', () => {
    const picks = [{ entryId: 'unit' }]
    const query = loadoutDatasheetsQuery('catalogue', 'unit', ['detachment'], picks, 0, { id: 'roster' })

    expect(query.queryKey).toEqual(['saved-roster-loadout-datasheets', 'roster', null, 0])
  })

  it('keeps draft roster contents in the editable query key', () => {
    const picks = [{ entryId: 'unit' }]
    const query = loadoutDatasheetsQuery('catalogue', 'unit', ['detachment'], picks, 0)

    expect(query.queryKey).toEqual(['loadout-datasheets', 'catalogue', 'unit', ['detachment'], picks, 0])
  })
})

describe('game reference queries', () => {
  it('retries while startup data is unavailable', () => {
    expect(gameReferencesRefreshInterval(null)).toBe(1_000)
    expect(gameReferencesRefreshInterval({ packs: [] })).toBe(false)
  })

  it('fetches versioned terrain instead of reusing cached geometry without objectives or measurements', async () => {
    const client = new QueryClient()
    const matchupIds = ['take-vs-purge']
    const legacy = { layouts: [{ geometry: { areas: [{ objectiveGroup: null }] } }], templates: [] }
    const current = { layouts: [], templates: [] }
    client.setQueryData(['terrain-references', ...matchupIds], legacy)
    const request = vi.spyOn(functions, 'terrainReferences').mockResolvedValue(current)
    try {
      expect(await client.query(terrainReferencesQuery(matchupIds))).toEqual(current)
      expect(request).toHaveBeenCalledExactlyOnceWith({ data: { matchupIds, geometryVersion: 3 } })
      expect(client.getQueryData(['terrain-references', ...matchupIds])).toEqual(legacy)
    } finally {
      request.mockRestore()
      client.clear()
    }
  })
})
