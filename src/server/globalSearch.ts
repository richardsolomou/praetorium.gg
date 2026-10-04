import { searchReference, searchOwn, type OwnSearchData } from '../core/referenceSearch'
import type { GlobalSearchIndex, GlobalSearchResult, IndexedResult, IndexedDatasheet } from '../contracts/referenceSearch'
export type { GlobalSearchIndex, GlobalSearchResult } from '../contracts/referenceSearch'
import { nameOf, targetOf } from '../core/catalogue'
import { datasheetSearchFieldsIn } from './catalogue'
import type { LoadedCatalogue } from './catalogueIndex'
import { datasheetSlug, datasheetsOf, isReferenceDatasheet } from './catalogueIndex'
import { isMatchedPlayDatasheet } from './cataloguePicker'
import { factionsFor } from './factionReferences'
import { gameReferencesFor } from './gameReferences'
import { ruleIndexOf } from './rulesCore'
import type { LoadedRules } from './rules'

/** The order results are shown in, and the most of each that is worth showing. */
const GROUPS: GlobalSearchResult['group'][] = ['Factions', 'Datasheets', 'Detachments', 'Missions', 'Rules', 'Your rosters', 'Your battles']
const PER_GROUP = 12

type Sources = {
  catalogue: LoadedCatalogue | null
  catalogueIndex?: GlobalSearchIndex
  rules: LoadedRules | null
  /** The signed-in player's own data, or nothing when the request carries no session. */
  own: () => Promise<OwnSearchData | null>
}

const globalSearchIndexes = new WeakMap<LoadedCatalogue, { rules: LoadedRules | null; index: GlobalSearchIndex }>()

export function prepareGlobalSearch(catalogue: LoadedCatalogue | null, rules: LoadedRules | null) {
  if (catalogue) globalSearchIndexFor(catalogue, rules)
}

function globalSearchIndexFor(loaded: LoadedCatalogue, rules: LoadedRules | null): GlobalSearchIndex {
  const cached = globalSearchIndexes.get(loaded)
  if (cached?.rules === rules) return cached.index

  const factions: IndexedResult[] = []
  const detachments: IndexedResult[] = []
  const datasheets: IndexedDatasheet[] = []
  for (const faction of factionsFor(loaded, rules).factions) {
    factions.push({
      search: `${faction.displayName} ${faction.name}`.toLowerCase(),
      result: {
        id: `faction:${faction.id}`,
        group: 'Factions',
        label: faction.displayName,
        detail: 'Faction reference',
        href: `/factions/${faction.slug}`,
      },
    })
    for (const detachment of faction.detachments) {
      if (!faction.referenceDetachmentIds.includes(detachment.id)) continue
      detachments.push({
        search: detachment.name.toLowerCase(),
        result: {
          id: `detachment:${faction.id}:${detachment.id}`,
          group: 'Detachments',
          label: detachment.name,
          detail: faction.displayName,
          href: `/factions/${faction.slug}/detachments/${detachment.slug}`,
        },
      })
    }
    for (const entryId of datasheetsOf(loaded.index, faction.id)) {
      const entry = loaded.index.definitions.get(entryId)
      if (!entry || !isMatchedPlayDatasheet(loaded.index, entry) || !isReferenceDatasheet(loaded, faction.id, entryId)) continue
      const fields = datasheetSearchFieldsIn(loaded, faction.id, entryId)
      if (!fields) continue
      const name = nameOf(entry, loaded.index.definitions)
      datasheets.push({
        targetId: targetOf(entry, loaded.index.definitions).id,
        allied: Boolean(loaded.index.alliedDatasheets.get(faction.id)?.has(entryId)),
        name,
        fields,
        result: {
          id: `datasheet:${faction.id}:${entryId}`,
          group: 'Datasheets',
          label: name,
          detail: faction.displayName,
          href: `/factions/${faction.slug}/datasheets/${datasheetSlug(loaded, faction.id, entryId)}`,
        },
      })
    }
  }
  const index = { factions, detachments, datasheets, missions: indexedMissions(rules), rules: indexedRules(rules) }
  globalSearchIndexes.set(loaded, { rules, index })
  return index
}

export function compiledGlobalSearchIndex(loaded: LoadedCatalogue, rules: LoadedRules | null) {
  return globalSearchIndexFor(loaded, rules)
}

export async function searchEverything(query: string, sources: Sources): Promise<GlobalSearchResult[]> {
  const index = sources.catalogueIndex ?? (sources.catalogue ? globalSearchIndexFor(sources.catalogue, sources.rules) : null)
  const results: GlobalSearchResult[] = [
    ...searchReference(
      query,
      index ?? {
        factions: [],
        datasheets: [],
        detachments: [],
        missions: indexedMissions(sources.rules),
        rules: indexedRules(sources.rules),
      },
    ),
    ...searchOwn(query, await sources.own()),
  ]
  return GROUPS.flatMap((group) => results.filter((result) => result.group === group).slice(0, PER_GROUP))
}

function indexedMissions(rules: LoadedRules | null): IndexedResult[] {
  if (!rules) return []
  const references = gameReferencesFor(rules)
  const results: IndexedResult[] = []

  for (const disposition of references.dispositions) {
    results.push({
      search: disposition.name.toLowerCase(),
      result: {
        id: `disposition:${disposition.id}`,
        group: 'Missions',
        label: disposition.name,
        detail: 'Force disposition',
        href: `/force-dispositions/${disposition.id}`,
      },
    })
  }
  for (const pack of references.packs) {
    results.push({
      search: pack.name.toLowerCase(),
      result: {
        id: `pack:${pack.id}`,
        group: 'Missions',
        label: pack.name,
        detail: 'Mission pack',
        href: `/missions/${pack.id}`,
      },
    })
    for (const mission of pack.missions) {
      results.push({
        search: mission.name.toLowerCase(),
        result: {
          id: `mission:${pack.id}:${mission.id}`,
          group: 'Missions',
          label: mission.name,
          detail: pack.name,
          href: `/missions/${pack.id}`,
        },
      })
    }
  }

  // Secondaries are shared across packs, so they are linked through the first one.
  const firstPack = references.packs[0]
  if (!firstPack) return results
  for (const mission of references.secondaries) {
    results.push({
      search: mission.name.toLowerCase(),
      result: {
        id: `secondary:${mission.key}`,
        group: 'Missions',
        label: mission.name,
        detail: 'Secondary mission',
        href: `/missions/${firstPack.id}`,
      },
    })
  }
  return results
}

/**
 * Any rule in any of the documents, by its name or by the number it is printed under.
 *
 * The number is searched as well as the name because that is how one rule quotes
 * another, so a player reading `(10.05)` on a card can type it straight in.
 */
function indexedRules(rules: LoadedRules | null): IndexedResult[] {
  if (!rules) return []
  return ruleIndexOf(rules.ruleDocuments).documents.flatMap((document) =>
    document.sections.flatMap((section) =>
      section.entries.map((entry) => ({
        search: `${entry.code ?? ''} ${entry.title}`.toLowerCase(),
        result: {
          id: `rule:${document.slug}:${entry.anchor}`,
          group: 'Rules' as const,
          label: entry.title,
          detail: [entry.code, document.title].filter(Boolean).join(' · '),
          href: `/rules/${document.slug}/${section.slug}#${entry.anchor}`,
        },
      })),
    ),
  )
}
