import { expect, it } from 'vitest'
import { combatRequestsSchema, rosterCombatantsSchema } from './combatCalculation'
import { datasheetSchema } from './schemas'
import { DEFAULT_COMBAT_OPTIONS } from '../core/combat'

it('normalises batched roster identities like an individual datasheet request', () => {
  const roster = {
    catalogueId: 'e0af-67df-9d63-8fb8',
    detachmentIds: [],
    picks: [{ entryId: 'profile-unit-e0af-67df-9d63-8fb8-34c7-75dd-fcff-ec94' }],
  }
  const single = datasheetSchema.parse({ ...roster, entryId: roster.picks[0]!.entryId, pickIndex: 0 })
  const batch = rosterCombatantsSchema.parse({ ...roster, pickIndices: [0] })
  expect({ catalogueId: batch.catalogueId, picks: batch.picks }).toEqual({ catalogueId: single.catalogueId, picks: single.picks })
})

it('rejects missing roster units before loading a catalogue', () => {
  expect(rosterCombatantsSchema.safeParse({ catalogueId: 'cat', picks: [{ entryId: 'unit' }], pickIndices: [1] }).success).toBe(false)
})

it('bounds each calculation batch', () => {
  expect(combatRequestsSchema.safeParse(Array.from({ length: 5 }, () => ({ ranged: null, melee: null }))).success).toBe(false)
})

it('rejects oversized target model counts', () => {
  expect(
    combatRequestsSchema.safeParse([
      {
        ranged: {
          options: DEFAULT_COMBAT_OPTIONS,
          weapons: [],
          target: {
            groups: [{ models: 101, toughness: 4, wounds: 2, save: 3, invulnerable: null }],
            feelNoPain: null,
          },
        },
        melee: null,
      },
    ]).success,
  ).toBe(false)
})
