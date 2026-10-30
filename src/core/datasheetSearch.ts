import { distance } from 'fastest-levenshtein'
import { foldedText } from './text'
import { wargearKey } from './wargear'
import { uniqueBy, remember } from './collections'

/**
 * One entry per weapon, keyed by base name so firing modes (`- Standard`) and
 * casing variants collapse to a single index entry. The first printed name is
 * kept as the stored value, since a match reason chip is shown to the player.
 */
export const dedupeWeapons = (names: string[]): string[] => uniqueBy(names, (name) => wargearKey(name))

export type DatasheetSearchFields = {
  name: string
  keywords: string[]
  abilities: string[]
  abilityDescriptions?: { name: string; description: string }[]
  weapons: string[]
  weaponKeywords: string[]
  wargear: string[]
}

export type DatasheetSearchReason = {
  kind: 'keyword' | 'ability' | 'weapon' | 'weapon keyword' | 'wargear' | 'detachment rule' | 'enhancement' | 'upgrade' | 'stratagem'
  value: string
}

/** `effectOnly` marks a datasheet found only through what its abilities say, which only counts when nothing is found by its own fields. */
type DatasheetSearchMatch = { score: number; reasons: DatasheetSearchReason[]; effectOnly: boolean }

/** The matches found by their own fields, or the ability-effect matches when there are none. */
export function strongestMatches<M extends { match: DatasheetSearchMatch }>(matches: readonly M[]): readonly M[] {
  const own = matches.filter(({ match }) => !match.effectOnly)
  return own.length ? own : matches
}

export function searchDatasheetEntries<T extends { name: string }>(
  entries: readonly T[],
  query: string,
  fieldsFor: (entry: T) => DatasheetSearchFields | null,
): (T & { matchReasons?: DatasheetSearchReason[]; fuzzy?: boolean })[] {
  const wanted = query.trim().toLowerCase()
  if (!wanted) return [...entries]
  const direct = strongestMatches(
    entries.flatMap((entry) => {
      const fields = fieldsFor(entry)
      const match = fields ? matchDatasheet(wanted, fields) : null
      return match ? [{ entry: match.reasons.length ? { ...entry, matchReasons: match.reasons } : entry, score: match.score, match }] : []
    }),
  )
  const found = direct.length
    ? direct
    : entries.flatMap((entry) => {
        const score = fuzzyNameScore(wanted, entry.name)
        return score === null ? [] : [{ entry: { ...entry, fuzzy: true }, score }]
      })
  return found
    .toSorted((left, right) => left.score - right.score || left.entry.name.localeCompare(right.entry.name))
    .map(({ entry }) => entry)
}

/**
 * How far a mistyped query is from a datasheet name, or null when it is not close: every substantial word must be close
 * to a word of the name, avoiding broad guesses.
 */
