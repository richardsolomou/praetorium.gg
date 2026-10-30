import { readFile, writeFile } from 'node:fs/promises'
import { INDEXNOW_BATCH, INDEXNOW_KEY_PATH, indexNowKey, sitemapChanges } from '../src/server/indexNow.ts'
import { isEntryPoint } from './lib/entryPoint.ts'
import { requiredEnv } from './lib/requiredEnv.ts'
import { waitForWebRevision } from './lib/webReadiness.ts'
import { setTimeout as delay } from 'node:timers/promises'

const ENDPOINT = 'https://api.indexnow.org/indexnow'
const HEALTH_INTERVAL_MS = 5_000

type Options = {
  key: string | undefined
  revision: string
  origin: string
  /** The sitemap production served before the deploy. */
  before: string
  afterFile?: string
  request?: typeof fetch
  sleep?: (ms: number) => Promise<void>
}

/**
 * Submits the pages a deploy added or re-dated in the sitemap. A missing key, or no earlier
 * sitemap to compare with, submits nothing rather than every page on the site.
 */
export async function submitIndexNow({ key: configured, revision, origin, before, afterFile, request = fetch, sleep = delay }: Options) {
  const key = indexNowKey(configured)
  if (!key) return console.log('IndexNow is not configured; nothing submitted')
  if (!before.includes('<urlset')) return console.log('No earlier sitemap to compare with; nothing submitted')
  // Every replica must serve `revision` before the sitemap read next is the new one.
  await waitForWebRevision(origin, revision, {
    request,
    pause: () => sleep(HEALTH_INTERVAL_MS),
    timeoutMs: 120 * HEALTH_INTERVAL_MS,
    consecutive: 5,
  })
  const keyFile = await request(new URL(INDEXNOW_KEY_PATH, origin), { cache: 'no-store' })
  if (!keyFile.ok || (await keyFile.text()).trim() !== key)
    throw new Error(`${origin}${INDEXNOW_KEY_PATH} does not serve the configured key`)
  const sitemapUrl = new URL('/sitemap.xml', origin)
  sitemapUrl.searchParams.set('revision', revision)
  const sitemap = await request(sitemapUrl, { cache: 'no-store' })
  if (!sitemap.ok) throw new Error(`The sitemap answered ${sitemap.status}`)
  const after = await sitemap.text()
  if (!after.includes('<urlset')) throw new Error('The released sitemap is not a URL set')
  if (afterFile) await writeFile(afterFile, after)
  const urls = sitemapChanges(before, after)
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

if (isEntryPoint(import.meta.url)) {
  const [beforeFile, origin, afterFile] = process.argv.slice(2)
  if (!beforeFile || !origin) throw new Error('Usage: submitIndexNow.ts <sitemap-before.xml> <origin> [sitemap-after.xml]')
  const revision = requiredEnv('DEPLOY_SHA')
  const before = await readFile(beforeFile, 'utf8').catch(() => '')
  await submitIndexNow({ key: process.env.INDEXNOW_KEY, revision, origin, before, afterFile })
}
