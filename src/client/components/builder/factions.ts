/**
 * How a book is named on screen.
 *
 * The catalogues carry their whole lineage in one string — "Imperium - Adeptus
 * Astartes - Dark Angels" — which is worth reading once and never again: a dozen
 * books begin with the same nineteen characters, so the part that identifies them
 * is the part that scrolls out of sight. The lineage becomes the heading and the
 * last segment becomes the name, which is also what the list names itself after.
 */
export const shortName = (name: string) => {
  const parts = name.split(' - ')
  const last = parts.at(-1)
  return last?.toLowerCase() === 'library' ? (parts.at(-2) ?? name) : (last ?? name)
}

const lineageOf = (name: string) => name.split(' - ').slice(0, -1).at(-1) ?? ''

export type FactionShelf<T> = { lineage: string; factions: T[] }

/** The books grouped under their lineage, each keeping the order it arrived in. */
export function shelve<T extends { name: string }>(factions: readonly T[]): FactionShelf<T>[] {
  const shelves: FactionShelf<T>[] = []
  for (const faction of factions) {
    const lineage = lineageOf(faction.name)
    const shelf = shelves.find((each) => each.lineage === lineage)
    if (shelf) shelf.factions.push(faction)
    else shelves.push({ lineage, factions: [faction] })
  }
  return shelves
}

export function factionSelectGroups<T extends { id: string; name: string }>(factions: readonly T[], favourites: ReadonlySet<string>) {
  const favourite = favouritesFirst(
    factions.filter((entry) => favourites.has(entry.id)),
    favourites,
  )
  const groups = shelve(factions.filter((entry) => !favourites.has(entry.id))).map((shelf) => ({
    label: shelf.lineage,
    items: shelf.factions.map((entry) => ({ label: shortName(entry.name), value: entry.id })),
  }))
  return favourite.length
    ? [{ label: 'Favourites', items: favourite.map((entry) => ({ label: shortName(entry.name), value: entry.id })) }, ...groups]
    : groups
}
import { favouritesFirst } from '../../favouriteFactions'
