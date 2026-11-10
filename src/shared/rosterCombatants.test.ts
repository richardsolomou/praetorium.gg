import { expect, it, vi } from 'vitest'
import { rosterCombatants } from './rosterCombatants'
import { rosterCombatant } from './rosterCombatRules'
import * as combatRules from './rosterCombatRules'
import { rosterCombatantsSchema } from '../contracts/combatCalculation'
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

it('projects a folded batch on the rules its request resolved', () => {
  const project = vi.spyOn(combatRules, 'rosterCombatant').mockReturnValue(null)
  try {
    const input = rosterCombatantsSchema.parse({
      catalogueId: 'current-rosters~2261-79a5-19d9-1668',
      detachmentIds: ['3caf-c168-c372-51b1'],
      picks: [{ entryId: 'squad' }],
      pickIndices: [0],
    })
    rosterCombatants(preferenceBook(true), null, input)
    expect(project.mock.calls[0]?.[2].catalogueId).toBe('2261-79a5-19d9-1668')
  } finally {
    project.mockRestore()
  }
})
