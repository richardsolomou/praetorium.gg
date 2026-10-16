import { expect, test } from './test'

const chapters = [
  ['imperial-fists', 'Ceramite Sentinels'],
  ['iron-hands', "Medusa's Wrath"],
  ['raven-guard', 'Shadowmark Talon'],
  ['salamanders', "Forgefather's Seekers"],
  ['ultramarines', 'Blade of Ultramar'],
  ['white-scars', 'Spearpoint Task Force'],
] as const

for (const width of [390, 1440]) {
  test(`Marine chapters show only their own detachment references at ${width}px @catalogue`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    for (const [chapter, detachment] of chapters) {
      await page.goto(`/factions/${chapter}`)
      const list = page.locator('[data-onboarding="faction-detachments"]')
      await expect(list.locator('h2 > .readout')).toHaveText('1')
      await expect(list.getByRole('link', { name: /^Gladius Task Force/ })).toHaveCount(0)
      await page.screenshot({ path: `test-results/marine-${chapter}-${width}.png`, fullPage: true })
      await list.getByRole('link', { name: new RegExp(`^${detachment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) }).click()
      await expect(page.getByRole('heading', { level: 1, name: detachment, exact: true })).toBeVisible()
      await expect(page).toHaveURL(new RegExp(`/factions/${chapter}/.*detachments/`))
      await page.reload()
      await expect(page.getByRole('heading', { level: 1, name: detachment, exact: true })).toBeVisible()
      await page.screenshot({ path: `test-results/marine-${chapter}-detachment-${width}.png`, fullPage: true })
    }
    for (const [chapter, count] of [
      ['black-templars', 3],
      ['blood-angels', 3],
      ['dark-angels', 3],
      ['deathwatch', 1],
      ['space-wolves', 3],
    ] as const) {
      await page.goto(`/factions/${chapter}`)
      const list = page.locator('[data-onboarding="faction-detachments"]')
      await expect(list.locator('h2 > .readout')).toHaveText(String(count))
      await expect(list.getByRole('link', { name: /^Gladius Task Force/ })).toHaveCount(0)
      await expect(list.getByRole('link', { name: /^Forgefather's Seekers/ })).toHaveCount(0)
    }
    for (const version of [
      'space-marines-codex-2026-10-03',
      'space-marines-codex-2026-10-12',
      'space-marines-codex-2026-10-13',
      'space-marines-points-2026-10-13',
      'mfm-1-6',
    ]) {
      await page.goto(`/factions/salamanders/rules/${version}`)
      await page
        .locator('[data-onboarding="faction-detachments"]')
        .getByRole('link', { name: /^Forgefather's Seekers/ })
        .click()
      await expect(page).toHaveURL(`/factions/salamanders/rules/${version}/detachments/forgefathers-seekers`)
      await expect(page.getByRole('heading', { level: 1, name: "Forgefather's Seekers", exact: true })).toBeVisible()
      await page.goto(`/factions/space-marines/rules/${version}`)
      const parentList = page.locator('[data-onboarding="faction-detachments"]')
      await expect(parentList.getByRole('link', { name: /^Forgefather's Seekers/ })).toHaveCount(0)
      await parentList.getByRole('link', { name: /^Gladius Task Force/ }).click()
      await expect(page).toHaveURL(`/factions/space-marines/rules/${version}/detachments/gladius-task-force`)
      await expect(page.getByRole('heading', { level: 1, name: 'Gladius Task Force', exact: true })).toBeVisible()
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  })
}
