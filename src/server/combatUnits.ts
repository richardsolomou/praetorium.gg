import { routeSlug } from '../core/slug'
import { isReferenceDatasheet, type LoadedCatalogue } from './catalogueIndex'
import { unitsIn } from './cataloguePicker'
import { factionIndexFor } from './factionReferences'
import type { LoadedRules } from './rules'

/** Units available to each faction, so one simulator search can pick without first choosing a faction. */
export function combatUnitsFor(loaded: LoadedCatalogue, rules: LoadedRules | null) {
  const { factions } = factionIndexFor(loaded, rules)
  const shelves = factions.map((book) => ({
    book,
    units: unitsIn(loaded, book.id, '', { restrictions: rules?.factionRestrictions.get(routeSlug(book.displayName)) }),
  }))
  return shelves.map(({ book, units }) => ({
    catalogueId: book.id,
    name: book.displayName,
    units: units.flatMap((unit) =>
      isReferenceDatasheet(loaded, book.id, unit.id) ? [{ id: unit.id, name: unit.name, points: unit.points }] : [],
    ),
  }))
}
