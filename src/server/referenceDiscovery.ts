import { createHash } from 'node:crypto'
import { activeReferenceCorpus } from './referenceApi'

export function referenceSitemap(request: Request) {
  const corpus = activeReferenceCorpus()
  if (!corpus) return new Response('Reference data is unavailable', { status: 503, headers: { 'Cache-Control': 'no-store' } })
  const origin = publicOrigin(request)
  const paths = new Set<string>(['/factions', '/rules'])
  for (const document of corpus.documents) paths.add(document.url.split('#')[0]!)
  for (const sheet of corpus.catalogue.datasheets) {
    const route = sheet.referenceRoute
    if (route) paths.add(`/factions/${route.catalogueId}`)
  }
  for (const detachment of corpus.catalogue.detachments) paths.add(`/factions/${detachment.factionSlug}`)
  for (const document of corpus.catalogue.ruleDocuments) {
    paths.add(`/rules/${document.slug}`)
    for (const section of document.sections) paths.add(`/rules/${document.slug}/${section.slug}`)
  }
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${[...paths]
    .toSorted()
    .map((path) => `  <url><loc>${xml(`${origin}${path}`)}</loc></url>`)
    .join('\n')}\n</urlset>\n`
  return cachedText(request, corpus.revision, 'sitemap', body, 'application/xml; charset=utf-8')
}

export function referenceRobots(request: Request) {
  const origin = publicOrigin(request)
  return new Response(`User-agent: *\nAllow: /\n\nSitemap: ${origin}/sitemap.xml\n`, {
    headers: { 'Cache-Control': 'public, max-age=86400', 'Content-Type': 'text/plain; charset=utf-8' },
  })
}

export function referenceLlms(request: Request) {
  const corpus = activeReferenceCorpus()
  const origin = publicOrigin(request)
  const revisions = corpus ? Object.entries(corpus.catalogue.revisions).map(([source, revision]) => `- ${source}: ${revision}`) : []
  const body = `# Praetorium

Praetorium is a public Warhammer 40,000 army builder, battle tracker, and community-data reference. Reference answers come from verified immutable snapshots and never from generated summaries.

## Agent interfaces

- [OpenAPI](${origin}/api/reference/v1/openapi.json): versioned read-only HTTP API
- [Search](${origin}/api/reference/v1/search?q=movement): search rules, detachments, and datasheets
- [Factions](${origin}/api/reference/v1/factions): discover available factions
- [MCP](${origin}/mcp): stateless read-only Streamable HTTP MCP endpoint

API reads return JSON by default. Send \`Accept: text/markdown\` for compact source-faithful text. Search results include canonical page URLs, source revisions, and attribution.

## Human reference

- [Factions](${origin}/factions)
- [Rules](${origin}/rules)
- [Data sources](${origin}/sources)

## Active source revisions

${revisions.length ? revisions.join('\n') : '- Reference data is temporarily unavailable.'}

Game data is fetched from the community sources named on the data sources page. Follow the attribution returned with each record when reproducing it.
`
  return new Response(body, { headers: { 'Cache-Control': 'public, max-age=3600', 'Content-Type': 'text/markdown; charset=utf-8' } })
}

function cachedText(request: Request, revision: string, key: string, body: string, contentType: string) {
  const etag = `"${createHash('sha256').update(`${revision}\0${key}`).digest('hex')}"`
  const headers = { 'Cache-Control': 'public, max-age=3600', 'Content-Type': contentType, ETag: etag }
  return request.headers.get('if-none-match') === etag ? new Response(null, { status: 304, headers }) : new Response(body, { headers })
}

function publicOrigin(request: Request) {
  return (process.env.APP_URL?.trim() || new URL(request.url).origin).replace(/\/$/, '')
}

const xml = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
