import { routeSlug } from '../core/slug'
import { detachmentCatalogueDetail } from './catalogueDescriptions'
import type { LoadedCatalogue } from './catalogueIndex'
import { factionDisplayName } from './factionNames'
import { type LoadedRules, rulesFaction } from './rules'

function factionSummary(loaded: LoadedCatalogue, rules: LoadedRules | null | undefined, faction: LoadedCatalogue['factions'][number]) {
  const displayName = factionDisplayName(faction.name, rules?.factionNames)
  const slugId = routeSlug(displayName)
  const content = loaded.factionContents.get(slugId)
  const detachments = loaded.detachments.get(faction.id)?.options ?? []
  const referenceDetachments = detachments.filter(
    (detachment) => !content || [...content.detachments].some((name) => routeSlug(name) === routeSlug(detachment.name)),
  )
  return {
    summary: {
      id: faction.id,
      slug: slugId,
      name: faction.name,
      displayName,
      icon: rules?.factionIcons?.has(slugId) ? `/api/faction-icons/${slugId}` : null,
      references: faction.references.map((reference) => ({
        ...reference,
        datasheets: content?.datasheets.size ?? reference.datasheets,
        detachments: referenceDetachments.length,
      })),
    },
    detachments,
    referenceDetachments,
  }
}

export function factionIndexFor(loaded: LoadedCatalogue, rules: LoadedRules | null | undefined) {
  return {
    revision: loaded.index.revision,
    factions: loaded.factions.map((faction) => factionSummary(loaded, rules, faction).summary),
  }
}

export function factionsFor(loaded: LoadedCatalogue, rules: LoadedRules | null | undefined) {
  return {
    revision: loaded.index.revision,
    factions: loaded.factions.map((faction) => {
      const { summary, detachments, referenceDetachments } = factionSummary(loaded, rules, faction)
      return {
        ...summary,
        armyRule: rules?.factionRules?.get(summary.slug) ?? null,
        referenceDetachmentIds: referenceDetachments.map((detachment) => detachment.id),
        detachments: detachments.map((detachment) => {
          const reference = rules?.detachmentReferences?.get(rulesFaction(rules, routeSlug(faction.name)))?.get(routeSlug(detachment.name))
          const detail = rules?.detachmentDetails?.get(rulesFaction(rules, routeSlug(faction.name)))?.get(routeSlug(detachment.name))
          const forced = detachmentCatalogueDetail(loaded, faction.id, detachment.id, [])?.forcedEnhancements ?? []
          return {
            id: detachment.id,
            slug: routeSlug(detachment.name),
            name: detachment.name,
            disposition: detachment.disposition,
            dispositions: reference?.dispositions.length
              ? reference.dispositions.map((id) => ({ id, name: rules?.dispositions?.get(id) ?? id }))
              : detachment.disposition
                ? [{ id: detachment.disposition, name: rules?.dispositions?.get(detachment.disposition) ?? detachment.disposition }]
                : [],
            reference: reference
              ? {
                  ...reference,
                  enhancements: new Set([
                    ...(detail?.enhancements.map((enhancement) => enhancement.name) ?? []),
                    ...forced.map((entry) => entry.name),
                  ]).size,
                  dispositions: reference.dispositions.map((disposition) => rules?.dispositions?.get(disposition) ?? disposition),
                }
              : null,
          }
        }),
      }
    }),
  }
}
