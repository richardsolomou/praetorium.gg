import { createHash } from 'node:crypto'
import { REFERENCE_KINDS, type ReferenceDocument, type ReferenceKind } from '../contracts/reference'
import { app } from './app'
import { referenceCorpusFor, referenceDocumentMarkdown, type ReferenceCorpus } from './referenceCorpus'
import { PRAETORIUM_GUIDE, praetoriumGuideMarkdown } from './referenceGuide'
import { REFERENCE_QUERY_MAX_LENGTH, REFERENCE_RESULT_MAX, searchReference, validReferenceCursor } from './referenceSearch'
import { referenceFactions, referenceIndex, referenceRecord, referenceUnits } from './referenceService'
import { DATACARDS_ATTRIBUTION } from './datacards'

type ReferenceRecord = {
  kind: ReferenceKind
  canonicalUrl: string
  revisions: Record<string, string>
  attribution: string[]
  data: unknown
}

export function activeReferenceCorpus() {
  const instance = app()
  return instance.sync().status === 'ready' ? referenceCorpusFor(instance) : null
}

export function referenceSearchResponse(request: Request) {
  const limited = referenceRateLimit(request, 120)
  if (limited) return limited
  const corpus = activeReferenceCorpus()
  if (!corpus) return referenceUnavailable()
  const parsed = parseReferenceSearch(new URL(request.url))
  if ('error' in parsed) return problem(parsed.error, 400)
  const result = searchReference(corpus, parsed)
  const markdown = [
    `# Search results for ${result.query}`,
    ...result.results.map(
      (entry) =>
        `## [${entry.title}](${entry.section.url})\n\n${[entry.faction, entry.kind, entry.section.title].filter(Boolean).join(' · ')}\n\n${entry.excerpt}`,
    ),
  ].join('\n\n')
  return referenceResponse(request, corpus, `search:${JSON.stringify(parsed)}`, result, markdown)
}

export function referenceFactionsResponse(request: Request) {
  const limited = referenceRateLimit(request, 120)
  if (limited) return limited
  const corpus = activeReferenceCorpus()
  if (!corpus) return referenceUnavailable()
  const data = {
    factions: referenceFactions(corpus),
    revisions: corpus.catalogue.revisions,
  }
  const markdown = `# Factions\n\n${data.factions.map((faction) => `- [${faction.name}](/factions/${faction.slug}) (${faction.datasheets} datasheets, ${faction.detachments} detachments)`).join('\n')}\n`
  return referenceResponse(request, corpus, 'factions', data, markdown)
}

export function referenceIndexResponse(request: Request) {
  const limited = referenceRateLimit(request, 120)
  if (limited) return limited
  const corpus = activeReferenceCorpus()
  if (!corpus) return referenceUnavailable()
  const data = referenceIndex(corpus)
  const markdown = [
    '# Praetorium reference index',
    `Corpus revision: ${data.corpusRevision}`,
    '## Mission packs',
    ...data.missionPacks.map((pack) => `- [${pack.title}](${pack.url})`),
    '## Rule documents',
    ...data.ruleDocuments.map((document) => `- [${document.title}](${document.url}) (${document.sections} sections)`),
    '## Factions',
    ...data.factions.map((faction) => `- ${faction.name} (${faction.datasheets} datasheets, ${faction.detachments} detachments)`),
  ].join('\n\n')
  return referenceResponse(request, corpus, 'index', data, markdown)
}

export function referenceGuideResponse(request: Request) {
  const limited = referenceRateLimit(request, 120)
  if (limited) return limited
  const corpus = activeReferenceCorpus()
  if (!corpus) return referenceUnavailable()
  return referenceResponse(request, corpus, 'guide', PRAETORIUM_GUIDE, praetoriumGuideMarkdown())
}

export function referenceUnitsResponse(request: Request, catalogueId: string) {
  const limited = referenceRateLimit(request, 60)
  if (limited) return limited
  const corpus = activeReferenceCorpus()
  const instance = app()
  const loaded = instance.catalogue()
  if (!corpus || !loaded) return referenceUnavailable()
  const url = new URL(request.url)
  const rawBattleSize = url.searchParams.get('battleSize')
  const battleSize = rawBattleSize === null ? undefined : Number(rawBattleSize)
  if (battleSize !== undefined && (!Number.isInteger(battleSize) || battleSize < 1 || battleSize > 10_000)) {
    return problem('battleSize must be an integer from 1 to 10000', 400)
  }
  const detachment = url.searchParams.get('detachment')?.trim() || undefined
  if (detachment && detachment.length > 160) return problem('detachment must contain at most 160 characters', 400)
  const data = referenceUnits(corpus, loaded, instance.rules(), catalogueId, battleSize, detachment)
  if (!data) return problem('faction or detachment not found', 404)
  const markdown = [
    `# ${data.faction.name} roster planning`,
    data.detachment ? `Detachment: ${data.detachment.name}` : null,
    data.battleSize ? `Battle size: ${data.battleSize} points` : null,
    ...data.units.map(
      (unit) =>
        `- ${unit.name}: ${unit.points ?? 'points unavailable'}${unit.limit === null ? '' : `, limit ${unit.limit}`} · ${unit.group}${unit.keywords.length ? ` · ${unit.keywords.join(', ')}` : ''}${unit.url ? ` · ${unit.url}` : ''}`,
    ),
  ]
    .filter(Boolean)
    .join('\n\n')
  return referenceResponse(request, corpus, `units:${catalogueId}:${battleSize ?? ''}:${detachment ?? ''}`, data, markdown)
}

