import { createHmac } from 'node:crypto'
import { expect, test, type Page } from '@playwright/test'
import { befriend, signUp, uniqueName } from './account'

// The seeded administrator is shared by every attempt, so these tests never change its
// security settings and give each player they create a name of its own.
const ADMIN_EMAIL = 'preview@praetorium.gg'
const ADMIN_PASSWORD = 'preview-preview-preview'

function decodeBase32(value: string) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  const bits = value
    .split('')
    .map((character) => alphabet.indexOf(character).toString(2).padStart(5, '0'))
    .join('')
  return Buffer.from(bits.match(/.{8}/g)?.map((byte) => Number.parseInt(byte, 2)) ?? [])
}

function currentTotp(uri: string) {
  const secret = new URL(uri).searchParams.get('secret')
  if (!secret) throw new Error('The authenticator URI has no secret.')
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)))
  const digest = createHmac('sha1', decodeBase32(secret)).update(counter).digest()
  const offset = digest.at(-1)! & 0x0f
  return ((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).toString().padStart(6, '0')
}

async function signIn(page: Page, twoFactor = false, email = ADMIN_EMAIL, password = ADMIN_PASSWORD) {
  await page.goto('/sign-in')
  // Filling before hydration submits the form natively and never signs in.
  await page.waitForLoadState('networkidle')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  if (!twoFactor) {
    await page.waitForURL('/')
  }
}

test('a player secures an account with an authenticator app', async ({ page, request }) => {
  const name = uniqueName('Secure Player')
  const { email, password } = await signUp(page, name)
  await page.goto('/profile')
  await expect(page.getByRole('heading', { name: 'Authenticator app' })).toBeVisible()
  await page.getByRole('button', { name: 'Set up authenticator' }).click()
  const setup = page.getByRole('dialog', { name: 'Set up two-factor authentication' })
  await setup.getByLabel('Confirm your password').fill(password)
  await setup.getByRole('button', { name: 'Continue' }).click()
  await expect(setup.getByRole('img', { name: 'Authenticator setup QR code' })).toBeVisible()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: 'test-results/two-factor-setup-phone.png', fullPage: true })
  const uri = await setup.locator('code').textContent()
  if (!uri) throw new Error('The authenticator URI was not rendered.')
  // Verifying replaces the session, and the old one's revocation reaches the page over
  // the live connection before this response carries the new cookie. Holding the
  // response makes that order certain; it must not read as a sign-out. `route.fetch`
  // would store the new cookie in the page's context at once, so a separate request
  // context sends it.
  await page.route('**/api/auth/two-factor/verify-totp', async (route) => {
    const response = await request.fetch(route.request(), { headers: await route.request().allHeaders() })
    await new Promise((resolve) => setTimeout(resolve, 2_000))
    await route.fulfill({ response })
  })
  await setup.getByLabel('Authenticator code').fill(currentTotp(uri))
  await setup.getByRole('button', { name: 'Verify and enable' }).click()
  await expect(setup.getByText('Save these one-time recovery codes somewhere secure.')).toBeVisible()
  await setup.getByRole('button', { name: 'I saved my recovery codes' }).click()
  await expect(page.getByText('Enabled', { exact: true })).toBeVisible()
  await page.unroute('**/api/auth/two-factor/verify-totp')

  await page.getByRole('button', { name: `Account menu for ${name}` }).click()
  await page.getByRole('menuitem', { name: 'Sign out' }).click()
  await page.waitForURL('/')
  await signIn(page, true, email, password)
  await expect(page.getByLabel('Authenticator code')).toBeVisible()
  await page.getByLabel('Authenticator code').fill(currentTotp(uri))
  await page.getByRole('button', { name: 'Verify and sign in' }).click()
  await page.waitForURL('/')
  await expect(page.getByRole('button', { name: `Account menu for ${name}` })).toBeVisible()
})

