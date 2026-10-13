import { expect, test } from './test'
import { signUp, uniqueName } from './account'

const rootSize = (page: import('@playwright/test').Page) => page.evaluate(() => getComputedStyle(document.documentElement).fontSize)

test('a chosen text size applies at once, before the app loads, and after a reload', async ({ page, browser }) => {
  await signUp(page, uniqueName('Reader'))
  await page.goto('/profile')
  const sizes = page.getByRole('group', { name: 'Text size' })
  await expect(sizes.getByRole('button', { name: /^Standard/ })).toHaveAttribute('aria-pressed', 'true')
  expect(await rootSize(page)).toBe('18px')

  await sizes.getByRole('button', { name: /^Larger/ }).click()
  await expect(sizes.getByRole('button', { name: /^Larger/ })).toHaveAttribute('aria-pressed', 'true')
  expect(await rootSize(page)).toBe('22px')

  await page.reload()
  await expect(page.getByRole('group', { name: 'Text size' }).getByRole('button', { name: /^Larger/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  expect(await rootSize(page)).toBe('22px')

  // The head script applies the size by itself: with the application's scripts blocked it still reads larger.
  const state = await page.context().storageState()
  const blocked = await browser.newContext({ storageState: state })
  const bare = await blocked.newPage()
  await bare.route(/\/assets\/.*\.js$/, (route) => route.abort())
  await bare.goto('/factions', { waitUntil: 'domcontentloaded' })
  expect(await rootSize(bare)).toBe('22px')
  await blocked.close()

  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  await page.screenshot({ path: 'test-results/text-size-larger-profile-390.png' })
  await page.goto('/factions/necrons')
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  await page.screenshot({ path: 'test-results/text-size-larger-faction-390.png' })

  await page.goto('/profile')
  await page
    .getByRole('group', { name: 'Text size' })
    .getByRole('button', { name: /^Standard/ })
    .click()
  expect(await rootSize(page)).toBe('18px')
  await page.reload()
  expect(await rootSize(page)).toBe('18px')
})
