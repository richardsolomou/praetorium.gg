import { expect, test } from './test'

const cases = [
  { faction: 'drukhari', sheet: 'venom', ability: 'Twin Linked' },
  { faction: 'aeldari', sheet: 'fire-prism', ability: 'Linked Fire' },
  { faction: 'tyranids', sheet: 'norn-assimilator', ability: 'Harpooned' },
  { faction: 'chaos-daemons', sheet: 'great-unclean-one', ability: 'Reverberating Summons' },
  { faction: 'agents-of-the-imperium', sheet: 'culexus-assassin', ability: 'Psychic Assassin' },
  { faction: 'astra-militarum', sheet: 'deathstrike', ability: 'Plasma Warhead' },
  { faction: 'leagues-of-votann', sheet: 'arkanyst-evaluator', ability: 'Overcharge' },
  { faction: 'space-marines', sheet: 'judiciar', ability: 'Fights First' },
  { faction: 'astra-militarum', sheet: 'basilisk', ability: 'Indirect Fire' },
]

for (const { faction, sheet, ability } of cases) {
  test(`${sheet} links to the official rules for ${ability}`, async ({ page }, testInfo) => {
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 })
      await page.goto(`/factions/${faction}/datasheets/${sheet}`)
      await page.waitForLoadState('networkidle')
      await page.getByRole('button', { name: ability, exact: true }).first().click()
      const tooltip = page.getByRole('tooltip')
      await expect(tooltip).toContainText('Summary unavailable.')
      await expect(tooltip.getByRole('link', { name: 'Official rules and downloads' })).toHaveAttribute(
        'href',
        'https://www.warhammer-community.com/en-gb/downloads/warhammer-40000/',
      )
      await page.screenshot({ path: testInfo.outputPath(`tooltip-${width}.png`) })
    }
  })
}

test('Lady Malys keeps her two melee weapons separate', async ({ page }, testInfo) => {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/factions/drukhari/datasheets/lady-malys')
    await expect(page.getByRole('heading', { name: /Melee weapons 2/i })).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath(`separate-weapons-${width}.png`) })
  }
})

test('Eradicator Hunter profiles link to the official rules for Melta', async ({ page }, testInfo) => {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/factions/space-marines/datasheets/eradicator-squad-with-melta-rifles')
    await page.waitForLoadState('networkidle')
    const weapon = page.locator('tbody[aria-label="melta rifle profiles"]').getByRole('row').filter({ hasText: 'HUNTER:Monster/Vehicle' })
    await weapon.getByRole('button', { name: 'Melta 2', exact: true }).click()
    await expect(page.getByRole('tooltip').getByRole('link', { name: 'Official rules and downloads' })).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath(`tooltip-${width}.png`) })
  }
})
