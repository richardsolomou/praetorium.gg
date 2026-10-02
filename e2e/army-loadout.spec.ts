import { expect, test } from '@playwright/test'
import { retryUntilVisible } from './account'

for (const width of [390, 1440]) {
  for (const token of ['preview-casual-strike-force', 'preview-league-battle-duel']) {
    test(`spectators inspect army loadouts in ${token} at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.goto(`/battles/${token}`)
      await expect(page.locator('a[href*="?battle="]')).toHaveCount(0)
      const open = page.getByRole('button', { name: /^Open / }).first()
      await expect(open).toHaveText('Army')
      const army = page.locator('[data-army-roster]')
      await retryUntilVisible(army, () => open.click())
      await expect(army.getByRole('button', { name: /^Simulate/ })).toHaveCount(0)
      if (width < 860) {
        await expect.poll(async () => (await army.boundingBox())?.x).toBe(0)
        const bounds = (await army.boundingBox())!
        expect(bounds.y).toBe(0)
        expect(bounds.width).toBe(width)
        expect(bounds.y + bounds.height).toBe((await page.locator('[data-native-app-tabs]').boundingBox())!.y)
      }
      const unit = army.locator('[data-unit]').first()
      const select = unit.locator('button[aria-pressed]')
      await select.click()
      const loadout = army.locator('[data-army-loadout]')
      await expect(loadout.locator('[data-slot="unit-profile"]')).toBeVisible()
      await expect(loadout).toContainText('Equipped')
      await expect(loadout.locator('[data-slot="datasheet-content"]')).toHaveCount(0)
      await expect(loadout.locator('[data-army-abilities]')).toContainText('abilities')
      await expect(loadout.getByRole('heading', { name: 'Attachments', exact: true })).toHaveCount(0)
      await expect(army.getByRole('button', { name: /^Mark .* lost$/ })).toHaveCount(0)
      await expect(loadout.getByRole('combobox')).toHaveCount(0)
      await expect(loadout.locator('[data-slot="scroll-area"]')).toHaveCount(0)
      const overflowing = await army.evaluate((element) =>
        [element, ...element.querySelectorAll('[data-unit], [data-army-loadout]')].some((node) => node.scrollWidth > node.clientWidth),
      )
      expect(overflowing).toBe(false)
      await page.screenshot({ path: `test-results/army-loadout-${token}-${width}.png` })
      await army.evaluate((element) => {
        const details = element.querySelector('[data-army-loadout]')!.getBoundingClientRect()
        element.scrollTop += details.top - element.getBoundingClientRect().top + details.height / 2
      })
      const header = army.locator('[data-army-unit-header]').first()
      await expect(select).toBeInViewport()
      const dialogBounds = (await army.boundingBox())!
      const headerBounds = (await header.boundingBox())!
      expect(headerBounds.y).toBeGreaterThanOrEqual(dialogBounds.y)
      expect(headerBounds.y + headerBounds.height).toBeLessThanOrEqual(dialogBounds.y + dialogBounds.height)
      await page.screenshot({ path: `test-results/army-loadout-sticky-${token}-${width}.png` })
      await select.click()
      await expect(loadout).toHaveCount(0)
      await expect(select).toBeInViewport()
      await select.click()
      await expect(loadout.locator('[data-slot="unit-profile"]')).toBeVisible()
      const second = army.locator('[data-unit]').nth(1).locator('button[aria-pressed]')
      await second.scrollIntoViewIfNeeded()
      const secondBefore = (await second.boundingBox())!
      await second.click()
      await expect(select).toHaveAttribute('aria-pressed', 'true')
      await expect(second).toHaveAttribute('aria-pressed', 'true')
      await expect(loadout).toHaveCount(2)
      await expect(loadout.nth(1).locator('[data-slot="unit-profile"]')).toBeVisible()
      await expect.poll(async () => Math.abs((await second.boundingBox())!.y - secondBefore.y)).toBeLessThan(2)
      await page.screenshot({ path: `test-results/army-loadout-independent-${token}-${width}.png` })
      await select.click()
      await expect(loadout).toHaveCount(1)
      await expect(second).toHaveAttribute('aria-pressed', 'true')
      await expect(select).toBeInViewport()
    })
  }
}

test('an unavailable loadout leaves the frozen army readable', async ({ page }) => {
  await page.goto('/battles/preview-casual-strike-force')
  const army = page.locator('[data-army-roster]')
  await retryUntilVisible(army, () => page.getByRole('button', { name: 'Open Taktikal Stompa 2K' }).click())
  await page.route('**/_serverFn/**', async (route) => {
    if (route.request().method() === 'POST') await route.abort()
    else await route.continue()
  })
  await army.getByRole('button', { name: 'Ghazghkull Thraka', exact: true }).click()
  await expect(army.getByRole('alert')).toContainText('This loadout could not be loaded')
  await expect(army.locator('[data-unit="Ghazghkull Thraka"]')).toContainText('Mork’s Roar')
  await expect(army.getByRole('button', { name: 'Close' })).toBeEnabled()
})
