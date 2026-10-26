import { expect, test } from './test'
import { retryUntilVisible, scrollSearchResultIntoView, nextFrames } from './account'

test('global search retains page shortcuts before a query is entered', async ({ page }) => {
  await page.goto('/search')
  await retryUntilVisible(page.getByRole('combobox'), () =>
    page.getByRole('button', { name: 'Search Praetorium', exact: true }).filter({ visible: true }).click(),
  )
  await expect(page.getByRole('option', { name: /^Home / })).toBeVisible()
  await page.getByRole('combobox').press('Enter')
  await expect(page).toHaveURL('/')
})

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
  const options = page.getByRole('option')
  await expect(options.first()).toHaveAttribute('aria-setsize', /[5-9]\d|\d{3,}/)
  expect(await options.count()).toBeLessThan(50)
  await page.getByRole('combobox').press('Control+End')
  const lastOption = page.getByRole('option', { selected: true })
  await expect(lastOption).toBeInViewport()
  const lastLabel = await lastOption.textContent()
  await page.screenshot({ path: test.info().outputPath('virtual-global-end.png') })
  await page.keyboard.press('Escape')
  const scroller = page.getByRole('region', { name: 'Search results' })
  expect(await scroller.getByRole('link').count()).toBeLessThan(50)
  await scroller.evaluate((element) => {
    element.parentElement!.scrollTop = element.parentElement!.scrollHeight
  })
  await expect(scroller.getByRole('link').last()).toHaveText(lastLabel!.trim())
  await page.screenshot({ path: test.info().outputPath('virtual-page-end.png') })
  await page.getByRole('searchbox', { name: 'Search Praetorium', exact: true }).fill('Awakened Dynasty')
  const detachments = page.getByRole('region', { name: 'Search results' })
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
  await scrollSearchResultIntoView(
    page,
    page
      .getByRole('main')
      .getByRole('link', { name: /Imotekh the Stormlord/ })
      .first(),
  )
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
  await scrollSearchResultIntoView(page, page.getByRole('option', { name: /Imotekh the Stormlord/ }).first())
  await expect(page.getByRole('option', { name: /Imotekh the Stormlord/ }).first()).toBeVisible()
  await page.screenshot({ path: test.info().outputPath('global-search.png') })
})

