import { expect, test } from './test'
import { retryUntilVisible } from './account'

for (const token of ['preview-casual-strike-force', 'preview-tournament-battle-duel']) {
  test(`spectators inspect army loadouts in ${token}`, async ({ page }) => {
    await page.goto(`/battles/${token}`)
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 })
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
      const unit = army.locator('[data-army-list] [data-unit]').first()
      const select = unit.locator('button[aria-pressed]')
      await select.click()
      const loadout = army.locator('[data-army-loadout]')
      await expect(loadout.locator('[data-slot="unit-profile"]')).toBeVisible()
      await expect(loadout).toContainText('Equipped')
      // The roster editor's datasheet, detachment rules and keywords included.
      await expect(loadout.locator('[data-slot="datasheet-content"]')).toContainText('abilities')
      await expect(loadout.locator('[data-slot="datasheet-content"]')).toContainText(/Detachment rules/i)
      await expect(army.getByRole('button', { name: /^Mark .* destroyed$/ })).toHaveCount(0)
      await expect(loadout.getByRole('combobox')).toHaveCount(0)
      await expect(loadout.locator('[data-slot="scroll-area"]')).toHaveCount(0)
      const overflowing = await army.evaluate((element) =>
        [element, ...element.querySelectorAll('[data-slot="dialog-body"], [data-unit], [data-army-loadout]')].some(
          (node) => node.scrollWidth > node.clientWidth,
        ),
      )
      expect(overflowing).toBe(false)
      await page.screenshot({ path: test.info().outputPath(`army-loadout-${token}-${width}.png`) })
      const list = army.locator('[data-army-list]')
      const second = list.locator('[data-unit]').nth(1).locator('button[aria-pressed]')
      if (width >= 860) {
        // The army stays beside the datasheet, so changing unit neither scrolls nor reflows the list.
        await expect(list).toBeVisible()
        const secondBefore = (await second.boundingBox())!
        await second.click()
        await expect(second).toHaveAttribute('aria-pressed', 'true')
        await expect(select).toHaveAttribute('aria-pressed', 'false')
        await expect(loadout).toHaveCount(1)
        await expect(army.locator('[data-army-detail] [data-unit]')).toHaveCount(0)
        await expect(loadout.locator('[data-slot="unit-profile"]')).toBeVisible()
        await expect.poll(async () => Math.abs((await second.boundingBox())!.y - secondBefore.y)).toBeLessThan(2)
        await page.keyboard.press('Escape')
        await expect(army).toBeHidden()
      } else {
        // A compact screen shows only the datasheet in place of the list, and goes back to it from the header.
        await expect(list).toBeHidden()
        await expect(army.locator('[data-army-detail] [data-unit]')).toHaveCount(0)
        await army.getByRole('button', { name: /^Back to / }).click()
        await expect(list).toBeVisible()
        await expect(loadout).toHaveCount(0)
        await expect(select).toBeInViewport()
        await army.getByRole('button', { name: 'Close', exact: true }).click()
        await expect(army).toBeHidden()
      }
    }
  })
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
  await expect(army.locator('[data-army-list] [data-unit="Ghazghkull Thraka"]')).toContainText('Mork’s Roar')
  await expect(army.getByRole('button', { name: 'Close' })).toBeEnabled()
})
