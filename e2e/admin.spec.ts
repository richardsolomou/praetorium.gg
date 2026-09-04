import { createHmac } from 'node:crypto'
import { expect, test, type Page } from '@playwright/test'

const ADMIN_EMAIL = 'preview@praetorium.gg'
const ADMIN_PASSWORD = 'preview-preview-preview'
const SUPPORT_EMAIL = 'support-player@example.test'
const SUPPORT_PASSWORD = 'support-player-password'

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
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  if (!twoFactor) await page.waitForURL('/')
}

test('an administrator can secure an account and impersonate a player', async ({ browser, page }) => {
  await signIn(page)
  await expect(page.getByRole('button', { name: 'Account menu for Preview Player' })).toBeVisible()
  await page.goto('/admin')
  await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible()
  const serverContext = await browser.newContext({ javaScriptEnabled: false, storageState: await page.context().storageState() })
  const serverPage = await serverContext.newPage()
  await serverPage.goto('/admin')
  await expect(serverPage.locator('[data-slot="skeleton"]').first()).toBeVisible()
  await expect(serverPage.getByText(ADMIN_EMAIL, { exact: true })).toHaveCount(0)
  await serverPage.screenshot({ path: 'test-results/admin-loading-state.png', fullPage: true })
  await serverContext.close()

  await page.goto('/profile')
  await expect(page.getByRole('heading', { name: 'Authenticator app' })).toBeVisible()
  await page.getByRole('button', { name: 'Set up authenticator' }).click()
  const setup = page.getByRole('dialog', { name: 'Set up two-factor authentication' })
  await setup.getByLabel('Confirm your password').fill(ADMIN_PASSWORD)
  await setup.getByRole('button', { name: 'Continue' }).click()
  await expect(setup.getByRole('img', { name: 'Authenticator setup QR code' })).toBeVisible()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: 'test-results/two-factor-setup-phone.png', fullPage: true })
  const uri = await setup.locator('code').textContent()
  if (!uri) throw new Error('The authenticator URI was not rendered.')
  await setup.getByLabel('Authenticator code').fill(currentTotp(uri))
  await setup.getByRole('button', { name: 'Verify and enable' }).click()
  await expect(setup.getByText('Save these one-time recovery codes somewhere secure.')).toBeVisible()
  await setup.getByRole('button', { name: 'I saved my recovery codes' }).click()
  await expect(page.getByText('Enabled', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Account menu for Preview Player' }).click()
  await page.getByRole('menuitem', { name: 'Sign out' }).click()
  await page.waitForURL('/')
  await signIn(page, true)
  await expect(page.getByLabel('Authenticator code')).toBeVisible()
  await page.getByLabel('Authenticator code').fill(currentTotp(uri))
  await page.getByRole('button', { name: 'Verify and sign in' }).click()
  await page.waitForURL('/')
  await expect(page.getByRole('button', { name: 'Account menu for Preview Player' })).toBeVisible()

  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/admin')
  await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible()
  await page.getByRole('button', { name: 'Add user' }).click()
  const create = page.getByRole('dialog', { name: 'Add user' })
  await create.getByLabel('Name').fill('Support Player')
  await create.getByLabel('Email').fill(SUPPORT_EMAIL)
  await create.getByLabel('Password').fill(SUPPORT_PASSWORD)
  await create.getByRole('button', { name: 'Create user' }).click()
  await expect(page.getByText('support-player@example.test')).toBeVisible()
  await page.screenshot({ path: 'test-results/admin-desktop.png', fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: 'test-results/admin-phone.png', fullPage: true })
  await page.setViewportSize({ width: 1440, height: 900 })

  await page.getByRole('button', { name: 'Actions for Support Player' }).click()
  await page.getByRole('menuitem', { name: 'View as user' }).click()
  await page.getByRole('dialog', { name: 'View as user' }).getByRole('button', { name: 'View as Support Player' }).click()
  await expect(page.getByText('Viewing as Support Player')).toBeVisible()
  await page.waitForLoadState('networkidle')
  await page.goto('/admin')
  await expect(page).toHaveURL('/')
  await page.getByRole('button', { name: 'Exit' }).click()
  await expect(page).toHaveURL('/admin')
  await page.waitForLoadState('networkidle')

  await page.getByRole('button', { name: 'Actions for Support Player' }).click()
  await page.getByRole('menuitem', { name: 'Make administrator' }).click()
  await page.getByRole('dialog', { name: 'Change administrator access' }).getByRole('button', { name: 'Change access' }).click()
  await expect(page.getByRole('cell', { name: 'Admin', exact: true })).toHaveCount(2)

  const supportContext = await browser.newContext()
  const supportPage = await supportContext.newPage()
  await signIn(supportPage, false, SUPPORT_EMAIL, SUPPORT_PASSWORD)
  await supportPage.goto('/admin')
  await expect(supportPage.getByRole('heading', { name: 'Users' })).toBeVisible()

  await page.getByRole('button', { name: 'Actions for Support Player' }).click()
  await page.getByRole('menuitem', { name: 'Remove admin role' }).click()
  await page.getByRole('dialog', { name: 'Change administrator access' }).getByRole('button', { name: 'Change access' }).click()
  await expect(page.getByRole('cell', { name: 'Admin', exact: true })).toHaveCount(1)
  await supportPage.goto('/admin')
  await expect(supportPage).toHaveURL('/')
  await supportContext.close()
})
