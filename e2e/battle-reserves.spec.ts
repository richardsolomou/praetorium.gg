import { expect, test } from '@playwright/test'
import {
  PRACTICE_OPPONENT,
  attachRoster,
  chooseBattlefield,
  createBattle,
  createRoster,
  setupStep,
  signUp,
  uniqueName,
  waitForRosterSave,
} from './account'

test('reserve choices over the points limit are disabled with the reason beside them', async ({ page }) => {
  await signUp(page, uniqueName('Reserves'))
  const roster = await createRoster(page, { faction: 'Necrons', detachment: /Awakened Dynasty/, name: 'Reserve army', size: /Incursion/ })
  for (const unit of ['Monolith', 'Doomsday Ark', 'Immortals']) {
    await page.getByLabel('Add a unit').fill(unit)
    await waitForRosterSave(page, () =>
      page
        .getByRole('button', { name: `Add ${unit}`, exact: true })
        .first()
        .click(),
    )
  }
  await createBattle(page, { practice: true })
  await attachRoster(page, roster)
  await attachRoster(page, roster, { forPlayer: PRACTICE_OPPONENT })
  await chooseBattlefield(page)
  await setupStep(page, 'Reserves')
  const reserves = page.getByRole('region', { name: 'Reserves' })
  await expect(reserves.getByRole('button', { name: /^Change reserves for / })).toHaveCount(0)

  const army = reserves.locator('article').first()
  await expect(army.getByText('0/500 reserve points')).toBeVisible()
  await army.getByRole('button', { name: 'Start Monolith in Strategic reserves', exact: true }).click()
  await expect(army.getByText('420/500 reserve points')).toBeVisible()
  const ark = army.getByRole('button', { name: 'Start Doomsday Ark in Strategic reserves', exact: true })
  await expect(ark).toBeDisabled()
  await expect(ark).toHaveAccessibleDescription('over the 500 pt reserve limit')
  await expect(army.getByRole('button', { name: 'Start Immortals in Strategic reserves', exact: true })).toBeEnabled()

  await army.getByRole('button', { name: 'Start Monolith in Battlefield', exact: true }).click()
  await expect(army.getByText('0/500 reserve points')).toBeVisible()
  await expect(ark).toBeEnabled()
})
