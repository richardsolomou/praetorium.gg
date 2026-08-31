import { expect, it } from 'vitest'
import { rosterSnapshot } from './rosterSnapshot'

it('freezes unit wounds into a roster snapshot', () => {
  const roster = rosterSnapshot(
    {
      id: 'roster',
      name: 'Army',
      catalogueId: 'catalogue',
      detachmentIds: [],
      disposition: null,
      limit: 2_000,
      waivedRules: [],
      picks: [{ entryId: 'unit' }],
    },
    {
      points: 80,
      revision: 'revision',
      detachment: null,
      detachments: [],
      detachmentPointBudget: null,
      disposition: null,
      units: [
        {
          key: 0,
          entryId: 'unit',
          name: 'Unit',
          points: 80,
          group: 'infantry',
          toggles: [],
          size: { models: 5, resizable: false },
          attachment: null,
          wargear: [],
          enhancements: [],
          upgrades: [],
          formationOptions: ['battlefield'],
          prebattleRules: [],
        },
      ],
    },
    [{ entryId: 'unit', wounds: 3 }],
  )

  expect(roster.built?.units[0]?.wounds).toBe(3)
})

it('freezes catalogue-derived Warlord eligibility into a roster snapshot', () => {
  const roster = rosterSnapshot(
    {
      id: 'roster',
      name: 'Army',
      catalogueId: 'catalogue',
      detachmentIds: [],
      disposition: null,
      limit: 1_000,
      waivedRules: [],
      picks: [{ entryId: 'captain' }],
    },
    {
      points: 80,
      revision: 'revision',
      detachment: null,
      detachments: [],
      detachmentPointBudget: null,
      disposition: null,
      units: [
        {
          key: 0,
          entryId: 'captain',
          name: 'Captain',
          points: 80,
          group: 'vehicle',
          toggles: [{ name: 'Warlord', selected: true }],
          size: { models: 1, resizable: false },
          attachment: null,
          wargear: [],
          enhancements: [],
          upgrades: [],
          formationOptions: ['battlefield'],
          prebattleRules: [],
        },
      ],
    },
    [],
  )

  expect(roster.built?.units[0]).toMatchObject({ warlord: true, warlordEligible: true })
})

it('freezes the unit a character joined into a roster snapshot', () => {
  const unit = {
    points: 80,
    toggles: [],
    size: { models: 5, resizable: false },
    attachment: null,
    wargear: [],
    enhancements: [],
    upgrades: [],
    formationOptions: [] as const,
    prebattleRules: [] as const,
  }
  const roster = rosterSnapshot(
    {
      id: 'roster',
      name: 'Army',
      catalogueId: 'catalogue',
      detachmentIds: [],
      disposition: null,
      limit: 2_000,
      waivedRules: [],
      picks: [{ entryId: 'marines' }, { entryId: 'lord', attachedTo: 0 }],
    },
    {
      points: 160,
      revision: 'revision',
      detachment: null,
      detachments: [],
      detachmentPointBudget: null,
      disposition: null,
      units: [
        { ...unit, key: 0, entryId: 'marines', name: 'Plague Marines', group: 'battleline' },
        { ...unit, key: 1, entryId: 'lord', name: 'Lord of Contagion', group: 'character' },
      ],
    },
    [],
  )

  expect(roster.built?.units[1]?.attachedTo).toBe(roster.built?.units[0]?.key)
})

it('leaves a character the list joined to nothing unattached', () => {
  const roster = rosterSnapshot(
    {
      id: 'roster',
      name: 'Army',
      catalogueId: 'catalogue',
      detachmentIds: [],
      disposition: null,
      limit: 2_000,
      waivedRules: [],
      picks: [{ entryId: 'lord' }],
    },
    {
      points: 80,
      revision: 'revision',
      detachment: null,
      detachments: [],
      detachmentPointBudget: null,
      disposition: null,
      units: [
        {
          key: 0,
          entryId: 'lord',
          name: 'Lord of Contagion',
          points: 80,
          group: 'character',
          toggles: [],
          size: { models: 1, resizable: false },
          attachment: null,
          wargear: [],
          enhancements: [],
          upgrades: [],
          formationOptions: ['deep-strike'],
          prebattleRules: [],
        },
      ],
    },
    [],
  )

  expect(roster.built?.units[0]).not.toHaveProperty('attachedTo')
})
