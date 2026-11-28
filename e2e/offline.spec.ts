import {
  OLDER_REVISION,
  REFERENCE_CACHE,
  saveOlderMovingRule,
  savedApplicationDigest,
  savedCore,
  downloadOfflineAppAtOnce,
  waitForOfflineApp,
} from './offline'
import { expect, test } from './test'
import { createRoster, scrollSearchResultIntoView, signUp, uniqueName, PHONE } from './account'
import { add } from './builder.harness'
import { screenshot } from './screenshots'

// The offline downloads mount once in the app shell, so the home page stands for every route.
test('the home page paints before downloading the offline application and keeps its reference across an update', async ({
  page,
  request,
}) => {
  test.setTimeout(240_000)
  const parts: string[] = []
  const downloads: number[] = []
  page.on('request', (assetRequest) => {
    if (/\/assets\/(reference|construction)-[a-f0-9]+\.bin$/.test(assetRequest.url())) parts.push(new URL(assetRequest.url()).pathname)
    if (/\/assets\/((reference|construction)-[a-f0-9]+\.bin|offline-app-[a-f0-9]+\.js)$/.test(assetRequest.url()))
      downloads.push(Date.now())
  })
  await page.goto('/')
  await expect(page.locator('main h1')).toBeVisible()
  await waitForOfflineApp(page)
  const navigationStart = await page.evaluate(() => performance.timeOrigin)
  expect(Math.min(...downloads) - navigationStart).toBeGreaterThanOrEqual(10_000)

  const manifest = await request.get('/offline-reference-version.json')
  expect(manifest.headers()['cache-control']).toBe('no-store')
  const { reference, construction } = await manifest.json()
  // Each part downloads once, the core first; a device without lists on other rules versions skips theirs.
  const sorted = (assets: string[]) => assets.toSorted((left, right) => left.localeCompare(right))
  expect({ first: parts[0], parts: sorted(parts) }).toEqual({
    first: reference.core,
    parts: sorted([
      reference.core,
      reference.search,
      ...Object.values<string>(reference.parts),
      construction.catalogue,
      construction.rules,
      ...(construction.vs ? [construction.vs] : []),
      ...(construction.importNames ? [construction.importNames] : []),
    ]),
  })
  const part = await request.get(reference.core)
  expect(part.headers()['content-type']).toBe('application/octet-stream')
  expect(part.headers()['content-encoding']).toBeUndefined()
  expect((await part.body()).subarray(0, 2).toString('hex')).toBe('1f8b')
  const appManifest = await request.get('/offline-app-version.json')
  expect(appManifest.headers()['cache-control']).toBe('no-store')
  const app = await appManifest.json()
  await page.route('**/offline-app-version.json', (route) => route.fulfill({ json: { ...app, revision: 'next-app-version' } }))
  const downloaded = parts.length
  await page.evaluate(() => window.dispatchEvent(new Event('online')))
  await expect.poll(() => page.evaluate(() => window.PraetoriumReferenceCache?.appRevision), { timeout: 60_000 }).toBe('next-app-version')
  // An application update keeps every stored part.
  expect(parts).toHaveLength(downloaded)
  await expect(page.locator('main h1')).toBeVisible()
})

test('a saved copy that finds the connection back offers the live app', async ({ page, context }) => {
  await downloadOfflineAppAtOnce(page)
  test.setTimeout(240_000)
  await page.goto('/')
  await expect(page.locator('main h1')).toBeVisible()
  await waitForOfflineApp(page)
  await page.clock.install()
  await context.setOffline(true)
  await page.reload()
  await expect.poll(() => page.evaluate(() => Boolean(window.PraetoriumOffline))).toBe(true)
  const notice = page.getByRole('complementary', { name: 'Back online' })
  await expect(notice).toHaveCount(0)

  await context.setOffline(false)
  // The saved copy hears the connection back from the release check's next poll.
  await page.clock.runFor(60_000)
  await expect(notice).toBeVisible()
  await screenshot(page, 'saved-copy-back-online.png')
  await notice.getByRole('button', { name: 'Reload' }).click()
  await expect.poll(() => page.evaluate(() => Boolean(window.PraetoriumOffline))).toBe(false)
  await expect(page.locator('main h1')).toBeVisible()
})