export function referenceRecordResponse(request: Request, id: string) {
  const limited = referenceRateLimit(request, 120)
  if (limited) return limited
  const corpus = activeReferenceCorpus()
  if (!corpus) return referenceUnavailable()
  const record = referenceRecord(corpus, app().rules(), id)
  if (!record) return problem('reference record not found', 404)
  return referenceResponse(request, corpus, `record:${id}`, record, referenceDocumentMarkdown(record.document))
}

export function referenceDatasheetResponse(request: Request, catalogueId: string, slug: string) {
  const limited = referenceRateLimit(request, 120)
  if (limited) return limited
  const corpus = activeReferenceCorpus()
  if (!corpus) return referenceUnavailable()
  const data = corpus.catalogue.datasheets.find(
    (sheet) => sheet.slug === slug && (sheet.catalogueId === catalogueId || sheet.referenceRoute?.catalogueId === catalogueId),
  )
  if (!data) return problem('datasheet not found', 404)
  const route = data.referenceRoute ?? { catalogueId: data.catalogueId, slug: data.slug }
  const document = corpus.byId.get(`datasheet:${route.catalogueId}:${route.slug}`)
  return recordResponse(request, corpus, document, {
    kind: 'datasheet',
    canonicalUrl: document?.url ?? `/factions/${route.catalogueId}/datasheets/${route.slug}`,
    revisions: document?.revisions ?? corpus.catalogue.revisions,
    attribution: document?.attribution ?? [],
    data,
  })
}

export function referenceDetachmentResponse(request: Request, catalogueId: string, slug: string) {
  const limited = referenceRateLimit(request, 120)
  if (limited) return limited
  const corpus = activeReferenceCorpus()
  if (!corpus) return referenceUnavailable()
  const data = corpus.catalogue.detachments.find(
    (detachment) => detachment.slug === slug && (detachment.catalogueId === catalogueId || detachment.factionSlug === catalogueId),
  )
  if (!data) return problem('detachment not found', 404)
  const document = corpus.byId.get(`detachment:${data.factionSlug}:${data.slug}`)
  return recordResponse(request, corpus, document, {
    kind: 'detachment',
    canonicalUrl: document?.url ?? `/factions/${data.factionSlug}/detachments/${data.slug}`,
    revisions: document?.revisions ?? corpus.catalogue.revisions,
    attribution: document?.attribution ?? [data.attribution],
    data,
  })
}

export function referenceRuleSectionResponse(request: Request, documentId: string, sectionId: string) {
  const limited = referenceRateLimit(request, 120)
  if (limited) return limited
  const corpus = activeReferenceCorpus()
  if (!corpus) return referenceUnavailable()
  const document = corpus.catalogue.ruleDocuments.find((entry) => entry.slug === documentId || entry.id === documentId)
  const section = document?.sections.find((entry) => entry.slug === sectionId || entry.id === sectionId)
  if (!document || !section) return problem('rules section not found', 404)
  const canonicalUrl = `/rules/${document.slug}/${section.slug}`
  const record: ReferenceRecord = {
    kind: 'rule',
    canonicalUrl,
    revisions: { datacards: document.provenance.datacards.revision },
    attribution: [DATACARDS_ATTRIBUTION],
    data: { document: { id: document.id, slug: document.slug, title: document.title, updated: document.updated }, section },
  }
  const markdown = section.entries
    .map((entry) => {
      const found = corpus.byId.get(`rule:${document.slug}:${entry.anchor}`)
      return found ? referenceDocumentMarkdown(found) : `# ${entry.title}`
    })
    .join('\n')
  return referenceResponse(request, corpus, `rule:${document.slug}:${section.slug}`, record, markdown)
}

export function referenceDocumentResponse(request: Request, id: string) {
  const limited = referenceRateLimit(request, 120)
  if (limited) return limited
  const corpus = activeReferenceCorpus()
  if (!corpus) return referenceUnavailable()
  const document = corpus.byId.get(id)
  if (!document) return problem('reference document not found', 404)
  return referenceResponse(request, corpus, id, document, referenceDocumentMarkdown(document))
}

