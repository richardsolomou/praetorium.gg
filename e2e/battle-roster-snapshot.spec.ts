import { expect, test } from '@playwright/test'
import { attachRoster, createBattle, createRoster, signUp, uniqueName, waitForRosterSave } from './account'

test('a fielded roster opens as the frozen read-only roster view', async ({ page }) => {
  await signUp(page, uniqueName('Snapshot'))
  const rosterName = await createRoster(page, { faction: 'Death Guard', detachment: /Shamblerot Vectorium/, name: 'Fielded Death Guard' })
  await page.getByLabel('Add a unit').fill('Lord of Virulence')
  await waitForRosterSave(page, () => page.getByRole('button', { name: 'Add Lord of Virulence', exact: true }).first().click())
  const rosterId = new URL(page.url()).pathname.split('/').filter(Boolean).at(-1)
  expect(rosterId).toBeTruthy()

  const battleUrl = await createBattle(page, { solo: true })
  await attachRoster(page, rosterName)
  const token = new URL(battleUrl).pathname.split('/').filter(Boolean).at(-1)
  await page.goto(`/rosters/${rosterId}?battle=${token}`)

  await expect(page.getByRole('heading', { name: rosterName })).toBeVisible()
  await expect(page.getByText('Characters', { exact: true })).toBeVisible()
  await expect(page.locator('[data-unit="Lord of Virulence"]')).toContainText('Lord of Virulence')
  await expect(page.locator('pre')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Unit actions/ })).toHaveCount(0)
})
