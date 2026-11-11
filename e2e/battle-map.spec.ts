import { expect, test, type Page } from './test'
import { createRoster, retryUntilVisible, signUp, startBattle, practiceBattle, concede, PHONE } from './account'

async function inspectMap(page: Page) {
  const trigger = page.getByRole('button', { name: /^View .+ battlefield$/ })
  const dialog = page.getByRole('dialog')
  await retryUntilVisible(dialog, () => trigger.click())
  const map = dialog.locator('svg[aria-label$="battlefield map"]')
  await expect(map).toBeVisible()
  await expect.poll(() => map.locator('polygon').count()).toBeGreaterThan(2)
  // The phone sheet slides in, so its bounds only hold once it has arrived.
  await dialog.evaluate((element) => Promise.all(element.getAnimations({ subtree: true }).map((animation) => animation.finished)))
  await expect(dialog.getByRole('group', { name: 'Measurements to show' })).toBeVisible()
  await expect.poll(() => map.locator('[marker-end]').count()).toBeGreaterThan(0)
  expect(
    await dialog.evaluate((element) => {
      const panel = element.getBoundingClientRect()
      return panel.top >= 0 && panel.bottom <= innerHeight
    }),
  ).toBe(true)
  await page.screenshot({ path: test.info().outputPath(`battle-map-${page.viewportSize()?.width}.png`) })
  await dialog.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(dialog).toBeHidden()
  await expect(trigger).toBeFocused()
}

test('players and spectators open the saved battlefield with its measurements', async ({ page, browser }) => {
  await signUp(page, 'Battlefield viewer')
  const roster = await createRoster(page, { faction: 'Space Marines', detachment: /Gladius Task Force/, name: 'Map army' })
  await practiceBattle(page, roster)
  await startBattle(page)
  await inspectMap(page)
  await page.setViewportSize(PHONE)
  await page.getByRole('tab', { name: 'Battle', exact: true }).click()
  await inspectMap(page)
  await concede(page)
  await expect(page.getByRole('navigation', { name: 'Battle replay timeline' })).toBeVisible()
  await inspectMap(page)

  const context = await browser.newContext()
  try {
    const spectator = await context.newPage()
    await spectator.goto(page.url())
    await inspectMap(spectator)
  } finally {
    await context.close()
  }
})
