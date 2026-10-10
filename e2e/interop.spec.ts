import { expect, test } from '@playwright/test'
import {
  attachRoster,
  chooseBattlefield,
  createBattle,
  createRoster,
  desktopContext,
  PRACTICE_OPPONENT,
  retryUntilVisible,
  signUp,
  waitForRosterSave,
} from './account'

test('a list can be copied as Games Workshop text', async ({ browser }) => {
  const page = await (await browser.newContext({ ...desktopContext, permissions: ['clipboard-read', 'clipboard-write'] })).newPage()

  await signUp(page, 'Alice')

  await createRoster(page, { faction: 'Necrons', detachment: /Awakened Dynasty/ })
  await page.getByLabel('Add a unit').fill('Immortals')
  await page.getByRole('button', { name: 'Add Immortals', exact: true }).first().click()
  await page.getByLabel('Add a unit').fill('Overlord')
  await page.getByRole('button', { name: 'Add Overlord', exact: true }).first().click()
  await page.locator('[data-unit="Overlord"]').getByRole('button', { name: 'Attach Overlord to unit' }).click()
  await page.getByRole('menu').getByRole('menuitem', { name: 'Immortals', exact: true }).click()
  await page
    .locator('[data-unit="Immortals"]')
    .getByRole('button', { name: /^Immortals/ })
    .click()
  for (let models = 6; models <= 10; models++) {
    await page.getByRole('button', { name: 'More models in Immortals' }).click()
    await expect(page.getByLabel('Immortals models')).toHaveText(String(models))
  }
  // Immortals take one weapon or the other for the whole squad, so the export has to
  // carry whichever was picked.
  const loadout = page.locator('aside[aria-label="Loadout"]')
  await loadout.getByRole('button', { name: 'Select Tesla carbine' }).click()
  await expect(page.getByText('10x Tesla carbine')).toBeVisible()

  await page.getByRole('button', { name: 'Roster actions' }).click()
  await page.getByRole('menuitem', { name: 'Export GW text' }).click()
  const dialog = page.getByRole('dialog', { name: 'Games Workshop text' })
  const text = dialog.locator('pre')
  await page.setViewportSize({ width: 390, height: 500 })
  await expect(dialog).toContainText('Necrons roster')
  await expect(dialog).toContainText('Awakened Dynasty')
  await expect(dialog).toContainText('Immortals')
  await expect(dialog).toContainText('10x Tesla carbine')
  await expect(dialog).toContainText('Overlord')
  await expect(dialog).toContainText('Leading: Immortals')
  await expect(dialog).toContainText('Leader: Overlord')
  await expect(text).toContainText(/Exported with Praetorium\.gg v\d+\.\d+\.\d+\s*\nRuleset: [a-z0-9-]+\s*$/)
  await expect.poll(() => dialog.evaluate((element) => element.scrollHeight - element.clientHeight)).toBe(0)
  await expect.poll(() => text.evaluate((element) => element.scrollHeight - element.clientHeight)).toBeGreaterThan(0)
  await expect(dialog.getByRole('button', { name: 'Copy text' })).toBeInViewport()
  await expect(text).toHaveJSProperty('scrollTop', 0)
  await dialog.getByRole('button', { name: 'Copy text' }).click()
  await expect(dialog.getByRole('button', { name: 'Copied' })).toBeVisible()
  await dialog.screenshot({ path: 'test-results/gw-text-export-phone.png' })
  await page.setViewportSize({ width: 1440, height: 500 })
  await expect.poll(() => dialog.evaluate((element) => element.scrollHeight - element.clientHeight)).toBe(0)
  await expect(dialog.getByRole('button', { name: 'Copied' })).toBeInViewport()
  await dialog.screenshot({ path: 'test-results/gw-text-export-desktop.png' })
  await page.setViewportSize({ width: 390, height: 500 })
  await text.evaluate((element) => element.scrollTo({ top: element.scrollHeight }))
  await dialog.screenshot({ path: 'test-results/gw-text-export-footer-phone.png' })
})

test('an imported roster with disagreeing dispositions asks for one before battle setup', async ({ page }) => {
  await signUp(page, 'Bob')

  await page.goto('/rosters')
  // The button answers only once the page has hydrated.
  await retryUntilVisible(page.getByLabel('Roster text'), () => page.getByRole('button', { name: 'Import roster' }).click())
  await page.getByLabel('Roster text').fill(`HLHOTD 2K - C'tan (1995 Points)

Necrons
Hypercrypt Legion and Hand of the Dynasty (3 Detachment Points)
Force Dispositions: Reconnaissance, Take and Hold
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
  await setup.getByRole('button', { name: 'Take and Hold', exact: true }).click()
  await waitForRosterSave(page, () => setup.getByRole('button', { name: 'Save changes' }).click())
  await expect(notice).toHaveCount(0)
  await expect(page.getByText('Take and Hold', { exact: true })).toBeVisible()

  for (const disposition of ['Take and Hold', 'Reconnaissance']) {
    if (disposition === 'Reconnaissance') {
      await page.getByRole('button', { name: 'Roster actions' }).click()
      await page.getByRole('menuitem', { name: 'Edit roster setup' }).click()
      await setup.getByRole('button', { name: disposition, exact: true }).click()
      await waitForRosterSave(page, () => setup.getByRole('button', { name: 'Save changes' }).click())
    }
    await page.reload()
    await expect(page.getByText(disposition, { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Roster actions' }).click()
    await page.getByRole('menuitem', { name: 'Export GW text' }).click()
    const exported = page.getByRole('dialog', { name: 'Games Workshop text' })
    await expect(exported.locator('pre')).toContainText(`Force Disposition: ${disposition}\n`)
    await expect(exported.locator('pre')).not.toContainText('Force Dispositions:')
    await exported.screenshot({ path: `test-results/selected-disposition-export-${disposition.toLowerCase()}.png` })
    await exported.getByRole('button', { name: 'Close' }).click()
  }

  await createBattle(page, { practice: true })
  await attachRoster(page, "HLHOTD 2K - C'tan")
  await attachRoster(page, "HLHOTD 2K - C'tan", { forPlayer: PRACTICE_OPPONENT })
  await chooseBattlefield(page)
})
