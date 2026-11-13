import type { Page } from '@playwright/test'
import { expect, test } from './test'
import { retryUntilVisible, signIn, signUp, uniqueName } from './account'

const bell = (page: Page) => page.locator('[data-web-app-chrome] [data-notifications-button]')

test('a friend request shows on every device the recipient uses, and reading it on one clears it on both', async ({ browser }) => {
  const alice = await (await browser.newContext()).newPage()
  const bob = await (await browser.newContext()).newPage()
  const bobElsewhere = await (await browser.newContext()).newPage()
  const aliceName = uniqueName('Alice')
  const bobName = uniqueName('Bob')
  const account = await signUp(bob, bobName)
  await signIn(bobElsewhere, account.email, account.password)
  await bobElsewhere.waitForURL('/')
  await signUp(alice, aliceName)

  await alice.goto('/friends')
  const sent = alice.locator('section').filter({ hasText: 'Sent requests' }).filter({ hasText: bobName })
  await retryUntilVisible(sent, async () => {
    await alice.getByPlaceholder('Search by account name').fill(bobName)
    await alice.locator(`[data-person="${bobName}"]`).getByRole('button', { name: 'Add friend' }).click({ timeout: 1_000 })
  })

  await expect(bell(bob)).toHaveAccessibleName('Notifications, 1 unread notification')
  await expect(bell(bobElsewhere)).toHaveAccessibleName('Notifications, 1 unread notification')

  await bell(bob).click()
  await bob.getByRole('link', { name: `${aliceName} wants to be friends.` }).click()
  await expect(bob.locator('section').filter({ hasText: 'Friend requests' }).filter({ hasText: aliceName })).toBeVisible()
  await expect(bell(bob)).toHaveAccessibleName('Notifications')
  await expect(bell(bobElsewhere)).toHaveAccessibleName('Notifications')
})
