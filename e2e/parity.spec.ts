import { expect, test, type Page } from '@playwright/test'
import { advance, attachRoster, createBattle, createRoster, setupStep, signUp, takeTheTurn, uniqueName, waitForRosterSave } from './account'

test('solo battle controls survive completion, reopen and deletion', async ({ page }) => {
  const player = uniqueName('Solo')
  await signUp(page, player)
  const firstRoster = await createRoster(page, { faction: 'Necrons', detachment: /Awakened Dynasty/, name: 'First roster' })
  await page.getByLabel('Add a unit').fill('Immortals')
  await waitForRosterSave(page, () => page.getByRole('button', { name: 'Add Immortals', exact: true }).first().click())
  await createBattle(page, { solo: true })
  await attachRoster(page, firstRoster)
  await setupStep(page, 'Battlefield')
  await page.getByRole('button', { name: 'Select layout A: Tipping Point' }).click()
  await expect(page.getByRole('button', { name: 'Selected layout A: Tipping Point' })).toBeVisible()
  await setupStep(page, 'First turn')
  await page.getByRole('button', { name: 'Start battle' }).click()
  await takeTheTurn(page)
  await expect(page.getByRole('heading', { name: 'command phase' })).toBeVisible()
  await endBattle(page, 'Finish early')
  await expect(page.getByRole('heading', { name: /Final score/ })).toBeVisible()
  await page.getByRole('button', { name: 'Battle options' }).click()
  await page.getByRole('menuitem', { name: 'Reopen battle' }).click()
  await expect(page.getByRole('button', { name: /End the .+ phase/ })).toBeVisible()

  for (let step = 0; step < 30; step++) await advance(page)
  await expect(page.getByText('Result', { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: /Final score/ })).toBeVisible()

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

  await page.getByRole('button', { name: 'Actions for Shareable roster' }).click()
  await page.getByRole('menuitem', { name: 'Share unlisted link' }).click()
  await expect(page.getByText('Unlisted')).toBeVisible()
  const sharedUrl = await page.evaluate(() => navigator.clipboard.readText())
  expect(sharedUrl).toMatch(/\/rosters\/[^/]+$/)
  const anonymous = await (await browser.newContext()).newPage()
  await anonymous.goto(sharedUrl)
  await expect(anonymous.getByRole('heading', { name: 'Shareable roster' })).toBeVisible()

  await page.getByRole('button', { name: 'Actions for Shareable roster' }).click()
  await page.getByRole('menuitem', { name: 'Make private' }).click()
  await expect(page.getByText('Private')).toBeVisible()
  await anonymous.reload()
  await expect(anonymous.getByRole('heading', { name: 'Nothing here' })).toBeVisible()
})

/** Ending and deleting live behind the battle menu, each behind its own confirmation. */
async function endBattle(page: Page, label: string) {
  await page.getByRole('button', { name: 'Battle options' }).click()
  await page.getByRole('menuitem', { name: label }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: label }).click()
}