test('the complete reference keeps its existing UI after a cold offline launch', { tag: '@catalogue' }, async ({ page, context }) => {
  await downloadOfflineAppAtOnce(page)
  test.setTimeout(240_000)
  const player = uniqueName('Offline reference')
  await signUp(page, player)
  await page.goto('/rules/core-rules/moving')
  await expect(page.locator('main [data-rule-summary]').first()).toBeAttached()
  await page.goto('/rules')
  await waitForOfflineApp(page)
  expect(
    await page.evaluate(
      async ({ name, text }) => (await (await (await caches.open(name)).match('/offline-reference.html'))!.text()).includes(text),
      { name: REFERENCE_CACHE, text: player },
    ),
  ).toBe(false)
  await saveOlderMovingRule(page, 'Saved Moving')
  const { promise: delayed, resolve: release } = Promise.withResolvers<void>()
  await page.route('**/offline-reference-version.json', async (route) => {
    await delayed
    await route.continue()
  })
  await context.setOffline(true)
  await page.goto('/rules/core-rules/moving')
  await expect(page.getByRole('heading', { name: 'Saved Moving', exact: true })).toBeVisible()
  await context.setOffline(false)
  await page.evaluate(() => window.dispatchEvent(new Event('online')))
  await page
    .locator('main article')
    .first()
    .evaluate((rule) => rule.setAttribute('data-kept', ''))
  release()
  await expect(page.getByRole('heading', { name: '03. Moving', exact: true })).toBeVisible({ timeout: 180_000 })
  // The page the reader has open stays as it is rather than being drawn again.
  await expect(page.locator('main article[data-kept]')).toHaveCount(1)
  await expect(page).toHaveURL(/rules\/core-rules\/moving$/)
  await expect(page.getByRole('region', { name: 'Offline reference' })).toHaveCount(0)
  await expect
    .poll(() =>
      page.evaluate(
        async ({ name, older }) => {
          const saved = await (await caches.open(name)).match('/offline-reference.html')
          return saved ? (await saved.text()).includes(older) : true
        },
        { name: REFERENCE_CACHE, older: OLDER_REVISION },
      ),
    )
    .toBe(false)
  const download = await savedApplicationDigest(page)
  expect(download).toMatch(/^[a-f0-9]{64}$/)
  await page.unroute('**/offline-reference-version.json')
  await page.route('**/offline-reference-version.json', (route) => route.abort())
  const failedRefresh = page.waitForEvent('requestfailed', {
    predicate: (request) => request.url().endsWith('/offline-reference-version.json'),
  })
  await page.evaluate(() => window.dispatchEvent(new Event('online')))
  await failedRefresh
  await expect(page.getByRole('button', { name: 'Refresh now' })).toHaveCount(0)
  expect(await savedApplicationDigest(page)).toBe(download)
  await page.unroute('**/offline-reference-version.json')
  await context.setOffline(true)
  await page.close()
  const offline = await context.newPage()
  const errors: string[] = []
  offline.on('pageerror', (error) => errors.push(error.message))
  await offline.goto('/rules/core-rules/moving')
  await expect(offline.getByRole('heading', { name: '03. Moving', exact: true })).toBeVisible()
  await expect
    .poll(() =>
      offline
        .locator('nav[aria-label="Community"] img')
        .evaluateAll((icons) => icons.map((icon) => (icon as HTMLImageElement).complete && (icon as HTMLImageElement).naturalWidth > 0)),
    )
    .toEqual([true, true])
  await expect(offline.getByRole('region', { name: 'Offline reference' })).toHaveCount(0)
  await expect(offline.locator('main [data-rule-summary]').first()).toBeVisible()
  await offline.getByRole('button', { name: 'Search Praetorium', exact: true }).first().click()
  await offline.getByPlaceholder('Search everything…').fill('Imotekh')
  await scrollSearchResultIntoView(offline, offline.getByRole('option', { name: /Imotekh the Stormlord/ }).first())
  await expect(offline.getByRole('option', { name: /Imotekh the Stormlord/ }).first()).toBeVisible()
  await offline.getByPlaceholder('Search everything…').fill('Immortals')
  await offline.getByRole('option').filter({ hasText: 'Immortals' }).first().click()
  await expect(offline.getByRole('heading', { name: 'Immortals', exact: true })).toBeVisible()
  await expect(offline).toHaveURL(/factions\/necrons\/rules\/mfm-1-6\/datasheets\/immortals$/)
  await offline.goBack()
  await expect(offline.getByRole('heading', { name: '03. Moving', exact: true })).toBeVisible()
  await offline.goForward()
  await expect(offline.getByRole('heading', { name: 'Immortals', exact: true })).toBeVisible()
  await offline.getByText('Lethal Hits', { exact: true }).first().hover()
  await expect(offline.getByRole('tooltip')).toContainText('Lethal Hits')
  await offline.mouse.move(0, 0)
  await expect(offline.getByRole('tooltip')).toBeHidden()
  await offline.setViewportSize(PHONE)
  await offline.goto('/factions/necrons/datasheets')
  await offline.getByRole('textbox', { name: 'Find a datasheet' }).fill('Warriors')
  await expect(offline.locator('[data-datasheet]')).toHaveCount(1)
  await offline.getByRole('link', { name: /^Necron Warriors [0-9]+ pts$/ }).click()
  await expect(offline.getByRole('heading', { name: 'Necron Warriors', exact: true })).toBeVisible()
  const index = (await savedCore(offline)).find((entry) => entry.key[0] === 'faction-index')!.data as {
    factions: { id: string; displayName: string }[]
  }
  const catalogueId = index.factions.find((faction) => faction.displayName === 'Necrons')!.id
  await offline.goto(`/factions/necrons/rules/${catalogueId}/datasheets/immortals`)
  await expect(offline.getByRole('heading', { name: 'Immortals', exact: true })).toBeVisible()
  await expect(offline).toHaveURL(`/factions/necrons/rules/mfm-1-6/datasheets/immortals`)
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
  await offline.route('**/t/offline-telemetry-probe.js', (route) =>
    route.fulfill({ contentType: 'application/javascript', body: 'window.__offlineTelemetryLoaded = true' }),
  )
  const telemetryLoaded = await offline.evaluate(
    () =>
      new Promise<boolean>((resolve) => {
        const script = document.createElement('script')
        script.src = '/t/offline-telemetry-probe.js'
        script.onload = () => resolve((window as typeof window & { __offlineTelemetryLoaded?: boolean }).__offlineTelemetryLoaded === true)
        script.onerror = () => resolve(false)
        document.head.append(script)
      }),
  )
  expect(telemetryLoaded).toBe(true)
})

