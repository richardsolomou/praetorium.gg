import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { chromium, expect } from '@playwright/test'

const origin = 'https://candidate.praetorium.gg'
const sessionToken = process.env.SESSION_TOKEN
const authSecret = process.env.AUTH_SECRET
const accessId = process.env.CANDIDATE_ACCESS_CLIENT_ID
const accessSecret = process.env.CANDIDATE_ACCESS_CLIENT_SECRET
assert(sessionToken && authSecret && accessId && accessSecret, 'Candidate browser credentials are missing')

const accessHeaders = { 'CF-Access-Client-Id': accessId, 'CF-Access-Client-Secret': accessSecret }
const accessResponse = await fetch(`${origin}/api/health`, { headers: accessHeaders })
assert(accessResponse.ok, 'Candidate Access authentication failed')
const accessCookie = accessResponse.headers
  .getSetCookie()
  .find((header) => header.startsWith('CF_Authorization='))
  ?.split(';')[0]

const signature = createHmac('sha256', authSecret).update(sessionToken).digest('base64')
const browser = await chromium.launch()
try {
  const context = await browser.newContext()
  await context.addCookies([
    {
      name: '__Secure-better-auth.session_token',
      value: `${sessionToken}.${signature}`,
      url: origin,
      secure: true,
    },
    ...(accessCookie
      ? [{ name: 'CF_Authorization', value: accessCookie.slice('CF_Authorization='.length), url: origin, secure: true }]
      : []),
  ])
  await context.route(`${origin}/**`, (route) => route.continue({ headers: { ...route.request().headers(), ...accessHeaders } }))
  const page = await context.newPage()
  let realtimeConnected = false
  page.on('websocket', (socket) => {
    if (socket.url().startsWith(`${origin.replace('https:', 'wss:')}/spacetime/`)) {
      socket.on('framereceived', () => {
        realtimeConnected = true
      })
    }
  })

  async function visit(path: string, heading: string) {
    const response = await page.goto(`${origin}${path}`)
    assert(response?.ok(), `Candidate ${path} did not load`)
    await page.getByRole('heading', { name: heading, exact: true }).waitFor({ timeout: 15_000 })
  }

  await visit('/rosters', 'My rosters')
  await page.waitForFunction(
    () => {
      const text = document.querySelector('main')?.innerText ?? ''
      return /No rosters yet|No rosters match|Could not load rosters/.test(text) || Boolean(document.querySelector('article[data-roster]'))
    },
    undefined,
    { timeout: 15_000 },
  )
  assert(!(await page.getByRole('heading', { name: 'Could not load rosters' }).isVisible()), 'Candidate rosters failed')
  const roster = page.locator('article[data-roster] a[href^="/rosters/"]').first()
  if (await roster.count()) {
    await roster.click()
    await page.waitForURL(/\/rosters\/[^/]+(?:\?.*)?$/)
    await page.locator('main h1').waitFor({ timeout: 15_000 })
    console.log('Candidate saved roster opened')
  }

  await visit('/battles', 'My battles')
  if (accessCookie) await expect.poll(() => realtimeConnected, { timeout: 15_000 }).toBe(true)
  await visit('/leagues', 'Leagues')

  await visit('/factions', 'Factions')
  const favourite = page.locator('section[data-shelf="Necrons"]').getByRole('button', { name: /Necrons.*favourites/ })
  await favourite.waitFor({ timeout: 15_000 })
  const original = await favourite.getAttribute('aria-pressed')
  assert(original === 'true' || original === 'false', 'Candidate faction favourite did not load')
  const readback = await context.newPage()
  const savedFavourite = () => readback.locator('section[data-shelf="Necrons"]').getByRole('button', { name: /Necrons.*favourites/ })
  try {
    await favourite.click()
    await expect
      .poll(
        async () => {
          await readback.goto(`${origin}/factions`)
          return savedFavourite().getAttribute('aria-pressed')
        },
        { timeout: 15_000 },
      )
      .toBe(original === 'true' ? 'false' : 'true')
  } finally {
    if ((await favourite.getAttribute('aria-pressed')) !== original) await favourite.click()
  }
  await expect
    .poll(
      async () => {
        await readback.reload()
        return savedFavourite().getAttribute('aria-pressed')
      },
      { timeout: 15_000 },
    )
    .toBe(original)
  await readback.close()
  console.log('Candidate faction favourite write and fresh readback passed')

  console.log(accessCookie ? 'Candidate realtime WebSocket connected' : 'Candidate Access did not issue a browser cookie')
  console.log('Candidate authenticated browser journeys passed')
} finally {
  await browser.close()
}
