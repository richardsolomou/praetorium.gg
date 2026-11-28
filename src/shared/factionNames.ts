import { routeSlug } from '../core/slug'
import type { LoadedCatalogue } from './catalogueIndex'

const editionlessCatalogueName = (name: string) => name.replace(/ \(11e\)$/, '')

/** The last segment of a catalogue's lineage, passing over a trailing "Library". */
export function catalogueLeafName(catalogueName: string) {
  const parts = catalogueName.split(' - ')
  const last = parts.at(-1)
  return last?.toLowerCase() === 'library' ? parts.at(-2) : last
}

/** The same rules-backed player-facing name used by the faction reference pages. */
export function factionDisplayName(catalogueName: string, names?: ReadonlyMap<string, string>) {
  const leaf = catalogueLeafName(catalogueName)
  if (!leaf) return catalogueName
  const name = editionlessCatalogueName(leaf)
  return names?.get(routeSlug(name)) ?? name
}

/** The VS Data faction a book plays, through the frozen book map, by its ID and English name; none without a VS Data release. */
export function vsFactionOf(loaded: Pick<LoadedCatalogue, 'vsPoints'>, catalogueId: string): { id: string; name: string } | null {
  const id = loaded.vsPoints?.books[catalogueId.slice(catalogueId.indexOf('~') + 1)]
  const name = id ? loaded.vsPoints?.factions[id]?.name : undefined
  return id && name ? { id, name } : null
}

/**
 * The faction an agent names by the VS Data faction it plays, its keyword name or ID, as "Asuryani" or "Legiones Daemonica"
 * for Aeldari and Chaos Daemons; a current rules version's book first, as several books can play one VS Data faction.
 */
export function factionByVsName<T extends { vsFaction?: { id: string; name: string } | null; isDefault?: boolean }>(
  named: string,
  factions: readonly T[],
): T | undefined {
  const key = routeSlug(named)
  const playing = factions.filter(({ vsFaction }) => vsFaction && (vsFaction.id === key || routeSlug(vsFaction.name) === key))
  return playing.find((faction) => faction.isDefault !== false) ?? playing[0]
}

type NamedFaction = { displayName: string; vsFaction?: { id: string; name: string } | null; isDefault?: boolean }

/**
 * The army slug a battle filter reads (its faction's display name as a slug) that an agent means by one, or by the VS Data
 * faction keyword name or ID it plays, as "Asuryani" for `aeldari`; anything else as given.
 */
export function factionSlugOf(named: string, factions: readonly NamedFaction[]) {
  if (factions.some((faction) => routeSlug(faction.displayName) === named)) return named
  const playing = factionByVsName(named, factions)
  return playing ? routeSlug(playing.displayName) : named
}

type Facet = { in: string[]; out: string[] }
const facetSlugs = (facet: Facet, factions: readonly NamedFaction[]): Facet => ({
  ...facet,
  in: facet.in.map((named) => factionSlugOf(named, factions)),
  out: facet.out.map((named) => factionSlugOf(named, factions)),
})

/** A battle filter whose faction facets name VS Data faction keyword names or IDs read as the army slugs they stand for. */
export const withFactionSlugs = <T extends { faction?: Facet; against?: Facet }>(filter: T, factions: readonly NamedFaction[]): T => ({
  ...filter,
  ...(filter.faction ? { faction: facetSlugs(filter.faction, factions) } : {}),
  ...(filter.against ? { against: facetSlugs(filter.against, factions) } : {}),
})

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
  ['imperial agents', 'Agents of the Imperium'],
])

export const catalogueFactionName = (name: string) => CATALOGUE_FACTION_NAMES.get(name.trim().toLowerCase()) ?? name

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
    .flatMap((segment) => {
      if (segment.toLowerCase() === 'library') return []
      const slug = routeSlug(editionlessCatalogueName(segment))
      return loaded.factionContents.get(slug) ?? []
    })
}

/** The file a book reads its army rules from: the nearest one that exists. */
export const factionContentOf = (loaded: LoadedCatalogue, catalogueName: string) => factionContentsOf(loaded, catalogueName)[0]
