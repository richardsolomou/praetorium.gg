import { expect, test } from '@playwright/test'

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

for (const width of [1440, 390]) {
  for (const { faction, sheet, ability, body } of cases) {
    test(`${sheet} explains ${ability} at ${width}px`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 900 })
      await page.goto(`/factions/${faction}/datasheets/${sheet}`)
      await page.waitForLoadState('networkidle')
      await page.getByRole('button', { name: ability, exact: true }).click()
      await expect(page.getByRole('tooltip')).toContainText(body)
      await page.screenshot({ path: testInfo.outputPath('tooltip.png') })
    })
  }

  test(`Eradicator Hunter profiles explain their semicolon-separated Melta ability at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/factions/space-marines/datasheets/eradicator-squad-with-melta-rifles')
    await page.waitForLoadState('networkidle')
    const weapon = page.getByRole('row').filter({ hasText: 'Melta Rifle – Hunter' })
    await weapon.getByRole('button', { name: 'Melta 2', exact: true }).click()
    await expect(page.getByRole('tooltip')).toContainText(/D characteristic/i)
    await page.screenshot({ path: testInfo.outputPath('tooltip.png') })
  })
}
