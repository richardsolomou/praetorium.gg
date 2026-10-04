import { expect, test } from '@playwright/test'
import manifest from '../package.json' with { type: 'json' }
const { version } = manifest

for (const width of [1440, 390]) {
  test(`release notice waits for a new version and refreshes only on request at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    let served = version
    await page.route('**/api/release', (route) => route.fulfill({ json: { version: served }, headers: { 'cache-control': 'no-store' } }))
    await page.clock.install()
    await page.goto('/')
    const notice = page.getByRole('complementary', { name: 'Release update' })
    await expect(notice).toHaveCount(0)
    served = '99.0.0'
    await page.clock.runFor(60_000)
    await expect(notice).toBeVisible()
    await expect(notice).toHaveText('Praetorium has been updated.Refresh')
    await expect(notice.getByRole('button')).toHaveCount(1)
    const bounds = await notice.boundingBox()
    expect(Math.abs(bounds!.x + bounds!.width / 2 - width / 2)).toBeLessThan(1)
    if (width === 390) {
      const tabs = await page.locator('[data-native-app-tabs]').boundingBox()
      expect(bounds!.y + bounds!.height).toBeLessThan(tabs!.y)
    }
    await page.screenshot({ path: `test-results/release-update-${width}.png` })
    await page.clock.runFor(60_000)
    await expect(notice).toBeVisible()
    served = version
    await notice.getByRole('button', { name: 'Refresh', exact: true }).click()
    await expect(page.getByRole('link', { name: 'Rosters', exact: true }).first()).toBeVisible()
    await expect(notice).toHaveCount(0)
  })
}

test('failed release checks leave the page usable without an update notice', async ({ page }) => {
  await page.route('**/api/release', (route) => route.fulfill({ status: 502 }))
  await page.goto('/')
  await expect(page.getByRole('complementary', { name: 'Release update' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Rosters', exact: true }).first()).toBeVisible()
})
