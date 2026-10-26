import { canonicalDetachmentName } from '../core/detachmentName'
import { datacardsFactionKeys } from './datacards'
import type { StandingFaction } from '../core/standings'
import { targetOf } from '../core/catalogue'
import { listedDatasheets } from './cataloguePicker'
import { routeSlug } from '../core/slug'
import { detachmentCatalogueDetail } from './catalogueDescriptions'
import { isReferenceDatasheet, type LoadedCatalogue } from './catalogueIndex'
import { factionContentOf, factionDisplayName } from './factionNames'
import { type LoadedRules, rulesFaction } from './rules'
import { joinKey } from '../core/text'
import { detachmentPoints } from './detachmentPoints'
import { exclusiveDetachments } from './rosterDetachments'
import { isUpgrade, mfmDetachmentFor, mfmSlugs, mfmVersions } from './mfm'
import { catalogueEditionId } from '../core/catalogueEdition'

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
  if (content)
    return [...content.detachments].some(
      (name) =>
        joinKey(canonicalDetachmentName(name)) === joinKey(canonicalDetachmentName(detachment.name)) &&
        (!content.detachmentFactions?.get(name) || datacardsFactionKeys(content.detachmentFactions.get(name)!).has(slugId)),
    )

  if (!detachmentNamed(rules?.detachmentReferences.get(rulesId), detachment.name)) return false

  // Some catalogue chapters repeat the generic detachment options. When the
  // catalogue that defines and offers that option also names it in the rules
  // source, it is its canonical reference home. A chapter-only detachment stays
  // put: its physical definition can still live in an imported parent catalogue.
  const ownerId = loaded.index.catalogueOf.get(detachment.id)
  const owner = loaded.factions.find((candidate) => candidate.id === ownerId)
  if (!owner || owner.id === faction.id) return true
  if (
    !loaded.detachments
      .get(owner.id)
      ?.options.some((candidate) => joinKey(canonicalDetachmentName(candidate.name)) === joinKey(canonicalDetachmentName(detachment.name)))
  )
    return true
  const ownerRulesId = rulesFaction(rules, routeSlug(owner.name))
  return !detachmentNamed(rules?.detachmentReferences.get(ownerRulesId), detachment.name)
}

function referenceDetachmentRoute(
  loaded: LoadedCatalogue,
  rules: LoadedRules | null | undefined,
  faction: LoadedCatalogue['factions'][number],
  detachment: { id: string; name: string },
) {
  if (isReferenceDetachment(loaded, rules, faction, detachment)) {
    return {
      catalogueId: loaded.edition ? faction.id : routeSlug(factionDisplayName(faction.name, rules?.factionNames)),
      slug: routeSlug(detachment.name),
    }
  }
  const ownerId = loaded.index.catalogueOf.get(detachment.id)
  const owner = loaded.factions.find((candidate) => candidate.id === ownerId)
  if (!owner) return null
  const definition = loaded.index.definitions.get(detachment.id)
  const targetId = definition ? targetOf(definition, loaded.index.definitions).id : detachment.id
  const ownerOptions = loaded.detachments.get(owner.id)?.options.filter((option) => {
    const entry = loaded.index.definitions.get(option.id)
    return (
      (entry ? targetOf(entry, loaded.index.definitions).id : option.id) === targetId && isReferenceDetachment(loaded, rules, owner, option)
    )
  })
  if (ownerOptions?.length !== 1) return null
  return {
    catalogueId: loaded.edition ? owner.id : routeSlug(factionDisplayName(owner.name, rules?.factionNames)),
    slug: routeSlug(ownerOptions[0]!.name),
  }
}

