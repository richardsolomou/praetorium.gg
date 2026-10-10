import { routeSlug } from '../core/slug'
import type { PickerUnit } from '../contracts/catalogue'
import { datasheetSearchFieldsIn } from './catalogue'
import { unitsIn } from './cataloguePicker'
import { factionDisplayName } from './factionNames'
import type { LoadedCatalogue } from './catalogueIndex'
import type { LoadedRules } from './rules'

function pickerRestrictions(loaded: LoadedCatalogue, rules: LoadedRules | null, catalogueId: string) {
  const book = loaded.factions.find((entry) => entry.id === catalogueId)
  const displayName = book ? factionDisplayName(book.name, rules?.factionNames) : ''
  return rules?.factionRestrictions.get(routeSlug(displayName))
}

export function pickerUnitsFor(
  loaded: LoadedCatalogue,
  rules: LoadedRules | null,
  catalogueId: string,
  query: string,
  battleSize?: number,
  waivedRules: readonly string[] = [],
): PickerUnit[] {
  const names = rules?.factionNames
  const restrictions = pickerRestrictions(loaded, rules, catalogueId)
  return unitsIn(loaded, catalogueId, query, { restrictions, battleSize, waivedRules }).map((unit) => ({
    ...unit,
    alliedFaction: unit.alliedFaction ? factionDisplayName(unit.alliedFaction, names) : null,
    search: datasheetSearchFieldsIn(loaded, catalogueId, unit.id),
  }))
}

/** The books whose picker lists a datasheet, which are the rosters a reference page can add it to. */
export function booksOffering(loaded: LoadedCatalogue, rules: LoadedRules | null, entryId: string, catalogueIds: readonly string[]) {
  return catalogueIds.filter((catalogueId) =>
    unitsIn(loaded, catalogueId, '', { restrictions: pickerRestrictions(loaded, rules, catalogueId) }).some((unit) => unit.id === entryId),
  )
}
