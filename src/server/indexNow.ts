/**
 * IndexNow tells Bing and the engines that share its submissions which pages changed, so a
 * points update is recrawled when it ships rather than whenever a crawler next passes.
 */

/** Where the key file is served; at the root, so it vouches for every URL on the host. */
export const INDEXNOW_KEY_PATH = '/indexnow.txt'

/** The protocol's own limit on one submission. */
export const INDEXNOW_BATCH = 10_000

/** The configured key, or null when it is absent or not one the protocol accepts, which leaves IndexNow off. */
export function indexNowKey(value: string | undefined) {
  const key = value?.trim()
  return key && /^[A-Za-z0-9-]{8,128}$/.test(key) ? key : null
}

export function indexNowKeyResponse() {
  const key = indexNowKey(process.env.INDEXNOW_KEY)
  return key
    ? new Response(key, { headers: { 'Cache-Control': 'public, max-age=86400', 'Content-Type': 'text/plain; charset=utf-8' } })
    : new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } })
}

/** Each page a sitemap lists, with its last modification where it states one. */
function sitemapEntries(xml: string) {
  const entries = new Map<string, string | null>()
  for (const [, url] of xml.matchAll(/<url>(.*?)<\/url>/gs)) {
    const loc = /<loc>(.*?)<\/loc>/s.exec(url!)?.[1]
    if (loc) entries.set(unescapeXml(loc), /<lastmod>(.*?)<\/lastmod>/s.exec(url!)?.[1] ?? null)
  }
  return entries
}

/** The pages a sitemap gained, or dated afresh, since an earlier copy of it. */
export function sitemapChanges(before: string, after: string) {
  const previous = sitemapEntries(before)
  return [...sitemapEntries(after)].filter(([url, modified]) => !previous.has(url) || previous.get(url) !== modified).map(([url]) => url)
}

const unescapeXml = (value: string) =>
  value.replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&quot;', '"').replaceAll('&amp;', '&')
