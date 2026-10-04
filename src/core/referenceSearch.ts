import type { DatasheetSearchFields, DatasheetSearchReason } from './datasheetSearch'

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

export type IndexedResult = { search: string; result: GlobalSearchResult }
export type IndexedDatasheet = {
  targetId: string
  allied: boolean
  name: string
  fields: DatasheetSearchFields
  result: GlobalSearchResult
}
export type GlobalSearchIndex = {
  factions: IndexedResult[]
  detachments: IndexedResult[]
  datasheets: IndexedDatasheet[]
  missions: IndexedResult[]
  rules: IndexedResult[]
}

import { distance } from 'fastest-levenshtein'
import { matchDatasheet } from './datasheetSearch'

export function searchReference(query: string, index: GlobalSearchIndex): GlobalSearchResult[] {
  const wanted = query.toLowerCase()
  const results = [
    ...catalogueResults(wanted, index),
    ...[...index.missions, ...index.rules].filter((entry) => entry.search.includes(wanted)).map((entry) => entry.result),
  ]
  return ['Factions', 'Datasheets', 'Detachments', 'Missions', 'Rules'].flatMap((group) =>
    results.filter((result) => result.group === group).slice(0, 12),
  )
}

function catalogueResults(wanted: string, index: GlobalSearchIndex | null): GlobalSearchResult[] {
  if (!index) return []
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

export type OwnSearchData = {
  rosters: { id: string; name: string; limit: number; label: string }[]
  battles: { token: string; status: string; players: string[]; armies: (string | null)[]; mission: { name: string } | null }[]
}

export function searchOwn(query: string, mine: OwnSearchData | null): GlobalSearchResult[] {
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
  return ['Your rosters', 'Your battles'].flatMap((group) => results.filter((result) => result.group === group).slice(0, 12))
}
