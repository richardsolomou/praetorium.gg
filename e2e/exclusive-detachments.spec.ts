import { expect, test } from './test'
import { retryUntilVisible, signUp, chooseFaction } from './account'

for (const width of [390, 1280]) {
  test(`roster setup explains a detachment that shares a one-per-army limit at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await signUp(page, 'Dynasty')
    await page.goto('/rosters')
    const dialog = page.getByRole('dialog', { name: 'Create roster' })
    await retryUntilVisible(dialog, () => page.getByRole('button', { name: 'New roster', exact: true }).first().click())
    await chooseFaction(dialog, 'Necrons')
    await dialog.getByRole('combobox', { name: 'Battle size' }).click()
    await page.getByRole('option', { name: 'Onslaught · 3,000 points' }).click()
    await dialog.getByRole('button', { name: 'Select Awakened Dynasty', exact: true }).click()

    const unavailable = dialog.getByRole('button', { name: 'Select Hand of the Dynasty, unavailable' })
    await expect(unavailable).toHaveAttribute('aria-disabled', 'true')
    await unavailable.click({ force: true })
    await expect(page.getByRole('tooltip')).toHaveText(
      'An army can include only one Dynasty detachment, and this army already has Awakened Dynasty.',
    )
    await expect(dialog.getByRole('button', { name: 'Select Hand of the Dynasty', exact: true })).toHaveCount(0)
    await page.screenshot({ path: test.info().outputPath(`exclusive-detachments-${width}.png`) })

    await dialog.getByRole('button', { name: 'Select Awakened Dynasty', pressed: true }).click()
    await expect(dialog.getByRole('button', { name: 'Select Hand of the Dynasty', exact: true })).toBeEnabled()
  })
}
