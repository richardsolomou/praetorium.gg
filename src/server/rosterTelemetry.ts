import { routeSlug } from '../core/slug'
import type { LoadedCatalogue } from './catalogueIndex'
import { detachmentNamed } from '../shared/factionReferences'
import { factionDisplayName } from '../shared/factionNames'
import { rosterDetachments } from '../shared/rosterDetachments'
import { type LoadedRules, rulesFaction } from './rules'
import { attachedUnitCount } from '../core/attachedUnits'
import type { z } from 'zod'
import type { saveRosterSchema } from '../contracts/schemas'
import type { app } from './app'

export async function captureRosterCreated(
  instance: Pick<ReturnType<typeof app>, 'telemetry' | 'catalogueFor' | 'rulesFor'>,
  userId: string,
  data: z.infer<typeof saveRosterSchema>,
  extra: { variant?: boolean } = {},
) {
  await instance.telemetry.capture(userId, 'roster_created', {
    ...rosterTelemetryProperties(data, await instance.catalogueFor(data.catalogueId), await instance.rulesFor(data.catalogueId)),
    unit_count: attachedUnitCount(data.picks.map((pick, key) => ({ key, attachedTo: pick.attachedTo }))),
    source: data.source,
    visibility: data.visibility,
    ...extra,
  })
}

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
