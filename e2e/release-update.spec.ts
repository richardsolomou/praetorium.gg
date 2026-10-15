import { expect, test } from '@playwright/test'
import manifest from '../package.json' with { type: 'json' }
const { version } = manifest

test('service worker updates bypass browser and edge caches', async ({ request }) => {
  const response = await request.get('/reference-worker.js')
  expect(response.headers()['cache-control']).toBe('no-store')
})

test('a connected launch loads the current application instead of the saved application', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(async () => {
    await (
      await caches.open('praetorium-reference-v2')
    ).put('/offline-reference.html', new Response('<h1>Previous application release</h1>', { headers: { 'Content-Type': 'text/html' } }))
    await navigator.serviceWorker.register('/reference-worker.js')
    await navigator.serviceWorker.ready
  })
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true)
  await page.reload()
  await expect(page.getByRole('link', { name: 'Rosters', exact: true }).first()).toBeVisible()
  await expect(page.getByRole('complementary', { name: 'Release update' })).toHaveCount(0)
  await page.screenshot({ path: test.info().outputPath('current-release-launch.png') })
})

test('release notice waits for a new version and refreshes only on request', async ({ page }) => {
  let served = version
  await page.route('**/api/release', (route) => route.fulfill({ json: { version: served }, headers: { 'cache-control': 'no-store' } }))
  await page.clock.install()
  await page.goto('/')
  const notice = page.getByRole('complementary', { name: 'Release update' })
  await expect(notice).toHaveCount(0)
  served = '99.0.0'
  await page.clock.runFor(60_000)
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 })
    await expect(notice).toBeVisible()
    await expect(notice).toHaveText('Praetorium has been updated.Refresh')
    await expect(notice.getByRole('button')).toHaveCount(1)
    const bounds = await notice.boundingBox()
    expect(Math.abs(bounds!.x + bounds!.width / 2 - width / 2)).toBeLessThan(1)
    if (width === 390) {
      const tabs = await page.locator('[data-native-app-tabs]').boundingBox()
      expect(bounds!.y + bounds!.height).toBeLessThan(tabs!.y)
    }
    await page.screenshot({ path: `test-results/release-update-${width}.png` })
  }
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.clock.runFor(60_000)
  await expect(notice).toBeVisible()
  served = version
  await notice.getByRole('button', { name: 'Refresh', exact: true }).click()
  await expect(page.getByRole('link', { name: 'Rosters', exact: true }).first()).toBeVisible()
  await expect(notice).toHaveCount(0)
})

test('failed release checks leave the page usable without an update notice', async ({ page }) => {
  await page.route('**/api/release', (route) => route.fulfill({ status: 502 }))
  await page.goto('/')
  await expect(page.getByRole('complementary', { name: 'Release update' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Rosters', exact: true }).first()).toBeVisible()
})

test("what's new announces changes once after an update and stays dismissed", async ({ page }) => {
  const notice = page.getByRole('complementary', { name: "What's new" })
  const acknowledgeOlder = () => page.evaluate(() => localStorage.setItem('praetorium-seen-release', '0.0.1'))
  await page.goto('/')
  await expect.poll(() => page.evaluate(() => localStorage.getItem('praetorium-seen-release'))).toBe(version)
  await expect(notice).toHaveCount(0)
  await acknowledgeOlder()
  await page.reload()
  await expect(notice).toContainText('New:')
  await notice.getByRole('button', { name: 'Dismiss', exact: true }).click()
  await expect(notice).toHaveCount(0)
  await page.reload()
  await expect(page.getByRole('link', { name: 'Rosters', exact: true }).first()).toBeVisible()
  await expect(notice).toHaveCount(0)
  await acknowledgeOlder()
  await page.setViewportSize({ width: 390, height: 900 })
  await page.reload()
  await expect(notice).toBeVisible()
  const tabs = await page.locator('[data-native-app-tabs]').boundingBox()
  const bounds = await notice.boundingBox()
  expect(bounds!.y + bounds!.height).toBeLessThan(tabs!.y)
  await page.screenshot({ path: 'test-results/whats-new-notice-390.png' })
  await notice.getByText("See what's new", { exact: true }).click()
  await expect(page.getByRole('heading', { name: "What's new", level: 1 })).toBeVisible()
  await expect(page.getByRole('heading', { name: new RegExp(`Version ${version.replaceAll('.', '\\.')}`) })).toContainText('This version')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.goto('/')
  await expect(page.getByRole('link', { name: 'Rosters', exact: true }).first()).toBeVisible()
  await expect(notice).toHaveCount(0)
})

test("dismissing what's new in one window hides it in the others", async ({ page, context }) => {
  await page.goto('/')
  await expect.poll(() => page.evaluate(() => localStorage.getItem('praetorium-seen-release'))).toBe(version)
  await page.evaluate(() => localStorage.setItem('praetorium-seen-release', '0.0.1'))
  const other = await context.newPage()
  await other.goto('/')
  await page.reload()
  const notice = (tab: typeof page) => tab.getByRole('complementary', { name: "What's new" })
  await expect(notice(other)).toBeVisible()
  await expect(notice(page)).toBeVisible()
  await notice(page).getByRole('button', { name: 'Dismiss', exact: true }).click()
  await expect(notice(other)).toHaveCount(0)
})
