import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { INDEXNOW_BATCH, INDEXNOW_KEY_PATH, indexNowKey, sitemapChanges } from '../src/server/indexNow.ts'

const ENDPOINT = 'https://api.indexnow.org/indexnow'

/** Replicas update one at a time, so the new revision must answer several health checks in a row. */
const SETTLED_CHECKS = 5
const HEALTH_ATTEMPTS = 120
const HEALTH_INTERVAL_MS = 5000

type Options = {
  key: string | undefined
  revision: string
  origin: string
  /** The sitemap production served before the deploy. */
  before: string
  request?: typeof fetch
  sleep?: (ms: number) => Promise<void>
}

/** Waits until every replica serves `revision`, so the sitemap read next is the new one. */
async function settled(origin: string, revision: string, request: typeof fetch, sleep: (ms: number) => Promise<void>) {
  let streak = 0
  for (let attempt = 0; attempt < HEALTH_ATTEMPTS; attempt += 1) {
    const response = await request(new URL('/api/health', origin), { cache: 'no-store' })
    streak = response.ok && response.headers.get('x-praetorium-revision') === revision ? streak + 1 : 0
    if (streak === SETTLED_CHECKS) return
    await sleep(HEALTH_INTERVAL_MS)
  }
  throw new Error(`${origin} did not settle on ${revision}`)
}

/**
 * Submits the pages a deploy added or re-dated in the sitemap. A missing key, or no earlier
 * sitemap to compare with, submits nothing rather than every page on the site.
 */
export async function submitIndexNow({ key: configured, revision, origin, before, request = fetch, sleep = defaultSleep }: Options) {
  const key = indexNowKey(configured)
  if (!key) return console.log('IndexNow is not configured; nothing submitted')
  if (!before.includes('<urlset')) return console.log('No earlier sitemap to compare with; nothing submitted')
  await settled(origin, revision, request, sleep)
  const keyFile = await request(new URL(INDEXNOW_KEY_PATH, origin), { cache: 'no-store' })
  if (!keyFile.ok || (await keyFile.text()).trim() !== key)
    throw new Error(`${origin}${INDEXNOW_KEY_PATH} does not serve the configured key`)
  const sitemap = await request(new URL('/sitemap.xml', origin), { cache: 'no-store' })
  if (!sitemap.ok) throw new Error(`The sitemap answered ${sitemap.status}`)
  const urls = sitemapChanges(before, await sitemap.text())
  for (let start = 0; start < urls.length; start += INDEXNOW_BATCH) {
    const response = await request(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        host: new URL(origin).host,
        key,
        keyLocation: new URL(INDEXNOW_KEY_PATH, origin).href,
        urlList: urls.slice(start, start + INDEXNOW_BATCH),
      }),
    })
    // 202 means the engine received the URLs and has yet to fetch the key.
    if (response.status !== 200 && response.status !== 202)
      throw new Error(`IndexNow answered ${response.status}: ${await response.text()}`)
  }
  console.log(`Submitted ${urls.length} changed ${urls.length === 1 ? 'page' : 'pages'} to IndexNow`)
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [beforeFile, origin] = process.argv.slice(2)
  if (!beforeFile || !origin) throw new Error('Usage: submitIndexNow.ts <sitemap-before.xml> <origin>')
  const revision = process.env.DEPLOY_SHA
  if (!revision) throw new Error('DEPLOY_SHA is required')
  const before = await readFile(beforeFile, 'utf8').catch(() => '')
  await submitIndexNow({ key: process.env.INDEXNOW_KEY, revision, origin, before })
}