function factionSummary(loaded: LoadedCatalogue, rules: LoadedRules | null | undefined, faction: LoadedCatalogue['factions'][number]) {
  const displayName = factionDisplayName(faction.name, rules?.factionNames)
  const slugId = routeSlug(displayName)
  const points = mfmSlugs(faction.name, slugId)
    .map((slug) => loaded.mfm?.get(slug))
    .find(Boolean)
  const versions = mfmVersions(loaded.mfm)
  const version = points?.attribution ? null : (points?.version ?? (versions.size === 1 ? versions.values().next().value : null))
  const detachments = loaded.detachments.get(faction.id)?.options ?? []
  const referenceDetachments = detachments.filter((detachment) => isReferenceDetachment(loaded, rules, faction, detachment))
  const datasheets = listedDatasheets(loaded, faction.id, { factionCards: true, nonMatchedPlay: true }).filter(({ id }) =>
    isReferenceDatasheet(loaded, faction.id, id),
  ).length
  return {
    summary: {
      id: faction.id,
      slug: loaded.edition ? faction.id : slugId,
      edition: loaded.edition ?? null,
      ...(version ? { rulesName: `MFM ${version}`, rulesSlug: `mfm-${routeSlug(version)}` } : {}),
      baseCatalogueId: catalogueEditionId(faction.id) ? faction.id.split('~')[1]! : faction.id,
      isDefault: loaded.edition ? loaded.edition.default : true,
      name: faction.name,
      displayName,
      icon: rules?.factionIcons?.has(slugId)
        ? process.env.NODE_ENV === 'development'
          ? (rules.factionIcons.get(slugId) ?? null)
          : `/api/faction-icons/${slugId}`
        : null,
      references: faction.references.map((reference) => ({
        ...reference,
        datasheets,
        detachments: referenceDetachments.length,
      })),
      detachments: detachments.map((detachment) => ({
        id: detachment.id,
        name: detachment.name,
        referenceRoute: referenceDetachmentRoute(loaded, rules, faction, detachment),
      })),
    },
    detachments,
    referenceDetachments,
  }
}

/** Both derivations are pure over the two memoized snapshots, so compute each once per snapshot pair. */
type FactionReferenceCache = {
  rules: LoadedRules | null | undefined
  index?: ReturnType<typeof buildFactionIndex>
  full?: ReturnType<typeof buildFactions>
}
const factionReferenceCache = new WeakMap<LoadedCatalogue, FactionReferenceCache>()

function cacheFor(loaded: LoadedCatalogue, rules: LoadedRules | null | undefined) {
  const existing = factionReferenceCache.get(loaded)
  if (existing && existing.rules === rules) return existing
  const fresh: FactionReferenceCache = { rules }
  factionReferenceCache.set(loaded, fresh)
  return fresh
}

export function factionIndexFor(loaded: LoadedCatalogue, rules: LoadedRules | null | undefined, catalogueIds?: ReadonlySet<string>) {
  if (catalogueIds) return buildFactionIndex(loaded, rules, catalogueIds)
  const cache = cacheFor(loaded, rules)
  cache.index ??= buildFactionIndex(loaded, rules)
  return cache.index
}

export function factionsFor(loaded: LoadedCatalogue, rules: LoadedRules | null | undefined, catalogueIds?: ReadonlySet<string>) {
  if (catalogueIds) return buildFactions(loaded, rules, catalogueIds)
  const cache = cacheFor(loaded, rules)
  cache.full ??= buildFactions(loaded, rules)
  return cache.full
}

function buildFactionIndex(loaded: LoadedCatalogue, rules: LoadedRules | null | undefined, catalogueIds?: ReadonlySet<string>) {
  return {
    revision: loaded.index.revision,
    factions: loaded.factions
      .filter((faction) => !catalogueIds || catalogueIds.has(faction.id))
      .map((faction) => factionSummary(loaded, rules, faction).summary),
  }
}

