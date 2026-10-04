import { expect, test, type Page } from '@playwright/test'
import { attachRoster, createBattle, createRoster, PRACTICE_OPPONENT, signUp, startBattle } from './account'

async function inspectMap(page: Page) {
  const trigger = page.getByRole('button', { name: /^View .+ battlefield$/ })
  await trigger.click()
  const dialog = page.getByRole('dialog')
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
  await page.screenshot({ path: `test-results/battle-map-${page.viewportSize()?.width}.png` })
  await dialog.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(dialog).toBeHidden()
  await expect(trigger).toBeFocused()
}

test('players and spectators open the saved battlefield as a full-board map', async ({ page, browser }) => {
  await signUp(page, 'Battlefield viewer')
  const roster = await createRoster(page, { faction: 'Space Marines', detachment: /Gladius Task Force/, name: 'Map army' })
  await createBattle(page, { practice: true })
  await attachRoster(page, roster)
  await attachRoster(page, roster, { forPlayer: PRACTICE_OPPONENT })
  await startBattle(page)
  await inspectMap(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('tab', { name: 'Battle', exact: true }).click()
  await inspectMap(page)
  await page.getByRole('button', { name: 'Battle options' }).click()
  await page.getByRole('menuitem', { name: 'Concede battle', exact: true }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Concede battle', exact: true }).click()
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
