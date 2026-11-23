import { expect, test } from './test'
import { createRoster, signUp, uniqueName, PHONE } from './account'
import { saveOlderMovingRule, downloadOfflineAppAtOnce, waitForOfflineApp } from './offline'

test(`factions stay visible with an older native download`, async ({ page }) => {
  test.setTimeout(240_000)
  await page.addInitScript(() => {
    window.PraetoriumReferenceCache = {
      version: 1,
      savedAt: 1,
      revision: 'old-reference',
      css: '',
      logo: '',
      queries: [{ key: ['faction-index'], data: { revision: 'old', factions: [] } }],
      search: { factions: [], detachments: [], datasheets: [], missions: [], rules: [] },
    }
    const states: boolean[] = []
    Object.assign(window, { factionVisibility: states })
    // A slow server streams the search field ahead of the list, so the parser can stop between them.
    new MutationObserver(() => {
      if (document.readyState !== 'loading' && document.querySelector('input[placeholder="Find a faction"]'))
        states.push(Boolean(document.querySelector('main a[href^="/factions/"]')))
    }).observe(document, { childList: true, subtree: true })
  })
  await page.goto('/factions')
  await expect(page.locator('[data-faction="Chaos Daemons"]')).toBeVisible()
  // The page reads only what it saved itself, so the injected download is replaced by a complete one.
  await expect.poll(() => page.evaluate(() => window.PraetoriumReferenceCache?.version), { timeout: 180_000 }).toBe(2)
  await expect(page.getByRole('textbox', { name: 'Find a faction' })).toBeVisible()
  const visibility = await page.evaluate(() => (window as typeof window & { factionVisibility: boolean[] }).factionVisibility)
  expect(visibility).toContain(true)
  expect(visibility).not.toContain(false)
  await page.screenshot({ path: test.info().outputPath(`refreshed-factions.png`) })
})

test('a first roster open shows progress until the army is ready', async ({ page, context, browser }) => {
  await signUp(page, uniqueName('Roster loading'))
  const name = await createRoster(page, { faction: 'Necrons', detachment: /Awakened Dynasty/, name: 'First open' })
  const opening = await browser.newContext({ storageState: await context.storageState() })
  const first = await opening.newPage()
  try {
    await first.goto('/rosters')
    const roster = first.locator(`[data-roster="${name}"]`)
    await expect(roster).toBeVisible()
    const { promise: held, resolve: release } = Promise.withResolvers<void>()
    await first.route('**/_serverFn/**', async (route) => {
      await held
      await route.continue()
    })
    await roster.getByRole('link').first().click()
    await expect(first.getByRole('status', { name: 'Loading', exact: true })).toBeVisible()
    await first.screenshot({ path: test.info().outputPath('first-roster-loading.png') })
    await first.setViewportSize(PHONE)
    await expect(first.getByRole('status', { name: 'Loading', exact: true })).toBeVisible()
    await first.screenshot({ path: test.info().outputPath('first-roster-loading-phone.png') })
    release()
    await expect(first.getByLabel('List name')).toHaveValue(name)
    await expect(first.getByRole('status', { name: 'Loading', exact: true })).toHaveCount(0)
  } finally {
    await opening.close()
  }
})

test('an unopened rule from an older download stays readable throughout hosted revalidation', async ({ page }) => {
  await downloadOfflineAppAtOnce(page)
  test.setTimeout(240_000)
  await page.goto('/rules/core-rules/moving')
  await waitForOfflineApp(page)
  // A download the service still publishes answers without revalidating, so this one predates it.
  await saveOlderMovingRule(page, 'Saved Moving')
  // Later pages wait as a player's do, so the older download is still the one saved when the rule opens.
  await page.addInitScript(() => {
    delete window.PraetoriumOfflineDownloadDelayMs
  })
  await page.goto('/')
  const { promise: held, resolve: release } = Promise.withResolvers<void>()
  await page.route('**/_serverFn/**', async (route) => {
    await held
    await route.continue()
  })
  await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Rules', exact: true }).click()
  await page.locator('a[href="/rules/core-rules/moving"]').first().click()
  await expect(page.getByRole('heading', { name: 'Saved Moving', exact: true })).toBeVisible()
  // The download carries the summaries too, so the rule reads while the service is held and after it answers.
  const summary = page.locator('main [data-rule-summary]').first()
  await expect(summary).toBeVisible()
  await page.screenshot({ path: test.info().outputPath('saved-rule-revalidating.png') })
  release()
  await expect(page.getByRole('heading', { name: '03. Moving', exact: true })).toBeVisible()
  await expect(summary).toBeVisible()
})
