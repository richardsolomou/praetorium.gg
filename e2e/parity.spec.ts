import { expect, test, type Page } from '@playwright/test'
import {
  advance,
  attachRoster,
  createBattle,
  createRoster,
  PRACTICE_OPPONENT,
  recordFirstTurn,
  setupStep,
  signUp,
  takeTheTurn,
  uniqueName,
  waitForRosterSave,
} from './account'

test('practice battle controls survive completion, reopen and deletion', async ({ page }) => {
  const player = uniqueName('Practice')
  await signUp(page, player)
  const firstRoster = await createRoster(page, { faction: 'Necrons', detachment: /Awakened Dynasty/, name: 'First roster' })
  await page.getByLabel('Add a unit').fill('Immortals')
  await waitForRosterSave(page, () => page.getByRole('button', { name: 'Add Immortals', exact: true }).first().click())
  await createBattle(page, { practice: true })
  await attachRoster(page, firstRoster)
  await attachRoster(page, firstRoster, { forPlayer: PRACTICE_OPPONENT })
  await setupStep(page, 'Battlefield')
  await page.getByRole('button', { name: 'Select layout A: Tipping Point' }).click()
  await expect(page.getByRole('button', { name: 'Selected layout A: Tipping Point' })).toBeVisible()
  await recordFirstTurn(page)
  await page.getByRole('button', { name: 'Start battle' }).click()
  await takeTheTurn(page)
  await expect(page.getByRole('heading', { name: 'command phase' })).toBeVisible()
  await endBattle(page, 'Finish early')
  // Two sides, so the result reads as a scoreline rather than one side's total.
  await expect(page.getByRole('heading', { name: /Drawn at|win/ })).toBeVisible()
  await page.getByRole('button', { name: 'Battle options' }).click()
  await page.getByRole('menuitem', { name: 'Reopen battle' }).click()
  await expect(page.getByRole('button', { name: /End the .+ phase/ })).toBeVisible()

  // Both sides take every round now, and the count follows the mission pack, so this
  // runs the battle out rather than assuming how many phases that is.
  const result = page.getByRole('heading', { name: /Drawn at|win/ })
  for (let step = 0; step < 80 && !(await result.isVisible().catch(() => false)); step++) await advance(page)
  await expect(page.getByText('Result', { exact: true })).toBeVisible()
  await expect(result).toBeVisible()

  await endBattle(page, 'Delete battle')
  await expect(page).toHaveURL('/battles')
  await expect(page.getByText('No battles yet.')).toBeVisible()
})

test('a private roster can be shared and made private again', async ({ browser }) => {
  const context = await browser.newContext()
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  const page = await context.newPage()
  await signUp(page, uniqueName('Sharer'))
  await createRoster(page, { faction: 'Necrons', detachment: /Awakened Dynasty/, name: 'Shareable roster' })
  await page.goto('/rosters')

  // Scoped to the row, because 'Unlisted' and 'Private' also appear in the menu
  // items that change them and would otherwise match before the change lands.
  const row = page.locator('[data-roster="Shareable roster"]')

  await page.getByRole('button', { name: 'Actions for Shareable roster' }).click()
  await page.getByRole('menuitem', { name: 'Share unlisted link' }).click()
  await expect(row.getByText('Unlisted')).toBeVisible()
  // Polled, because the link is copied only once the visibility change comes back.
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toMatch(/\/rosters\/[^/]+$/)
  const sharedUrl = await page.evaluate(() => navigator.clipboard.readText())
  const anonymous = await (await browser.newContext()).newPage()
  await anonymous.goto(sharedUrl)
  await expect(anonymous.getByRole('textbox', { name: 'List name' })).toHaveValue('Shareable roster')

  await page.getByRole('button', { name: 'Actions for Shareable roster' }).click()
  await page.getByRole('menuitem', { name: 'Make private' }).click()
  await expect(row.getByText('Private')).toBeVisible()
  await anonymous.reload()
  await expect(anonymous.getByRole('heading', { name: 'Nothing here' })).toBeVisible()
})

/** Ending and deleting live behind the battle menu, each behind its own confirmation. */
async function endBattle(page: Page, label: string) {
  await page.getByRole('button', { name: 'Battle options' }).click()
  await page.getByRole('menuitem', { name: label }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: label }).click()
}
