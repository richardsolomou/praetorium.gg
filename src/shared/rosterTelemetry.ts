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

/** `roster_priced` is sampled: pricing runs on most roster edits. */
export const ROSTER_PRICED_SAMPLE_RATE = 0.1

/** `roster_priced`, whether the server or the device priced the roster; the caller adds `duration_ms`. */
export function rosterPricedProperties(
  data: RosterTelemetryInput & { units: readonly unknown[] },
  loaded: LoadedCatalogue | null,
  rules: LoadedRules | null,
  result: { errors: readonly unknown[]; unhandled: readonly unknown[] } | null,
) {
  return {
    ...rosterTelemetryProperties(data, loaded, rules),
    sample_rate: ROSTER_PRICED_SAMPLE_RATE,
    unit_count: data.units.length,
    error_count: result?.errors.length ?? 0,
    unhandled_count: result?.unhandled.length ?? 0,
  }
}

/** `roster_datasheet_loaded` for a roster's own loadout datasheets; the caller adds `duration_ms`. */
export const rosterDatasheetLoadedProperties = (
  data: { picks: readonly unknown[] },
  result: { datacardJoin: string },
  persisted: boolean,
) => ({
  unit_count: data.picks.length,
  persisted,
  datacard_join: result.datacardJoin,
})
