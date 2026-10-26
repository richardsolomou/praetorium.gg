import { expect, test } from './test'
import { createRoster, signUp, uniqueName, PHONE } from './account'

for (const width of [1440, 390]) {
  test(`factions stay visible with an older native download at ${width}px`, async ({ page }) => {
    test.setTimeout(240_000)
    await page.setViewportSize({ width, height: 844 })
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
    await expect.poll(() => page.evaluate(() => window.PraetoriumReferenceCache?.revision), { timeout: 180_000 }).not.toBe('old-reference')
    await expect(page.getByRole('textbox', { name: 'Find a faction' })).toBeVisible()
    const visibility = await page.evaluate(() => (window as typeof window & { factionVisibility: boolean[] }).factionVisibility)
    expect(visibility).toContain(true)
    expect(visibility).not.toContain(false)
    await page.screenshot({ path: test.info().outputPath(`refreshed-factions-${width}.png`) })
  })
}

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
    await expect(first.getByRole('status')).toContainText('Loading your roster')
    await first.screenshot({ path: test.info().outputPath('first-roster-loading.png') })
    await first.setViewportSize(PHONE)
    await expect(first.getByRole('status')).toContainText('Loading your roster')
    await first.screenshot({ path: test.info().outputPath('first-roster-loading-phone.png') })
    release()
    await expect(first.getByLabel('List name')).toHaveValue(name)
    await expect(first.getByRole('status').filter({ hasText: 'Loading your roster' })).toHaveCount(0)
  } finally {
    await opening.close()
  }
})

test('an unopened rule from an older download stays readable throughout hosted revalidation', async ({ page }) => {
  test.setTimeout(240_000)
  await page.goto('/rules/core-rules/moving')
  await expect.poll(() => page.evaluate(() => Boolean(window.PraetoriumReferenceCache)), { timeout: 180_000 }).toBe(true)
  const saved = await page.evaluate(() => {
    const reference = window.PraetoriumReferenceCache!
    const queries = reference.queries.filter(
      (entry) => entry.key[0] === 'rule-index' || entry.key.join('/') === 'rule-section/core-rules/moving',
    )
    const rule = queries.find((entry) => entry.key[0] === 'rule-section')!.data as { section: { title: string } }
    rule.section.title = 'Saved Moving'
    // A download the service still publishes answers without revalidating, so this one predates it.
    return { ...reference, revision: 'previous-reference', construction: undefined, queries, savedAt: 1 }
  })
  await page.addInitScript((reference) => {
    window.PraetoriumReferenceCache = reference
  }, saved)
  await page.goto('/')
  const { promise: held, resolve: release } = Promise.withResolvers<void>()
  await page.route('**/_serverFn/**', async (route) => {
    await held
    await route.continue()
  })
  await page.getByRole('navigation', { name: 'Reference' }).getByRole('link', { name: 'Rules', exact: true }).click()
  await page.locator('a[href="/rules/core-rules/moving"]').first().click()
  await expect(page.getByRole('heading', { name: 'Saved Moving', exact: true })).toBeVisible()
  await page.locator('main details summary').first().click()
  await page.screenshot({ path: test.info().outputPath('saved-rule-revalidating.png') })
  release()
  await expect(page.getByRole('heading', { name: '03. Moving', exact: true })).toBeVisible()
  await expect(page.locator('main details').first()).toHaveAttribute('open', '')
})
