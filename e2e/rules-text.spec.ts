import { expect, test } from './test'
import { PHONE } from './account'

test('the core rules outline links to the official rules', async ({ page }) => {
  await page.goto('/rules/core-rules/moving')
  await expect(page.getByRole('heading', { level: 2, name: 'Moving Units' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Official rules and downloads' })).toHaveAttribute(
    'href',
    'https://www.warhammer-community.com/en-gb/downloads/warhammer-40000/',
  )
})

test('a datasheet displays a community summary without fetching a rules mirror', async ({ page }, testInfo) => {
  const external: string[] = []
  page.on('request', (request) => {
    if (new URL(request.url()).hostname === 'raw.githubusercontent.com') external.push(request.url())
  })
  await page.goto('/factions/space-marines/datasheets/gladiator-lancer')
  const ability = page.locator('article').filter({ has: page.getByRole('heading', { name: /aqu[il]lon optics/i }) })
  await expect(ability.getByText('40kdc community summary')).toBeVisible()
  await expect(ability).toContainText('You can re-roll one Wound roll.')
  expect(external).toEqual([])
  await ability.screenshot({ path: testInfo.outputPath('40kdc-summary.png') })
  await page.setViewportSize(PHONE)
  await ability.screenshot({ path: testInfo.outputPath('40kdc-summary-mobile.png') })
})

test('the datasheet shows its starting models and gear from the catalogue', async ({ page }) => {
  await page.goto('/factions/space-marines/datasheets/gladiator-lancer')
  const configuration = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Unit configuration' }) })
  await expect(configuration).toContainText('1 × Gladiator Lancer')
  await expect(configuration.locator('#loadout')).toContainText(/lancer laser destroyer/i)
  await expect(configuration.locator('#loadout')).toContainText(/defensive array/i)
  await expect(configuration).not.toContainText('Summary unavailable')
})
