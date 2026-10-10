import { describe, expect, it } from 'vitest'
import { catalogueChanges, changesTouching } from '../core/catalogueChanges'
import { bookOf, points } from './catalogue.fixtures'
import { calculateRosterAssessment, calculateRosterPrice, savedRosterPriceInput } from '../shared/pricing'
import type { LoadedRules } from './rules'
import { rosterChangeWithoutPricing, rosterStatus, rosterVerdict } from './rosterStatus'

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
  it.each([
    ['legal', saved(['lord', 'squad'])],
    ['over points', saved(['lord', 'squad'], 150)],
    ['broken limit', saved(['lord', 'lord'])],
    ['retired datasheet', saved(['retired'])],
  ])('assesses %s like full pricing', (_scenario, roster) => {
    const input = savedRosterPriceInput(roster)
    expect(rosterVerdict(roster, calculateRosterAssessment(input, loaded, rulesWithout))).toEqual(
      rosterVerdict(roster, calculateRosterPrice(input, loaded, rulesWithout)),
    )
  })

  it('reuses a unit build across lists with duplicate picks', () => {
    const cache: NonNullable<Parameters<typeof calculateRosterAssessment>[3]> = new Map()
    calculateRosterAssessment(savedRosterPriceInput(saved(['lord', 'squad'])), loaded, rulesWithout, cache)
    const roster = saved(['lord', 'lord'])
    const input = savedRosterPriceInput(roster)
    const assessed = calculateRosterAssessment(input, loaded, rulesWithout, cache)
    const priced = calculateRosterPrice(input, loaded, rulesWithout)

    expect({ points: assessed?.points, verdict: rosterVerdict(roster, assessed) }).toEqual({
      points: priced?.points,
      verdict: rosterVerdict(roster, priced),
    })
  })

  it('finds nothing wrong with a legal list', () => {
    expect(judged(saved(['lord', 'squad'])).problem).toBeNull()
  })

  it('names a list over its points limit', () => {
    expect(judged(saved(['lord', 'squad'], 150)).problem).toBe('over-limit')
  })

  it('does not mark a list over points when it waived the points limit', () => {
    const roster = { ...saved(['lord', 'squad'], 150), waivedRules: ['points-limit'] }
    expect(judged(roster).problem).toBeNull()
  })

  it('names a list within its limit that breaks a datasheet limit as not legal', () => {
    expect(judged(saved(['lord', 'lord'])).problem).toBe('not-legal')
  })

  it('judges nothing about a list it could not price', () => {
    expect(rosterVerdict(saved(['lord', 'lord']), null).problem).toBeNull()
  })

  it('counts a datasheet the data no longer builds as held', () => {
    expect(judged(saved(['retired'])).contents.datasheets).toEqual([{ id: 'retired', models: null }])
  })

  it('keeps the rebuilt model count for points changes', () => {
    expect(judged(saved(['lord'])).contents.datasheets).toEqual([{ id: 'lord', models: 1 }])
  })

  it('reads the enhancements and upgrades a list holds from its price', () => {
    const verdict = rosterVerdict(saved(['lord']), {
      points: 100,
      detachmentError: null,
      dispositionError: null,
      errors: [],
      units: [{ key: 0, size: { models: 1 }, enhancements: ['Artificer Armour'], upgrades: ['Drill Squad'] }],
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

describe('changes that do not need roster pricing', () => {
  it('prices a list before claiming a changed row for a different model count', () => {
    const roster = saved(['squad'])
    const update = {
      recordedAt: 200,
      changes: catalogueChanges(
        {
          datasheets: [
            {
              catalogueId: 'cat',
              faction: 'Test',
              id: 'squad',
              name: 'Squad',
              points: null,
              costs: [
                { models: '1', cost: '40', keyword: null, faction: null, detachment: null },
                { models: '6', cost: '175', keyword: null, faction: null, detachment: null },
              ],
            },
          ],
          detachments: [],
        },
        {
          datasheets: [
            {
              catalogueId: 'cat',
              faction: 'Test',
              id: 'squad',
              name: 'Squad',
              points: null,
              costs: [
                { models: '1', cost: '40', keyword: null, faction: null, detachment: null },
                { models: '6', cost: '190', keyword: null, faction: null, detachment: null },
              ],
            },
          ],
          detachments: [],
        },
      ),
    }

    expect({
      fallback: rosterChangeWithoutPricing(roster, [update]),
      changes: rosterStatus({ ...roster, id: 'list' }, judged(roster), [update]).changes,
    }).toEqual({ fallback: 'needs-price', changes: 0 })
  })

  const optionChange = (catalogueId: string, detachmentId: string) => ({
    recordedAt: 200,
    changes: {
      factions: [
        {
          catalogueId,
          faction: 'Test',
          changes: [
            {
              kind: 'enhancement-points' as const,
              detachmentId,
              detachment: 'Test Detachment',
              name: 'Artificer Armour',
              upgrade: false,
              from: '10',
              to: '15',
            },
          ],
        },
      ],
      omitted: 0,
    },
  })

  it('finds a changed datasheet even when it belongs to another faction', () => {
    const alliedChange = {
      ...repricedSquad,
      changes: {
        ...repricedSquad.changes,
        factions: repricedSquad.changes.factions.map((faction) => ({ ...faction, catalogueId: 'ally' })),
      },
    }

    expect(rosterChangeWithoutPricing(saved(['squad']), [alliedChange])).toBe('changed')
  })

  it('finds a changed detachment in the roster faction', () => {
    const detachment = { catalogueId: 'cat', faction: 'Test', id: 'detachment', name: 'Test Detachment', enhancements: [], upgrades: [] }
    const update = {
      recordedAt: 200,
      changes: catalogueChanges(
        { datasheets: [], detachments: [{ ...detachment, points: 0 }] },
        { datasheets: [], detachments: [{ ...detachment, points: 5 }] },
      ),
    }

    expect(rosterChangeWithoutPricing({ ...saved(['lord']), detachmentIds: ['detachment'] }, [update])).toBe('changed')
  })

  it('does not report a change that was undone', () => {
    const unchanged = {
      ...repricedSquad,
      recordedAt: 300,
      changes: catalogueChanges(
        { datasheets: [{ catalogueId: 'cat', faction: 'Test', id: 'squad', name: 'Squad', points: 80, costs: [] }], detachments: [] },
        { datasheets: [{ catalogueId: 'cat', faction: 'Test', id: 'squad', name: 'Squad', points: 70, costs: [] }], detachments: [] },
      ),
    }

    expect(rosterChangeWithoutPricing(saved(['squad']), [repricedSquad, unchanged])).toBe('unchanged')
  })

  it('leaves an enhancement-only change for the priced fallback', () => {
    const roster = { ...saved(['lord']), detachmentIds: ['detachment'] }
    const update = optionChange('cat', 'detachment')
    const priced = rosterVerdict(roster, {
      points: 100,
      detachmentError: null,
      dispositionError: null,
      errors: [],
      units: [{ key: 0, size: { models: 1 }, enhancements: ['Artificer Armour'], upgrades: [] }],
    })

    expect({
      certain: rosterChangeWithoutPricing(roster, [update]),
      priced: rosterStatus({ ...roster, id: 'list' }, priced, [update]).changes,
    }).toEqual({
      certain: 'needs-price',
      priced: 1,
    })
  })

  it('skips an option change in another detachment', () => {
    expect(rosterChangeWithoutPricing({ ...saved(['lord']), detachmentIds: ['detachment'] }, [optionChange('cat', 'other')])).toBe(
      'unchanged',
    )
  })

  it('skips an option change in another faction', () => {
    expect(rosterChangeWithoutPricing({ ...saved(['lord']), detachmentIds: ['detachment'] }, [optionChange('ally', 'detachment')])).toBe(
      'unchanged',
    )
  })

  it('ignores updates from before the roster was saved', () => {
    expect(rosterChangeWithoutPricing({ ...saved(['squad']), updatedAt: 300 }, [repricedSquad])).toBe('unchanged')
  })
})
