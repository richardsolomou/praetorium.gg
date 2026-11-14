import { expect, test, type Page } from './test'
import { PHONE, addUnit, advanceButton, createRoster, playerPanel, practiceBattle, signUp, startBattle } from './account'
import { closePicker, openBuilder } from './builder.harness'

/**
 * Pictures of the screens players open most on a phone, compared with baselines. The overflow
 * checks elsewhere catch a page that scrolls sideways; these catch clipping, overlap and broken
 * stacking that stay inside the screen.
 */

/**
 * Compares the phone viewport with its baseline, masking the clocks and dates that differ on every run. Only the
 * viewport: a full page stamps the fixed navigation mid-page and takes in data a catalogue update changes.
 */
async function expectPhoneScreen(page: Page, name: string) {
  await expect(page).toHaveScreenshot(name, {
    mask: [page.locator('time'), page.locator('.readout').filter({ hasText: /^[\d–]+:[\d:–]+$/ })],
  })
}

test('a battle in progress keeps its layout on a phone', async ({ page }) => {
  await signUp(page, 'Phone Player')
  const roster = await createRoster(page, { faction: 'Necrons', detachment: /Awakened Dynasty/, name: 'Phone roster' })
  await practiceBattle(page, roster)
  await startBattle(page, undefined, true, ['Cleanse', 'Centre Ground'])
  await page.setViewportSize(PHONE)
  await page.reload()
  await expect(advanceButton(page)).toBeVisible()
  await expect(playerPanel(page, 0).locator('[data-secondary]')).toHaveCount(2)
  await expectPhoneScreen(page, 'battle.png')
})

test('the roster builder keeps its layout on a phone', async ({ page }) => {
  await openBuilder(page)
  await addUnit(page, 'Immortals')
  await addUnit(page, 'Necron Warriors')
  await page.setViewportSize(PHONE)
  await page.reload()
  await closePicker(page)
  await expect(page.locator('[data-unit="Necron Warriors"]')).toBeVisible()
  await expect(page.locator('[data-roster-builder]')).toHaveAttribute('data-saving', 'false')
  await expectPhoneScreen(page, 'roster-builder.png')
})

test('a datasheet keeps its layout on a phone', async ({ page }) => {
  await page.setViewportSize(PHONE)
  await page.goto('/factions/space-marines/datasheets/eradicator-squad-with-melta-rifles')
  await page.waitForLoadState('networkidle')
  await expect(page.locator('tbody[aria-label="melta rifle profiles"]')).toBeVisible()
  await expectPhoneScreen(page, 'datasheet.png')
})
