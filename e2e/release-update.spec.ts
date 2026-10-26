import type { Page } from '@playwright/test'
import { expect, test } from './test'
import { createBattle, retryUntilVisible, signUp, uniqueName } from './account'
import manifest from '../package.json' with { type: 'json' }
const { version } = manifest

/** Answers the release check with whatever version `served` reads at the time of the request. */
const serveRelease = (page: Page, served: () => string) =>
  page.route('**/api/release', (route) => route.fulfill({ json: { version: served() }, headers: { 'cache-control': 'no-store' } }))

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
  await serveRelease(page, () => served)
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
    await page.screenshot({ path: test.info().outputPath(`release-update-${width}.png`) })
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

test("an update shows no what's new notice", async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => localStorage.setItem('praetorium-seen-release', '0.0.1'))
  await page.reload()
  await expect(page.getByRole('link', { name: 'Rosters', exact: true }).first()).toBeVisible()
  await expect(page.getByRole('complementary', { name: "What's new" })).toHaveCount(0)
})

const staleBuildMarker = /[?&]__build_retry=\d+\.(\d)\.99\.0\.0(?:&|#|$)/

/** Serves a factions route module that fails the way an older build's code fails on a newer server's response. */
async function failFactionsModule(page: Page, failing: (document: URL) => boolean) {
  let broken = failing(new URL(page.url()))
  await page.route('**/*', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (request.isNavigationRequest()) broken = failing(url)
    if (broken && /\/assets\/factions\.index-[^/]+\.js$/.test(url.pathname))
      await route.fulfill({
        body: `throw new TypeError("Cannot read properties of undefined (reading 'flatMap')")`,
        headers: { 'content-type': 'text/javascript', 'cache-control': 'no-store' },
      })
    else await route.fallback()
  })
}

test('a page built before the deployed release loads its next route from the new release', async ({ page }) => {
  await serveRelease(page, () => '99.0.0')
  await page.goto('/')
  await expect(page.getByRole('complementary', { name: 'Release update' })).toBeVisible()
  await page.evaluate(() => Object.assign(window, { previousDocument: true }))
  await page.getByRole('link', { name: 'Rosters', exact: true }).first().click()
  await expect(page).toHaveURL(staleBuildMarker)
  await expect(page.getByRole('heading', { name: 'Rosters', exact: true }).first()).toBeVisible()
  expect(await page.evaluate(() => 'previousDocument' in window)).toBe(false)
})

test('a route error in a page built before the deployed release reloads into the new release', async ({ page }) => {
  let served = version
  await serveRelease(page, () => served)
  await page.goto('/')
  await expect(page.getByRole('link', { name: 'Rosters', exact: true }).first()).toBeVisible()
  await failFactionsModule(page, (document) => !document.searchParams.has('__build_retry'))
  // The release changes between checks, so only the error page's own check can notice it.
  served = '99.0.0'
  await retryUntilVisible(page.getByRole('combobox'), () =>
    page.getByRole('button', { name: 'Search Praetorium', exact: true }).filter({ visible: true }).click(),
  )
  await page.getByRole('combobox').fill('Factions')
  await page.getByRole('option', { name: /^Factions / }).click()
  await expect(page.getByRole('heading', { name: 'Factions', exact: true })).toBeVisible()
  await expect(page).toHaveURL(staleBuildMarker)
})

test('try again reloads a stale page that has stopped reloading itself', async ({ page }, testInfo) => {
  let recovering = false
  await serveRelease(page, () => '99.0.0')
  await failFactionsModule(page, () => !recovering)
  await page.goto('/factions?__build_retry=1234.3.99.0.0')
  const tryAgain = page.getByRole('button', { name: 'Try again', exact: true })
  await expect(tryAgain).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('stale-build-error.png') })
  recovering = true
  await tryAgain.click()
  await expect(page.getByRole('heading', { name: 'Factions', exact: true })).toBeVisible()
  expect(staleBuildMarker.exec(page.url())?.[1]).toBe('3')
})

test('a stale page sends a queued battle command before a route change reloads it', async ({ page }) => {
  await signUp(page, uniqueName('Stale commander'))
  await createBattle(page, { practice: true })
  await serveRelease(page, () => '99.0.0')
  let holding = false
  const { promise: released, resolve: release } = Promise.withResolvers<void>()
  const { promise: sent, resolve: held } = Promise.withResolvers<void>()
  await page.route('**/_serverFn/**', async (route) => {
    if (holding && route.request().method() === 'POST') {
      held()
      await released
    }
    await route.fallback()
  })
  await page.reload()
  await expect(page.getByRole('complementary', { name: 'Release update' })).toBeVisible()
  await page.getByRole('button', { name: 'Change battle size and mission pack' }).click()
  holding = true
  await page.getByRole('button', { name: /^Manual/ }).click()
  await sent
  await page.evaluate(() => Object.assign(window, { previousDocument: true }))
  await page.getByRole('link', { name: 'Rosters', exact: true }).first().click()
  await expect(page.getByRole('heading', { name: 'Rosters', exact: true }).first()).toBeVisible()
  expect(await page.evaluate(() => 'previousDocument' in window)).toBe(true)
  holding = false
  release()
  // Once the command lands, the next route change reloads; alternate destinations so each click changes route.
  let destination = 'Battles'
  await expect(async () => {
    destination = destination === 'Battles' ? 'Leaderboard' : 'Battles'
    await page.getByRole('link', { name: destination, exact: true }).first().click({ timeout: 1_000 })
    await expect(page).toHaveURL(staleBuildMarker, { timeout: 1_000 })
  }).toPass({ timeout: 20_000 })
})