function buildFactions(loaded: LoadedCatalogue, rules: LoadedRules | null | undefined, catalogueIds?: ReadonlySet<string>) {
  return {
    revision: loaded.index.revision,
    factions: loaded.factions
      .filter((faction) => !catalogueIds || catalogueIds.has(faction.id))
      .map((faction) => {
        const { summary, detachments, referenceDetachments } = factionSummary(loaded, rules, faction)
        const content = factionContentOf(loaded, faction.name)
        const rulesId = rulesFaction(rules, routeSlug(faction.name))
        const exclusive = exclusiveDetachments(loaded, faction.id)
        return {
          ...summary,
          armyRules: [
            ...(content?.armyRules.length
              ? content.armyRules
              : rules?.factionRules?.get(routeSlug(summary.displayName))
                ? [rules.factionRules.get(routeSlug(summary.displayName))!]
                : []),
            ...(rules?.supplementalArmyRules?.get(rulesId) ?? []),
          ],
          referenceDetachmentIds: referenceDetachments.map((detachment) => detachment.id),
          detachments: detachments.map((detachment) => {
            const reference = detachmentNamed(rules?.detachmentReferences?.get(rulesId), detachment.name)
            const detail = detachmentNamed(rules?.detachmentDetails?.get(rulesId), detachment.name)
            const forced = detachmentCatalogueDetail(loaded, faction.id, detachment.id, [])?.forcedEnhancements ?? []
            const points = detachmentPoints(loaded, faction.id, detachment.id, reference)
            const mfmEnhancements = mfmDetachmentFor(loaded, faction.id, detachment.name)?.enhancements ?? []
            return {
              id: detachment.id,
              slug: routeSlug(detachment.name),
              name: detachment.name,
              referenceRoute: referenceDetachmentRoute(loaded, rules, faction, detachment),
              points,
              disposition: detachment.disposition,
              exclusiveWith: exclusive.get(detachment.id) ?? [],
              dispositions: reference
                ? reference.dispositions.map((id) => ({ id, name: rules?.dispositions?.get(id) ?? id }))
                : detachment.disposition
                  ? [{ id: detachment.disposition, name: rules?.dispositions?.get(detachment.disposition) ?? detachment.disposition }]
                  : [],
              reference: reference
                ? {
                    ...reference,
                    points,
                    enhancements: new Set([
                      ...(detail?.enhancements.map((enhancement) => enhancement.name) ?? []),
                      ...mfmEnhancements.filter((entry) => !isUpgrade(entry.name)).map((entry) => entry.name),
                      ...forced.map((entry) => entry.name),
                    ]).size,
                    upgrades: new Set([
                      ...(detail?.upgrades.map((upgrade) => upgrade.name) ?? []),
                      ...mfmEnhancements.filter((entry) => isUpgrade(entry.name)).map((entry) => entry.name),
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

type DispositionFaction = {
  slug: string
  displayName: string
  icon: string | null
  edition?: StandingFaction['edition']
  isDefault?: boolean
  referenceDetachmentIds: readonly string[]
  detachments: readonly {
    id: string
    slug: string
    name: string
    dispositions: readonly { id: string }[]
    reference: { points: number | null } | null
  }[]
}

/** Each faction's own reference detachments that offer a force disposition, so a chapter's repeated options appear once. */
export function detachmentsOffering(factions: readonly DispositionFaction[], dispositionId: string) {
  return factions
    .filter((faction) => faction.isDefault !== false)
    .flatMap((faction) => {
      const detachments = faction.detachments.flatMap((detachment) =>
        detachment.reference &&
        faction.referenceDetachmentIds.includes(detachment.id) &&
        detachment.dispositions.some((disposition) => disposition.id === dispositionId)
          ? [{ slug: detachment.slug, name: detachment.name, points: detachment.reference.points }]
          : [],
      )
      return detachments.length
        ? [{ slug: faction.slug, displayName: faction.displayName, icon: faction.icon, edition: faction.edition, detachments }]
        : []
    })
    .toSorted((a, b) => a.displayName.localeCompare(b.displayName))
}

export function detachmentNamed<T>(detachments: ReadonlyMap<string, T> | undefined, name: string): T | undefined {
  const slug = routeSlug(name)
  const exact = detachments?.get(slug)
  if (exact) return exact
  const compact = joinKey(canonicalDetachmentName(name))
  const matches = [...(detachments ?? [])].filter(([id]) => joinKey(canonicalDetachmentName(id)) === compact)
  return matches.length === 1 ? matches[0]?.[1] : undefined
}
