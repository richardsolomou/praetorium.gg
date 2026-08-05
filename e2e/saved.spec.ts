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

  await page.getByRole('combobox', { name: 'Faction' }).click()
  await page.getByRole('option', { name: 'Xenos - Necrons' }).click()
  await page.getByRole('button', { name: 'Detachments' }).click()
  await page.getByRole('menuitemcheckbox', { name: /Awakened Dynasty/ }).click()
  await page.getByLabel('Add a unit').fill('Immortals')
  await page.getByRole('button', { name: 'Add Immortals', exact: true }).first().click()
  await page.getByLabel('Add a unit').fill('Overlord')
  await page.getByRole('button', { name: 'Add Overlord', exact: true }).first().click()
  await page.locator('[data-unit="Overlord"]').getByRole('button', { name: 'Immortals', exact: true }).click()
  await expect(page.getByText('Leading')).toBeVisible()
  await page
    .getByRole('button', { name: /^Immortals/ })
    .first()
    .click()
  await page.getByRole('button', { name: /More models in Immortals/ }).click()

  const total = page.locator('[data-stat="points"]')
  // The bar reads 0/2000 before the first price lands, so capturing without waiting
  // compares a saved list against a total that had not been worked out yet.
  await expect(total).not.toHaveText('0/2000')
  const priced = await total.innerText()

  // The name is offered, not demanded; this one is overridden on purpose.
  await page.getByLabel('List name').fill('Nurgle 2k')
  await expect(page.getByRole('status')).toContainText('Saved automatically')
  const datasheetPage = page.waitForEvent('popup')
  await page.getByRole('link', { name: 'View full datasheet' }).click()
  const datasheet = await datasheetPage
  await expect(datasheet.getByRole('heading', { name: 'Immortals', exact: true })).toBeVisible()
  await datasheet.close()
  await expect(page.getByLabel('List name')).toHaveValue('Nurgle 2k')
  await expect(page.getByLabel('Immortals models')).toHaveText('6')

  // A second battle, in the same browser, starts from the saved list.
  await page.goto('/')
  await page.getByRole('button', { name: 'Open a battle' }).click()
  await page.getByRole('button', { name: 'Build from the catalogue' }).click()
  await page.getByRole('button', { name: 'Nurgle 2k', exact: true }).click()

  await expect(total).toHaveText(priced)
  await page
    .getByRole('button', { name: /^Immortals/ })
    .first()
    .click()
  await expect(page.getByLabel('Immortals models')).toHaveText('6')
  await expect(page.getByText('Leading')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Detachments' })).toContainText(/Awakened Dynasty/)

  await page.getByRole('button', { name: 'Copy Nurgle 2k' }).click()
  await expect(page.getByLabel('List name')).toHaveValue('Copy of Nurgle 2k')
  await expect(page.getByLabel('Immortals models')).toHaveText('6')
  await expect(page.getByRole('status')).toContainText('Saved automatically')
  await expect(page.getByRole('button', { name: 'Copy of Nurgle 2k', exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'View Copy of Nurgle 2k' }).click()
  await expect(page.getByRole('heading', { name: 'Copy of Nurgle 2k' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Immortals' })).toBeVisible()
  await page.evaluate(() => {
    window.print = () => document.documentElement.setAttribute('data-print-called', 'true')
  })
  await page.getByRole('button', { name: 'Print' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-print-called', 'true')
  await page.emulateMedia({ media: 'print' })
  await page.screenshot({ path: 'test-results/shared-roster-print.png', fullPage: true })
})
