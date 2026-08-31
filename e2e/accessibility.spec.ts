import { expect, test } from '@playwright/test'
import { signUp } from './account'

test('opening a battle is operable from the keyboard', async ({ page }) => {
  await signUp(page, 'Alice')
  await page.goto('/battles')
  const initialResponse = await page.reload()
  if (!initialResponse) throw new Error('The battles page did not return a document response.')
  const initialDocument = await initialResponse.text()
  expect(initialDocument).not.toContain('Practice Opponent')
  expect(initialDocument).not.toContain('favourite-factions')
  expect(initialDocument).not.toContain('favourite-detachments')

  // Enough tabs to cross the header: the logo, every primary navigation link,
  // search and the account menu all come before the page's own first control.
  for (let tabs = 0; tabs < 20; tabs++) {
    if (await page.getByRole('button', { name: 'New casual battle' }).evaluate((element) => element === document.activeElement)) break
    await page.keyboard.press('Tab')
  }
  const newBattle = page.getByRole('button', { name: 'New casual battle' })
  await expect(newBattle).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog', { name: 'Start a casual battle' })).toBeVisible()
  await page.getByRole('combobox', { name: 'Opponent' }).click()
  await page.getByRole('option', { name: 'Practice Opponent', exact: true }).click()
  await page.screenshot({ path: 'test-results/new-battle-dialog.png', fullPage: true })
  await page.getByRole('button', { name: 'Create casual battle' }).click()
  await expect(page).toHaveURL(/\/battles\/[^/]+$/)
})

test('reduced motion removes meaningful transitions', async ({ page }) => {
  await signUp(page, 'Alice')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/battles')

  const duration = await page
    .getByRole('button', { name: 'New casual battle' })
    .evaluate((element) => getComputedStyle(element).transitionDuration)
  expect(Number.parseFloat(duration)).toBeLessThanOrEqual(0.00001)
})

test('rendered controls do not reuse ids', async ({ page }) => {
  await page.goto('/')
  const duplicates = await page.locator('[id]').evaluateAll((elements) => {
    const ids = elements.map((element) => element.id)
    return [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))]
  })
  expect(duplicates).toEqual([])
})
