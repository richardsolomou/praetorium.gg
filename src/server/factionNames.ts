import { routeSlug } from '../core/slug'

/** The same rules-backed player-facing name used by the faction reference pages. */
export function factionDisplayName(catalogueName: string, names?: ReadonlyMap<string, string>) {
  const parts = catalogueName.split(' - ')
  const last = parts.at(-1)
  const leaf = last?.toLowerCase() === 'library' ? parts.at(-2) : last
  if (!leaf) return catalogueName
  return names?.get(routeSlug(leaf)) ?? leaf
}
