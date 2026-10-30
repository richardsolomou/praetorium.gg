import { hash } from 'node:crypto'
import { withTextPointers, withoutText } from '../shared/sourceText'
import { publishedTextLocations } from './publishedTextFiles'
import { REFERENCE_KINDS, type ReferenceDocument, type ReferenceKind } from '../contracts/reference'
import { app } from './app'
import { datasheetRoute, referenceCorpusFor, referenceDocumentMarkdown, type ReferenceCorpus } from './referenceCorpus'
import { PRAETORIUM_GUIDE, praetoriumGuideMarkdown } from './referenceGuide'
import {
  REFERENCE_FILTER_MAX_LENGTH,
  REFERENCE_QUERY_MAX_LENGTH,
  REFERENCE_RESULT_MAX,
  searchReference,
  validReferenceCursor,
  type ReferenceSearchInput,
} from './referenceSearch'
import {
  factionDetachmentNames,
  referenceFaction,
  referenceFactions,
  referenceIndex,
  referenceRecord,
  referenceRecordCatalogueId,
  referenceUnits,
  type ReferenceUnitsQuery,
} from './referenceService'
import { DATACARDS_ATTRIBUTION } from './datacards'
import { ifNoneMatch } from './ifNoneMatch'
import { fixedWindowRateLimit } from './rateLimit'
import { catalogueEditionId } from '../core/catalogueEdition'
import { datasheetPageBySlug } from '../core/datasheetSlug'

type ReferenceRecord = {
  kind: ReferenceKind
  canonicalUrl: string
  revisions: Record<string, string>
  attribution: string[]
  data: unknown
}

/** Each army's current rules, by the faction id the reference files them under. */
export async function currentFactionIds() {
  const factions = (await app().factionsFor())?.factions ?? []
  return new Set(factions.filter((faction) => faction.isDefault).map((faction) => faction.id))
}

export async function activeReferenceCorpus(catalogueId?: string) {
  const instance = app()
  if (instance.sync().status !== 'ready') return null
  const textLocations = await publishedTextLocations()
  const factions = (await instance.factionsFor())?.factions
  if (!catalogueId || !catalogueEditionId(catalogueId))
    return referenceCorpusFor({
      catalogue: () => instance.catalogue(),
      rules: () => instance.rules(),
      canonicalCatalogue: () => instance.canonicalCatalogue(),
      textLocations,
      factions,
    })
  const [catalogue, rules, canonical] = await Promise.all([
    instance.catalogueFor(catalogueId),
    instance.rulesFor(catalogueId),
    instance.canonicalCatalogueFor(catalogueId),
  ])
  return referenceCorpusFor({
    catalogue: () => catalogue,
    rules: () => rules,
    canonicalCatalogue: () => canonical,
    textLocations,
    factions,
  })
}

/** One faction's planning units, with the corpus they came from; null while no snapshot can answer. */
export async function referenceUnitsFor(faction: string, query: ReferenceUnitsQuery = {}) {
  const corpus = await activeReferenceCorpus(faction)
  const instance = app()
  const selected = corpus && referenceFaction(corpus, faction)
  const [loaded, rules] = await Promise.all([instance.catalogueFor(selected?.id ?? faction), instance.rulesFor(selected?.id ?? faction)])
  if (!corpus || !loaded) return null
  return {
    corpus,
    faction: selected ?? null,
    detachments: selected ? factionDetachmentNames(loaded, selected.id) : [],
    units: referenceUnits(corpus, loaded, rules, faction, query, await currentFactionIds()),
  }
}

/** The structured record behind a reference id, with the corpus it came from; null while no snapshot can answer. */
export async function referenceRecordFor(id: string) {
  const catalogueId = referenceRecordCatalogueId(id)
  const corpus = await activeReferenceCorpus(catalogueId)
  if (!corpus) return null
  return { corpus, record: referenceRecord(corpus, await app().rulesFor(catalogueId), id) }
}

/** The document a reference id names, with the corpus it came from; null while no snapshot can answer. */
export async function referenceDocumentFor(id: string) {
  const corpus = await activeReferenceCorpus(referenceRecordCatalogueId(id))
  return corpus && { corpus, document: corpus.byId.get(id) }
}

