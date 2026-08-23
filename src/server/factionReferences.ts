import { routeSlug } from '../core/slug'
import { detachmentCatalogueDetail } from './catalogueDescriptions'
import type { LoadedCatalogue } from './catalogueIndex'
import { factionDisplayName } from './factionNames'
import { type LoadedRules, rulesFaction } from './rules'
import { joinKey } from './rulesSource'

export function isReferenceDetachment(
  loaded: LoadedCatalogue,
  rules: LoadedRules | null | undefined,
  faction: { id: string; name: string },
  detachment: { id: string; name: string },
) {
  const displayName = factionDisplayName(faction.name, rules?.factionNames)
  const slugId = routeSlug(displayName)
  const content = loaded.factionContents.get(slugId)
  const rulesId = rulesFaction(rules, routeSlug(faction.name))
  if (content) return [...content.detachments].some((name) => routeSlug(name) === routeSlug(detachment.name))

  if (!detachmentNamed(rules?.detachmentReferences.get(rulesId), detachment.name)) return false

  // Some catalogue chapters repeat the generic detachment options. When the
  // catalogue that defines that option also names it in the rules source, it
  // is its canonical reference home. A chapter-only detachment stays put: its
  // physical definition can still live in an imported parent catalogue.
  const ownerId = loaded.index.catalogueOf.get(detachment.id)
  const owner = loaded.factions.find((candidate) => candidate.id === ownerId)
  if (!owner || owner.id === faction.id) return true
  const ownerRulesId = rulesFaction(rules, routeSlug(owner.name))
  return !detachmentNamed(rules?.detachmentReferences.get(ownerRulesId), detachment.name)
}

function factionSummary(loaded: LoadedCatalogue, rules: LoadedRules | null | undefined, faction: LoadedCatalogue['factions'][number]) {
  const displayName = factionDisplayName(faction.name, rules?.factionNames)
  const slugId = routeSlug(displayName)
  const content = loaded.factionContents.get(slugId)
  const detachments = loaded.detachments.get(faction.id)?.options ?? []
  const referenceDetachments = detachments.filter((detachment) => isReferenceDetachment(loaded, rules, faction, detachment))
  return {
    summary: {
      id: faction.id,
      slug: slugId,
      name: faction.name,
      displayName,
      icon: rules?.factionIcons?.has(slugId)
        ? process.env.NODE_ENV === 'development'
          ? (rules.factionIcons.get(slugId) ?? null)
          : `/api/faction-icons/${slugId}`
        : null,
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
      const content = loaded.factionContents.get(summary.slug)
      const rulesId = rulesFaction(rules, routeSlug(faction.name))
      const pageRules = rules?.factionRuleCards.get(summary.slug)
      const aliasedPageRules = [...(rules?.factionRuleCards.values() ?? [])].find((cards) =>
        cards.some((card) => routeSlug(card.name) === summary.slug),
      )
      return {
        ...summary,
        armyRules: content?.armyRules.length
          ? content.armyRules
          : pageRules?.length
            ? pageRules
            : aliasedPageRules?.length
              ? aliasedPageRules
              : rules?.factionRules?.get(summary.slug)
                ? [rules.factionRules.get(summary.slug)!]
                : [],
        referenceDetachmentIds: referenceDetachments.map((detachment) => detachment.id),
        detachments: detachments.map((detachment) => {
          const reference = detachmentNamed(rules?.detachmentReferences?.get(rulesId), detachment.name)
          const detail = detachmentNamed(rules?.detachmentDetails?.get(rulesId), detachment.name)
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

export function detachmentNamed<T>(detachments: ReadonlyMap<string, T> | undefined, name: string): T | undefined {
  const slug = routeSlug(name)
  const exact = detachments?.get(slug)
  if (exact) return exact
  const compact = joinKey(name)
  const matches = [...(detachments ?? [])].filter(([id]) => joinKey(id) === compact)
  return matches.length === 1 ? matches[0]?.[1] : undefined
}