for (const width of [390, 1280]) {
  test(`enhancement and stratagem names open their detachment at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 })
    await page.goto('/search?q=Superior%20Creation')
    const result = page
      .getByRole('main')
      .getByRole('link', { name: /Auric Champions/ })
      .first()
    await expect(result).toBeVisible()
    await page.screenshot({ path: test.info().outputPath('enhancement-search.png') })
    await result.click()
    await expect(page.getByRole('heading', { name: 'Auric Champions', exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Superior Creation', exact: true })).toBeVisible()
    await retryUntilVisible(page.getByRole('combobox'), () =>
      page.getByRole('button', { name: 'Search Praetorium', exact: true }).filter({ visible: true }).click(),
    )
    await page.getByRole('combobox').fill('Superior Creation')
    await expect(page.getByRole('option', { name: /Auric Champions/ }).first()).toBeVisible()
    await page.getByRole('combobox').press('Enter')
    await expect(page.getByRole('dialog')).not.toBeVisible()
    await expect(page.getByRole('heading', { name: 'Auric Champions', exact: true })).toBeVisible()
    await page.goto('/search?q=Gilded%20Champion')
    await expect(
      page
        .getByRole('main')
        .getByRole('link', { name: /Auric Champions/ })
        .first(),
    ).toBeVisible()
    await retryUntilVisible(page.getByRole('combobox'), () =>
      page.getByRole('button', { name: 'Search Praetorium', exact: true }).filter({ visible: true }).click(),
    )
    await page.getByRole('combobox').fill('Gilded Champion')
    await expect(page.getByRole('option', { name: /Auric Champions/ }).first()).toBeVisible()
    await page.screenshot({ path: test.info().outputPath('stratagem-global.png') })
  })
}

// Game Datacards rules text is published only as tokens, so search matches stratagems by name rather than by what they say.
test('detachment rule and stratagem names, enhancement text, and weapon traits explain their matches', async ({ page }) => {
  for (const [query, reason] of [
    ['Assemblage of Might', 'Assemblage of Might detachment rule'],
    ['Duty Unto Death', 'Duty Unto Death stratagem'],
    ['Lone Operative Stealth', 'Shroud of the Hidden Blade enhancement'],
    ['Gilded Champion', 'Gilded Champion stratagem'],
  ] as const) {
    await page.goto(`/search?q=${encodeURIComponent(query)}`)
    const result = page
      .getByRole('main')
      .getByRole('link', { name: /Auric Champions/ })
      .first()
    await scrollSearchResultIntoView(page, result)
    await expect(result).toContainText(reason)
    await retryUntilVisible(page.getByRole('combobox'), () =>
      page.getByRole('button', { name: 'Search Praetorium', exact: true }).filter({ visible: true }).click(),
    )
    await page.getByRole('combobox').fill(query)
    const option = page.getByRole('option', { name: /Auric Champions/ }).first()
    await scrollSearchResultIntoView(page, option)
    await expect(option).toContainText(reason)
  }
  await page.goto('/search?q=Immortals%20Lethal%20Hits')
  const result = page
    .getByRole('main')
    .getByRole('link', { name: /Immortals/ })
    .first()
  await scrollSearchResultIntoView(page, result)
  await expect(result).toContainText('Lethal Hits weapon keyword')
  await retryUntilVisible(page.getByRole('combobox'), () =>
    page.getByRole('button', { name: 'Search Praetorium', exact: true }).filter({ visible: true }).click(),
  )
  await page.getByRole('combobox').fill('Immortals Lethal Hits')
  await expect(page.getByRole('option', { name: /Immortals/ }).first()).toContainText('Lethal Hits weapon keyword')
})

test('both searches debounce typing for 250 milliseconds and retain prior results', async ({ page }) => {
  await page.goto('/search?q=Superior%20Creation')
  const result = page
    .getByRole('main')
    .getByRole('link', { name: /Auric Champions/ })
    .first()
  await expect(result).toContainText('Superior Creation enhancement')
  await retryUntilVisible(page.getByRole('combobox'), () =>
    page.getByRole('button', { name: 'Search Praetorium', exact: true }).filter({ visible: true }).click(),
  )
  await page.getByRole('combobox').fill('Superior Creation')
  await expect(page.getByRole('option').first()).toContainText('Superior Creation enhancement')
  await page.clock.install()
  await page.getByRole('combobox').fill('Gilded Champion')
  await page.clock.runFor(200)
  await expect(page.getByRole('option').first()).toContainText('Superior Creation enhancement')
  await page.clock.runFor(100)
  await expect(page.getByRole('option').first()).toContainText('Gilded Champion stratagem')
  await page.keyboard.press('Escape')
  await page.getByRole('searchbox', { name: 'Search Praetorium', exact: true }).fill('Gilded Champion')
  await page.clock.runFor(200)
  await expect(result).toContainText('Superior Creation enhancement')
  await page.clock.runFor(100)
  await expect(result).toContainText('Gilded Champion stratagem')
})

test('search remembers opened results on this device until they are removed', async ({ page }) => {
  await page.goto('/search')
  const openSearch = () =>
    retryUntilVisible(page.getByRole('combobox'), () =>
      page.getByRole('button', { name: 'Search Praetorium', exact: true }).filter({ visible: true }).click(),
    )
  const recent = page.getByRole('region', { name: 'Recent' })
  for (const name of ['Immortals', 'Overlord']) {
    await openSearch()
    await page.getByRole('combobox').fill(name)
    await scrollSearchResultIntoView(page, page.getByRole('option', { name: new RegExp(name) }).first())
    await page
      .getByRole('option', { name: new RegExp(name) })
      .first()
      .click()
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible()
  }
  await page.reload()
  await openSearch()
  await expect(recent.getByRole('button', { name: /^(Immortals|Overlord)/ })).toHaveText([/^Overlord/, /^Immortals/])
  await recent.getByRole('button', { name: 'Remove Overlord from recent searches' }).click()
  await expect(recent.getByRole('button', { name: /^(Immortals|Overlord)/ })).toHaveText([/^Immortals/])
  // Removing an entry keeps a keyboard user's place on its neighbour.
  await expect(recent.getByRole('button', { name: /^Immortals/ })).toBeFocused()
  await page.screenshot({ path: test.info().outputPath('recent-searches.png') })
  await recent.getByRole('button', { name: /^Immortals/ }).click()
  await expect(page.getByRole('heading', { name: 'Immortals', exact: true })).toBeVisible()
  await page.goto('/search')
  await expect(
    page
      .getByRole('main')
      .getByRole('region', { name: 'Recent' })
      .getByRole('link', { name: /^Immortals/ }),
  ).toBeVisible()
  await page.getByRole('main').getByRole('button', { name: 'Clear' }).click()
  await expect(page.getByRole('region', { name: 'Recent' })).toHaveCount(0)
  await expect(page.getByRole('main').getByRole('searchbox', { name: 'Search Praetorium' })).toBeFocused()
})

for (const width of [390, 1280]) {
  test.describe(`resizing at ${width}px`, () => {
    test.use({ hasTouch: width === 390 })
    test(`search selection remains usable through resizing at ${width}px`, async ({ page }) => {
      const resizeErrors: string[] = []
      page.on('pageerror', (error) => {
        if (error.message.includes('ResizeObserver')) resizeErrors.push(error.message)
      })
      await page.setViewportSize({ width, height: 844 })
      await page.goto('/search?q=Necrons')
      const results = page.getByRole('region', { name: 'Search results' })
      await expect(results.getByRole('link').first()).toBeVisible()
      for (let cycle = 0; cycle < 3; cycle++) {
        for (const next of [390, 1280, 860, 600, 390, 1440]) {
          await page.setViewportSize({ width: next, height: cycle % 2 ? 500 : 844 })
          await nextFrames(page)
        }
      }
      await page.setViewportSize({ width, height: 844 })
      await retryUntilVisible(page.getByRole('combobox'), () =>
        page.getByRole('button', { name: 'Search Praetorium', exact: true }).filter({ visible: true }).click(),
      )
      const search = page.getByRole('combobox')
      await search.fill('Immortals')
      const option = page.getByRole('option', { name: /^Immortals/ }).first()
      await expect(option).toBeVisible()
      await page.screenshot({ path: test.info().outputPath('resized-global-search.png') })
      if (width === 390) await option.tap()
      else await search.press('Enter')
      await expect(page.getByRole('heading', { name: 'Immortals', exact: true })).toBeVisible()
      expect(resizeErrors).toEqual([])
    })
  })
}
