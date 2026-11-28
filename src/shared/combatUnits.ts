import { isReferenceDatasheet, type LoadedCatalogue } from './catalogueIndex'
import { unitsIn } from './cataloguePicker'
import { factionIndexFor } from './factionReferences'
import type { LoadedRules } from './rules'
import { vsDatasheetName } from './vsDataNames'

/** Units available to each faction, so one simulator search can pick without first choosing a faction. */
export function combatUnitsFor(loaded: LoadedCatalogue, rules: LoadedRules | null, catalogueIds?: ReadonlySet<string>) {
  const { factions } = factionIndexFor(loaded, rules, catalogueIds)
  const shelves = factions.map((book) => ({
    book,
    units: unitsIn(loaded, book.id, '', { nonMatchedPlay: true }),
  }))
  return shelves.map(({ book, units }) => ({
    catalogueId: book.id,
    name: book.displayName,
    units: units.flatMap((unit) => {
      if (!isReferenceDatasheet(loaded, book.id, unit.id)) return []
      const appName = vsDatasheetName(loaded, book.id, unit.id)
      // The official app's name, from VS Data, only where it differs, as the whole list goes to every device.
      return [
        { id: unit.id, slug: unit.slug, name: unit.name, ...(appName && appName !== unit.name ? { appName } : {}), points: unit.points },
      ]
    }),
  }))
}
