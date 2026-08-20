import { expect, test } from '@playwright/test'
import { attachRoster, chooseBattlefield, createBattle, createRoster, signUp } from './account'

test('a list can be copied as Games Workshop text', async ({ browser }) => {
  const page = await (await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] })).newPage()

  await signUp(page, 'Alice')

  await createRoster(page, { faction: 'Necrons', detachment: /Awakened Dynasty/ })
  await page.getByLabel('Add a unit').fill('Immortals')
  await page.getByRole('button', { name: 'Add Immortals', exact: true }).first().click()
  await page.getByLabel('Add a unit').fill('Overlord')
  await page.getByRole('button', { name: 'Add Overlord', exact: true }).first().click()
  await page.locator('[data-unit="Overlord"]').getByRole('button', { name: 'Immortals', exact: true }).click()
  await page
    .locator('[data-unit="Immortals"]')
    .getByRole('button', { name: /^Immortals/ })
    .click()
  for (let models = 6; models <= 10; models++) {
    await page.getByRole('button', { name: 'More models in Immortals' }).click()
    await expect(page.getByLabel('Immortals models')).toHaveText(String(models))
  }
  const loadout = page.locator('aside[aria-label="Loadout"]')
  for (let swapped = 1; swapped <= 3; swapped++) {
    await loadout.getByRole('button', { name: 'More Tesla carbine' }).click()
    await expect(page.getByLabel('Tesla carbine count')).toHaveText(String(swapped))
  }

  await page.getByRole('button', { name: 'Roster actions' }).click()
  await page.getByRole('menuitem', { name: 'Export GW text' }).click()
  const dialog = page.getByRole('dialog', { name: 'Games Workshop text' })
  await expect(dialog).toContainText('Necrons roster')
  await expect(dialog).toContainText('Awakened Dynasty')
  await expect(dialog).toContainText('Immortals')
  await expect(dialog).toContainText('7x Gauss blaster')
  await expect(dialog).toContainText('3x Tesla carbine')
  await expect(dialog).toContainText('Overlord')
  await dialog.getByRole('button', { name: 'Copy text' }).click()
  await expect(dialog.getByRole('button', { name: 'Copied' })).toBeVisible()
})

test('an imported roster with disagreeing dispositions asks for one before battle setup', async ({ page }) => {
  await signUp(page, 'Bob')

  await page.goto('/rosters')
  await page.getByRole('button', { name: 'Import roster' }).click()
  await page.getByLabel('Roster text').fill(`PoWSS 2K (2000 Points)

Necrons
Pantheon of Woe and Skyshroud Spearhead (3 Detachment Points)
Force Dispositions: Disruption, Reconnaissance
Strike Force (2,000 Points)

CHARACTER

Technomancer (70 Points)
  • Warlord

Exported with BattleBase, Data Version: v20260812`)
  await page.getByRole('button', { name: 'Import pasted roster' }).click()
  await page.waitForURL(/\/rosters\/[^/]+$/)

  const notice = page.getByRole('alert').filter({ hasText: 'Pick a disposition.' })
  await expect(notice).toBeVisible()
  await notice.getByRole('button', { name: 'Choose one' }).click()
  const setup = page.getByRole('dialog', { name: 'Edit roster setup' })
  await setup.getByRole('button', { name: 'Disruption', exact: true }).click()
  await setup.getByRole('button', { name: 'Save changes' }).click()
  await expect(notice).toHaveCount(0)
  await expect(page.getByText('Disruption', { exact: true })).toBeVisible()

  await createBattle(page, { solo: true })
  await attachRoster(page, 'PoWSS 2K')
  await chooseBattlefield(page)
})
