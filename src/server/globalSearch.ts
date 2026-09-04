import { nameOf, targetOf } from '../core/catalogue'
import { distance } from 'fastest-levenshtein'
import { datasheetSearchFieldsIn } from './catalogue'
import type { LoadedCatalogue } from './catalogueIndex'
import { datasheetSlug, datasheetsOf, isReferenceDatasheet } from './catalogueIndex'
import { isMatchedPlayDatasheet } from './cataloguePicker'
import { matchDatasheet, type DatasheetSearchFields, type DatasheetSearchReason } from './datasheetSearch'
import { factionsFor } from './factionReferences'
import { gameReferencesFor } from './gameReferences'
import { ruleIndexOf } from './rulesCore'
import type { LoadedRules } from './rules'

/**
 * One search box over everything the app can name: factions, datasheets,
 * detachments, missions, and the player's own rosters and battles.
 *
 * Plain substring matching is the default. Datasheets alone fall back to a small,
 * token-based typo match when their group has no direct result. Every group is
 * capped and returned in a fixed order, so a two-letter query cannot bury the one
 * thing the player was reaching for under three hundred datasheets.
 */
export type GlobalSearchResult = {
  id: string
  group: 'Pages' | 'Factions' | 'Datasheets' | 'Detachments' | 'Missions' | 'Rules' | 'Your rosters' | 'Your battles'
  label: string
  detail: string
  href: string
  matchReasons?: DatasheetSearchReason[]
  /** A typo-tolerant fallback, shown separately from direct matches. */
  fuzzy?: boolean
}

/** The order results are shown in, and the most of each that is worth showing. */
const GROUPS: GlobalSearchResult['group'][] = ['Factions', 'Datasheets', 'Detachments', 'Missions', 'Rules', 'Your rosters', 'Your battles']
const PER_GROUP = 12

type SavedRoster = { id: string; name: string; limit: number; label: string }
type Battle = {
  token: string
  status: string
  players: string[]
  armies: (string | null)[]
  mission: { name: string } | null
}

type Sources = {
  catalogue: LoadedCatalogue | null
  rules: LoadedRules | null
  /** The signed-in player's own data, or nothing when the request carries no session. */
  own: () => Promise<{ rosters: SavedRoster[]; battles: Battle[] } | null>
}

type IndexedResult = { search: string; result: GlobalSearchResult }
type IndexedDatasheet = {
  targetId: string
  allied: boolean
  name: string
  fields: DatasheetSearchFields
  result: GlobalSearchResult
}
type GlobalSearchIndex = { factions: IndexedResult[]; detachments: IndexedResult[]; datasheets: IndexedDatasheet[] }

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
          href: `/factions/${faction.slug}/reference/detachments/${detachment.slug}`,
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
  const index = { factions, detachments, datasheets }
  globalSearchIndexes.set(loaded, { rules, index })
  return index
}

export async function searchEverything(query: string, sources: Sources): Promise<GlobalSearchResult[]> {
  const wanted = query.toLowerCase()
  const matches = (...text: (string | null | undefined)[]) => text.filter(Boolean).join(' ').toLowerCase().includes(wanted)
  const results: GlobalSearchResult[] = [
    ...catalogueResults(wanted, sources),
    ...missionResults(matches, sources.rules),
    ...ruleResults(wanted, sources.rules),
    ...(await ownResults(matches, sources.own)),
  ]
  return GROUPS.flatMap((group) => results.filter((result) => result.group === group).slice(0, PER_GROUP))
}

type Matcher = (...text: (string | null | undefined)[]) => boolean

function catalogueResults(wanted: string, sources: Sources): GlobalSearchResult[] {
  const loaded = sources.catalogue
  if (!loaded) return []

  const index = globalSearchIndexFor(loaded, sources.rules)
  const results: GlobalSearchResult[] = [
    ...index.factions.filter((entry) => entry.search.includes(wanted)).map((entry) => entry.result),
    ...index.detachments.filter((entry) => entry.search.includes(wanted)).map((entry) => entry.result),
  ]
  const datasheets = new Map<string, { primary: RankedResult[]; allied?: RankedResult }>()
  for (const entry of index.datasheets) {
    const match = matchDatasheet(wanted, entry.fields)
    if (!match) continue
    const result = match.reasons.length ? { ...entry.result, matchReasons: match.reasons } : entry.result
    const found = datasheets.get(entry.targetId) ?? { primary: [] }
    const ranked = { result, score: match.score }
    if (entry.allied) found.allied ??= ranked
    else found.primary.push(ranked)
    datasheets.set(entry.targetId, found)
  }
  const direct = datasheetResults(datasheets)
  results.push(...(direct.length ? direct : fuzzyDatasheetResults(index.datasheets, wanted)))
  return results
}

type RankedResult = { result: GlobalSearchResult; score: number }

