import { expect, test, type Page } from './test'
import { createRoster, retryUntilVisible, signUp, startBattle, practiceBattle, concede, PHONE } from './account'

async function inspectMap(page: Page) {
  const trigger = page.getByRole('button', { name: /^View .+ battlefield$/ })
  const dialog = page.getByRole('dialog')
  await retryUntilVisible(dialog, () => trigger.click())
  const map = dialog.locator('svg[aria-label$="battlefield map"]')
  await expect(map).toBeVisible()
  await expect.poll(() => map.locator('polygon').count()).toBeGreaterThan(2)
  await expect(map.locator('[marker-end]')).toHaveCount(0)
  expect(
    await map.evaluate((element) => {
      const board = element.getBoundingClientRect()
      const panel = element.closest('[role="dialog"]')!.getBoundingClientRect()
      return board.top >= panel.top && board.bottom <= panel.bottom && panel.top >= 0 && panel.bottom <= innerHeight
    }),
  ).toBe(true)
  await page.screenshot({ path: test.info().outputPath(`battle-map-${page.viewportSize()?.width}.png`) })
  await dialog.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(dialog).toBeHidden()
  await expect(trigger).toBeFocused()
}

test('players and spectators open the saved battlefield as a full-board map', async ({ page, browser }) => {
  await signUp(page, 'Battlefield viewer')
  const roster = await createRoster(page, { faction: 'Space Marines', detachment: /Gladius Task Force/, name: 'Map army' })
  await practiceBattle(page, roster)
  await startBattle(page)
  await inspectMap(page)
  await page.setViewportSize(PHONE)
  await page.getByRole('tab', { name: 'Battle', exact: true }).click()
  await inspectMap(page)
  await concede(page)
  await expect(page.getByText('Battle replay', { exact: true })).toBeVisible()
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
