import { expect, test, type Page } from './test'
import manifest from '../package.json' with { type: 'json' }
import { expectNoHorizontalOverflow } from './builder.harness'

/** The page fits a phone as well as the desktop the journey runs at. */
async function fitsEachWidth(page: Page) {
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await expectNoHorizontalOverflow(page.locator('main'))
  }
}

test('release and data update pages share navigation and preserve history', { tag: '@catalogue' }, async ({ page }) => {
  await page.goto(`/whats-new#release-${manifest.version}`)
  const navigation = page.getByRole('navigation', { name: 'Updates', exact: true })
  await expect(navigation.getByRole('link', { name: "What's new", exact: true })).toHaveAttribute('aria-current', 'page')
  const current = page.locator(`[id="release-${manifest.version}"]`)
  await expect(current).toBeVisible()
  await fitsEachWidth(page)
  await page.screenshot({ path: test.info().outputPath('whats-new.png') })

  await navigation.getByRole('link', { name: 'Data updates', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Data updates', exact: true })).toBeVisible()
  await expect(navigation.getByRole('link', { name: 'Data updates', exact: true })).toHaveAttribute('aria-current', 'page')
  const closed = page.locator('main details:not([open])').first()
  await expect(closed).toBeVisible()
  const anchor = (await closed.getAttribute('id'))!
  const row = page.locator(`[id="${anchor}"]`)
  await fitsEachWidth(page)
  await page.screenshot({ path: test.info().outputPath('data-updates.png') })

  await row.locator('summary').click()
  await expect(row).toHaveAttribute('open', '')
  await expect(row.locator('[data-factions]').first()).toBeVisible()
  await fitsEachWidth(page)
  await page.screenshot({ path: test.info().outputPath('data-update-open.png') })
  await page.getByRole('link', { name: 'Older updates', exact: true }).press('Enter')
  await expect(page).toHaveURL(/\/data-updates\?before=/)
  await expect(navigation.getByRole('link', { name: 'Data updates', exact: true })).toHaveAttribute('aria-current', 'page')
  await fitsEachWidth(page)
  await page.getByRole('link', { name: 'Newest updates', exact: true }).click()
  await expect(page).toHaveURL('/data-updates')
  await navigation.getByRole('link', { name: "What's new", exact: true }).click()
  await expect(page.locator('main h2[id^="released-"]').first()).toBeVisible()
  await expect(navigation.getByRole('link', { name: "What's new", exact: true })).toHaveAttribute('aria-current', 'page')
})
