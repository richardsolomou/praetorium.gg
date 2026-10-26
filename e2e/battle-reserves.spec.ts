import { expect, test } from './test'
import { chooseBattlefield, createRoster, setupStep, signUp, startBattle, uniqueName, addUnit, practiceBattle } from './account'

test('reserve choices over the points limit are disabled with the reason beside them', async ({ page }) => {
  await signUp(page, uniqueName('Reserves'))
  const roster = await createRoster(page, { faction: 'Necrons', detachment: /Awakened Dynasty/, name: 'Reserve army', size: /Incursion/ })
  for (const unit of ['Monolith', 'Doomsday Ark', 'Immortals']) {
    await addUnit(page, unit)
  }
  await practiceBattle(page, roster)
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
  await expect(ark).toHaveAccessibleDescription('Over the 500 pt reserve limit.')
  await expect(army.getByRole('button', { name: 'Start Immortals in Strategic reserves', exact: true })).toBeEnabled()

  await army.getByRole('button', { name: 'Start Monolith in Battlefield', exact: true }).click()
  await expect(army.getByText('0/500 reserve points')).toBeVisible()
  await expect(ark).toBeEnabled()
})

test('a unit arriving from reserves mid-battle becomes a combat target', async ({ page }) => {
  const player = uniqueName('Arrival')
  await signUp(page, player)
  const roster = await createRoster(page, { faction: 'Necrons', detachment: /Awakened Dynasty/, name: 'Arriving army', size: /Incursion/ })
  await addUnit(page, 'Immortals')
  await practiceBattle(page, roster)
  await chooseBattlefield(page)
  await setupStep(page, 'Reserves')
  const reserved = page.getByRole('region', { name: 'Reserves' }).locator('article').first()
  await reserved.getByRole('button', { name: 'Start Immortals in Strategic reserves', exact: true }).click()
  await expect(reserved.getByRole('button', { name: 'Start Immortals in Battlefield', exact: true })).toBeVisible()
  await startBattle(page)

  const panel = page.locator('[data-panel="player"][data-side="0"]')
  const simulate = panel.getByRole('button', { name: `Simulate ${player}'s combat`, exact: true })
  await expect(simulate).toHaveCount(0)
  await panel.getByRole('button', { name: `Open ${roster}`, exact: true }).click()
  const army = page.locator('[data-army-roster]')
  await army.getByRole('button', { name: 'Set up Immortals on the battlefield', exact: true }).click()
  await expect(army.locator('[data-unit="Immortals"]')).not.toContainText('Strategic reserves')
  await army.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(simulate).toBeVisible()
  await expect(page.getByText(`${player} sets up their Immortals on the battlefield`)).toBeVisible()
})
