import { catalogueEditionId, editionFamilyId } from './catalogueEdition'
import { routeSlug } from './slug'

type ReferenceFaction = { id: string; displayName: string; edition?: { id: string } | null; isDefault?: boolean }

export function factionReferenceRoute(faction: ReferenceFaction) {
  return {
    catalogueId: routeSlug(faction.displayName),
    rulesVersion: faction.edition?.id ?? (faction.isDefault === false ? faction.id : undefined),
  }
}

export function referenceFactionId(factions: readonly ReferenceFaction[], slug: string, rules: string) {
  const family = factions.find((faction) => routeSlug(faction.displayName) === slug && !catalogueEditionId(faction.id))
  if (!family) return null
  if (rules === family.id) return family.id
  return `${rules}~${editionFamilyId(family.id)}`
}

export function factionReferenceHref(faction: ReferenceFaction, suffix = '') {
  const route = factionReferenceRoute(faction)
  return `/factions/${route.catalogueId}${route.rulesVersion ? `/rules/${encodeURIComponent(route.rulesVersion)}` : ''}${suffix}`
}
