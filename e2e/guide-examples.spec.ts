import { expect, test } from '@playwright/test'
import { add } from './builder.harness'
import { advance, attachRoster, createBattle, createRoster, PRACTICE_OPPONENT, signUp, startBattle, waitForRosterSave } from './account'
import { chooseCombatUnit, closeCombatBreakdown } from './combat'

test.use({ viewport: { width: 1440, height: 1100 } })

test('the army guide example keeps a five-model Immortals draft through reload', async ({ page }, testInfo) => {
  await page.goto('/rosters')
  const setup = page.getByRole('region', { name: 'Create roster' })
  await setup.getByRole('combobox', { name: 'Faction' }).click()
  await page.getByPlaceholder('Search factions…').fill('Necrons')
  await page.getByRole('option', { name: 'Necrons', exact: true }).click()
  await setup.getByRole('button', { name: 'Select Awakened Dynasty' }).click()
  await setup.getByRole('group', { name: 'Force disposition' }).getByRole('button', { name: 'Take and Hold' }).click()
  await setup.getByRole('button', { name: 'Start building' }).click()
  await add(page, 'Immortals')
  await expect(page.locator('[data-stat="points"]')).not.toHaveText(/^0\//)
  await expect
    .poll(() => page.evaluate(() => sessionStorage.getItem('praetorium.workspace-state:/rosters:guest-draft')))
    .toContain('"picks":[{')
  await page.reload()
  await expect(page.locator('[data-unit="Immortals"]').first()).toBeVisible()
  await page.locator('[data-unit="Immortals"]').getByRole('button', { name: 'Immortals', exact: true }).click()
  await expect(page.getByLabel('Immortals models')).toHaveText('5')
  await page.locator('[data-roster-builder]').screenshot({ path: testInfo.outputPath('build-an-army.png') })
})

test('the import guide example preserves units from a complete text export', async ({ page }, testInfo) => {
  await signUp(page, 'Guide player')
  await createRoster(page, { faction: 'Necrons', detachment: /Awakened Dynasty/, name: 'Immortals example' })
  await waitForRosterSave(page, () => add(page, 'Immortals'))
  await page.getByRole('button', { name: 'Roster actions' }).click()
  await page.getByRole('menuitem', { name: 'Export GW text' }).click()
  const exported = page.getByRole('dialog', { name: 'Games Workshop text' })
  const text = await exported.locator('pre').innerText()
  await page.goto('/rosters')
  await page.getByRole('button', { name: 'Import roster', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Import roster', exact: true })
  await dialog.getByLabel('Roster text').fill(text)
  await expect(dialog.getByRole('button', { name: 'Import pasted roster', exact: true })).toBeEnabled()
  await dialog.getByLabel('Roster text').evaluate((element) => {
    element.scrollTop = 0
  })
  await dialog.screenshot({ path: testInfo.outputPath('import-a-roster.png') })
  await dialog.getByRole('button', { name: 'Import pasted roster', exact: true }).click()
  await expect(page).toHaveURL(/\/rosters\/[^/]+$/)
  await expect(page.locator('[data-unit="Immortals"]')).toHaveCount(1)
  await page.reload()
  await expect(page.locator('[data-unit="Immortals"]')).toHaveCount(1)
})

test('the loadout guide example shares five tesla carbines', async ({ page }, testInfo) => {
  await page.goto('/simulator')
  await chooseCombatUnit(page, 'Attacker', 'Necrons', 'Immortals')
  await chooseCombatUnit(page, 'Defender', 'Necrons', 'Necron Warriors')
  const attacker = page.getByRole('region', { name: 'Attacker', exact: true })
  await attacker.getByRole('button', { name: 'Loadout', exact: true }).click()
  const loadout = page.getByRole('dialog')
  await loadout.getByRole('button', { name: 'Select Tesla carbine', exact: true }).click()
  await loadout.getByRole('button', { name: 'Close', exact: true }).click()
  const shooting = page.getByRole('region', { name: 'Shooting results' })
  await expect(shooting).toHaveAttribute('aria-busy', 'false')
  await expect(shooting.getByRole('heading', { name: '5× Tesla carbine', exact: true })).toBeVisible()
  await expect(shooting.getByRole('alert')).toHaveCount(0)
  await closeCombatBreakdown(page)
  for (const details of await page.locator('[data-combat-buffs], [data-manual-modifiers]').all()) {
    if (await details.evaluate((element) => (element as HTMLDetailsElement).open)) await details.locator('summary').click()
  }
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: testInfo.outputPath('compare-loadouts.png'), fullPage: true })
  await page.reload()
  await expect(shooting.getByRole('heading', { name: '5× Tesla carbine', exact: true })).toBeVisible()
})

test('the battle guide example advances a practice game from command to movement', async ({ page }, testInfo) => {
  await signUp(page, 'Guide player')
  const roster = await createRoster(page, { faction: 'Necrons', detachment: /Awakened Dynasty/, name: 'Practice army' })
  await waitForRosterSave(page, () => add(page, 'Immortals'))
  await createBattle(page, { practice: true })
  await attachRoster(page, roster)
  await attachRoster(page, roster, { forPlayer: PRACTICE_OPPONENT })
  await startBattle(page)
  await advance(page)
  await expect(page.getByRole('heading', { name: 'movement phase', exact: true })).toBeVisible()
  await page.getByRole('region', { name: 'Battle scoreboard', exact: true }).screenshot({ path: testInfo.outputPath('track-a-battle.png') })
})
