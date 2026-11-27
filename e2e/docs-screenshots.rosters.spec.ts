import { expect, test } from './test'
import { addUnit, chooseRosterAction, seededRoster, openImport, openLibraryShare, renameRoster, retryUntilVisible, signUp } from './account'
import { bloodAngelsOfficial } from '../src/core/rosterText.bloodAngels.fixture'
import { capture, docsScreenshots } from './docsScreenshots'

docsScreenshots()

test('search screenshot', async ({ page }) => {
  await page.goto('/')
  const search = page.getByRole('combobox')
  await retryUntilVisible(search, () =>
    page.getByRole('button', { name: 'Search Praetorium', exact: true }).filter({ visible: true }).click(),
  )
  await search.fill('bolt rifle')
  const dialog = page.getByRole('dialog').filter({ has: search })
  const matched = dialog.getByText(/^Matches/).nth(1)
  await expect(matched).toBeVisible()
  await capture('search-results', dialog, matched)
})

test('roster library screenshots', async ({ page }) => {
  test.setTimeout(180_000)
  await signUp(page, 'Docs player')
  await seededRoster(page, { faction: 'Necrons', detachment: 'Awakened Dynasty', name: 'Necron army' })
  await addUnit(page, 'Necron Warriors')
  await seededRoster(page, { faction: 'Space Marines', detachment: 'Gladius Task Force', name: 'Gladius strike force' })
  await addUnit(page, 'Intercessor Squad')
  await addUnit(page, 'Captain')

  await page.locator('[data-unit="Intercessor Squad"]').getByRole('button', { name: 'Intercessor Squad', exact: true }).click()
  const loadout = page.locator('aside[data-pane="loadout"]')
  await page.setViewportSize({ width: 1280, height: 560 })
  await capture('simulate-from-roster', loadout, loadout.getByRole('button', { name: 'Simulate combat' }).first())
  await page.setViewportSize({ width: 1280, height: 900 })

  // A whole tournament-sized list, so the grades read like a real army's rather than a sketch's.
  const pasted = await openImport(page)
  await pasted.getByLabel('Roster text').fill(bloodAngelsOfficial)
  await pasted.getByRole('button', { name: 'Import pasted roster', exact: true }).click()
  await pasted
    .getByRole('button', { name: /^Import (roster|anyway)$/ })
    .first()
    .click()
  await page.waitForURL(/\/rosters\/[^/]+$/)
  await renameRoster(page, 'Blood Angels strike force')
  await chooseRosterAction(page, 'Grade this roster')
  const grades = page.getByRole('dialog', { name: 'Roster grades', exact: true })
  await expect(grades.getByRole('status', { name: 'Grading this roster' })).toBeHidden({ timeout: 60_000 })
  await page.setViewportSize({ width: 1280, height: 720 })
  await capture('roster-grades', grades)
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.keyboard.press('Escape')

  await page.goto('/rosters')
  const share = await openLibraryShare(page, 'Gladius strike force')
  // The test server's own address would read as the link to share.
  await share.locator('input[readonly]').evaluate((input) => {
    ;(input as HTMLInputElement).value = (input as HTMLInputElement).value.replace(/^https?:\/\/[^/]+/, 'https://praetorium.gg')
  })
  await capture('copy-and-share-dialog', share, share.locator('fieldset').filter({ hasText: 'Who can open it' }))
  await page.keyboard.press('Escape')

  const bar = page.locator('[data-filter-bar]').first()
  await bar.getByRole('button', { name: 'Faction', exact: true }).click()
  const exclude = page.getByRole('button', { name: 'Exclude Necrons' })
  await expect(exclude).toBeVisible()
  await page.setViewportSize({ width: 1280, height: 640 })
  await capture('filter-lists-bar', page.getByRole('main'), exclude)
})
