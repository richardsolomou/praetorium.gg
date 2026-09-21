import { routeSlug } from '../core/slug'
import type { LoadedCatalogue } from './catalogueIndex'
import { detachmentNamed } from './factionReferences'
import { factionDisplayName } from './factionNames'
import { rosterDetachments } from './rosterDetachments'
import { type LoadedRules, rulesFaction } from './rules'

type RosterTelemetryInput = {
  catalogueId: string
  detachmentIds: readonly string[]
  limit: number
}

export function rosterTelemetryProperties(data: RosterTelemetryInput, loaded: LoadedCatalogue | null, rules: LoadedRules | null) {
  if (!loaded) return { limit: data.limit }

  const catalogueName = loaded.index.catalogues.get(data.catalogueId)?.name
  const { chosen } = rosterDetachments(loaded, data.catalogueId, data.detachmentIds)
  const faction = catalogueName ? routeSlug(factionDisplayName(catalogueName, rules?.factionNames)) : null
  const detachment = chosen
    .map((candidate) => routeSlug(candidate.name))
    .toSorted()
    .join('|')
  const rulesId = rulesFaction(rules, routeSlug(catalogueName ?? ''))
  const semantics = rules?.byDetachment.get(rulesId)

  return {
    ...(faction ? { faction } : {}),
    detachment: detachment || 'none',
    detachment_count: chosen.length,
    ...(data.detachmentIds.length
      ? {
          detachment_rules_covered:
            chosen.length === data.detachmentIds.length && chosen.every((candidate) => Boolean(detachmentNamed(semantics, candidate.name))),
        }
      : {}),
    limit: data.limit,
  }
}
