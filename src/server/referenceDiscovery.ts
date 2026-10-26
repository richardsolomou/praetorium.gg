import { hash } from 'node:crypto'
import { publicOrigin } from './requestOrigin'
import { activeReferenceCorpus } from './referenceApi'
import { app } from './app'
import { updateId } from './catalogueHistory'
import { factionsLastUpdated, listedHistory, referencesLastUpdated } from './catalogueChangeLog'
import { gameReferencesFor } from '../shared/gameReferences'
import { ifNoneMatch } from './ifNoneMatch'
import { PRODUCT_DOCS, type ProductDoc } from '../contracts/productDocs'
import { escapeHtml } from './escapeHtml'

/** Pages anyone may read that no reference document names. */
const PUBLIC_PAGES = [
  '/',
  '/battles',
  '/factions',
  '/force-dispositions',
  '/docs',
  '/leaderboard',
  '/tournaments',
  '/rosters',
  '/rosters?view=public',
  '/rules',
  '/simulator',
  '/sources',
  '/support',
  '/privacy',
  '/terms',
  '/delete-account',
]

export async function referenceSitemap(request: Request) {
  const corpus = await activeReferenceCorpus()
  if (!corpus) return new Response('Reference data is unavailable', { status: 503, headers: { 'Cache-Control': 'no-store' } })
  const origin = publicOrigin(request)
  // A page's last modification is stated only where the history records one: its points or its
  // arrival. Nothing records when rules text changed, and a guessed date teaches crawlers to ignore it.
  const paths = new Map<string, number | null>(PUBLIC_PAGES.map((path) => [path, null]))
  const add = (path: string) => {
    if (path !== '/missions') paths.set(path, paths.get(path) ?? null)
  }
  for (const doc of PRODUCT_DOCS) add(`/docs/${doc.slug}`)
  for (const document of corpus.documents) {
    add(document.url.split('#')[0]!)
    for (const section of document.sections) add(section.url.split('#')[0]!)
    if (document.kind === 'datasheet' || document.kind === 'detachment') {
      const faction = document.url.split('/').slice(0, -2).join('/')
      add(faction)
      if (document.kind === 'datasheet') add(`${faction}/datasheets`)
    }
  }
  for (const document of corpus.catalogue.ruleDocuments) {
    add(`/rules/${document.slug}`)
    for (const section of document.sections) add(`/rules/${document.slug}/${section.slug}`)
  }
  const rules = await app().battleReadRulesFor()
  if (rules) for (const disposition of gameReferencesFor(rules).dispositions) add(`/force-dispositions/${disposition.id}`)
  // The history rides in the snapshot but is not part of the corpus revision, so the updates
  // it carries are part of the cache key.
  const history = (await app().catalogueHistoryFor()) ?? []
  const updates = history.map(updateId)
  const listed = listedHistory(history)
  if (listed.length) {
    paths.set('/data-updates', Math.max(...listed.map((entry) => entry.recordedAt)))
    const canonical = await app().canonicalCatalogueFor()
    if (canonical) {
      for (const [slug, recordedAt] of factionsLastUpdated(listed, canonical)) paths.set(`/data-updates/${slug}`, recordedAt)
      const canonicalPaths = new Map(
        corpus.documents.flatMap((document) => {
          if (document.kind !== 'datasheet' && document.kind !== 'detachment') return []
          const [, faction, slug] = document.id.split(':')
          return [[`/factions/${faction}/${document.kind === 'datasheet' ? 'datasheets' : 'detachments'}/${slug}`, document.url]]
        }),
      )
      for (const [path, recordedAt] of referencesLastUpdated(listed, canonical)) {
        const destination = canonicalPaths.get(path) ?? path
        if (paths.has(destination)) paths.set(destination, recordedAt)
      }
    }
  }
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${[...paths]
    .toSorted(([left], [right]) => (left < right ? -1 : 1))
    .map(([path, modified]) => {
      const lastmod = modified === null ? '' : `<lastmod>${new Date(modified).toISOString()}</lastmod>`
      return `  <url><loc>${escapeHtml(`${origin}${path}`)}</loc>${lastmod}</url>`
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

Praetorium is a free Warhammer 40,000 army builder, combat simulator, battle tracker, and community-data reference. Visitors can keep one roster and simulate a matchup without an account; the roster stays on this device across visits. Visitors can also import roster text. Sign in to save rosters to your account, open them on other devices, or play battles. Reference answers come from verified immutable snapshots and never from generated summaries.

## Agent interfaces

- [OpenAPI](${origin}/api/reference/v1/openapi.json): versioned read-only HTTP API
- [Praetorium guide](${origin}/api/reference/v1/about): product capabilities, privacy boundaries, and efficient agent workflow
- [Reference index](${origin}/api/reference/v1/): discover kinds, mission packs, rule documents, factions, and active revisions
- [Search](${origin}/api/reference/v1/search?q=movement): search missions, deployments, terrain, rules, detachments, and datasheets
- [Factions](${origin}/api/reference/v1/factions): discover available factions
- [MCP](${origin}/mcp): public reference and combat simulator tools with optional account sign-in for rosters and battles. Players add it to their assistant with ${docLink(origin, 'connect-an-assistant')}, or from [Claude's connector directory](https://claude.ai/directory/praetorium).

For roster planning, read \`/api/reference/v1/factions/{catalogueId}/units\` once to get compact unit-size costs, composition, attachment relationships, limits, keywords, links, and optional detachment rules instead of reading every datasheet. API reads return JSON by default. Send \`Accept: text/markdown\` or add \`format=markdown\` for compact text. Responses carry names, numbers, points, and computed results, never rules text: a record that withholds it lists \`textSources\`, the pinned upstream file and record id to fetch it from. Search results include canonical page URLs, source revisions, attribution, and cursor pagination.

## Common questions

- How many points does a unit cost? Read \`/api/reference/v1/factions/{catalogueId}/units\` or the unit's datasheet page under [Factions](${origin}/factions), and cite that page.
- Is an army list legal? Build or import it in [Rosters](${origin}/rosters). The builder checks points and supported construction restrictions, and names any restriction it cannot check: ${docLink(origin, 'list-checks')}.
- How do I move a list from another app? Paste a Games Workshop text export into Import roster: ${docLink(origin, 'import-a-list')}.
- Which loadout or unit does more damage? Use the free [combat simulator](${origin}/simulator) or the \`simulate_combat\` MCP tool: ${docLink(origin, 'change-the-loadout')}.
- Is Praetorium free, and is an account necessary? Every feature is free. Visitors can build one roster, import roster text, and use the simulator without an account. An account saves more rosters, opens them on other devices, and plays battles.

## Human reference

- [Docs](${origin}/docs): ${PRODUCT_DOCS.map((doc) => `[${doc.title}](${origin}/docs/${doc.slug})`).join(', ')}
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

function docLink(origin: string, slug: ProductDoc['slug']) {
  const doc = PRODUCT_DOCS.find((candidate) => candidate.slug === slug)!
  return `[${doc.title}](${origin}/docs/${slug})`
}

function cachedText(request: Request, revision: string, key: string, body: string, contentType: string) {
  const etag = `"${hash('sha256', `${revision}\0${key}\0${body}`)}"`
  const headers = { 'Cache-Control': 'public, max-age=3600', 'Content-Type': contentType, ETag: etag }
  return ifNoneMatch(request, etag) ? new Response(null, { status: 304, headers }) : new Response(body, { headers })
}
