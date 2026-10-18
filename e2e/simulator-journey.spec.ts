import { expect, test } from './test'
import { retryUntilVisible, signInAsPreview } from './account'
import { holdCombatCalculations } from './combat'

const pairing = 'Intercessor Squad vs Necron Warriors'
const history = '[aria-label="Recent matchups"]'

test(
  'an editable example is remembered only after a result and reopens with its latest settings',
  { tag: '@catalogue' },
  async ({ page, context }) => {
    await page.goto('/simulator')
    await page.waitForLoadState('networkidle')
    const gate = await holdCombatCalculations(page)
    await page.getByRole('button', { name: 'Try an example', exact: true }).click()
    await gate.waitForStart()
    await expect(page.locator(history)).toHaveCount(0)
    await gate.release()
    const recent = page.getByRole('region', { name: 'Recent matchups', exact: true })
    await expect(recent.getByRole('link', { name: pairing, exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'More attacker models', exact: true }).click()
    await expect(page.getByLabel('Attacker models', { exact: true })).toHaveText('6')
    await expect
      .poll(async () => {
        const url = new URL((await recent.getByRole('link', { name: pairing, exact: true }).getAttribute('href')) ?? '', 'http://localhost')
        return JSON.parse(Buffer.from(url.searchParams.get('s')!, 'base64url').toString()).sides[0].pick.models
      })
      .toBe(6)
    await expect(recent.getByRole('link')).toHaveCount(1)
    await page.getByRole('tab', { name: 'Rosters', exact: true }).click()
    await page.getByRole('tab', { name: 'Units', exact: true }).click()
    await expect(page.getByLabel('Attacker models', { exact: true })).toHaveText('6')
    await page.reload()
    await expect(page.getByLabel('Attacker models', { exact: true })).toHaveText('6')
    await page.goto('/simulator')
    await retryUntilVisible(page.getByLabel('Attacker models', { exact: true }).filter({ hasText: '6' }), () =>
      recent.getByRole('link', { name: pairing, exact: true }).click(),
    )
    await expect(page.getByRole('combobox', { name: 'Defender unit', exact: true })).toContainText('Necron Warriors')
    const other = await context.newPage()
    await other.goto('/')
    await expect(
      other.getByRole('region', { name: 'Recent matchups', exact: true }).getByRole('link', { name: pairing, exact: true }),
    ).toBeVisible()
    await other.getByRole('button', { name: `Remove ${pairing}`, exact: true }).click()
    await expect(recent).toHaveCount(0)
    await page.goto('/simulator')
    await page.reload()
    await expect(recent).toHaveCount(0)
  },
)

test('recent matchups are accessible from signed-in home at desktop and phone widths', { tag: '@catalogue' }, async ({ page }) => {
  await signInAsPreview(page)
  await page.goto('/simulator')
  await page.waitForLoadState('networkidle')
  await page.getByRole('button', { name: 'Try an example', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Recent matchups', exact: true })).toBeVisible()
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/')
    const recent = page.getByRole('region', { name: 'Recent matchups', exact: true })
    await expect(recent.getByRole('link', { name: pairing, exact: true })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await recent.screenshot({ path: `test-results/recent-matchups-home-${width}.png` })
    await recent.getByRole('link', { name: pairing, exact: true }).click()
    await expect(page.getByRole('combobox', { name: 'Attacker unit', exact: true })).toContainText('Intercessor Squad')
    await expect(page.getByRole('region', { name: 'Combined estimate' })).toHaveAttribute('aria-busy', 'false')
    await page.screenshot({ path: `test-results/recent-matchups-simulator-${width}.png`, fullPage: true })
  }
})

test('damaged stored matchups and invalid shared links leave the simulator usable', async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem('praetorium:recent-matchups:v1', '[{"shared":"broken","attacker":"x","defender":"y"}]'),
  )
  await page.goto('/simulator?s=invalid')
  await expect(page.getByRole('button', { name: 'Try an example', exact: true })).toBeEnabled()
  await expect(page.locator(history)).toHaveCount(0)
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: 'test-results/simulator-example-phone.png', fullPage: true })
})
