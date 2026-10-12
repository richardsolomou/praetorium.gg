import { expect, it } from 'vitest'
import { rosterCombatants } from './rosterCombatants'
import { rosterCombatant } from './rosterCombatRules'
import { preferenceBook } from '../server/combatPreferences.fixtures'

it.each([{ inactivePicks: [] }, { inactivePicks: [1] }, { inactivePicks: [2] }])(
  'preserves individual projections with $inactivePicks',
  ({ inactivePicks }) => {
    const catalogue = preferenceBook(true)
    const input = {
      catalogueId: 'cat',
      detachmentIds: [],
      picks: [{ entryId: 'squad' }, { entryId: 'leader', attachedTo: 0 }, { entryId: 'support', attachedTo: 0 }],
      pickIndices: [0, 2, 1],
      inactivePicks,
    }
    expect(rosterCombatants(catalogue, null, input)).toEqual(
      input.pickIndices.map((pickIndex) => rosterCombatant(catalogue, null, { ...input, pickIndex })),
    )
  },
)
