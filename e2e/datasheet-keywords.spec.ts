import { expect, test } from './test'

const cases = [
  { faction: 'drukhari', sheet: 'venom', ability: 'Twin Linked', body: /wound roll/i },
  { faction: 'aeldari', sheet: 'fire-prism', ability: 'Linked Fire', body: /determine visibility/i },
  { faction: 'tyranids', sheet: 'norn-assimilator', ability: 'Harpooned', body: /charge rolls/i },
  { faction: 'chaos-daemons', sheet: 'great-unclean-one', ability: 'Reverberating Summons', body: /Plaguebearer model/i },
  { faction: 'agents-of-the-imperium', sheet: 'culexus-assassin', ability: 'Psychic Assassin', body: /Attacks characteristic/i },
  { faction: 'astra-militarum', sheet: 'deathstrike', ability: 'Plasma Warhead', body: /Remained Stationary/i },
  { faction: 'leagues-of-votann', sheet: 'arkanyst-evaluator', ability: 'Overcharge', body: /Hazardous test/i },
  { faction: 'space-marines', sheet: 'judiciar', ability: 'Fights First', body: /Fight phase/i },
  { faction: 'tyranids', sheet: 'sporocyst', ability: 'Hive Defences', body: /Fire Overwatch/i },
]

for (const { faction, sheet, ability, body } of cases) {
  test(`${sheet} explains ${ability}`, async ({ page }, testInfo) => {
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 })
      await page.goto(`/factions/${faction}/datasheets/${sheet}`)
      await page.waitForLoadState('networkidle')
      await page.getByRole('button', { name: ability, exact: true }).click()
      await expect(page.getByRole('tooltip')).toContainText(body)
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

test('Eradicator Hunter profiles explain their Melta ability', async ({ page }, testInfo) => {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/factions/space-marines/datasheets/eradicator-squad-with-melta-rifles')
    await page.waitForLoadState('networkidle')
    const weapon = page.locator('tbody[aria-label="melta rifle profiles"]').getByRole('row').filter({ hasText: 'HUNTER:Monster/Vehicle' })
    await weapon.getByRole('button', { name: 'Melta 2', exact: true }).click()
    await expect(page.getByRole('tooltip')).toContainText(/D characteristic/i)
    await page.screenshot({ path: testInfo.outputPath(`tooltip-${width}.png`) })
  }
})
