import type { CoreAbility } from '../core/vsDataConstruction'
import type { LoadedCatalogue } from './catalogueIndex'
import { vsDefinitionsOf } from './vsDataBuild'
import { inBook } from './vsDataPoints'

/**
 * The core abilities VS Data records for a datasheet of a list of `catalogueId`, whatever builds its pick; undefined where
 * VS Data has no unit for it or could not read them, which leaves them to the datasheet's own names.
 */
export function vsCoreAbilitiesOf(loaded: LoadedCatalogue, catalogueId: string, entryId: string): readonly CoreAbility[] | undefined {
  const unit = inBook(loaded.vsRoster?.units, catalogueId, entryId)
  return unit ? vsDefinitionsOf(loaded)?.get('unit', unit)?.data.coreAbilities : undefined
}

/** Whether the abilities give every model of the unit one, as Deep Strike, Infiltrators and Scouts ask. */
export const everyModelHas = (abilities: readonly CoreAbility[], ability: CoreAbility['ability']) =>
  abilities.some((held) => held.ability === ability && !held.models)
