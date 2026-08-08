import { expect, test } from '@playwright/test'
import { signUp } from './account'

test('opening a battle is operable from the keyboard', async ({ page }) => {
  await signUp(page, 'Alice')
  await page.goto('/')

  for (let tabs = 0; tabs < 10; tabs++) {
    // eslint-disable-next-line no-await-in-loop
    if (await page.getByRole('button', { name: 'Open a battle' }).evaluate((element) => element === document.activeElement)) break
    // eslint-disable-next-line no-await-in-loop
    await page.keyboard.press('Tab')
  }
  await expect(page.getByRole('button', { name: 'Open a battle' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByLabel('Send this link to your opponent')).toHaveValue(/\/b\//)
})

test('reduced motion removes meaningful transitions', async ({ page }) => {
  await signUp(page, 'Alice')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')

  const duration = await page
    .getByRole('button', { name: 'Open a battle' })
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
