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

it('freezes the selected Warlord marker into a roster snapshot', () => {
  const roster = rosterSnapshot(
    {
      id: 'roster',
      name: 'Army',
      catalogueId: 'catalogue',
      detachmentIds: [],
      disposition: null,
      limit: 1_000,
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
          entryId: 'captain',
          name: 'Captain',
          points: 80,
          group: 'character',
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

  expect(roster.built?.units[0]?.warlord).toBe(true)
})