export function fuzzyNameScore(query: string, name: string) {
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

const METADATA = [
  { field: 'keywords', kind: 'keyword', weight: 100 },
  { field: 'abilities', kind: 'ability', weight: 200 },
  { field: 'weapons', kind: 'weapon', weight: 300 },
  { field: 'weaponKeywords', kind: 'weapon keyword', weight: 350 },
  { field: 'wargear', kind: 'wargear', weight: 400 },
] as const

const EXACT_REASON_WORD_LIMIT = 8
const EXACT_REASON_CANDIDATE_LIMIT = 16

export function matchDatasheet(query: string, fields: DatasheetSearchFields): DatasheetSearchMatch | null {
  const wanted = [...new Set(wordsIn(query))]
  if (!wanted.length) return { score: 0, reasons: [], effectOnly: false }

  const nameMatch = fieldMatch(wanted, fields.name)
  if (nameMatch?.complete) return { score: nameMatch.quality, reasons: [], effectOnly: false }

  const searchable = searchableText(fields)
  if (!wanted.every((word) => textHasWord(searchable.all, word))) return null
  const effectOnly = !wanted.every((word) => textHasWord(searchable.own, word))

  const descriptions = (fields.abilityDescriptions ?? []).map(({ name, description }) => ({ name, text: `${name} ${description}` }))

  const metadata: MetadataMatch[] = [
    ...METADATA.flatMap(({ field, kind, weight }) =>
      fields[field].flatMap((value) => {
        const match = fieldMatch(wanted, value)
        return match ? [{ ...match, reason: { kind, value }, weight }] : []
      }),
    ),
    ...descriptions.flatMap(({ name, text }) => {
      const match = fieldMatch(wanted, text)
      return match ? [{ ...match, reason: { kind: 'ability' as const, value: name }, weight: 250 }] : []
    }),
  ]
  const ranked = metadata.toSorted(
    (left, right) =>
      Number(right.complete) - Number(left.complete) ||
      right.coverage - left.coverage ||
      left.weight - right.weight ||
      left.quality - right.quality,
  )
  const best = ranked[0]
  if (!best) return null
  return {
    score: best.weight + (best.complete ? 0 : 1_000) + (wanted.length - best.coverage) * 10 + best.quality,
    reasons: selectReasons(wanted, nameMatch?.matchingWords ?? [], ranked),
    effectOnly,
  }
}

type MetadataMatch = {
  complete: boolean
  coverage: number
  matchingWords: string[]
  quality: number
  reason: DatasheetSearchReason
  weight: number
}

function selectReasons(wanted: readonly string[], nameWords: readonly string[], ranked: readonly MetadataMatch[]) {
  const covered = new Set(nameWords)
  const missingWords = wanted.filter((word) => !covered.has(word))
  const seenCoverage = new Set<string>()
  const candidates = ranked.filter((match) => {
    if (!match.matchingWords.some((word) => missingWords.includes(word))) return false
    const coverage = match.matchingWords.join('\0')
    if (seenCoverage.has(coverage)) return false
    seenCoverage.add(coverage)
    return true
  })

  if (missingWords.length <= EXACT_REASON_WORD_LIMIT && candidates.length <= EXACT_REASON_CANDIDATE_LIMIT) {
    for (let size = 1; size <= 3; size++) {
      const exact = reasonCombination(missingWords, candidates, size)
      if (exact) return exact.map(({ reason }) => reason)
    }
  }

  const remaining = [...ranked]
  const selected: MetadataMatch[] = []

  while (selected.length < 3) {
    const uncovered = wanted.filter((word) => !covered.has(word))
    if (!uncovered.length) break
    const best = remaining
      .map((match, index) => ({ index, coverage: uncovered.filter((word) => match.matchingWords.includes(word)).length }))
      .toSorted((left, right) => right.coverage - left.coverage || left.index - right.index)[0]
    if (!best?.coverage) break
    const [match] = remaining.splice(best.index, 1)
    if (!match) break
    selected.push(match)
    match.matchingWords.forEach((word) => covered.add(word))
  }

  return selected.map(({ reason }) => reason)
}

function reasonCombination(
  uncovered: readonly string[],
  candidates: readonly MetadataMatch[],
  size: number,
  start = 0,
  selected: readonly MetadataMatch[] = [],
): MetadataMatch[] | null {
  if (selected.length === size) {
    return uncovered.every((word) => selected.some((match) => match.matchingWords.includes(word))) ? [...selected] : null
  }
  for (let index = start; index <= candidates.length - (size - selected.length); index++) {
    const candidate = candidates[index]
    if (!candidate) continue
    const found = reasonCombination(uncovered, candidates, size, index + 1, [...selected, candidate])
    if (found) return found
  }
  return null
}

export function matchSearchText(query: string, value: string): number | null {
  const wanted = [...new Set(wordsIn(query))]
  if (!wanted.length) return null
  const match = fieldMatch(wanted, value)
  return match?.complete ? match.quality : null
}

function fieldMatch(wanted: readonly string[], value: string) {
  const { normalized, padded } = indexed(value)
  const matchingWords = wanted.filter((word) => textHasWord(padded, word))
  const coverage = matchingWords.length
  if (!coverage) return null
  const query = wanted.join(' ')
  const quality = normalized === query ? 0 : normalized.startsWith(query) ? 1 : normalized.includes(query) ? 2 : 3
  return { complete: coverage === wanted.length, coverage, matchingWords, quality }
}

const wordsIn = (value: string) => normalize(value).split(' ').filter(Boolean)

const MAX_INDEXED = 500_000
const indexedText = new Map<string, { normalized: string; padded: string; words: string[] }>()

/** Normalizes searched text before the first query needs it. */
export function prepareSearchText(value: string) {
  indexed(value)
}

/** Normalizes a datasheet's searched text before the first query needs it. */
export function prepareDatasheetSearch(fields: DatasheetSearchFields) {
  indexed(fields.name)
  searchableText(fields)
}

const searchableTextCache = new WeakMap<DatasheetSearchFields, { all: string; own: string }>()

const wordText = (values: readonly string[]) => ` ${[...new Set(values.flatMap((value) => indexed(value).words))].join(' ')} `

/**
 * Every distinct word a datasheet can be found by, space-separated, so most datasheets are rejected by one native
 * substring search before their fields are ranked; `own` leaves out what its abilities say.
 */
function searchableText(fields: DatasheetSearchFields) {
  return remember(searchableTextCache, fields, () => {
    const own = [fields.name, ...METADATA.flatMap(({ field }) => fields[field])]
    const effects = (fields.abilityDescriptions ?? []).map(({ name, description }) => `${name} ${description}`)
    return { all: wordText([...own, ...effects]), own: wordText(own) }
  })
}

/**
 * Whether a normalized text padded with spaces has a word matching `wanted`: numbers match whole words, `gain` a
 * word's start, anything else part of a word. Query words hold no spaces, so no match spans two words.
 */
const textHasWord = (text: string, wanted: string) =>
  /^\d+$/.test(wanted)
    ? text.includes(` ${wanted} `)
    : wanted === 'gain'
      ? text.includes(` ${wanted}`)
      : text.includes(wanted) || (wanted === 'death' && text.includes(' destroyed '))

/** Searched text is normalized once, because every keystroke matches it against thousands of datasheets. */
function indexed(value: string) {
  let found = indexedText.get(value)
  if (!found) {
    if (indexedText.size >= MAX_INDEXED) indexedText.clear()
    const normalized = normalize(value)
    found = { normalized, padded: ` ${normalized} `, words: normalized.split(' ').filter(Boolean) }
    indexedText.set(value, found)
  }
  return found
}

const normalize = (value: string) =>
  foldedText(value)
    .replaceAll(/\b(\d+)\s*(?:cp|command points?)\b/g, '$1 cp')
    .replaceAll(/[^\p{L}\p{N}]+/gu, ' ')
    .replaceAll(/\badvance\s+and\s+charge\b/g, 'advance charge')
    .replaceAll(/\bfight(?:s|ing)?\s+on\s+death\b/g, 'fight death')
    .trim()