export async function referenceSearchResponse(request: Request) {
  const limited = referenceRateLimit(request)
  if (limited) return limited
  const parsed = parseReferenceSearch(new URL(request.url))
  if ('error' in parsed) return problem(parsed.error, 400)
  const corpus = await activeReferenceCorpus()
  if (!corpus) return referenceUnavailable()
  const result = searchReference(corpus, parsed)
  const markdown = [
    `# Search results for ${result.query}`,
    ...result.results.map(
      (entry) =>
        `## [${entry.title}](${entry.section.url})\n\n${[entry.faction, entry.kind, entry.section.title].filter(Boolean).join(' · ')}\n\n${entry.excerpt}`,
    ),
  ].join('\n\n')
  return referenceResponse(request, corpus.revision, `search:${JSON.stringify(parsed)}`, result, markdown)
}

export async function referenceFactionsResponse(request: Request) {
  const limited = referenceRateLimit(request)
  if (limited) return limited
  const corpus = await activeReferenceCorpus()
  if (!corpus) return referenceUnavailable()
  const data = { factions: referenceFactions(corpus), revisions: corpus.catalogue.revisions }
  const markdown = `# Factions\n\n${data.factions.map((faction) => `- [${faction.name}](/factions/${faction.slug}) (${faction.datasheets} datasheets, ${faction.detachments} detachments)`).join('\n')}\n`
  return referenceResponse(request, corpus.revision, 'factions', data, markdown)
}

export async function referenceIndexResponse(request: Request) {
  const limited = referenceRateLimit(request)
  if (limited) return limited
  const corpus = await activeReferenceCorpus()
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
  return referenceResponse(request, data.corpusRevision, 'index', data, markdown)
}

export async function referenceGuideResponse(request: Request) {
  const limited = referenceRateLimit(request)
  if (limited) return limited
  const corpus = await activeReferenceCorpus()
  if (!corpus) return referenceUnavailable()
  return referenceResponse(
    request,
    corpus.revision,
    `guide:${JSON.stringify(PRAETORIUM_GUIDE)}`,
    PRAETORIUM_GUIDE,
    praetoriumGuideMarkdown(),
  )
}

export async function referenceUnitsResponse(request: Request, catalogueId: string) {
  const limited = unitsRateLimit(request)
  if (limited) return limited
  const url = new URL(request.url)
  const rawBattleSize = url.searchParams.get('battleSize')
  const battleSize = rawBattleSize === null ? undefined : Number(rawBattleSize)
  if (battleSize !== undefined && (!Number.isInteger(battleSize) || battleSize < 1 || battleSize > 10_000)) {
    return problem('battleSize must be an integer from 1 to 10000', 400)
  }
  const detachment = url.searchParams.get('detachment')?.trim() || undefined
  if (detachment && detachment.length > REFERENCE_FILTER_MAX_LENGTH)
    return problem(`detachment must contain at most ${REFERENCE_FILTER_MAX_LENGTH} characters`, 400)
  const query = url.searchParams.get('query')?.trim() || undefined
  if (query && query.length > REFERENCE_FILTER_MAX_LENGTH)
    return problem(`query must contain at most ${REFERENCE_FILTER_MAX_LENGTH} characters`, 400)
  const nonMatchedPlay = url.searchParams.get('nonMatchedPlay') === 'true'
  const found = await referenceUnitsFor(catalogueId, { battleSize, detachment, nonMatchedPlay, query })
  if (!found) return referenceUnavailable()
  const { corpus, units: data } = found
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
  return referenceResponse(
    request,
    corpus.revision,
    `units:${catalogueId}:${battleSize ?? ''}:${detachment ?? ''}:${nonMatchedPlay}:${query ?? ''}`,
    data,
    markdown,
  )
}

export async function referenceRecordResponse(request: Request, id: string) {
  const limited = referenceRateLimit(request)
  if (limited) return limited
  const found = await referenceRecordFor(id)
  if (!found) return referenceUnavailable()
  const { corpus, record } = found
  if (!record) return problem('reference record not found', 404)
  return referenceResponse(request, corpus.revision, `record:${id}`, record, referenceDocumentMarkdown(record.document))
}

export async function referenceDatasheetResponse(request: Request, catalogueId: string, slug: string) {
  const limited = referenceRateLimit(request)
  if (limited) return limited
  const corpus = await activeReferenceCorpus(catalogueId)
  if (!corpus) return referenceUnavailable()
  const data = datasheetPageBySlug(
    corpus.catalogue.datasheets.filter((sheet) => sheet.catalogueId === catalogueId || sheet.referenceRoute?.catalogueId === catalogueId),
    slug,
  )
  if (!data) return problem('datasheet not found', 404)
  const route = datasheetRoute(data)
  const document = corpus.byId.get(`datasheet:${route.catalogueId}:${route.slug}`)
  return recordResponse(request, corpus, document, {
    kind: 'datasheet',
    canonicalUrl: document?.url ?? `/factions/${route.catalogueId}/datasheets/${route.slug}`,
    revisions: document?.revisions ?? corpus.catalogue.revisions,
    attribution: document?.attribution ?? [],
    data,
  })
}

