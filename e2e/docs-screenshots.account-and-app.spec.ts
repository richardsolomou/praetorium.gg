import { expect, test } from './test'
import { currentTotp, retryUntilVisible, signUp } from './account'
import { capture, docsScreenshots } from './docsScreenshots'

docsScreenshots()

test('account and app screenshots', async ({ page, request }) => {
  const { password } = await signUp(page, 'Docs player')
  await page.goto('/profile')

  const setUp = page.getByRole('button', { name: 'Set up authenticator' })
  const twoFactor = page.locator('#sign-in-methods')
  await expect(setUp).toBeEnabled()
  // The sticky site header would cover a section scrolled only just into view.
  await twoFactor.evaluate((element) => element.scrollIntoView({ block: 'center' }))
  await capture('account-two-factor', twoFactor, setUp)

  await setUp.click()
  const setup = page.getByRole('dialog', { name: 'Set up two-factor authentication' })
  await setup.getByLabel('Confirm your password').fill(password)
  await setup.getByRole('button', { name: 'Continue' }).click()
  const uri = await setup.locator('code').textContent()
  if (!uri) throw new Error('The authenticator URI was not rendered.')
  // Verifying replaces the session; holding the response keeps the old session's revocation from reading as a sign-out.
  await page.route('**/api/auth/two-factor/verify-totp', async (route) => {
    const response = await request.fetch(route.request(), { headers: await route.request().allHeaders() })
    await new Promise((resolve) => setTimeout(resolve, 2_000))
    await route.fulfill({ response })
  })
  await setup.getByLabel('Authenticator code').fill(currentTotp(uri))
  await setup.getByRole('button', { name: 'Verify and enable' }).click()
  const copy = setup.getByRole('button', { name: 'Copy recovery codes' })
  await expect(copy).toBeVisible()
  await capture('account-recovery-codes', setup, copy)
})

test('sign-in screenshot', async ({ page }) => {
  await page.goto('/sign-in')
  await page.waitForLoadState('networkidle')
  await page.setViewportSize({ width: 1280, height: 760 })
  const form = page
    .locator('div')
    .filter({ has: page.getByRole('heading', { name: 'Welcome back' }) })
    .filter({ has: page.getByRole('button', { name: 'I need an account' }) })
    .last()
  await capture('sign-in-page', form, page.getByRole('button', { name: 'I need an account' }), { padded: true })
})

test('calendar screenshot', async ({ page }) => {
  await signUp(page, 'Docs player')
  await page.goto('/profile')
  const calendar = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Calendar', exact: true }) })
  await calendar.evaluate((element) => element.scrollIntoView({ block: 'center' }))
  await calendar.getByRole('button', { name: 'Get calendar link' }).click()
  const copy = calendar.getByRole('button', { name: 'Copy link' })
  await expect(copy).toBeVisible()
  // The test server's own address would read as the link to copy.
  await calendar.getByLabel('Calendar link').evaluate((input) => {
    ;(input as HTMLInputElement).value = (input as HTMLInputElement).value.replace(/^https?:\/\/[^/]+/, 'https://praetorium.gg')
  })
  await capture('calendar-link', calendar, copy, { padded: true })
})

test('notifications screenshots', async ({ browser }) => {
  const alice = await (await browser.newContext()).newPage()
  const bob = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage()
  await signUp(bob, 'Brother Bob')
  await bob.goto('/')
  await signUp(alice, 'Aurelia')
  await alice.goto('/friends')
  const sent = alice.locator('section').filter({ hasText: 'Sent requests' }).filter({ hasText: 'Brother Bob' })
  await retryUntilVisible(sent, async () => {
    await alice.getByPlaceholder('Search by account name').fill('Brother Bob')
    await alice.locator('[data-person="Brother Bob"]').getByRole('button', { name: 'Add friend' }).click({ timeout: 1_000 })
  })

  const bell = bob.locator('[data-web-app-chrome] [data-notifications-button]')
  await expect(bell).toHaveAccessibleName('Notifications, 1 unread notification')
  // A short window keeps the whole side menu in one image, so the bell is shown where it sits.
  await bob.setViewportSize({ width: 1280, height: 640 })
  await capture('notifications-bell', bob.locator('aside[data-web-app-chrome]'), bell)
  await bob.setViewportSize({ width: 1280, height: 900 })
  await bell.click()
  const panel = bob.locator('[data-slot="popover-content"]')
  await expect(panel.getByRole('link', { name: 'Aurelia wants to be friends.' })).toBeVisible()
  await capture('notifications-panel', panel, panel.getByRole('button', { name: 'Mark all read' }))
})
