import { expect, test } from '@playwright/test'
import { befriend, createBattle, createRoster, signUp, uniqueName, waitForRosterSave } from './account'

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

test('account forms show the server error', async ({ page }) => {
  const email = `auth-error-${crypto.randomUUID()}@example.test`
  await page.request.post('/api/auth/sign-up/email', {
    data: { email, password: 'a-long-enough-password', name: 'Auth Error' },
  })

  await page.goto('/sign-in')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill('the-wrong-password')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByText('Invalid email or password', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'I need an account' }).click()
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill('a-long-enough-password')
  await page.getByRole('button', { name: 'Create the account' }).click()
  await expect(page.getByText('User already exists. Use another email.', { exact: true })).toBeVisible()
})

test('social sign-in callback errors explain how to recover', async ({ page }) => {
  await page.goto('/sign-in?error=account_not_linked')

  await expect(
    page.getByText('An account already uses this email. Sign in with its existing method, then link this provider from your profile.'),
  ).toBeVisible()
})

test('social account linking errors explain how to recover', async ({ page }) => {
  await page.request.post('/api/auth/sign-up/email', {
    data: {
      email: `link-error-${crypto.randomUUID()}@example.test`,
      password: 'a-long-enough-password',
      name: uniqueName('Link Error'),
    },
  })
  await page.goto('/profile?error=email_doesn%27t_match')

  await expect(page.getByText('This provider uses a different email address. Use matching email addresses before linking.')).toBeVisible()
  await page.screenshot({ path: 'test-results/profile-link-error.png', fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: 'test-results/profile-link-error-phone.png', fullPage: true })
})

test('an unverified account cannot forge a verification success message', async ({ page }) => {
  await page.request.post('/api/auth/sign-up/email', {
    data: {
      email: `verification-state-${crypto.randomUUID()}@example.test`,
      password: 'a-long-enough-password',
      name: uniqueName('Verification State'),
    },
  })

  await page.goto('/profile?verified=true')

  await expect(page.getByText('Email address verified.', { exact: true })).toBeHidden()
})

test('email verification callbacks explain their result without an active session', async ({ page }) => {
  await page.goto('/profile?verified=true')
  await expect(page.getByRole('heading', { name: 'Email address verified' })).toBeVisible()

  await page.goto('/profile?verified=true&error=INVALID_TOKEN')
  await expect(page.getByRole('heading', { name: 'Could not complete account verification' })).toBeVisible()
  await expect(page.getByText('This email verification link is invalid or has expired. Sign in to try again.')).toBeVisible()
})

test('a player can edit their display name and profile picture', async ({ page }) => {
  await signUp(page, uniqueName('Alice'))
  await page.getByRole('button', { name: /Account menu for/ }).click()
  await page.getByRole('menuitem', { name: 'Edit profile' }).click()

  await page.getByLabel('Display name').fill('Commander Alice')
  await page.getByLabel('Choose profile picture').setInputFiles({
    name: 'avatar.png',
    mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'),
  })
  await expect(page.getByRole('button', { name: 'Replace picture' })).toBeVisible()
  await page.getByRole('button', { name: 'Save profile' }).click()

  await expect(page.getByText('Profile saved.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Account menu for Commander Alice' })).toBeVisible()
  await page.reload()
  await expect(page.getByLabel('Display name')).toHaveValue('Commander Alice')
  await expect(page.locator('main img')).toHaveAttribute('src', /\/avatars\/[0-9a-f]+\.webp$/)
  await expect(page.getByRole('button', { name: 'Save profile' })).toBeDisabled()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: 'test-results/profile-phone.png', fullPage: true })

  await page.locator('form').getByRole('button', { name: 'Remove' }).click()
  await page.getByRole('button', { name: 'Save profile' }).click()
  // Wait for the save to be acknowledged, as the first one does. Reloading out of
  // an in-flight mutation cancels it, and the picture is still there afterwards.
  await expect(page.getByText('Profile saved.')).toBeVisible()
  await page.reload()
  await expect(page.getByRole('button', { name: 'Add picture' })).toBeVisible()
  await expect(page.locator('main img')).toHaveCount(0)
})

test('a list saved under an account is there on another device', async ({ browser }) => {
  const first = await browser.newContext()
  const page = await first.newPage()
  const email = `alice-${crypto.randomUUID()}@example.test`

  await page.goto('/sign-in')
  await page.getByRole('button', { name: 'I need an account' }).click()
  await page.getByLabel('Your name').fill('Alice')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill('a-long-enough-password')
  await page.getByRole('button', { name: 'Create the account' }).click()
  await expect(page.getByRole('button', { name: 'Account menu for Alice' })).toBeVisible()

  await createRoster(page, { faction: 'Death Guard', detachment: /Shamblerot Vectorium/, name: 'Kept list' })
  await page.getByLabel('Add a unit').fill('Plague Marines')
  await waitForRosterSave(page, () => page.getByRole('button', { name: 'Add Plague Marines', exact: true }).first().click())

  // A different browser entirely: no cookie, no storage, nothing but the account.
  const second = await browser.newContext()
  const elsewhere = await second.newPage()
  await elsewhere.goto('/sign-in')
  await elsewhere.getByLabel('Email').fill(email)
  await elsewhere.getByLabel('Password').fill('a-long-enough-password')
  await elsewhere.getByRole('button', { name: 'Sign in', exact: true }).click()
  await elsewhere.waitForURL('/rosters')
  await expect(elsewhere.getByRole('button', { name: 'Account menu for Alice' })).toBeVisible()

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

  await guest.goto('/sign-in')
  await guest.getByRole('button', { name: 'I need an account' }).click()
  await guest.getByLabel('Your name').fill(bobName)
  await guest.getByLabel('Email').fill(bobEmail)
  await guest.getByLabel('Password').fill('a-long-enough-password')
  await guest.getByRole('button', { name: 'Create the account' }).click()
  const accountMenu = guest.getByRole('button', { name: `Account menu for ${bobName}` })
  await accountMenu.waitFor()
  await signUp(host, aliceName)
  await befriend(host, guest)
  await accountMenu.click()
  await guest.getByRole('menuitem', { name: 'Sign out' }).click()
  await expect(guest.getByRole('link', { name: 'Sign in' }).first()).toBeVisible()

  const link = await createBattle(host, { opponent: bobName })

  await guest.goto(link)
  await guest.getByRole('main').getByRole('link', { name: 'Sign in' }).click()
  await guest.getByLabel('Email').fill(bobEmail)
  await guest.getByLabel('Password').fill('a-long-enough-password')
  await guest.getByRole('button', { name: 'Sign in', exact: true }).click()

  await guest.waitForURL(/\/battles\/[^/]+$/)
  await expect(guest.getByRole('heading', { name: 'Choose how you are playing' })).toBeVisible()
  // The table strip names both sides, which is how the guest knows it is the battle they were invited to.
  await expect(guest.getByRole('main')).toContainText(aliceName)
  await expect(guest.getByRole('main')).toContainText(bobName)
})
