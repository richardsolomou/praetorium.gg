import { expect, test } from './test'
import { chooseRosterAction, signUp, openImport } from './account'
import { capture, docsScreenshots } from './docsScreenshots'
import { necronsOfficial } from '../src/core/rosterText.necrons.fixture'

docsScreenshots()

/** The official-app export with an unknown unit and an enhancement from a detachment the list didn't take. */
const necronsWithMistakes = necronsOfficial
  .replace('Enhancements: Murdermind', 'Enhancements: Veil of Darkness')
  .replace('CHARACTERS', 'BATTLELINE\n\nNecron Warrior (90 Points)\n  • 10x Necron Warrior\n\nCHARACTERS')

test('import a roster', async ({ page }) => {
  await signUp(page, 'Docs importer')
  const dialog = await openImport(page)

  const pasted = dialog.getByLabel('Roster text')
  await pasted.fill(necronsWithMistakes)
  await pasted.evaluate((element) => {
    element.blur()
    element.scrollTop = 0
  })
  await capture('import-a-roster-paste', dialog, dialog.getByRole('button', { name: 'Import pasted roster', exact: true }))

  await dialog.getByRole('button', { name: 'Import pasted roster', exact: true }).click()
  const importAnyway = dialog.getByRole('button', { name: 'Import anyway', exact: true })
  await expect(importAnyway).toBeVisible()
  await capture('import-a-roster-shortfall', dialog, importAnyway)

  await dialog.getByRole('button', { name: 'Edit pasted text', exact: true }).click()
  await dialog.getByLabel('Roster text').fill(necronsOfficial)
  await dialog.getByRole('button', { name: 'Import pasted roster', exact: true }).click()
  const points = dialog.getByText(/^Reported army:/)
  await expect(points).toBeVisible()
  await capture('import-a-roster-review', dialog, points)

  await dialog.getByRole('button', { name: 'Import roster', exact: true }).click()
  await page.waitForURL(/\/rosters\/[^/]+$/)
  await expect(page.locator('[data-unit]')).toHaveCount(7)

  await chooseRosterAction(page, 'Exchange code')
  const exchange = page.getByRole('dialog', { name: 'Exchange code' })
  await expect(exchange.getByRole('img', { name: /^Exchange QR code for / })).toBeVisible()
  await capture('import-a-roster-exchange-code', exchange, exchange.getByRole('button', { name: 'Copy code' }))
  await exchange.getByRole('button', { name: 'Close' }).first().click()

  await chooseRosterAction(page, 'Export text')
  const exported = page.getByRole('dialog', { name: 'Export roster' })
  await expect(exported.locator('pre')).toContainText('Nekrosor Ammentar')
  await capture('import-a-roster-export-text', exported, exported.getByRole('button', { name: 'Copy text' }))
})
