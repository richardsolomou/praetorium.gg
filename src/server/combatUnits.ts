import { routeSlug } from '../core/slug'
import { unitsIn } from './cataloguePicker'
import { factionIndexFor } from './factionReferences'
import { factionDisplayName } from './factionNames'
import type { LoadedCatalogue } from './catalogueIndex'
import type { LoadedRules } from './rules'

/** Units available to each faction, so one simulator search can pick without first choosing a faction. */
export function combatUnitsFor(loaded: LoadedCatalogue, rules: LoadedRules | null) {
  const { factions } = factionIndexFor(loaded, rules)
  // An allied datasheet is listed under its own faction when that faction has a book; otherwise only its host offers it.
  const books = new Set(factions.map((book) => book.displayName))
  const bookIds = new Set(factions.map((book) => book.id))
  const shelves = factions.map((book) => ({
    book,
    units: unitsIn(loaded, book.id, '', { restrictions: rules?.factionRestrictions.get(routeSlug(book.displayName)) }),
  }))
  const owners = new Map<string, Set<string>>()
  for (const { units } of shelves)
    for (const unit of units) {
      const owner = loaded.index.catalogueOf.get(unit.id)
      if (!owner || !bookIds.has(owner)) continue
      const catalogues = owners.get(unit.name) ?? new Set<string>()
      catalogues.add(owner)
      owners.set(unit.name, catalogues)
    }
  return shelves.map(({ book, units }) => ({
    catalogueId: book.id,
    name: book.displayName,
    units: units.flatMap((unit) =>
      (unit.alliedFaction && books.has(factionDisplayName(unit.alliedFaction, rules?.factionNames))) ||
      (loaded.index.catalogueOf.get(unit.id) !== book.id && (owners.get(unit.name)?.size ?? 0) > 1)
        ? []
        : [{ id: unit.id, name: unit.name, points: unit.points }],
    ),
  }))
}
