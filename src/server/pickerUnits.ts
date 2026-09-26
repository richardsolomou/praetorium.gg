import { routeSlug } from '../core/slug'
import type { PickerUnit } from '../contracts/catalogue'
import { datasheetSearchFieldsIn } from './catalogue'
import { unitsIn } from './cataloguePicker'
import { factionDisplayName } from './factionNames'
import type { LoadedCatalogue } from './catalogueIndex'
import type { LoadedRules } from './rules'

export function pickerUnitsFor(
  loaded: LoadedCatalogue,
  rules: LoadedRules | null,
  catalogueId: string,
  query: string,
  battleSize?: number,
  waivedRules: readonly string[] = [],
): PickerUnit[] {
  const names = rules?.factionNames
  const book = loaded.factions.find((entry) => entry.id === catalogueId)
  const displayName = book ? factionDisplayName(book.name, names) : ''
  const restrictions = rules?.factionRestrictions.get(routeSlug(displayName))
  return unitsIn(loaded, catalogueId, query, { restrictions, battleSize, waivedRules }).map((unit) => ({
    ...unit,
    alliedFaction: unit.alliedFaction ? factionDisplayName(unit.alliedFaction, names) : null,
    search: datasheetSearchFieldsIn(loaded, catalogueId, unit.id),
  }))
}