test('a returning visit searches and opens datasheets from its download without waiting for the service', async ({ page }) => {
  await downloadOfflineAppAtOnce(page)
  test.setTimeout(240_000)
  await page.goto('/')
  await waitForOfflineApp(page)
  await page.reload()
  await expect(page.locator('main h1')).toBeVisible()
  // Holding every service read proves the reference never waits on one; downloads are deferred far longer than this.
  await page.route('**/_serverFn/**', () => new Promise(() => {}))
  await page.getByRole('button', { name: 'Search Praetorium', exact: true }).first().click()
  await page.getByPlaceholder('Search everything…').fill('Immortals')
  await page.getByRole('option').filter({ hasText: 'Immortals' }).first().click({ timeout: 4_000 })
  await expect(page.getByRole('heading', { name: 'Immortals', exact: true })).toBeVisible({ timeout: 4_000 })
})

test('the roster builder prices units and opens datasheets on the device once it has prepared them', async ({ page }) => {
  await downloadOfflineAppAtOnce(page)
  test.setTimeout(240_000)
  await signUp(page, 'Richard')
  await createRoster(page, { faction: 'Necrons', detachment: /Awakened Dynasty/ })
  await waitForOfflineApp(page)
  await page.reload()
  // Server function ids hash their file and export: the two datasheet reads in references.ts and `priceRoster` in rosters.ts.
  const DATASHEET = '50de9b8fbcf16262f1323f158c2bd2a5e6d32b2eb6e5a6ebd58064efaadf69b8'
  const ROSTER_DATASHEET = '2f319fb6f0bf0f3568b46609de887095fccbb584eef2642e97c4e620fab6f4df'
  const PRICE = '2305a40a0317ee9af2a331b9753b8bc50d8b6fea03575e255596193749f7ac88'
  // The ids must name real functions for the checks below to mean anything; the server fails an unknown id.
  for (const id of [DATASHEET, ROSTER_DATASHEET, PRICE]) expect((await page.request.get(`/_serverFn/${id}`)).status()).not.toBe(500)
  const asked: string[] = []
  page.on('request', (request) => asked.push(request.url().split('/_serverFn/')[1]?.slice(0, 64) ?? ''))
  const picker = page.getByLabel('Add a unit')
  if (!(await picker.isVisible())) await page.getByRole('button', { name: 'Add units', exact: true }).click()
  // The server answers until the device has prepared, so each attempt opens a datasheet not yet read.
  const units = ['Lychguard', 'Deathmarks', 'Triarch Praetorians', 'Canoptek Wraiths', 'Flayed Ones', 'Tomb Blades', 'Ophydian Destroyers']
  await expect(async () => {
    const unit = units.shift()!
    asked.length = 0
    await picker.fill(unit)
    await page.getByRole('button', { name: `View ${unit} datasheet` }).click()
    await expect(page.locator('aside[aria-label="Datasheet"]')).toContainText(unit)
    expect(asked.filter((id) => id === DATASHEET || id === ROSTER_DATASHEET)).toEqual([])
  }).toPass({ timeout: 60_000 })
  asked.length = 0
  await add(page, 'Immortals')
  await expect(page.locator('[data-unit="Immortals"]').first()).toContainText(/\d+ pts/)
  expect(asked).not.toContain(PRICE)
})