const datasheetResults = (datasheets: ReadonlyMap<string, { primary: RankedResult[]; allied?: RankedResult }>) =>
  [...datasheets.values()]
    .flatMap((found) => (found.primary.length ? found.primary : found.allied ? [found.allied] : []))
    .toSorted((left, right) => left.score - right.score || left.result.label.localeCompare(right.result.label))
    .map(({ result }) => result)

function fuzzyDatasheetResults(datasheets: readonly IndexedDatasheet[], query: string) {
  const found = new Map<string, { result: GlobalSearchResult; score: number }>()
  for (const entry of datasheets) {
    const score = fuzzyScore(query, entry.name)
    if (score === null) continue
    const existing = found.get(entry.targetId)
    if (existing && existing.score <= score) continue
    found.set(entry.targetId, { score, result: { ...entry.result, fuzzy: true } })
  }
  return [...found.values()]
    .toSorted((left, right) => left.score - right.score || left.result.label.localeCompare(right.result.label))
    .map(({ result }) => result)
}

/** Every substantial word must be close to a word on the datasheet, avoiding broad guesses. */
function fuzzyScore(query: string, name: string) {
  const queryWords = wordsIn(query).filter((word) => word.length >= 3)
  const nameWords = wordsIn(name)
  if (!queryWords.length || !nameWords.length) return null
  let score = 0
  for (const queryWord of queryWords) {
    const nearest = Math.min(...nameWords.map((nameWord) => distance(queryWord, nameWord) / Math.max(queryWord.length, nameWord.length)))
    if (nearest > 0.34) return null
    score += nearest
  }
  return score / queryWords.length
}

const wordsIn = (value: string) => value.toLowerCase().match(/[a-z0-9]+/g) ?? []

function missionResults(matches: Matcher, rules: LoadedRules | null): GlobalSearchResult[] {
  if (!rules) return []
  const references = gameReferencesFor(rules)
  const results: GlobalSearchResult[] = []

  for (const pack of references.packs) {
    if (matches(pack.name)) {
      results.push({
        id: `pack:${pack.id}`,
        group: 'Missions',
        label: pack.name,
        detail: 'Mission pack',
        href: `/mission-packs/${pack.id}`,
      })
    }
    for (const mission of pack.missions) {
      if (!matches(mission.name)) continue
      results.push({
        id: `mission:${pack.id}:${mission.id}`,
        group: 'Missions',
        label: mission.name,
        detail: pack.name,
        href: `/mission-packs/${pack.id}`,
      })
    }
  }

  // Secondaries are shared across packs, so they are linked through the first one.
  const firstPack = references.packs[0]
  if (!firstPack) return results
  for (const mission of references.secondaries) {
    if (!matches(mission.name)) continue
    results.push({
      id: `secondary:${mission.key}`,
      group: 'Missions',
      label: mission.name,
      detail: 'Secondary mission',
      href: `/mission-packs/${firstPack.id}`,
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
function ruleResults(wanted: string, rules: LoadedRules | null): GlobalSearchResult[] {
  if (!rules) return []
  return ruleIndexOf(rules.ruleDocuments).documents.flatMap((document) =>
    document.sections.flatMap((section) =>
      section.entries
        .filter((entry) => `${entry.code ?? ''} ${entry.title}`.toLowerCase().includes(wanted))
        .map((entry) => ({
          id: `rule:${document.slug}:${entry.anchor}`,
          group: 'Rules' as const,
          label: entry.title,
          detail: [entry.code, document.title].filter(Boolean).join(' · '),
          href: `/rules/${document.slug}/${section.slug}#${entry.anchor}`,
        })),
    ),
  )
}

/** The signed-in player's own rosters and battles, which nobody else's search reaches. */
async function ownResults(matches: Matcher, own: Sources['own']): Promise<GlobalSearchResult[]> {
  const mine = await own()
  if (!mine) return []

  const results: GlobalSearchResult[] = []
  for (const roster of mine.rosters) {
    // A list its owner never named is found by what it is called instead. The label
    // here is the setup alone: pricing every list on a keystroke to reach its units
    // would be paid by every search, and the units are searchable as datasheets.
    const name = roster.name || roster.label
    if (!matches(name)) continue
    results.push({
      id: `roster:${roster.id}`,
      group: 'Your rosters',
      label: name,
      detail: `${roster.limit} points`,
      href: `/rosters/${roster.id}`,
    })
  }
  for (const battle of mine.battles) {
    const label = battle.armies.filter(Boolean).join(' vs ') || battle.players.join(' vs ')
    if (!matches(label, ...battle.players, battle.mission?.name)) continue
    results.push({
      id: `battle:${battle.token}`,
      group: 'Your battles',
      label,
      detail: battle.mission?.name ?? battle.status,
      href: `/battles/${battle.token}`,
    })
  }
  return results
}
