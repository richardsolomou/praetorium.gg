import { expect, type Page } from '@playwright/test'

export const REFERENCE_CACHE = 'praetorium-reference-v3'

export async function savedApplicationDigest(page: Page) {
  return page.evaluate(async (name) => {
    const saved = await (await caches.open(name)).match('/offline-reference.html')
    if (!saved) return null
    const digest = await crypto.subtle.digest('SHA-256', await saved.arrayBuffer())
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
  }, REFERENCE_CACHE)
}

/** Waits until the page has saved a complete download, which it starts using only once every part is stored. */
export async function waitForOfflineApp(page: Page) {
  await expect
    .poll(
      () =>
        page.evaluate(
          async (name) =>
            Boolean((await (await caches.open(name)).match('/offline-reference.html')) && window.PraetoriumReferenceCache?.version === 2),
          REFERENCE_CACHE,
        ),
      { timeout: 180_000 },
    )
    .toBe(true)
}

/** The queries a saved download's core part holds, as a page decodes them. */
export function savedCore(page: Page) {
  return page.evaluate(async (name) => {
    const cache = await caches.open(name)
    const record = (await (await cache.match('/offline-reference.json'))!.json()) as { download: { reference: { core: string } } }
    const part = (await cache.match(record.download.reference.core))!
    const { value, texts } = JSON.parse(await new Response(part.body!.pipeThrough(new DecompressionStream('gzip'))).text()) as {
      value: unknown
      texts: string[]
    }
    const restore = (item: unknown): unknown =>
      Array.isArray(item)
        ? item.map(restore)
        : item && typeof item === 'object'
          ? '$praetoriumText' in item
            ? texts[(item as { $praetoriumText: number }).$praetoriumText]
            : Object.fromEntries(Object.entries(item).map(([key, child]) => [key, restore(child)]))
          : item
    return restore(value) as { key: unknown[]; data: unknown }[]
  }, REFERENCE_CACHE)
}

export const OLDER_REVISION = '0'.repeat(64)

/** Replaces the saved download with an older one whose Moving rule has `title`, as a device holds before the service publishes a newer one. */
export async function saveOlderMovingRule(page: Page, title: string) {
  const queries = await savedCore(page)
  const moving = queries.find((entry) => entry.key.join('/') === 'rule-section/core-rules/moving')!.data as { section: { title: string } }
  moving.section.title = title
  await page.evaluate(
    async ({ name, core: saved, revision }) => {
      const cache = await caches.open(name)
      const record = await (await cache.match('/offline-reference.json'))!.json()
      const core = `/assets/reference-${revision}.bin`
      const json = new Blob([JSON.stringify({ value: saved, texts: [] })]).stream().pipeThrough(new CompressionStream('gzip'))
      await cache.put(core, new Response(json))
      record.download = { ...record.download, revision, reference: { ...record.download.reference, core } }
      await cache.put('/offline-reference.json', Response.json(record))
      const html = await (await cache.match('/offline-reference.html'))!.text()
      const embedded = html.match(/<script>window\.PraetoriumOffline=([^]*?);<\/script>/)![1]
      await cache.put(
        '/offline-reference.html',
        new Response(
          html.replace(embedded, () => JSON.stringify(record).replaceAll('<', '\\u003c')),
          { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
        ),
      )
    },
    { name: REFERENCE_CACHE, core: queries, revision: OLDER_REVISION },
  )
}
