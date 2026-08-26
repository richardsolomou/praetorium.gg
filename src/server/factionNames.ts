import { routeSlug } from '../core/slug'
import type { LoadedCatalogue } from './catalogueIndex'

/** The same rules-backed player-facing name used by the faction reference pages. */
export function factionDisplayName(catalogueName: string, names?: ReadonlyMap<string, string>) {
  const parts = catalogueName.split(' - ')
  const last = parts.at(-1)
  const leaf = last?.toLowerCase() === 'library' ? parts.at(-2) : last
  if (!leaf) return catalogueName
  return names?.get(routeSlug(leaf)) ?? leaf
}

/**
 * The name the catalogues give a faction the rules call something else: a `Faction:`
 * keyword, a Game Datacards file and the Adeptus Astartes book all name the Space
 * Marines, and one table says so.
 */
const CATALOGUE_FACTION_NAMES = new Map([
  ['adeptus astartes', 'Space Marines'],
  ['heretic astartes', 'Chaos Space Marines'],
  ['asuryani', 'Aeldari'],
  ['harlequins', 'Aeldari'],
  ['legiones daemonica', 'Chaos Daemons'],
])

export const catalogueFactionName = (name: string) => CATALOGUE_FACTION_NAMES.get(name.trim().toLocaleLowerCase()) ?? name

/**
 * The Game Datacards files a book can read, nearest first: its own, then those of the
 * books it is a supplement to. The catalogue names the Ultramarines book "Imperium -
 * Adeptus Astartes - Ultramarines", and the Adeptus Astartes cards are the ones its
 * datasheets print. The files answer to every name a faction goes by, so no alias
 * table is needed here.
 */
export function factionContentsOf(loaded: LoadedCatalogue, catalogueName: string) {
  return catalogueName
    .split(' - ')
    .toReversed()
    .flatMap((segment) => (segment.toLowerCase() === 'library' ? [] : (loaded.factionContents.get(routeSlug(segment)) ?? [])))
}

/** The file a book reads its army rules from: the nearest one that exists. */
export const factionContentOf = (loaded: LoadedCatalogue, catalogueName: string) => factionContentsOf(loaded, catalogueName)[0]
