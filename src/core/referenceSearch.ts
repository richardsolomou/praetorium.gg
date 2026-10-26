import { uniqueBy, remember } from './collections'
import type { DatasheetSearchFields, DatasheetSearchReason } from './datasheetSearch'
import type { CatalogueEdition } from './catalogueEdition'
import { rosterLabel } from './rosterLabel'
import { pointsLabel } from './battle'

export type GlobalSearchResult = {
  id: string
  group: 'Pages' | 'Factions' | 'Datasheets' | 'Detachments' | 'Missions' | 'Rules' | 'Your rosters' | 'Your battles'
  label: string
  detail: string
  href: string
  faction?: {
    slug: string
    displayName: string
    icon: string | null
    edition?: Pick<CatalogueEdition, 'id' | 'name' | 'status' | 'description'> | null
  }
  matchReasons?: DatasheetSearchReason[]
  /** A typo-tolerant fallback, shown separately from direct matches. */
  fuzzy?: boolean
}

export type IndexedResult = { search: string; result: GlobalSearchResult }
export type IndexedDetachment = IndexedResult & {
  cards?: { kind: 'detachment rule' | 'enhancement' | 'upgrade' | 'stratagem'; name: string; description: string | null }[]
}
export type IndexedDatasheet = {
  targetId: string
  allied: boolean
  name: string
  fields: DatasheetSearchFields
  result: GlobalSearchResult
}
export type GlobalSearchIndex = {
  factions: IndexedResult[]
  detachments: IndexedDetachment[]
  datasheets: IndexedDatasheet[]
  missions: IndexedResult[]
  rules: IndexedResult[]
}

import {
  fuzzyNameScore,
  matchDatasheet,
  strongestMatches,
  matchSearchText,
  prepareDatasheetSearch,
  prepareSearchText,
} from './datasheetSearch'

export function searchReference(query: string, index: GlobalSearchIndex): GlobalSearchResult[] {
  const wanted = query.toLowerCase()
  const results = [
    ...catalogueResults(wanted, index),
    ...[...index.missions, ...index.rules].filter((entry) => entry.search.includes(wanted)).map((entry) => entry.result),
  ]
  return ['Factions', 'Datasheets', 'Detachments', 'Missions', 'Rules'].flatMap((group) =>
    results.filter((result) => result.group === group),
  )
}

