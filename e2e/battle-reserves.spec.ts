import { expect, test } from './test'
import {
  chooseBattlefield,
  createRoster,
  setupStep,
  signUp,
  startBattle,
  uniqueName,
  addUnit,
  practiceBattle,
  playerPanel,
} from './account'

test('a unit arriving from reserves mid-battle becomes a combat target', async ({ page }) => {
  const player = uniqueName('Arrival')
  await signUp(page, player)
  const roster = await createRoster(page, { faction: 'Necrons', detachment: /Canoptek Court/, name: 'Arriving army', size: /Incursion/ })
  await addUnit(page, 'Immortals')
  await practiceBattle(page, roster)
  await chooseBattlefield(page)
  await setupStep(page, 'Reserves')
  const reserved = page.getByRole('region', { name: 'Reserves' }).locator('article').first()
  await reserved.getByRole('button', { name: 'Start Immortals in Strategic reserves', exact: true }).click()
  await expect(reserved.getByRole('button', { name: 'Start Immortals in Battlefield', exact: true })).toBeVisible()
  await startBattle(page)

  const panel = playerPanel(page, 0)
  const simulate = panel.getByRole('button', { name: `Simulate ${player}'s combat`, exact: true })
  await expect(simulate).toHaveCount(0)
  await panel.getByRole('button', { name: `Units: ${roster}`, exact: true }).click()
  const army = page.locator('[data-army-roster]')
  await army.getByRole('button', { name: 'Set up Immortals on the battlefield', exact: true }).click()
  await expect(army.locator('[data-unit="Immortals"]')).not.toContainText('Strategic reserves')
  await army.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(simulate).toBeVisible()
  await expect(page.getByText(`${player} sets up their Immortals on the battlefield`)).toBeVisible()
})
