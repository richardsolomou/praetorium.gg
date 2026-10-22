import { expect, test } from './test'
import { currentTotp, signUp } from './account'
import { capture, docsScreenshots } from './docsScreenshots'

docsScreenshots()

test('account and app screenshots', async ({ page, request }) => {
  const { password } = await signUp(page, 'Docs player')
  await page.goto('/profile')

  const battlePrivacy = page.locator('#battle-sharing')
  await expect(battlePrivacy.getByRole('button', { name: /^Anyone/, pressed: true })).toBeVisible()
  await capture('account-battle-privacy', battlePrivacy, battlePrivacy.getByRole('group', { name: 'Who can watch' }))

  const setUp = page.getByRole('button', { name: 'Set up authenticator' })
  const twoFactor = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Two-factor authentication' }) })
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
