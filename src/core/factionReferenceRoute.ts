import { catalogueEditionId, editionFamilyId } from './catalogueEdition'
import { routeSlug } from './slug'

export type ReferenceFaction = {
  id: string
  displayName: string
  edition?: { id: string; slug?: string; name?: string } | null
  rulesSlug?: string
  isDefault?: boolean
}

export function factionReferenceRoute(faction: ReferenceFaction) {
  return {
    catalogueId: routeSlug(faction.displayName),
    rulesVersion:
      faction.edition?.slug ?? faction.edition?.id ?? faction.rulesSlug ?? (faction.isDefault === false ? faction.id : undefined),
  }
}

export function referenceFactionId(factions: readonly ReferenceFaction[], slug: string, rules: string) {
  const selected = factions.find(
    (faction) =>
      (catalogueEditionId(faction.id) === rules || factionReferenceRoute(faction).rulesVersion === rules) &&
      routeSlug(faction.displayName) === slug,
  )
  if (selected) return selected.id
  const matching = factions.filter((faction) => routeSlug(faction.displayName) === slug)
  // A superseded root MFM path opens the rules version named for that MFM, or else the current rules.
  if (/^mfm-\d+(?:-\d+)*$/.test(rules))
    return (
      (
        matching.find((faction) => faction.edition?.name && routeSlug(faction.edition.name) === rules) ??
        matching.find((faction) => faction.isDefault !== false)
      )?.id ?? null
    )
  const family = matching.find((faction) => !catalogueEditionId(faction.id)) ?? matching.find((faction) => faction.isDefault)
  if (!family) return null
  if (rules === editionFamilyId(family.id)) return editionFamilyId(family.id)
  const edition = factions.find((faction) => faction.edition?.slug === rules)?.edition
  return `${edition?.id ?? rules}~${editionFamilyId(family.id)}`
}

export function factionReferenceHref(faction: ReferenceFaction, suffix = '') {
  const route = factionReferenceRoute(faction)
  return `/factions/${route.catalogueId}${route.rulesVersion ? `/rules/${encodeURIComponent(route.rulesVersion)}` : ''}${suffix}`
}