function catalogueResults(wanted: string, index: GlobalSearchIndex | null): GlobalSearchResult[] {
  if (!index) return []
  const results: GlobalSearchResult[] = [
    ...index.factions.filter((entry) => entry.search.includes(wanted)).map((entry) => entry.result),
    ...detachmentResults(wanted, index.detachments),
  ]
  const datasheets = new Map<string, { primary: RankedResult[]; allied?: RankedResult }>()
  const matches = index.datasheets.flatMap((entry) => {
    const match = matchDatasheet(wanted, entry.fields)
    return match ? [{ entry, match }] : []
  })
  for (const { entry, match } of strongestMatches(matches)) {
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

function detachmentResults(query: string, entries: IndexedDetachment[]): GlobalSearchResult[] {
  return entries
    .flatMap((entry) => {
      const titleScore = matchSearchText(query, entry.search)
      if (titleScore !== null) return [{ result: entry.result, score: titleScore }]
      const matches = (entry.cards ?? [])
        .flatMap((card) => {
          const nameScore = matchSearchText(query, card.name)
          const effectScore = card.description ? matchSearchText(query, cardText(card)) : null
          const score = nameScore ?? (effectScore === null ? null : 100 + effectScore)
          return score === null ? [] : [{ score, reason: { kind: card.kind, value: card.name } }]
        })
        .toSorted((left, right) => left.score - right.score)
      return matches.length
        ? [{ result: { ...entry.result, matchReasons: matches.slice(0, 3).map(({ reason }) => reason) }, score: 10 + matches[0]!.score }]
        : []
    })
    .toSorted((left, right) => left.score - right.score || left.result.label.localeCompare(right.result.label))
    .map(({ result }) => result)
}

const cardTexts = new WeakMap<NonNullable<IndexedDetachment['cards']>[number], string>()

/** A card's name and effect as one searched text, built once so its normalization is looked up rather than redone. */
const cardText = (card: NonNullable<IndexedDetachment['cards']>[number]) =>
  remember(cardTexts, card, () => `${card.name} ${card.description}`)

/** Normalizes an index's searched text ahead of the first query, yielding between slices so it can run while idle. */
export function* prepareReferenceSearch(index: GlobalSearchIndex) {
  for (const [at, entry] of index.datasheets.entries()) {
    prepareDatasheetSearch(entry.fields)
    if (at % 200 === 199) yield
  }
  for (const [at, entry] of index.detachments.entries()) {
    prepareSearchText(entry.search)
    for (const card of entry.cards ?? []) {
      prepareSearchText(card.name)
      if (card.description) prepareSearchText(cardText(card))
    }
    if (at % 40 === 39) yield
  }
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
    const score = fuzzyNameScore(query, entry.name)
    if (score === null) continue
    const existing = found.get(entry.targetId)
    if (existing && existing.score <= score) continue
    found.set(entry.targetId, { score, result: { ...entry.result, fuzzy: true } })
  }
  return [...found.values()]
    .toSorted((left, right) => left.score - right.score || left.result.label.localeCompare(right.result.label))
    .map(({ result }) => result)
}

/** The fewest characters global search answers. */
export const SEARCH_MIN_LENGTH = 2

/** Search offers a player's recently active battles, not every battle the account has played. */
export const OWN_SEARCH_BATTLES = 50

const SEARCH_GROUPS: GlobalSearchResult['group'][] = [
  'Factions',
  'Datasheets',
  'Detachments',
  'Missions',
  'Rules',
  'Your rosters',
  'Your battles',
]

type SearchedRoster = { id: string; name: string; limit: number; catalogueId: string; detachmentIds: readonly string[] }
type SearchedFaction = { id: string; displayName: string; detachments: readonly { id: string; name: string }[] }

/** A player's rosters labelled as search shows them, and their most recent distinct battles. */
export function ownSearchLists<B extends OwnSearchData['battles'][number]>(
  rosters: readonly SearchedRoster[],
  battles: readonly B[],
  factions: readonly SearchedFaction[],
): OwnSearchData {
  return {
    rosters: rosters.map((roster) => {
      const faction = factions.find((entry) => entry.id === roster.catalogueId)
      return {
        ...roster,
        label: faction
          ? rosterLabel({
              factionName: faction.displayName,
              detachmentNames: roster.detachmentIds.flatMap((id) =>
                faction.detachments.filter((entry) => entry.id === id).map((entry) => entry.name),
              ),
              limit: roster.limit,
            })
          : '',
      }
    }),
    battles: uniqueBy(battles, (battle) => battle.token).slice(0, OWN_SEARCH_BATTLES),
  }
}

/** Global search over a reference index and the player's own lists, in the order search shows them. */
export function searchAll(query: string, index: GlobalSearchIndex, own: OwnSearchData | null) {
  const results = [...searchReference(query, index), ...searchOwn(query, own)]
  return SEARCH_GROUPS.flatMap((group) => results.filter((result) => result.group === group))
}

export type OwnSearchData = {
  rosters: { id: string; name: string; limit: number; label: string }[]
  battles: { token: string; status: string; players: string[]; armies: (string | null)[]; mission: { name: string } | null }[]
}

function searchOwn(query: string, mine: OwnSearchData | null): GlobalSearchResult[] {
  const wanted = query.toLowerCase()
  const matches = (...text: (string | null | undefined)[]) => text.filter(Boolean).join(' ').toLowerCase().includes(wanted)
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
      detail: pointsLabel(roster.limit),
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
  return ['Your rosters', 'Your battles'].flatMap((group) => results.filter((result) => result.group === group).slice(0, 12))
}
