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
