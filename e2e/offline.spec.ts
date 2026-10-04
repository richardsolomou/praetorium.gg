import { expect, test } from '@playwright/test'
import { signUp, uniqueName } from './account'

test('the complete reference keeps its existing UI after a cold offline launch', async ({ page, context }) => {
  test.setTimeout(240_000)
  const player = uniqueName('Offline reference')
  await signUp(page, player)
  await page.goto('/rules')
  await expect
    .poll(() => page.evaluate(async () => Boolean(await (await caches.open('praetorium-reference-v2')).match('/offline-reference.html'))), {
      timeout: 180_000,
    })
    .toBe(true)
  let download = await page.evaluate(async () =>
    (await (await caches.open('praetorium-reference-v2')).match('/offline-reference.html'))!.text(),
  )
  expect(download).not.toContain(player)
  await page.evaluate(async () => {
    const cache = await caches.open('praetorium-reference-v2')
    const html = await (await cache.match('/offline-reference.html'))!.text()
    const serialized = html.match(/<script>window\.PraetoriumOffline=([^]*?);<\/script>/)![1]
    const data = JSON.parse(serialized)
    data.revision = 'previous-reference'
    data.queries.find((entry: { key: string[] }) => entry.key.join('/') === 'rule-section/core-rules/moving').data.section.title =
      'Saved Moving'
    await cache.put(
      '/offline-reference.html',
      new Response(html.replace(serialized, JSON.stringify(data).replaceAll('<', '\\u003c')), {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      }),
    )
  })
  let release!: () => void
  const delayed = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('**/_serverFn/**', async (route) => {
    await delayed
    await route.continue()
  })
  await page.goto('/rules/core-rules/moving')
  await expect(page.getByRole('heading', { name: 'Saved Moving', exact: true })).toBeVisible()
  await page.locator('main details summary').first().click()
  await expect(page.locator('main details').first()).toHaveAttribute('open', '')
  release()
  await expect(page.getByRole('heading', { name: '03. Moving', exact: true })).toBeVisible({ timeout: 180_000 })
  await expect(page.locator('main details').first()).toHaveAttribute('open', '')
  await expect(page).toHaveURL(/rules\/core-rules\/moving$/)
  await expect(page.getByRole('region', { name: 'Offline reference' })).toHaveCount(0)
  download = await page.evaluate(async () =>
    (await (await caches.open('praetorium-reference-v2')).match('/offline-reference.html'))!.text(),
  )
  expect(download).not.toContain('previous-reference')
  await page.unroute('**/_serverFn/**')
  await page.route('**/_serverFn/**', (route) => route.abort())
  await page.evaluate(() => window.dispatchEvent(new Event('online')))
  await expect(page.getByRole('button', { name: 'Refresh now' })).toHaveCount(0)
  expect(
    await page.evaluate(async () => (await (await caches.open('praetorium-reference-v2')).match('/offline-reference.html'))!.text()),
  ).toBe(download)
  await page.unroute('**/_serverFn/**')
  await context.setOffline(true)
  await page.close()
  const offline = await context.newPage()
  const errors: string[] = []
  offline.on('pageerror', (error) => errors.push(error.message))
  await offline.goto('/rules/core-rules/moving')
  await expect(offline.getByRole('heading', { name: '03. Moving', exact: true })).toBeVisible()
  await expect(offline.getByRole('region', { name: 'Offline reference' })).toHaveCount(0)
  await offline.locator('main details summary').first().click()
  await expect(offline.locator('main details').first()).toHaveAttribute('open', '')
  await offline.screenshot({ path: test.info().outputPath('offline-rules-desktop.png') })
  await offline.getByRole('button', { name: 'Search Praetorium', exact: true }).first().click()
  await offline.getByPlaceholder('Search everything…').fill('Immortals')
  await offline.getByRole('option').filter({ hasText: 'Immortals' }).first().click()
  await expect(offline.getByRole('heading', { name: 'Immortals', exact: true })).toBeVisible()
  await expect(offline).toHaveURL(/factions\/necrons\/datasheets\/immortals$/)
  await offline.goBack()
  await expect(offline.getByRole('heading', { name: '03. Moving', exact: true })).toBeVisible()
  await offline.goForward()
  await expect(offline.getByRole('heading', { name: 'Immortals', exact: true })).toBeVisible()
  await offline.getByText('Lethal Hits', { exact: true }).first().hover()
  await expect(offline.getByRole('tooltip')).toContainText('Lethal Hits')
  await offline.mouse.move(0, 0)
  await expect(offline.getByRole('tooltip')).toBeHidden()
  await offline.setViewportSize({ width: 390, height: 844 })
  await offline.screenshot({ path: test.info().outputPath('offline-datasheet-phone.png') })
  await offline.goto('/factions/necrons/datasheets')
  await offline.getByRole('textbox', { name: 'Find a datasheet' }).fill('Warriors')
  await expect(offline.locator('[data-datasheet]')).toHaveCount(1)
  await offline.getByRole('link', { name: /^Necron Warriors [0-9]+ pts$/ }).click()
  await expect(offline.getByRole('heading', { name: 'Necron Warriors', exact: true })).toBeVisible()
  await offline.goto('/missions')
  await expect(offline.getByRole('heading', { name: 'Chapter Approved 2026-2027', exact: true })).toBeVisible()
  await offline.getByRole('link', { name: 'Battlefield Dominance', exact: true }).click()
  await expect(offline.getByRole('heading', { name: 'Take and Hold vs Take and Hold', exact: true })).toBeVisible()
  await offline
    .getByRole('button', { name: /^Enlarge terrain layout/ })
    .first()
    .click()
  await expect(offline.getByRole('dialog')).toBeVisible()
  await offline.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click()
  expect(errors).toEqual([])
  await context.setOffline(false)
  // A page created under network emulation can retain navigator.onLine across reconnection.
  await offline.evaluate(() => window.dispatchEvent(new Event('online')))
  await expect(offline.getByRole('button', { name: 'Refresh now' })).toHaveCount(0)
  await expect(offline.getByText('Offline · Reference saved', { exact: false })).toHaveCount(0)
})
