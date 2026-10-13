import { expect, test } from './test'
import { retryUntilVisible } from './account'

for (const width of [390, 1280]) {
  test(`browser unit search opens datasheets and preserves the query at ${width}px`, async ({ page, request }) => {
    await page.setViewportSize({ width, height: 844 })
    const response = await request.get('/search?q=Immortals')
    expect(await response.text()).toMatch(/href="[^"]*\/datasheets\/immortals"/)
    await page.goto('/search?q=Immortals')
    const search = page.getByRole('searchbox', { name: 'Search Praetorium', exact: true })
    await expect(search).toHaveValue('Immortals')
    const result = page
      .getByRole('main')
      .getByRole('link', { name: /Immortals/ })
      .first()
    await expect(result).toBeVisible()
    await page.screenshot({ path: test.info().outputPath('search-page.png'), fullPage: true })
    await result.click()
    await expect(page.getByRole('heading', { name: 'Immortals', exact: true })).toBeVisible()
    await page.goBack()
    await expect(search).toHaveValue('Immortals')
    await page.reload()
    await expect(result).toBeVisible()
    await expect(async () => {
      await search.fill('')
      await search.fill('Overlord')
      await expect(page).toHaveURL(/\/search\?q=Overlord$/, { timeout: 1_000 })
    }).toPass()
    await expect(page).toHaveURL(/\/search\?q=Overlord$/)
    await expect(
      page
        .getByRole('main')
        .getByRole('link', { name: /Overlord/ })
        .first(),
    ).toBeVisible()
    await page.reload()
    await expect(search).toHaveValue('Overlord')
    await search.fill('zzzzzzzzzzzzzz')
    await expect(page.getByRole('heading', { name: 'No results found' })).toBeVisible()
    await search.fill('')
    await expect(page.getByText('Enter at least two characters to search.')).toBeVisible()
  })
}

test('browser search decodes unit names and offers typo matches', async ({ page }) => {
  await page.goto(`/search?q=${encodeURIComponent("C'tan Shard of the Nightbringer")}`)
  await expect(
    page
      .getByRole('main')
      .getByRole('link', { name: /C'tan Shard of the Nightbringer/ })
      .first(),
  ).toBeVisible()
  await page.goto('/search?q=Immortls')
  await expect(page.getByRole('heading', { name: 'Close matches' })).toBeVisible()
  await expect(
    page
      .getByRole('main')
      .getByRole('link', { name: /Immortals/ })
      .first(),
  ).toBeVisible()
  const search = page.getByRole('searchbox', { name: 'Search Praetorium', exact: true })
  await search.fill('')
  await search.pressSequentially("C'tan Shard of the Nightbringer", { delay: 30 })
  await expect(search).toHaveValue("C'tan Shard of the Nightbringer")
  await expect(
    page
      .getByRole('main')
      .getByRole('link', { name: /C'tan Shard of the Nightbringer/ })
      .first(),
  ).toBeVisible()
})

test('the search page shows the same results as global autocomplete', async ({ page }) => {
  await page.goto('/search?q=Necrons')
  await expect(page.getByRole('heading', { name: 'Factions', exact: true })).toBeVisible()
  await expect(
    page
      .getByRole('main')
      .getByRole('link', { name: /^Necrons/ })
      .first(),
  ).toBeVisible()
  await retryUntilVisible(page.getByRole('combobox'), () =>
    page.getByRole('button', { name: 'Search Praetorium', exact: true }).filter({ visible: true }).click(),
  )
  await page.getByRole('combobox').fill('Necrons')
  await expect(page.getByRole('option').first()).toBeVisible()
  await expect(
    page
      .getByRole('option')
      .filter({ has: page.locator('[data-faction-mark]') })
      .first(),
  ).toBeVisible()
  const labels = await page
    .getByRole('option')
    .filter({ hasNotText: /^Show more/ })
    .allTextContents()
  const options = page
    .locator('[data-slot="command-group"]')
    .filter({ has: page.locator('[cmdk-group-heading]').filter({ hasText: /^Datasheets$/ }) })
    .getByRole('option')
    .filter({ has: page.locator('[data-faction-mark]') })
  await expect(options).toHaveCount(50)
  await page.getByRole('option', { name: 'Show more datasheets', exact: true }).click()
  await expect(options).toHaveCount(52)
  await page.keyboard.press('Escape')
  const results = await page.getByRole('main').getByRole('link').allTextContents()
  expect(results.map((text) => text.trim())).toEqual(labels.map((text) => text.trim()))
  await expect(page.getByRole('main').locator('[data-faction-mark]').first()).toBeVisible()
  const datasheets = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Datasheets', exact: true }) })
  await expect(datasheets.getByRole('link')).toHaveCount(50)
  await page.getByRole('button', { name: 'Show more datasheets', exact: true }).click()
  await expect(datasheets.getByRole('link')).toHaveCount(52)
  await page.getByRole('searchbox', { name: 'Search Praetorium', exact: true }).fill('Awakened Dynasty')
  const detachments = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Detachments', exact: true }) })
  await expect(detachments.locator('[data-faction-mark]').first()).toBeVisible()
  await page.screenshot({ path: test.info().outputPath('detachment-page.png') })
  await retryUntilVisible(page.getByRole('combobox'), () =>
    page.getByRole('button', { name: 'Search Praetorium', exact: true }).filter({ visible: true }).click(),
  )
  await page.getByRole('combobox').fill('Awakened Dynasty')
  await expect(page.getByRole('option', { name: /Awakened Dynasty/ }).locator('[data-faction-mark]')).toBeVisible()
  await page.screenshot({ path: test.info().outputPath('detachment-global.png') })
  await page.keyboard.press('Escape')
  await page.getByRole('searchbox', { name: 'Search Praetorium', exact: true }).fill('Factions')
  await expect(page.getByRole('heading', { name: 'Pages', exact: true })).toBeVisible()
  await expect(
    page
      .getByRole('main')
      .getByRole('link', { name: /Factions/ })
      .first(),
  ).toBeVisible()
})

test('both searches find command-phase CP abilities', async ({ page }) => {
  await page.goto('/search?q=gain%201cp')
  await expect(
    page
      .getByRole('main')
      .getByRole('link', { name: /Imotekh the Stormlord/ })
      .first(),
  ).toBeVisible()
  await expect(async () => {
    const search = page.getByRole('searchbox', { name: 'Search Praetorium', exact: true })
    await search.fill('')
    await search.fill('gain 1 CP command phase')
    await expect.poll(() => new URL(page.url()).searchParams.get('q'), { timeout: 1_000 }).toBe('gain 1 CP command phase')
    await expect(search).toHaveValue('gain 1 CP command phase')
  }).toPass()
  await expect(
    page
      .getByRole('main')
      .getByRole('link', { name: /Imotekh the Stormlord/ })
      .first(),
  ).toBeVisible()
  await retryUntilVisible(page.getByRole('combobox'), () =>
    page.getByRole('button', { name: 'Search Praetorium', exact: true }).filter({ visible: true }).click(),
  )
  await page.getByRole('combobox').fill('gain 1cp')
  await expect(page.getByRole('option', { name: /Imotekh the Stormlord/ }).first()).toBeVisible()
  await page.screenshot({ path: test.info().outputPath('global-search.png') })
})
