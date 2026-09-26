import type {
  ReferenceDocument,
  ReferenceKind,
  ReferenceSearchResponse,
  ReferenceSearchResult,
  ReferenceSection,
} from '../contracts/reference'
import { distance } from 'fastest-levenshtein'
import type { ReferenceCorpus } from './referenceCorpus'

export const REFERENCE_QUERY_MAX_LENGTH = 120
export const REFERENCE_RESULT_MAX = 25
const EXCERPT_MAX_LENGTH = 320

export type ReferenceSearchInput = {
  query: string
  kinds?: readonly ReferenceKind[]
  faction?: string
  pack?: string
  document?: string
  limit?: number
  cursor?: string
}

type IndexedSection = {
  section: ReferenceSection
  id: string
  idWords: string[]
  heading: string
  headingWords: string[]
  text: string
  textWords: string[]
  searchableWords: string[]
}

type IndexedDocument = {
  document: ReferenceDocument
  id: string
  idWords: string[]
  title: string
  titleWords: string[]
  sections: IndexedSection[]
}

const indices = new WeakMap<ReferenceDocument[], IndexedDocument[]>()

type RankedReferenceResult = ReferenceSearchResult & { score: number }

export function searchReference(corpus: ReferenceCorpus, input: ReferenceSearchInput): ReferenceSearchResponse {
  return finishReferenceSearch(input, corpus.catalogue.revisions, rankReferencePart(corpus, input))
}

export function finishReferenceSearch(
  input: ReferenceSearchInput,
  revisions: ReferenceCorpus['catalogue']['revisions'],
  parts: readonly RankedReferenceResult[],
): ReferenceSearchResponse {
  const limit = Math.min(Math.max(input.limit ?? 10, 1), REFERENCE_RESULT_MAX)
  const offset = decodeCursor(input.cursor)
  const ranked = parts.toSorted(
    (left, right) => right.score - left.score || left.title.localeCompare(right.title) || left.id.localeCompare(right.id),
  )
  const results = ranked.slice(offset, offset + limit).map(({ score: _score, ...result }) => result)
  return {
    query: input.query.trim(),
    results,
    revisions,
    nextCursor: offset + limit < ranked.length ? encodeCursor(offset + limit) : null,
  }
}

export function rankReferencePart(corpus: ReferenceCorpus, input: ReferenceSearchInput): RankedReferenceResult[] {
  const query = input.query.trim()
  const wanted = normalize(query)
  const tokens = [...new Set(words(query))]
  const kinds = input.kinds?.length ? new Set(input.kinds) : null
  const faction = input.faction ? normalize(input.faction) : null
  const pack = input.pack ? normalize(input.pack) : null
  const ruleDocument = input.document ? normalize(input.document) : null
  return indexFor(corpus)
    .flatMap((indexed) => {
      const { document } = indexed
      if (kinds && !kinds.has(document.kind)) return []
      if (faction && normalize(document.faction ?? '') !== faction) return []
      if (pack && !missionPackOf(document).some((candidate) => normalize(candidate) === pack)) return []
      if (ruleDocument && !(document.kind === 'rule' && normalize(document.id.split(':')[1] ?? '') === ruleDocument)) return []
      const match = bestSection(indexed, wanted, tokens)
      return match ? [{ document, ...match }] : []
    })
    .map(({ document, section, score }): RankedReferenceResult => ({
      id: document.id,
      kind: document.kind,
      title: document.title,
      faction: document.faction,
      url: document.url,
      section: { id: section.id, title: section.title, url: section.url },
      excerpt: excerpt(section.text, query, tokens),
      revisions: document.revisions,
      attribution: document.attribution,
      score,
    }))
}

function missionPackOf(document: ReferenceDocument) {
  if (document.id.startsWith('mission-pack:')) return [document.id.slice('mission-pack:'.length)]
  if (document.id.startsWith('mission:') && !document.id.startsWith('mission:secondary:')) return [document.id.split(':')[1] ?? '']
  const segments = document.url.split('#')[0]!.split('/')
  const packAt = segments.findIndex((segment) => segment === 'mission-packs' || segment === 'mission-matchups')
  return packAt >= 0 ? [segments[packAt + 1] ?? ''] : []
}

function encodeCursor(offset: number) {
  return Buffer.from(String(offset)).toString('base64url')
}

