import { describe, expect, it } from 'vitest'
import { catalogueChanges, changesTouching } from '../core/catalogueChanges'
import { bookOf, points } from './catalogue.fixtures'
import { calculateRosterPrice, savedRosterPriceInput } from './pricing'
import type { LoadedRules } from './rules'
import { rosterStatus, rosterVerdict } from './rosterStatus'

const rulesWithout = {
  factionKeys: new Map(),
  detachmentReferences: new Map(),
  detachmentDetails: new Map(),
  factionRestrictions: new Map(),
} as Partial<LoadedRules> as LoadedRules

const loaded = bookOf({
  selectionEntries: [
    {
      id: 'lord',
      name: 'Lord',
      type: 'model',
      costs: points(100),
      constraints: [{ id: 'lord-max', type: 'max', value: 1, field: 'selections', scope: 'force', includeChildSelections: true }],
    },
    { id: 'squad', name: 'Squad', type: 'model', costs: points(80) },
  ],
})

const saved = (entryIds: string[], limit = 1_000) => ({
  catalogueId: 'cat',
  detachmentIds: [],
  disposition: null,
  limit,
  picks: entryIds.map((entryId) => ({ entryId })),
  updatedAt: 100,
})

const judged = (roster: ReturnType<typeof saved>) =>
  rosterVerdict(roster, calculateRosterPrice(savedRosterPriceInput(roster), loaded, rulesWithout))

const repricedSquad = {
  recordedAt: 200,
  changes: catalogueChanges(
    { datasheets: [{ catalogueId: 'cat', faction: 'Test', id: 'squad', name: 'Squad', points: 70, costs: [] }], detachments: [] },
    { datasheets: [{ catalogueId: 'cat', faction: 'Test', id: 'squad', name: 'Squad', points: 80, costs: [] }], detachments: [] },
  ),
}

describe('the verdict on a saved list', () => {
  it('finds nothing wrong with a legal list', () => {
    expect(judged(saved(['lord', 'squad'])).problem).toBeNull()
  })

  it('names a list over its points limit', () => {
    expect(judged(saved(['lord', 'squad'], 150)).problem).toBe('over-limit')
  })

  it('names a list within its limit that breaks a datasheet limit as not legal', () => {
    expect(judged(saved(['lord', 'lord'])).problem).toBe('not-legal')
  })

  it('judges nothing about a list it could not price', () => {
    expect(rosterVerdict(saved(['lord', 'lord']), null).problem).toBeNull()
  })

  it('counts a datasheet the data no longer builds as held', () => {
    expect(judged(saved(['retired'])).contents.datasheetIds).toEqual(['retired'])
  })

  it('reads the enhancements and upgrades a list holds from its price', () => {
    const verdict = rosterVerdict(saved(['lord']), {
      points: 100,
      detachmentError: null,
      dispositionError: null,
      errors: [],
      units: [{ enhancements: ['Artificer Armour'], upgrades: ['Drill Squad'] }],
    })

    expect({ enhancements: verdict.contents.enhancements, upgrades: verdict.contents.upgrades }).toEqual({
      enhancements: ['Artificer Armour'],
      upgrades: ['Drill Squad'],
    })
  })

  it('warns about an illegal list without naming a change when none came after its save', () => {
    const roster = saved(['lord', 'lord'])
    const verdict = judged(roster)

    expect({ problem: verdict.problem, changes: changesTouching(verdict.contents, 300, [repricedSquad]) }).toEqual({
      problem: 'not-legal',
      changes: [],
    })
  })

  it('names a change that reached a legal list without warning about it', () => {
    const roster = saved(['squad'])
    const verdict = judged(roster)

    expect({
      problem: verdict.problem,
      changes: changesTouching(verdict.contents, roster.updatedAt, [repricedSquad]).map((entry) => entry.change.kind),
    }).toEqual({ problem: null, changes: ['datasheet-points'] })
  })
})

describe('the library row for a saved list', () => {
  const squadPriced = (recordedAt: number, from: number, to: number) => ({
    recordedAt,
    changes: catalogueChanges(
      { datasheets: [{ catalogueId: 'cat', faction: 'Test', id: 'squad', name: 'Squad', points: from, costs: [] }], detachments: [] },
      { datasheets: [{ catalogueId: 'cat', faction: 'Test', id: 'squad', name: 'Squad', points: to, costs: [] }], detachments: [] },
    ),
  })
  const row = (sets: Parameters<typeof rosterStatus>[2]) => {
    const roster = { ...saved(['squad']), id: 'list' }
    return rosterStatus(roster, judged(roster), sets)
  }

  it('counts an item two updates changed as one change', () => {
    expect(row([squadPriced(200, 70, 80), squadPriced(300, 80, 90)]).changes).toBe(1)
  })

  it('counts nothing for a list whose changes all cancel out', () => {
    expect(row([squadPriced(200, 70, 80), squadPriced(300, 80, 70)]).changes).toBe(0)
  })
})
