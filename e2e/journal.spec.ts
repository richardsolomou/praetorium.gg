import { expect, test } from './test'
import { signUp, uniqueName } from './account'
import type { Page } from '@playwright/test'

async function recordGame(page: Page, { playedOn, opponent, score, opponentScore, result, event }: Record<string, string | undefined>) {
  await page.getByRole('button', { name: 'Record a game' }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Record a game' })
  if (playedOn) await dialog.getByLabel('Played on').fill(playedOn)
  if (event) {
    await dialog.getByLabel('Event').click()
    await page.getByRole('option', { name: event }).click()
  }
  if (opponent) await dialog.getByLabel('Opponent', { exact: true }).fill(opponent)
  if (score) await dialog.getByLabel('Your victory points').fill(score)
  if (opponentScore) await dialog.getByLabel('Opponent’s victory points').fill(opponentScore)
  if (result) await dialog.getByRole('button', { name: result, exact: true }).click()
  await dialog.getByRole('button', { name: 'Record game' }).click()
  await expect(dialog).toBeHidden()
}

test('a player keeps a private journal of games played elsewhere, grouped by event', async ({ page }) => {
  await page.goto('/journal')
  await expect(page.getByText('Sign in to record games you played away from Praetorium.')).toBeVisible()

  await signUp(page, uniqueName('Journal'))
  await page.goto('/journal')
  await expect(page.getByRole('heading', { name: 'No games recorded' })).toBeVisible()

  await recordGame(page, { playedOn: '2026-10-01', opponent: 'Sam', result: 'Drew' })
  await page.getByRole('button', { name: 'Record a game' }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Record a game' })
  await dialog.getByLabel('Played on').fill('2026-10-03')
  await dialog.getByRole('combobox', { name: 'Your faction' }).click()
  await page.getByPlaceholder('Search factions…').fill('Necrons')
  await page.getByRole('option', { name: 'Necrons', exact: true }).click()
  await dialog.getByLabel('Your victory points').fill('80')
  await dialog.getByLabel('Opponent’s victory points').fill('60')
  await expect(dialog.getByRole('button', { name: 'Won', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(dialog.getByText('The scores decide the result.')).toBeVisible()
  await page.setViewportSize({ width: 390, height: 844 })
  await dialog.screenshot({ path: 'test-results/journal-record-phone.png' })
  await page.setViewportSize({ width: 1440, height: 900 })
  await dialog.getByRole('button', { name: 'Record game' }).click()
  await expect(dialog).toBeHidden()

  const totals = page.locator('dl[aria-label="All games"]')
  await expect(totals).toContainText('2')
  await expect(totals).toContainText('1 · 1 · 0')
  await expect(totals).toContainText('80–60')
  await expect(page.locator('[data-journal-game]').first()).toContainText('Win')
  await expect(page.locator('[data-journal-game]').first()).toContainText('Necrons')

  await page.getByRole('button', { name: 'Add an event' }).click()
  const eventDialog = page.getByRole('dialog', { name: 'Add an event' })
  await eventDialog.getByLabel('Event name').fill('Autumn GT')
  await eventDialog.getByRole('button', { name: 'Add event' }).click()
  await expect(eventDialog).toBeHidden()
  await recordGame(page, { playedOn: '2026-10-05', opponent: 'Alex', score: '45', opponentScore: '70', event: 'Autumn GT' })
  const event = page.getByRole('region', { name: 'Autumn GT' })
  await expect(event.locator('[data-journal-game]')).toHaveCount(1)
  await expect(event).toContainText('Loss')

  await event.getByRole('button', { name: /^Actions for the game/ }).click()
  await page.getByRole('menuitem', { name: 'Edit game' }).click()
  const editDialog = page.getByRole('dialog', { name: 'Edit game' })
  await editDialog.getByLabel('Notes').fill('Lost on primary in round four')
  await editDialog.getByRole('button', { name: 'Save changes' }).click()
  await expect(editDialog).toBeHidden()

  await page.reload()
  await expect(page.locator('[data-journal-game]')).toHaveCount(3)
  await expect(page.getByRole('region', { name: 'Autumn GT' })).toContainText('Lost on primary in round four')
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  await page.screenshot({ path: 'test-results/journal-phone.png', fullPage: true })
  await page.setViewportSize({ width: 1440, height: 900 })

  await page.getByRole('button', { name: 'Actions for Autumn GT' }).click()
  await page.getByRole('menuitem', { name: 'Delete event' }).click()
  await expect(page.getByRole('alertdialog')).toContainText('Its game stays in your journal, no longer grouped.')
  await page.getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Autumn GT' })).toHaveCount(0)
  await expect(page.locator('[data-journal-game]')).toHaveCount(3)

  await page
    .locator('[data-journal-game]')
    .filter({ hasText: 'Sam' })
    .getByRole('button', { name: /^Actions for the game/ })
    .click()
  await page.getByRole('menuitem', { name: 'Delete game' }).click()
  await page.getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(page.locator('[data-journal-game]')).toHaveCount(2)
  await page.reload()
  await expect(page.locator('[data-journal-game]')).toHaveCount(2)
})
