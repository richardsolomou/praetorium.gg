import { expect, type Page } from '@playwright/test'

export async function savedApplicationDigest(page: Page) {
  return page.evaluate(async () => {
    const saved = await (await caches.open('praetorium-reference-v2')).match('/offline-reference.html')
    if (!saved) return null
    const digest = await crypto.subtle.digest('SHA-256', await saved.arrayBuffer())
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
  })
}

export async function waitForOfflineApp(page: Page) {
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          const saved = await (await caches.open('praetorium-reference-v2')).match('/offline-reference.html')
          const data = window.PraetoriumReferenceCache
          return Boolean(saved && data && 'construction' in data && data.construction)
        }),
      { timeout: 180_000 },
    )
    .toBe(true)
}
