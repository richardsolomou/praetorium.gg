import { expect, test } from '@playwright/test'

test('a guest can enter through the roster library and browse the product', async ({ page }) => {
  await page.goto('/rosters')
  await page.getByLabel('Your name').fill('Alice')
  await page.getByRole('button', { name: 'Continue' }).click()

  await expect(page.getByRole('heading', { name: 'My rosters' })).toBeVisible()
  await expect(page.getByText('No rosters yet. Create one or bring one from another app.')).toBeVisible()
  await page.screenshot({ path: 'test-results/roster-library.png', fullPage: true })
  await page.getByRole('button', { name: 'Create editable roster' }).click()
  await expect(page.getByRole('heading', { name: 'Create editable roster' })).toBeVisible()
  await expect(page.getByRole('combobox', { name: 'Faction' })).toBeVisible()
  await page.getByRole('button', { name: 'Back to rosters' }).click()
  await expect(page.getByRole('button', { name: 'Import roster' })).toBeVisible()
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Import roster' }).click()
  await chooser
  await expect(page.getByRole('heading', { name: 'Create editable roster' })).toBeVisible()

  await page.getByRole('link', { name: 'Battles' }).click()
  await expect(page.getByRole('heading', { name: 'Battle history' })).toBeVisible()
  await expect(page.getByText('No battles yet.')).toBeVisible()

  await page.getByRole('link', { name: 'Factions' }).click()
  await expect(page.getByText('All factions')).toBeVisible()
  const necrons = page.locator('[data-shelf="All factions"] [data-faction="Xenos - Necrons"]')
  await necrons.getByRole('button', { name: 'Add Xenos - Necrons to favourites' }).click()
  await expect(page.locator('[data-shelf="Favourites"] [data-faction="Xenos - Necrons"]')).toBeVisible()
  await page.screenshot({ path: 'test-results/faction-index.png', fullPage: true })
  await necrons.getByRole('button').first().click()
  await page.screenshot({ path: 'test-results/faction-detail.png', fullPage: true })
  await page.getByLabel('Find a datasheet').fill('Overlord')
  await page
    .getByRole('link', { name: /Overlord/ })
    .first()
    .click()
  await expect(page.getByRole('heading', { name: 'Overlord', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: /Weapons/ })).toBeVisible()
  await expect(page.getByRole('heading', { name: /Abilities/ })).toBeVisible()
  await page.screenshot({ path: 'test-results/datasheet.png', fullPage: true })
})
