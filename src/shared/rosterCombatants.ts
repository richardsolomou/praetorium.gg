import type { z } from 'zod'
import { datasheetSchema } from '../contracts/schemas'
import type { rosterCombatantsSchema } from '../contracts/combatCalculation'
import type { LoadedCatalogue } from './catalogueIndex'
import type { LoadedRules } from './rules'
import { rosterCombatant } from './rosterCombatRules'
import { rosterDatasheetSelections } from './rosterDatasheetContext'

export function rosterCombatants(catalogue: LoadedCatalogue, rules: LoadedRules | null, input: z.infer<typeof rosterCombatantsSchema>) {
  const prepared = rosterDatasheetSelections(catalogue, input)
  return input.pickIndices.map((pickIndex) =>
    rosterCombatant(
      catalogue,
      rules,
      {
        ...datasheetSchema.parse({ ...input, pickIndex, entryId: input.picks[pickIndex]!.entryId }),
        inactivePicks: input.inactivePicks,
      },
      prepared,
    ),
  )
}
