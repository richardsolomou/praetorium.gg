import { expect, test } from '@playwright/test'
import { attachRoster, createBattle, createRoster, setupStep, signUp, uniqueName, waitForRosterSave } from './account'

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
  await setupStep(page, 'Start')
  await page.getByRole('button', { name: 'Start battle' }).click()
  await expect(page.getByRole('heading', { name: 'command phase' })).toBeVisible()
  await page.getByRole('button', { name: 'Finish early' }).click()
  await page.getByRole('button', { name: 'Finish early' }).last().click()
  await expect(page.getByText('Battle over')).toBeVisible()
  await page.getByRole('button', { name: 'Reopen battle' }).click()
  await expect(page.getByRole('button', { name: /End the .+ phase/ })).toBeVisible()

  for (let step = 0; step < 30; step++) {
    await page.getByRole('button', { name: /End the .+ phase|Pass the turn/ }).click()
  }
  await expect(page.getByText('Final result', { exact: true })).toBeVisible()
  await expect(page.getByText(/attacking · Completed$/)).toBeVisible()

  await page.getByRole('button', { name: 'Delete battle' }).click()
  await page.getByRole('button', { name: 'Delete battle' }).last().click()
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
  expect(sharedUrl).toMatch(/\/r\//)
  const anonymous = await (await browser.newContext()).newPage()
  await anonymous.goto(sharedUrl)
  await expect(anonymous.getByRole('heading', { name: 'Shareable roster' })).toBeVisible()

  await page.getByRole('button', { name: 'Actions for Shareable roster' }).click()
  await page.getByRole('menuitem', { name: 'Make private' }).click()
  await expect(page.getByText('Private')).toBeVisible()
  await anonymous.reload()
  await expect(anonymous.getByRole('heading', { name: 'Nothing here' })).toBeVisible()
})
