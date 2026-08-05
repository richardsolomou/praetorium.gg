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
})
