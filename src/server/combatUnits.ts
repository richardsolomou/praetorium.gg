import { routeSlug } from '../core/slug'
import { unitsIn } from './cataloguePicker'
import { factionIndexFor } from './factionReferences'
import { factionDisplayName } from './factionNames'
import type { LoadedCatalogue } from './catalogueIndex'
import type { LoadedRules } from './rules'

/** Every faction's own units, so one simulator search can pick without first choosing a faction. */
export function combatUnitsFor(loaded: LoadedCatalogue, rules: LoadedRules | null) {
  const { factions } = factionIndexFor(loaded, rules)
  // An allied datasheet is listed under its own faction when that faction has a book; otherwise only its host offers it.
  const books = new Set(factions.map((book) => book.displayName))
  return factions.map((book) => ({
    catalogueId: book.id,
    name: book.displayName,
    units: unitsIn(loaded, book.id, '', { restrictions: rules?.factionRestrictions.get(routeSlug(book.displayName)) }).flatMap((unit) =>
      unit.alliedFaction && books.has(factionDisplayName(unit.alliedFaction, rules?.factionNames))
        ? []
        : [{ id: unit.id, name: unit.name, points: unit.points }],
    ),
  }))
}
