import { catalogueLeafName } from '../../../../shared/factionNames'
import { groupBy } from '../../../../core/collections'
import type { FactionPresentation } from '../../../components/FactionMark'
/**
 * How a book is named on screen.
 *
 * The catalogues carry their whole lineage in one string — "Imperium - Adeptus
 * Astartes - Dark Angels" — which is worth reading once and never again: a dozen
 * books begin with the same nineteen characters, so the part that identifies them
 * is the part that scrolls out of sight. The lineage becomes the heading and the
 * last segment becomes the name, which is also what the list names itself after.
 */
export const shortName = (name: string) => catalogueLeafName(name) ?? name

const lineageOf = (name: string) => name.split(' - ').slice(0, -1).at(-1) ?? ''

export type FactionShelf<T> = { lineage: string; factions: T[] }

/** The books grouped under their lineage, each keeping the order it arrived in. */
function shelve<T extends { name: string }>(factions: readonly T[]): FactionShelf<T>[] {
  return [...groupBy(factions, (faction) => lineageOf(faction.name))].map(([lineage, shelf]) => ({ lineage, factions: shelf }))
}

export function factionSelectGroups<
  T extends {
    id: string
    name: string
    slug?: string
    displayName?: string
    icon?: string | null
    edition?: FactionPresentation['edition']
  },
>(factions: readonly T[], favourites: ReadonlySet<string>) {
  const option = (entry: T) => ({
    label: shortName(entry.name),
    value: entry.id,
    faction: entry.slug
      ? {
          slug: entry.slug,
          displayName: entry.displayName ?? shortName(entry.name),
          icon: entry.icon ?? null,
          ...(entry.edition !== undefined ? { edition: entry.edition } : {}),
        }
      : undefined,
  })
  const favourite = factions.filter((entry) => favourites.has(entry.id))
  const groups = shelve(factions.filter((entry) => !favourites.has(entry.id))).map((shelf) => ({
    label: shelf.lineage,
    items: shelf.factions.map(option),
  }))
  return favourite.length ? [{ label: 'Favourites', items: favourite.map(option) }, ...groups] : groups
}
