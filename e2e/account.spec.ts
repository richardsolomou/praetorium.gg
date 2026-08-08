import { expect, test } from '@playwright/test'
import { signUp } from './account'

/**
 * An account is who you are here, so this covers both halves of that: nothing is
 * reachable without one, and everything saved under one is still there on a
 * device that has never seen this player before.
 */
test('a battle cannot be opened without an account', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Open a battle' })).toBeHidden()
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

  await page.goto('/')
  await page.getByRole('button', { name: 'Open a battle' }).click()
  await page.getByRole('button', { name: 'Build from the catalogue' }).click()
  await page.getByRole('combobox', { name: 'Faction' }).click()
  await page.getByRole('option', { name: 'Death Guard', exact: true }).click()
  await page.getByRole('button', { name: 'Add detachment' }).click()
  await page.getByRole('menuitem', { name: /Death Lord/ }).click()
  await page.getByLabel('Add a unit').fill('Plague Marines')
  await page.getByRole('button', { name: 'Add Plague Marines', exact: true }).first().click()
  await page.getByLabel('List name').fill('Kept list')
  await expect(page.getByRole('status')).toContainText('Saved automatically')

  // A different browser entirely: no cookie, no storage, nothing but the account.
  const second = await browser.newContext()
  const elsewhere = await second.newPage()
  await elsewhere.goto('/signin')
  await elsewhere.getByLabel('Email').fill(email)
  await elsewhere.getByLabel('Password').fill('a-long-enough-password')
  await elsewhere.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(elsewhere.getByRole('button', { name: /Alice · sign out/ })).toBeVisible()

  await elsewhere.goto('/')
  await elsewhere.getByRole('button', { name: 'Open a battle' }).click()
  await elsewhere.getByRole('button', { name: 'Build from the catalogue' }).click()
  await expect(elsewhere.getByRole('button', { name: 'Kept list', exact: true })).toBeVisible()

  await elsewhere.getByRole('button', { name: 'Delete Kept list' }).click()
  await expect(elsewhere.getByRole('alertdialog', { name: 'Delete Kept list?' })).toBeVisible()
  await elsewhere.getByRole('button', { name: 'Cancel' }).click()
  await expect(elsewhere.getByRole('button', { name: 'Kept list', exact: true })).toBeVisible()

  await elsewhere.getByRole('button', { name: 'Delete Kept list' }).click()
  await elsewhere.getByRole('button', { name: 'Delete roster' }).click()
  await expect(elsewhere.getByRole('button', { name: 'Kept list', exact: true })).toBeHidden()
})

test('an invite link signs you in and drops you back into the battle', async ({ browser }) => {
  const host = await (await browser.newContext()).newPage()
  const guest = await (await browser.newContext()).newPage()

  await signUp(host, 'Alice')
  await host.goto('/')
  await host.getByRole('button', { name: 'Open a battle' }).click()
  const invite = host.getByLabel('Send this link to your opponent')
  await expect(invite).toHaveValue(/\/b\//)
  const link = await invite.inputValue()

  // Following the link signed out asks for an account, and comes back here after.
  await guest.goto(link)
  // The one on the page, not the one in the header: only this one carries where
  // the visitor was going.
  await guest.getByRole('main').getByRole('link', { name: 'Sign in' }).click()
  await guest.getByRole('button', { name: 'I need an account' }).click()
  await guest.getByLabel('Your name').fill('Bob')
  await guest.getByLabel('Email').fill(`bob-${crypto.randomUUID()}@example.test`)
  await guest.getByLabel('Password').fill('a-long-enough-password')
  await guest.getByRole('button', { name: 'Create the account' }).click()

  // Signing in came back to the battle rather than to the front page.
  await guest.waitForURL(/\/b\//)
  await expect(guest.getByRole('button', { name: 'Join the battle' })).toBeVisible()
  await guest.getByRole('button', { name: 'Join the battle' }).click()
  await expect(host.getByRole('heading', { name: 'Alice versus Bob' })).toBeVisible()
})
