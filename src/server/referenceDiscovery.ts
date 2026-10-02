import { createHash } from 'node:crypto'
import { publicOrigin } from './requestOrigin'
import { activeReferenceCorpus } from './referenceApi'
import { app } from './app'
import { updateId } from './catalogueHistory'
import { factionsLastUpdated } from './catalogueChangeLog'
import { ifNoneMatch } from './ifNoneMatch'

/** Pages anyone may read that no reference document names. */
const PUBLIC_PAGES = ['/', '/factions', '/leaderboard', '/rosters', '/rules', '/simulator', '/sources']

export async function referenceSitemap(request: Request) {
  const corpus = await activeReferenceCorpus()
  if (!corpus) return new Response('Reference data is unavailable', { status: 503, headers: { 'Cache-Control': 'no-store' } })
  const origin = publicOrigin(request)
  // A page's last modification is stated only where the history records it; nothing records
  // when a datasheet's rules text last changed, and a guessed date teaches crawlers to ignore it.
  const paths = new Map<string, number | null>(PUBLIC_PAGES.map((path) => [path, null]))
  const add = (path: string) => paths.set(path, paths.get(path) ?? null)
  for (const document of corpus.documents) {
    add(document.url.split('#')[0]!)
    for (const section of document.sections) add(section.url.split('#')[0]!)
  }
  for (const sheet of corpus.catalogue.datasheets) {
    const route = sheet.referenceRoute
    if (route) add(`/factions/${route.catalogueId}`)
  }
  for (const detachment of corpus.catalogue.detachments) add(`/factions/${detachment.factionSlug}`)
  for (const document of corpus.catalogue.ruleDocuments) {
    add(`/rules/${document.slug}`)
    for (const section of document.sections) add(`/rules/${document.slug}/${section.slug}`)
  }
  // The history rides in the snapshot but is not part of the corpus revision, so the updates
  // it carries are part of the cache key.
  const history = (await app().catalogueHistoryFor()) ?? []
  const updates = history.map(updateId)
  if (history.length) {
    paths.set('/data-updates', Math.max(...history.map((entry) => entry.recordedAt)))
    const canonical = await app().canonicalCatalogueFor()
    if (canonical) for (const [slug, recordedAt] of factionsLastUpdated(history, canonical)) paths.set(`/data-updates/${slug}`, recordedAt)
  }
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${[...paths]
    .toSorted(([left], [right]) => (left < right ? -1 : 1))
    .map(([path, modified]) => {
      const lastmod = modified === null ? '' : `<lastmod>${new Date(modified).toISOString()}</lastmod>`
      return `  <url><loc>${xml(`${origin}${path}`)}</loc>${lastmod}</url>`
    })
    .join('\n')}\n</urlset>\n`
  return cachedText(request, corpus.revision, `sitemap\0${updates.join(',')}`, body, 'application/xml; charset=utf-8')
}

export function referenceRobots(request: Request) {
  const origin = publicOrigin(request)
  // Sign-in carries a return address per page, so following its links would crawl one copy of it per page.
  return new Response(`User-agent: *\nAllow: /\nDisallow: /sign-in\nDisallow: /signin\n\nSitemap: ${origin}/sitemap.xml\n`, {
    headers: { 'Cache-Control': 'public, max-age=86400', 'Content-Type': 'text/plain; charset=utf-8' },
  })
}

export async function referenceLlms(request: Request) {
  const corpus = await activeReferenceCorpus()
  const origin = publicOrigin(request)
  const revisions = corpus ? Object.entries(corpus.catalogue.revisions).map(([source, revision]) => `- ${source}: ${revision}`) : []
  const body = `# Praetorium

Praetorium is a public Warhammer 40,000 army builder, battle tracker, and community-data reference. Reference answers come from verified immutable snapshots and never from generated summaries.

## Agent interfaces

- [OpenAPI](${origin}/api/reference/v1/openapi.json): versioned read-only HTTP API
- [Praetorium guide](${origin}/api/reference/v1/about): product capabilities, privacy boundaries, and efficient agent workflow
- [Reference index](${origin}/api/reference/v1/): discover kinds, mission packs, rule documents, factions, and active revisions
- [Search](${origin}/api/reference/v1/search?q=movement): search missions, deployments, terrain, rules, detachments, and datasheets
- [Factions](${origin}/api/reference/v1/factions): discover available factions
- [MCP](${origin}/mcp): public reference tools with optional account sign-in for rosters and battles

For roster planning, read \`/api/reference/v1/factions/{catalogueId}/units\` once to get compact unit-size costs, composition, attachment relationships, limits, keywords, links, and optional detachment rules instead of reading every datasheet. API reads return JSON by default. Send \`Accept: text/markdown\` for compact source-faithful text. Search results include canonical page URLs, source revisions, attribution, and cursor pagination.

## Human reference

- [Factions](${origin}/factions)
- [Missions](${origin}/missions)
- [Rules](${origin}/rules)
- [Data sources](${origin}/sources)

## Active source revisions

${revisions.length ? revisions.join('\n') : '- Reference data is temporarily unavailable.'}

## Update model

The reference changes only when Praetorium activates another verified immutable snapshot or updates its source-faithful projection. API records identify their source revisions and content-derived ETags so clients can validate cached answers.

## Licence and attribution

Praetorium is AGPL-3.0 open source software. Community game data remains subject to the terms of its upstream sources. Follow the attribution returned with each record and the [data sources](${origin}/sources) page when reproducing it.
`
  return cachedText(request, corpus?.revision ?? 'unavailable', 'llms', body, 'text/markdown; charset=utf-8')
}

function cachedText(request: Request, revision: string, key: string, body: string, contentType: string) {
  const etag = `"${createHash('sha256').update(`${revision}\0${key}`).digest('hex')}"`
  const headers = { 'Cache-Control': 'public, max-age=3600', 'Content-Type': contentType, ETag: etag }
  return ifNoneMatch(request, etag) ? new Response(null, { status: 304, headers }) : new Response(body, { headers })
}

const xml = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
