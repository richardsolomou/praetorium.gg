import type { Page } from '@playwright/test'
import { expect, test } from './test'
import { advance, advanceButton, createRoster, openImport, renameRoster, setupBattle, signUp } from './account'
import { custodesOfficial } from '../src/core/rosterText.custodes.fixture'
import { docsScreenshots } from './docsScreenshots'

docsScreenshots()

/** Chosen in the profile rather than left to each account's id, so the two sides always read as two players. */
async function chooseColour(page: Page, colour: string) {
  await page.goto('/profile', { waitUntil: 'networkidle' })
  await page.getByTitle(colour, { exact: true }).click()
  await page.getByRole('button', { name: 'Save profile' }).click()
  await expect(page.getByText('Profile saved.')).toBeVisible()
}

test('readme battle screenshot', async ({ page, browser }) => {
  test.setTimeout(300_000)
  // Two accounts, as in a real game, so each side and its events carry that player's own colour.
  const opponent = await (await browser.newContext()).newPage()
  await signUp(opponent, 'rago')
  await chooseColour(opponent, 'Azure')
  const custodes = await createRoster(opponent, { faction: 'Adeptus Custodes', detachment: /Aquilan Shield/, name: 'Aquilan Shield' })
  await signUp(page, 'tronic')
  await chooseColour(page, 'Crimson')
  const necrons = await createRoster(page, { faction: 'Necrons', detachment: /Awakened Dynasty/, name: 'Necron army' })
  await setupBattle(page, opponent, { hostRoster: necrons, guestRoster: custodes })
  await advance(page)

  await page.setViewportSize({ width: 1440, height: 900 })
  await expect(page.getByRole('region', { name: 'Battle scoreboard' })).toBeVisible()
  // The controls wait for the last command to land, and a picture of them greyed out reads as a broken page.
  await expect(advanceButton(page)).toBeEnabled()
  await page.screenshot({
    path: 'docs/images/readme-battle.png',
    animations: 'disabled',
    caret: 'hide',
    style: '[data-sonner-toaster] { display: none !important; }',
  })
})

test('readme roster builder screenshot', async ({ page }) => {
  test.setTimeout(180_000)
  await signUp(page, 'rago')
  await chooseColour(page, 'Azure')
  const dialog = await openImport(page)
  await dialog.getByLabel('Roster text').fill(custodesOfficial)
  await dialog.getByRole('button', { name: 'Import pasted roster', exact: true }).click()
  await dialog
    .getByRole('button', { name: /^Import (roster|anyway)$/ })
    .first()
    .click()
  await page.waitForURL(/\/rosters\/[^/]+$/)
  await renameRoster(page, 'Lions of the Emperor')
  await page
    .locator('[data-unit="Custodian Guard Sodality"]')
    .getByRole('button', { name: 'Custodian Guard Sodality', exact: true })
    .first()
    .click()
  await expect(page.locator('aside[data-pane="loadout"]')).toBeVisible()

  await page.setViewportSize({ width: 1440, height: 900 })
  await page.screenshot({
    path: 'docs/images/readme-builder.png',
    animations: 'disabled',
    caret: 'hide',
    style: '[data-sonner-toaster] { display: none !important; }',
  })
})
