import { expect, type Page } from '@playwright/test'

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