export async function referenceDetachmentResponse(request: Request, catalogueId: string, slug: string) {
  const limited = referenceRateLimit(request)
  if (limited) return limited
  const corpus = await activeReferenceCorpus(catalogueId)
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

export async function referenceRuleSectionResponse(request: Request, documentId: string, sectionId: string) {
  const limited = referenceRateLimit(request)
  if (limited) return limited
  const corpus = await activeReferenceCorpus()
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
  return referenceResponse(request, corpus.revision, `rule:${document.slug}:${section.slug}`, record, markdown)
}

export async function referenceDocumentResponse(request: Request, id: string) {
  const limited = referenceRateLimit(request)
  if (limited) return limited
  const found = await referenceDocumentFor(id)
  if (!found) return referenceUnavailable()
  const { corpus, document } = found
  if (!document) return problem('reference document not found', 404)
  return referenceResponse(request, corpus.revision, id, document, referenceDocumentMarkdown(document))
}

function recordResponse(request: Request, corpus: ReferenceCorpus, document: ReferenceDocument | undefined, record: ReferenceRecord) {
  return referenceResponse(
    request,
    corpus.revision,
    document?.id ?? record.canonicalUrl,
    record,
    document ? referenceDocumentMarkdown(document) : '',
  )
}

export function parseReferenceSearch(url: URL): ReferenceSearchInput | { error: string } {
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
  if (faction && faction.length > REFERENCE_FILTER_MAX_LENGTH)
    return { error: `faction must contain at most ${REFERENCE_FILTER_MAX_LENGTH} characters` }
  const pack = url.searchParams.get('pack')?.trim() || undefined
  if (pack && pack.length > REFERENCE_FILTER_MAX_LENGTH)
    return { error: `pack must contain at most ${REFERENCE_FILTER_MAX_LENGTH} characters` }
  const document = url.searchParams.get('document')?.trim() || undefined
  if (document && document.length > REFERENCE_FILTER_MAX_LENGTH)
    return { error: `document must contain at most ${REFERENCE_FILTER_MAX_LENGTH} characters` }
  const cursor = url.searchParams.get('cursor')?.trim() || undefined
  if (!validReferenceCursor(cursor)) return { error: 'cursor is not valid' }
  const rawLimit = url.searchParams.get('limit')
  const limit = rawLimit === null ? undefined : Number(rawLimit)
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > REFERENCE_RESULT_MAX)) {
    return { error: `limit must be an integer from 1 to ${REFERENCE_RESULT_MAX}` }
  }
  return { query, kinds: kinds.length ? (kinds as ReferenceKind[]) : undefined, faction, pack, document, limit, cursor }
}

async function referenceResponse(request: Request, revision: string, key: string, published: unknown, withTokens: string) {
  // Programs get facts and where withheld rules text lives upstream, never the words.
  const data = withTextPointers(published, await publishedTextLocations())
  const markdown = withoutText(withTokens)
  // A query parameter as well as the header, so a plain link can name the Markdown representation.
  const asMarkdown =
    new URL(request.url).searchParams.get('format') === 'markdown' ||
    (request.headers.get('accept')?.toLocaleLowerCase().includes('text/markdown') ?? false)
  const etag = `"${hash('sha256', `${revision}\0${key}\0${asMarkdown ? 'markdown' : 'json'}`)}"`
  const headers = {
    'Cache-Control': 'public, max-age=3600',
    ETag: etag,
    Vary: 'Accept',
  }
  if (ifNoneMatch(request, etag)) return new Response(null, { status: 304, headers })
  return asMarkdown
    ? new Response(markdown, { headers: { ...headers, 'Content-Type': 'text/markdown; charset=utf-8' } })
    : Response.json(data, { headers })
}

const referenceUnavailable = () => problem('reference data is unavailable', 503)

function problem(error: string, status: number) {
  return Response.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } })
}

export const referenceRateLimit = fixedWindowRateLimit('too many reference requests', 120)
const unitsRateLimit = fixedWindowRateLimit('too many reference requests', 60)