export function validReferenceCursor(cursor: string | undefined) {
  if (!cursor) return true
  try {
    const decoded = Buffer.from(cursor, 'base64url').toString('utf8')
    return /^\d+$/.test(decoded) && Number(decoded) <= 10_000 && encodeCursor(Number(decoded)) === cursor
  } catch {
    return false
  }
}

function decodeCursor(cursor: string | undefined) {
  return cursor && validReferenceCursor(cursor) ? Number(Buffer.from(cursor, 'base64url').toString('utf8')) : 0
}

function indexFor(corpus: ReferenceCorpus) {
  const cached = indices.get(corpus.documents)
  if (cached) return cached
  const indexed = corpus.documents.map((document): IndexedDocument => {
    const id = normalize(document.id)
    const idWords = words(id)
    const title = normalize(document.title)
    const titleWords = words(title)
    return {
      document,
      id,
      idWords,
      title,
      titleWords,
      sections: document.sections.map((section) => {
        const sectionId = normalize(section.id)
        const sectionIdWords = words(sectionId)
        const heading = normalize(section.title)
        const headingWords = words(heading)
        const text = normalize(section.text)
        const textWords = words(text)
        return {
          section,
          id: sectionId,
          idWords: sectionIdWords,
          heading,
          headingWords,
          text,
          textWords,
          searchableWords: [...idWords, ...sectionIdWords, ...titleWords, ...headingWords, ...textWords],
        }
      }),
    }
  })
  indices.set(corpus.documents, indexed)
  return indexed
}

function bestSection(document: IndexedDocument, query: string, tokens: readonly string[]) {
  const candidates = document.sections.flatMap((indexed) => {
    const { section, id, idWords, heading, headingWords, text, textWords, searchableWords } = indexed
    if (!tokens.every((token) => searchableWords.some((candidate) => wordMatches(candidate, token)))) return []
    let score = 0
    if (document.id === query) score += 30_000 + (section.url === document.document.url ? 5_000 : 0)
    if (id === query) score += 25_000
    if (document.title === query) score += 20_000
    else if (document.title.startsWith(query)) score += 12_000
    else if (document.title.includes(query)) score += 8_000
    if (heading === query) score += 10_000
    else if (heading.startsWith(query)) score += 6_000
    else if (heading.includes(query)) score += 4_000
    if (text.includes(query)) score += 2_000
    for (const token of tokens) {
      if (document.idWords.some((word) => word === token)) score += 1_200
      if (idWords.some((word) => word === token)) score += 1_000
      if (document.titleWords.some((word) => word === token)) score += 800
      else if (document.titleWords.some((word) => wordMatches(word, token))) score += 600
      if (headingWords.some((word) => word === token)) score += 400
      else if (headingWords.some((word) => wordMatches(word, token))) score += 300
      score += Math.min(textWords.filter((word) => wordMatches(word, token)).length, 10) * 20
    }
    return [{ section, score }]
  })
  return candidates.toSorted((left, right) => right.score - left.score || left.section.id.localeCompare(right.section.id))[0] ?? null
}

function excerpt(text: string, query: string, tokens: readonly string[]) {
  const lower = text.toLocaleLowerCase()
  const direct = lower.indexOf(query.toLocaleLowerCase())
  const token = direct >= 0 ? direct : Math.max(0, ...tokens.map((word) => lower.indexOf(word)))
  const start = Math.max(0, token - Math.floor(EXCERPT_MAX_LENGTH / 3))
  const end = Math.min(text.length, start + EXCERPT_MAX_LENGTH)
  return `${start ? '…' : ''}${text.slice(start, end).trim()}${end < text.length ? '…' : ''}`
}

const words = (value: string) => normalize(value).split(' ').filter(Boolean)

function wordMatches(candidate: string, query: string) {
  if (candidate.includes(query)) return true
  if (singular(candidate) === singular(query)) return true
  return candidate.length >= 5 && query.length >= 5 && Math.abs(candidate.length - query.length) <= 1 && distance(candidate, query) <= 1
}

const singular = (value: string) => {
  if (value.endsWith('ies') && value.length > 4) return `${value.slice(0, -3)}y`
  return value.endsWith('s') && value.length > 3 ? value.slice(0, -1) : value
}

const normalize = (value: string) =>
  value
    .normalize('NFKD')
    .replaceAll(/\p{M}/gu, '')
    .replaceAll(/[‘’ʼ]/g, "'")
    .toLocaleLowerCase()
    .replaceAll(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
