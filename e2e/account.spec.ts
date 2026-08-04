import { expect, test } from '@playwright/test'

/**
 * An account exists to keep a player's lists, not to gate play.
 *
 * The point of the test is the claiming: a list saved as a guest must still be there
 * after signing up, because the account adopts the guest identity rather than
 * starting a fresh one.
 */
test('an account keeps the lists a guest saved', async ({ browser }) => {
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
  await page.getByLabel('List name').fill('Guest list')
  await page.getByRole('button', { name: 'Save list' }).click()
  await expect(page.getByRole('button', { name: 'Saved' })).toBeVisible()

  await page.getByRole('link', { name: 'Sign in' }).click()
  await page.getByRole('button', { name: 'I need an account' }).click()
  await page.getByLabel('Your name').fill('Alice')
  await page.getByLabel('Email').fill(`alice${Date.now()}@example.test`)
  await page.getByLabel('Password').fill('a-long-enough-password')
  await page.getByRole('button', { name: 'Create the account' }).click()

  await expect(page.getByRole('button', { name: /Alice · sign out/ })).toBeVisible()

  // The list saved as a guest is still there, because the account claimed the guest.
  await page.getByRole('button', { name: 'Open a battle' }).click()
  await page.getByRole('button', { name: 'Build from the catalogue' }).click()
  await expect(page.getByRole('button', { name: 'Guest list', exact: true })).toBeVisible()
})
