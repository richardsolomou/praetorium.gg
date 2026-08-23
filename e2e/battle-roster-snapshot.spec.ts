import { expect, test } from '@playwright/test'
import { attachRoster, createBattle, createRoster, PRACTICE_OPPONENT, signUp, uniqueName, waitForRosterSave } from './account'

const lastPathSegment = (url: string) => new URL(url).pathname.match(/\/([^/]+)\/?$/)?.[1]

test('a fielded roster opens as the frozen read-only roster view', async ({ page }) => {
  await signUp(page, uniqueName('Snapshot'))
  const rosterName = await createRoster(page, { faction: 'Death Guard', detachment: /Shamblerot Vectorium/, name: 'Fielded Death Guard' })
  await page.getByLabel('Add a unit').fill('Lord of Virulence')
  await waitForRosterSave(page, () => page.getByRole('button', { name: 'Add Lord of Virulence', exact: true }).first().click())
  const rosterId = lastPathSegment(page.url())
  expect(rosterId).toBeTruthy()

  const battleUrl = await createBattle(page, { practice: true })
  await attachRoster(page, rosterName)
  await attachRoster(page, rosterName, { forPlayer: PRACTICE_OPPONENT })
  await expect(page.getByRole('navigation', { name: 'Setup sections' }).getByRole('button', { name: /Armies/ })).toHaveAttribute(
    'data-complete',
    'true',
  )
  const token = lastPathSegment(battleUrl)
  await page.goto(`/rosters/${rosterId}?battle=${token}`)

  await expect(page.getByLabel('List name')).toHaveValue(rosterName)
  await expect(page.getByLabel('List name')).toHaveAttribute('readonly', '')
  await expect(page.getByText('Characters', { exact: true })).toBeVisible()
  await expect(page.locator('[data-unit="Lord of Virulence"]')).toContainText('Lord of Virulence')
  await page.locator('[data-unit="Lord of Virulence"]').click()
  await expect(page.locator('[data-pane="loadout"]')).toBeVisible()
  await expect(page.locator('[data-slot="unit-profile"]')).toBeVisible()
  await expect(page.locator('pre')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Unit actions/ })).toHaveCount(0)
})