function recordResponse(request: Request, corpus: ReferenceCorpus, document: ReferenceDocument | undefined, record: ReferenceRecord) {
  return referenceResponse(
    request,
    corpus,
    document?.id ?? record.canonicalUrl,
    record,
    document ? referenceDocumentMarkdown(document) : '',
  )
}

export function parseReferenceSearch(url: URL):
  | {
      query: string
      kinds?: ReferenceKind[]
      faction?: string
      pack?: string
      document?: string
      limit?: number
      cursor?: string
    }
  | { error: string } {
  const query = url.searchParams.get('q')?.trim() ?? ''
  if (query.length < 2) return { error: 'q must contain at least 2 characters' }
  if (query.length > REFERENCE_QUERY_MAX_LENGTH) return { error: `q must contain at most ${REFERENCE_QUERY_MAX_LENGTH} characters` }
  const rawKinds = url.searchParams
    .getAll('kind')
    .flatMap((value) => value.split(','))
    .filter(Boolean)
  const kinds = [...new Set(rawKinds)]
  if (kinds.some((kind) => !(REFERENCE_KINDS as readonly string[]).includes(kind))) return { error: 'kind is not supported' }
  const faction = url.searchParams.get('faction')?.trim() || undefined
  if (faction && faction.length > 160) return { error: 'faction must contain at most 160 characters' }
  const pack = url.searchParams.get('pack')?.trim() || undefined
  if (pack && pack.length > 160) return { error: 'pack must contain at most 160 characters' }
  const document = url.searchParams.get('document')?.trim() || undefined
  if (document && document.length > 160) return { error: 'document must contain at most 160 characters' }
  const cursor = url.searchParams.get('cursor')?.trim() || undefined
  if (!validReferenceCursor(cursor)) return { error: 'cursor is not valid' }
  const rawLimit = url.searchParams.get('limit')
  const limit = rawLimit === null ? undefined : Number(rawLimit)
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > REFERENCE_RESULT_MAX)) {
    return { error: `limit must be an integer from 1 to ${REFERENCE_RESULT_MAX}` }
  }
  return { query, kinds: kinds.length ? (kinds as ReferenceKind[]) : undefined, faction, pack, document, limit, cursor }
}

function referenceResponse(request: Request, corpus: ReferenceCorpus, key: string, data: unknown, markdown: string) {
  const asMarkdown = request.headers.get('accept')?.toLocaleLowerCase().includes('text/markdown') ?? false
  const etag = `"${createHash('sha256')
    .update(`${corpus.revision}\0${key}\0${asMarkdown ? 'markdown' : 'json'}`)
    .digest('hex')}"`
  const headers = {
    'Cache-Control': 'public, max-age=3600',
    ETag: etag,
    Vary: 'Accept',
  }
  if (request.headers.get('if-none-match') === etag) return new Response(null, { status: 304, headers })
  return asMarkdown
    ? new Response(markdown, { headers: { ...headers, 'Content-Type': 'text/markdown; charset=utf-8' } })
    : Response.json(data, { headers })
}

const referenceUnavailable = () => problem('reference data is unavailable', 503)

function problem(error: string, status: number) {
  return Response.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } })
}

type RateWindow = { startedAt: number; requests: number }
const rateWindows = new Map<string, RateWindow>()
const RATE_WINDOW_MS = 60_000
const RATE_BUCKET_MAX = 10_000

export function referenceRateLimit(request: Request, limit: number) {
  const now = Date.now()
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  const key = forwarded || 'unknown'
  const current = rateWindows.get(key)
  if (current && now - current.startedAt < RATE_WINDOW_MS) {
    current.requests += 1
    if (current.requests <= limit) return null
    return rateLimitResponse(windowRetryAfter(current, now))
  }
  if (current) rateWindows.delete(key)
  if (rateWindows.size >= RATE_BUCKET_MAX) {
    for (const [bucketKey, value] of rateWindows) if (now - value.startedAt >= RATE_WINDOW_MS) rateWindows.delete(bucketKey)
  }
  if (rateWindows.size >= RATE_BUCKET_MAX) {
    const retryAt = Math.min(...[...rateWindows.values()].map((window) => window.startedAt + RATE_WINDOW_MS))
    return rateLimitResponse(Math.max(1, Math.ceil((retryAt - now) / 1000)))
  }
  rateWindows.set(key, { startedAt: now, requests: 1 })
  return null
}

const windowRetryAfter = (window: RateWindow, now: number) => Math.ceil((window.startedAt + RATE_WINDOW_MS - now) / 1000)

function rateLimitResponse(retryAfter: number) {
  return Response.json(
    { error: 'too many reference requests' },
    {
      status: 429,
      headers: { 'Cache-Control': 'no-store', 'Retry-After': String(retryAfter) },
    },
  )
}