test('an administrator finds and manages a player', async ({ browser, page }) => {
  const supportContext = await browser.newContext()
  const supportPage = await supportContext.newPage()
  const supportName = uniqueName('Support Player')
  const earlierContext = await browser.newContext()
  const earlierName = `${supportName} Earlier`
  const earlierPage = await earlierContext.newPage()
  const earlierAccount = await signUp(earlierPage, earlierName)
  const { email: supportEmail } = await signUp(supportPage, supportName)
  await earlierPage.getByRole('button', { name: `Account menu for ${earlierName}` }).click()
  await earlierPage.getByRole('menuitem', { name: 'Sign out' }).click()
  await earlierPage.waitForURL('/')
  await signIn(earlierPage, false, earlierAccount.email, earlierAccount.password)
  await earlierContext.close()

  await signIn(page)
  await expect(page.getByRole('button', { name: 'Account menu for Preview Player' })).toBeVisible()
  const serverContext = await browser.newContext({ javaScriptEnabled: false, storageState: await page.context().storageState() })
  const serverPage = await serverContext.newPage()
  await serverPage.goto('/admin')
  await expect(serverPage.locator('[data-slot="skeleton"]').first()).toBeVisible()
  await serverPage.screenshot({ path: 'test-results/admin-loading-state.png', fullPage: true })
  await expect(serverPage.getByText(ADMIN_EMAIL, { exact: true })).toHaveCount(0)
  await serverContext.close()

  await page.goto('/admin')
  await expect(page.getByRole('heading', { name: 'Administration' })).toBeVisible()
  const table = page.getByRole('table', { name: 'Players' })
  await expect(table.getByRole('columnheader', { name: 'Player', exact: true })).toBeVisible()
  await page.getByLabel('Search users').fill(supportName)
  await expect(table.locator('tbody').getByRole('row')).toHaveCount(2)
  await expect(table.getByRole('columnheader', { name: 'Sort by recently joined' })).toHaveAttribute('aria-sort', 'descending')
  await table.getByRole('button', { name: 'Sort by recently seen' }).click()
  await expect(table.getByRole('columnheader', { name: 'Sort by recently seen' })).toHaveAttribute('aria-sort', 'descending')
  await expect(page.getByRole('button', { name: 'Sort: Recently seen' })).toBeVisible()
  await expect(table.locator('tbody').getByRole('row').first()).toContainText(earlierAccount.email)
  await table.getByRole('button', { name: 'Sort by recently joined' }).click()
  await expect(table.locator('tbody').getByRole('row').first()).toContainText(supportEmail)
  await page.getByLabel('Search users').fill(supportEmail)
  const playerButton = table.getByRole('button', { name: supportEmail })
  const row = table.getByRole('row').filter({ hasText: supportEmail })
  await expect(row).toContainText('0 rosters · 0 battles')
  await expect(row).toContainText('0 friends')
  await page.getByRole('button', { name: 'Show: Everyone' }).click()
  await page.getByRole('menuitemradio', { name: 'Administrators', exact: true }).click()
  await expect(table.getByText('No player matches this search.')).toBeVisible()
  await page.getByRole('button', { name: 'Show: Administrators' }).click()
  await page.getByRole('menuitemradio', { name: 'Everyone', exact: true }).click()
  await expect(playerButton).toBeVisible()
  const friendContext = await browser.newContext()
  const friendPage = await friendContext.newPage()
  await signUp(friendPage, uniqueName('Support Friend'))
  await befriend(supportPage, friendPage)
  await friendContext.close()
  await page.reload()
  await page.getByLabel('Search users').fill(supportEmail)
  await expect(table.locator('tbody').getByRole('row')).toHaveCount(1)
  await expect(row).toContainText('1 friend')
  await page.screenshot({ path: 'test-results/admin-users-desktop.png', fullPage: true })
  await page.getByLabel('Search users').fill('')
  await expect(table.getByRole('button', { name: ADMIN_EMAIL })).toBeVisible()
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(table.getByRole('columnheader', { name: 'Activity' })).toBeHidden()
  await expect(table.getByRole('columnheader', { name: 'Sort by recently seen' })).toBeVisible()
  await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 390)
  await page.screenshot({ path: 'test-results/admin-users-phone.png', fullPage: true })
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.getByLabel('Search users').fill(supportEmail)
  await expect(table.locator('tbody').getByRole('row')).toHaveCount(1)

  await row.getByRole('cell').filter({ hasText: '1 friend' }).click()
  const details = page.getByRole('dialog', { name: supportName })
  await expect(details.getByRole('button', { name: /^Sign out / })).toBeVisible()
  await page.screenshot({ path: 'test-results/admin-user-panel.png' })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: 'test-results/admin-user-panel-phone.png' })
  await page.setViewportSize({ width: 1440, height: 900 })
  await details.getByRole('button', { name: 'View', exact: true }).click()
  await expect(page.getByText(`Viewing as ${supportName}`)).toBeVisible()
  await page.waitForLoadState('networkidle')
  await page.goto('/admin')
  await expect(page).toHaveURL('/')
  await page.getByRole('button', { name: 'Exit' }).click()
  await expect(page).toHaveURL('/admin')
  await page.waitForLoadState('networkidle')

  await page.getByLabel('Search users').fill(supportEmail)
  await playerButton.focus()
  await page.keyboard.press('Enter')
  const confirm = page.getByRole('alertdialog')
  await details.getByRole('button', { name: /^Administrator/ }).click()
  await confirm.getByRole('button', { name: 'Make administrator' }).click()
  await expect(details.getByText(`${supportName} is now an administrator.`)).toBeVisible()
  await expect(details.getByRole('button', { name: 'Delete account' })).toBeDisabled()
  await supportPage.goto('/admin')
  await expect(supportPage.getByRole('heading', { name: 'Administration' })).toBeVisible()

  await details.getByRole('button', { name: /^User/ }).click()
  await confirm.getByRole('button', { name: 'Make user' }).click()
  await expect(details.getByText(`${supportName} is now a user.`)).toBeVisible()
  const renamed = `${supportName} Renamed`
  await details.getByLabel('Display name').fill(renamed)
  await details.getByRole('button', { name: 'Rename' }).click()
  await expect(details.getByText(`Renamed to ${renamed}.`)).toBeVisible()
  await supportPage.goto('/admin')
  await expect(supportPage).toHaveURL('/')

  await details.getByRole('button', { name: /^Sign out / }).click()
  await expect(details.getByText(`${renamed} is not signed in anywhere.`)).toBeVisible()
  await supportPage.reload()
  await expect(supportPage.getByRole('button', { name: `Account menu for ${supportName}` })).toHaveCount(0)

  await details.getByRole('button', { name: 'Delete account' }).click()
  await confirm.getByRole('button', { name: 'Delete account' }).click()
  await expect(page.getByText('No player matches this search.')).toBeVisible()
  await supportContext.close()
})
