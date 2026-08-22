import { describe, expect, it } from 'vitest'
import { gameReferencesRefreshInterval, loadoutDatasheetsQuery, newestBattleScreen } from './queries'

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
})
