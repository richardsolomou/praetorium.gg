import { expect, test } from './test'
import { retryUntilVisible } from './account'

declare global {
  interface Window {
    reliabilitySockets?: { socket: WebSocket; received: number }[]
  }
}

for (const width of [390, 1440]) {
  test(`a cached document with an unavailable route module recovers at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 })
    let broken = true
    await page.route('**/*', async (route) => {
      const request = route.request()
      const url = new URL(request.url())
      if (request.isNavigationRequest() && url.pathname === '/factions') {
        broken = !url.searchParams.has('__route_retry')
      }
      if (broken && /\/assets\/factions-[^/]+\.js$/.test(url.pathname)) {
        await route.fulfill({ status: 404, body: 'Unavailable stale route module', headers: { 'cache-control': 'no-store' } })
      } else await route.continue()
    })
    if (width === 390) {
      await page.goto('/')
      await retryUntilVisible(page.getByRole('combobox'), () =>
        page.getByRole('button', { name: 'Search Praetorium', exact: true }).filter({ visible: true }).click(),
      )
      await page.getByRole('combobox').fill('Factions')
      await page.getByRole('option', { name: /^Factions / }).click()
    } else await page.goto('/factions?view=armies#reference')
    await expect(page.getByRole('heading', { name: 'Something went wrong' })).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath(`module-load-error-${width}.png`), fullPage: true })
    // A normal reload keeps requesting the unavailable module from the same cached document.
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Something went wrong' })).toBeVisible()
    await page.getByRole('button', { name: 'Reload', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Factions', exact: true })).toBeVisible()
    await expect(page.getByLabel('Find a faction')).toBeVisible()
    await expect(page.getByRole('link', { name: /Necrons/ }).first()).toBeVisible()
    await expect(page).toHaveURL(width === 390 ? '/factions' : '/factions?view=armies#reference')
    await page.screenshot({ path: testInfo.outputPath(`module-load-recovered-${width}.png`), fullPage: true })
  })
}

test('an anonymous realtime subscription survives a full socket reconnect with its identity', async ({ page }) => {
  await page.addInitScript(() => {
    window.reliabilitySockets = []
    const NativeSocket = window.WebSocket
    window.WebSocket = class extends NativeSocket {
      constructor(url: string | URL, protocols?: string | string[]) {
        super(url, protocols)
        const record = { socket: this, received: 0 }
        window.reliabilitySockets!.push(record)
        this.addEventListener('message', () => record.received++)
      }
    }
  })
  let identities = 0
  page.on('request', (request) => {
    if (request.method() === 'POST' && new URL(request.url()).pathname.endsWith('/v1/identity')) identities++
  })
  await page.goto('/')
  await page.waitForFunction(() => {
    return window.reliabilitySockets?.some((entry) => entry.received >= 2)
  })
  await page.evaluate(() => {
    window.reliabilitySockets!.find((entry) => entry.received >= 2)!.socket.close(4000, 'Reconnect verification')
  })
  await page.waitForFunction(() => {
    return (
      window.reliabilitySockets!.filter((entry) => entry.received >= 2 && entry.socket.readyState === WebSocket.OPEN).length === 1 &&
      window.reliabilitySockets!.length >= 2
    )
  })
  expect(identities).toBe(1)
})

test('an unavailable module stays a failed recovery rather than reporting success', async ({ page }) => {
  await page.route(/\/assets\/factions-[^/]+\.js$/, (route) => route.fulfill({ status: 404, body: 'Unavailable route module' }))
  await page.goto('/factions?__route_retry=1234.2')
  await expect(page.getByRole('heading', { name: 'Something went wrong' })).toBeVisible()
  await expect(page).toHaveURL('/factions?__route_retry=1234.2')
})
