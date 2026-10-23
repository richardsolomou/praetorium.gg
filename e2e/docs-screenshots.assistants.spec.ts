import { createHash, randomBytes } from 'node:crypto'
import { expect, test } from './test'
import { signUp } from './account'
import { capture, docsScreenshots } from './docsScreenshots'

docsScreenshots()

const CALLBACK = 'https://assistant.example/callback'

test('assistant screenshots', async ({ page, request, baseURL }) => {
  await signUp(page, 'Docs player')
  const registered = await request.post('/api/auth/oauth2/register', {
    data: {
      client_name: 'Claude',
      redirect_uris: [CALLBACK],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    },
  })
  expect(registered.status()).toBe(201)
  const { client_id: clientId } = (await registered.json()) as { client_id: string }

  const authorize = new URL('/api/auth/oauth2/authorize', baseURL)
  authorize.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: CALLBACK,
    response_type: 'code',
    scope: 'mcp:read mcp:write offline_access',
    code_challenge: createHash('sha256').update(randomBytes(32).toString('base64url')).digest('base64url'),
    code_challenge_method: 'S256',
    resource: new URL('/mcp', baseURL).href,
    state: 'docs',
  }).toString()
  await page.goto(authorize.href)

  const consent = page.getByRole('main')
  const allow = consent.getByRole('button', { name: 'Allow access' })
  await expect(consent.getByText('Claude is asking to access your Praetorium account.')).toBeVisible()
  // The page's main grows to fill the viewport; the capture only needs its content.
  await consent.evaluate((element) => ((element as HTMLElement).style.flex = 'none'))
  await capture('assistant-consent', consent, allow, { padded: true })

  await page.route(`${CALLBACK}**`, (route) => route.fulfill({ body: 'Connected' }))
  await allow.click()
  await expect(page.getByText('Connected', { exact: true })).toBeVisible()

  await page.goto('/profile')
  const connectedApps = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Connected apps' }) })
  const revoke = connectedApps.getByRole('button', { name: 'Revoke access' })
  await expect(revoke).toBeVisible()
  // The section spans the whole profile grid; at docs width its text would shrink to unreadable.
  await connectedApps.evaluate((element) => {
    ;(element as HTMLElement).style.maxWidth = '640px'
    element.scrollIntoView({ block: 'center' })
  })
  await capture('assistant-connected-apps', connectedApps, revoke)
})
