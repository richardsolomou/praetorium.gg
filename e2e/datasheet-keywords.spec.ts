import { expect, test } from './test'
import { screenshot } from './screenshots'

const cases = [
  { faction: 'aeldari', sheet: 'warp-hunter-legends', ability: 'Twin Linked' },
  { faction: 'drukhari', sheet: 'venom', ability: 'Twin-linked' },
  { faction: 'aeldari', sheet: 'fire-prism', ability: 'Linked Fire' },
  { faction: 'tyranids', sheet: 'norn-assimilator', ability: 'Harpooned' },
  { faction: 'chaos-daemons', sheet: 'great-unclean-one', ability: 'Reverberating Summons' },
  { faction: 'agents-of-the-imperium', sheet: 'culexus-assassin', ability: 'Psychic Assassin' },
  { faction: 'astra-militarum', sheet: 'deathstrike', ability: 'Plasma Warhead' },
  { faction: 'leagues-of-votann', sheet: 'arkanyst-evaluator', ability: 'Overcharge' },
  { faction: 'space-marines', sheet: 'judiciar', ability: 'Fights First' },
  { faction: 'astra-militarum', sheet: 'basilisk', ability: 'Indirect Fire' },
  { faction: 'astra-militarum', sheet: 'gaunts-ghosts', ability: 'Benefit Of Cover' },
]

for (const { faction, sheet, ability } of cases) {
  test(`${sheet} explains ${ability}`, async ({ page }) => {
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 })
      await page.goto(`/factions/${faction}/datasheets/${sheet}`)
      await page.waitForLoadState('networkidle')
      // An ability's words may name the rule as well as its chip, and either explains it.
      await page.getByRole('button', { name: ability, exact: true }).first().click()
      await expect(page.getByRole('tooltip').locator('[data-rule-summary]')).toBeVisible()
      await screenshot(page, `tooltip-${width}.png`)
    }
  })
}

test('Lady Malys keeps her two melee weapons separate', async ({ page }) => {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/factions/drukhari/datasheets/lady-malys')
    await expect(page.getByRole('heading', { name: /Melee weapons 2/i })).toBeVisible()
    await screenshot(page, `separate-weapons-${width}.png`)
  }
})

test('Eradicator Hunter profiles explain their Melta ability', async ({ page }) => {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/factions/space-marines/datasheets/eradicator-squad-with-melta-rifles')
    await page.waitForLoadState('networkidle')
    const weapon = page.locator('tbody[aria-label="melta rifle profiles" i]').getByRole('row').filter({ hasText: 'HUNTER:Monster/Vehicle' })
    await weapon.getByRole('button', { name: 'Melta 2', exact: true }).click()
    await expect(page.getByRole('tooltip').locator('[data-rule-summary]')).toBeVisible()
    await screenshot(page, `tooltip-${width}.png`)
  }
})
