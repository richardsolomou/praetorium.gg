import { argv, env } from 'node:process'

const targetOrigin = argv[2] ?? env.REFERENCE_BASE_URL
if (!targetOrigin) throw new Error('pass the deployed reference origin as an HTTP(S) URL')
const base = new URL(targetOrigin)
if (!['http:', 'https:'].includes(base.protocol)) throw new Error('pass the deployed reference origin as an HTTP(S) URL')

const checked: string[] = []

async function request(path: string, init?: RequestInit) {
  const response = await fetch(new URL(path, base), init)
  checked.push(`${init?.method ?? 'GET'} ${path} ${response.status}`)
  return response
}

async function search(query: string, kinds?: string) {
  const parameters = new URLSearchParams({ q: query, limit: '5' })
  if (kinds) parameters.set('kind', kinds)
  const response = await request(`/api/reference/v1/search?${parameters}`)
  if (!response.ok) throw new Error(`reference search failed with ${response.status}`)
  const body = (await response.json()) as {
    results: {
      id: string
      title: string
      url: string
      section: { id: string; url: string }
      revisions: Record<string, string>
      attribution: string[]
    }[]
  }
  if (!body.results.length) throw new Error(`reference search returned no results for ${query}`)
  if (JSON.stringify(body).length > 24_000) throw new Error(`reference search exceeded the response baseline for ${query}`)
  return { response, body }
}

const movement = await search('movement', 'rule')
const movementResult = movement.body.results[0]!
const etag = movement.response.headers.get('etag')
if (!etag) throw new Error('reference search did not return an ETag')
const cached = await request('/api/reference/v1/search?q=movement&limit=5&kind=rule', { headers: { 'If-None-Match': etag } })
if (cached.status !== 304) throw new Error(`reference cache validation returned ${cached.status}`)

const openApiResponse = await request('/api/reference/v1/openapi.json')
const openApi = (await openApiResponse.json()) as {
  openapi?: string
  paths?: Record<string, unknown>
  components?: { schemas?: Record<string, unknown> }
}
if (
  !openApiResponse.ok ||
  openApi.openapi !== '3.1.0' ||
  !openApi.paths?.['/api/reference/v1/search'] ||
  !openApi.components?.schemas?.DatasheetRecord ||
  !openApi.components.schemas.DetachmentRecord ||
  !openApi.components.schemas.RuleSectionRecord
) {
  throw new Error('OpenAPI discovery omitted a reference operation or response schema')
}

const documentPath = `/api/reference/v1/documents/${encodeURIComponent(movementResult.id)}`
const documentResponse = await request(documentPath)
if (!documentResponse.ok || !(await documentResponse.text()).includes(movementResult.title))
  throw new Error('JSON document retrieval did not return the search result')
const markdown = await request(documentPath, { headers: { Accept: 'text/markdown' } })
if (!markdown.ok || !(await markdown.text()).includes('Canonical URL:')) throw new Error('Markdown retrieval omitted its canonical URL')

const mcp = await request('/mcp', {
  method: 'POST',
  headers: {
    Accept: 'application/json, text/event-stream',
    'Content-Type': 'application/json',
    'MCP-Protocol-Version': '2025-06-18',
  },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: { name: 'get_reference', arguments: { id: movementResult.id } },
  }),
})
const mcpBody = (await mcp.json()) as { result?: { structuredContent?: { id?: string } } }
if (!mcp.ok || mcpBody.result?.structuredContent?.id !== movementResult.id) throw new Error('MCP retrieval disagreed with the HTTP API')

const datasheet = (await search('Battle Sisters Squad', 'datasheet')).body.results[0]!
const detachment = (await search('Bringers of Flame', 'detachment')).body.results[0]!
const missionMatrix = (await search('Force disposition mission matrix', 'mission')).body.results[0]!
if (missionMatrix.section.id !== 'matrix') throw new Error('mission search did not return the Force Disposition matrix')
const primaryMission = (await search('Death Trap terrain area trapped this turn', 'mission')).body.results[0]!
const primaryMissionDocument = await request(`/api/reference/v1/documents/${encodeURIComponent(primaryMission.id)}`)
if (!(await primaryMissionDocument.text()).includes('Scoring: For each terrain area trapped this turn.')) {
  throw new Error('primary mission retrieval omitted source scoring')
}

const mcpMissionSearch = await request('/mcp', {
  method: 'POST',
  headers: {
    Accept: 'application/json, text/event-stream',
    'Content-Type': 'application/json',
    'MCP-Protocol-Version': '2025-06-18',
  },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/call',
    params: { name: 'search_reference', arguments: { query: 'Force disposition mission matrix', kinds: ['mission'] } },
  }),
})
const mcpMissionBody = (await mcpMissionSearch.json()) as {
  result?: { structuredContent?: { results?: { id?: string; section?: { id?: string } }[] } }
}
if (
  !mcpMissionSearch.ok ||
  mcpMissionBody.result?.structuredContent?.results?.[0]?.id !== missionMatrix.id ||
  mcpMissionBody.result.structuredContent.results[0]?.section?.id !== 'matrix'
) {
  throw new Error('MCP mission search disagreed with the HTTP API')
}

for (const result of [movementResult, datasheet, detachment, missionMatrix, primaryMission]) {
  const path = new URL(result.url, base).pathname
  const response = await request(path)
  const html = await response.text()
  if (!response.ok || !html.includes(result.title) || !html.includes(`rel="canonical" href="${path}"`)) {
    throw new Error(`${path} did not return source content and its canonical link in the initial HTML`)
  }
}

const sitemap = await request('/sitemap.xml')
const sitemapText = await sitemap.text()
if (!sitemapText.includes(new URL(datasheet.url.split('#')[0]!, base).toString())) throw new Error('sitemap omitted a canonical datasheet')
if (!sitemapText.includes(new URL(primaryMission.url.split('#')[0]!, base).toString())) {
  throw new Error('sitemap omitted a canonical mission matchup')
}
const robots = await request('/robots.txt')
if (!(await robots.text()).includes(new URL('/sitemap.xml', base).toString())) throw new Error('robots.txt omitted the sitemap')
const llms = await request('/llms.txt')
const llmsText = await llms.text()
if (!llmsText.includes('/api/reference/v1/openapi.json') || !llmsText.includes('/mcp') || !llmsText.includes('AGPL-3.0')) {
  throw new Error('llms.txt omitted API, MCP, or licence discovery')
}

console.log(JSON.stringify({ origin: base.origin, checked }, null, 2))
