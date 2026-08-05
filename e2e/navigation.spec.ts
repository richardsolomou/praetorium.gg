import { expect, test } from '@playwright/test'

test('a guest can enter through the roster library and browse the product', async ({ page }) => {
  await page.goto('/rosters')
  await page.getByLabel('Your name').fill('Alice')
  await page.getByRole('button', { name: 'Continue' }).click()

  await expect(page.getByRole('heading', { name: 'Build an army' })).toBeVisible()
  await expect(page.getByRole('combobox', { name: 'Faction' })).toBeVisible()

  await page.getByRole('link', { name: 'Battles' }).click()
  await expect(page.getByRole('heading', { name: 'Battle history' })).toBeVisible()
  await expect(page.getByText('No battles yet.')).toBeVisible()

  await page.getByRole('link', { name: 'Factions' }).click()
  await expect(page.getByRole('heading', { name: 'Factions' })).toBeVisible()
  await page.getByRole('button', { name: 'Xenos - Necrons' }).click()
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
