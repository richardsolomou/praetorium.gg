import { expect, test } from '@playwright/test'

/**
 * A list kept between battles. What is stored is the picks, so loading it re-prices
 * against the catalogue the instance currently holds — which is what a player
 * expects a saved list to do when the points change.
 */
test('a list is saved and loaded into another battle', async ({ browser }) => {
  const context = await browser.newContext()
  const page = await context.newPage()

  await page.goto('/')
  await page.getByLabel('Your name').fill('Alice')
  await page.getByRole('button', { name: 'Open a battle' }).click()
  await page.getByRole('button', { name: 'Build from the catalogue' }).click()

  await page.getByRole('combobox', { name: 'Army' }).click()
  await page.getByRole('option', { name: 'Chaos - Death Guard' }).click()
  await page.getByRole('combobox', { name: 'Detachment' }).click()
  await page.getByRole('option', { name: /Death Lord/ }).click()
  await page.getByLabel('Add a unit').fill('Plague Marines')
  await page
    .getByRole('button', { name: /^Plague Marines/ })
    .first()
    .click()
  await page.getByRole('button', { name: /More models in Plague Marines/ }).click()

  const total = page.locator('[data-stat="points"]')
  const priced = await total.innerText()

  await page.getByLabel('Name this army').fill('Nurgle 2k')
  await page.getByRole('button', { name: 'Save list' }).click()
  await expect(page.getByRole('button', { name: 'Saved' })).toBeVisible()

  // A second battle, in the same browser, starts from the saved list.
  await page.goto('/')
  await page.getByRole('button', { name: 'Open a battle' }).click()
  await page.getByRole('button', { name: 'Build from the catalogue' }).click()
  await page.getByRole('button', { name: 'Nurgle 2k', exact: true }).click()

  await expect(total).toHaveText(priced)
  await expect(page.getByLabel('Plague Marines models')).toHaveText('6')
  await expect(page.getByRole('combobox', { name: 'Detachment' })).toContainText(/Death Lord/)
})
