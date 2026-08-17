import { expect, test } from '@playwright/test'
import { createBattle, createRoster, signUp, uniqueName, waitForRosterSave } from './account'

/**
 * An account is who you are here, so this covers both halves of that: nothing is
 * reachable without one, and everything saved under one is still there on a
 * device that has never seen this player before.
 */
test('a battle cannot be opened without an account', async ({ page }) => {
  await page.goto('/battles')
  await expect(page.getByRole('button', { name: 'New battle' })).toBeHidden()
  await expect(page.getByRole('link', { name: 'Sign in' }).first()).toBeVisible()
})

test('a list saved under an account is there on another device', async ({ browser }) => {
  const first = await browser.newContext()
  const page = await first.newPage()
  const email = `alice-${crypto.randomUUID()}@example.test`

  await page.goto('/signin')
  await page.getByRole('button', { name: 'I need an account' }).click()
  await page.getByLabel('Your name').fill('Alice')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill('a-long-enough-password')
  await page.getByRole('button', { name: 'Create the account' }).click()
  await expect(page.getByRole('button', { name: /Alice · sign out/ })).toBeVisible()

  await createRoster(page, { faction: 'Death Guard', detachment: /Shamblerot Vectorium/, name: 'Kept list' })
  await page.getByLabel('Add a unit').fill('Plague Marines')
  await waitForRosterSave(page, () => page.getByRole('button', { name: 'Add Plague Marines', exact: true }).first().click())

  // A different browser entirely: no cookie, no storage, nothing but the account.
  const second = await browser.newContext()
  const elsewhere = await second.newPage()
  await elsewhere.goto('/signin')
  await elsewhere.getByLabel('Email').fill(email)
  await elsewhere.getByLabel('Password').fill('a-long-enough-password')
  await elsewhere.getByRole('button', { name: 'Sign in', exact: true }).click()
  await elsewhere.waitForURL('/rosters')
  await expect(elsewhere.getByRole('button', { name: /Alice · sign out/ })).toBeVisible()

  await elsewhere.goto('/rosters')
  await expect(elsewhere.getByRole('link', { name: /Kept list/ })).toBeVisible()

  await elsewhere.getByRole('button', { name: 'Actions for Kept list' }).click()
  await elsewhere.getByRole('menuitem', { name: 'Delete' }).click()
  await expect(elsewhere.getByRole('alertdialog', { name: 'Delete Kept list?' })).toBeVisible()
  await elsewhere.getByRole('button', { name: 'Cancel' }).click()
  await expect(elsewhere.getByRole('link', { name: /Kept list/ })).toBeVisible()

  await elsewhere.getByRole('button', { name: 'Actions for Kept list' }).click()
  await elsewhere.getByRole('menuitem', { name: 'Delete' }).click()
  await elsewhere.getByRole('button', { name: 'Delete roster' }).click()
  await expect(elsewhere.getByRole('link', { name: /Kept list/ })).toBeHidden()
})

test('a seated battle signs the opponent in and drops them back into setup', async ({ browser }) => {
  const host = await (await browser.newContext()).newPage()
  const guest = await (await browser.newContext()).newPage()
  const aliceName = uniqueName('Alice')
  const bobName = uniqueName('Bob')
  const bobEmail = `${bobName.toLowerCase()}@example.test`

  await guest.goto('/signin')
  await guest.getByRole('button', { name: 'I need an account' }).click()
  await guest.getByLabel('Your name').fill(bobName)
  await guest.getByLabel('Email').fill(bobEmail)
  await guest.getByLabel('Password').fill('a-long-enough-password')
  await guest.getByRole('button', { name: 'Create the account' }).click()
  await guest.getByRole('button', { name: new RegExp(`${bobName} · sign out`) }).waitFor()
  await guest.getByRole('button', { name: new RegExp(`${bobName} · sign out`) }).click()
  await expect(guest.getByRole('link', { name: 'Sign in' }).first()).toBeVisible()

  await signUp(host, aliceName)
  const link = await createBattle(host, { opponent: bobName })

  await guest.goto(link)
  await guest.getByRole('main').getByRole('link', { name: 'Sign in' }).click()
  await guest.getByLabel('Email').fill(bobEmail)
  await guest.getByLabel('Password').fill('a-long-enough-password')
  await guest.getByRole('button', { name: 'Sign in', exact: true }).click()

  await guest.waitForURL(/\/b\//)
  await expect(guest.getByRole('heading', { name: `${bobName} versus ${aliceName}` })).toBeVisible()
})
