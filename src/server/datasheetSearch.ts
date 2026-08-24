export type DatasheetSearchFields = {
  name: string
  keywords: string[]
  abilities: string[]
  weapons: string[]
  weaponKeywords: string[]
  wargear: string[]
}

export type DatasheetSearchReason = {
  kind: 'keyword' | 'ability' | 'weapon' | 'weapon keyword' | 'wargear'
  value: string
}

export type DatasheetSearchMatch = { score: number; reasons: DatasheetSearchReason[] }

const METADATA = [
  { field: 'keywords', kind: 'keyword', weight: 100 },
  { field: 'abilities', kind: 'ability', weight: 200 },
  { field: 'weapons', kind: 'weapon', weight: 300 },
  { field: 'weaponKeywords', kind: 'weapon keyword', weight: 350 },
  { field: 'wargear', kind: 'wargear', weight: 400 },
] as const

export function matchDatasheet(query: string, fields: DatasheetSearchFields): DatasheetSearchMatch | null {
  const wanted = [...new Set(wordsIn(query))]
  if (!wanted.length) return { score: 0, reasons: [] }

  const name = fieldMatch(wanted, fields.name)
  if (name?.complete) return { score: name.quality, reasons: [] }

  const metadata = METADATA.flatMap(({ field, kind, weight }) =>
    fields[field].flatMap((value) => {
      const match = fieldMatch(wanted, value)
      return match ? [{ ...match, reason: { kind, value }, weight }] : []
    }),
  )
  const searchable = [fields.name, ...METADATA.flatMap(({ field }) => fields[field])]
  if (!wanted.every((word) => searchable.some((value) => wordsIn(value).some((candidate) => wordMatches(word, candidate))))) return null

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
    score: best.weight + (wanted.length - best.coverage) * 10 + best.quality,
    reasons: selectReasons(wanted, name?.matchingWords ?? [], ranked),
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

function fieldMatch(wanted: readonly string[], value: string) {
  const normalized = normalize(value)
  const candidates = wordsIn(value)
  const matchingWords = wanted.filter((word) => candidates.some((candidate) => wordMatches(word, candidate)))
  const coverage = matchingWords.length
  if (!coverage) return null
  const query = wanted.join(' ')
  const quality = normalized === query ? 0 : normalized.startsWith(query) ? 1 : normalized.includes(query) ? 2 : 3
  return { complete: coverage === wanted.length, coverage, matchingWords, quality }
}

const wordMatches = (wanted: string, candidate: string) => candidate.includes(wanted)

const wordsIn = (value: string) => normalize(value).split(' ').filter(Boolean)

const normalize = (value: string) =>
  value
    .normalize('NFKD')
    .replaceAll(/\p{M}/gu, '')
    .replaceAll(/[‘’ʼ]/g, "'")
    .toLocaleLowerCase()
    .replaceAll(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
