import { expect, test, type Page } from './test'
import { seededRoster, signUp, startBattle, uniqueName, addUnit, practiceBattle, playerPanel } from './account'

/** A Death Guard list of Plague Marines and a Foetid Bloat-drone, started in a practice battle. */
async function guardBattle(page: Page, label: string, name: string) {
  const player = uniqueName(label)
  await signUp(page, player)
  const roster = await seededRoster(page, { faction: 'Death Guard', detachment: 'Shamblerot Vectorium', name })
  for (const unit of ['Plague Marines', 'Foetid Bloat-drone']) await addUnit(page, unit)
  await practiceBattle(page, roster)
  await startBattle(page)
  return { player, roster }
}

test('an army is read and its losses recorded without leaving the battle', async ({ page }) => {
  const { player, roster } = await guardBattle(page, 'Attrition', 'Attrition Guard')

  // The list opens over the battle rather than on a page of its own.
  const panel = playerPanel(page, 0)
  await expect(panel.getByRole('link', { name: roster, exact: true })).toHaveCount(0)
  const units = panel.locator('[data-army-units]')
  const models = panel.locator('[data-army-models]')
  await expect(units).toHaveText('2/2')
  // Read off the army rather than written in, so the assertion holds whatever the
  // catalogue says a Plague Marine squad comes in.
  const brought = Number((await models.textContent())?.split('/')[1])
  expect(brought).toBeGreaterThan(1)
  await expect(models).toHaveText(`${brought}/${brought}`)

  await panel.getByRole('button', { name: `Units: ${roster}` }).click()
  const army = page.locator('[data-army-roster]')
  const squad = army.locator('[data-army-list] [data-unit="Plague Marines"]')
  await squad.getByRole('button', { name: 'Plague Marines', exact: true }).click()
  const loadout = army.locator('[data-army-loadout]')
  await expect(loadout.locator('[data-slot="unit-profile"]')).toBeVisible()
  await expect(loadout).toContainText('Boltgun')
  await expect(loadout.getByRole('combobox')).toHaveCount(0)
  await army.getByRole('button', { name: 'Minimize dialog' }).click()
  await page.getByRole('button', { name: 'Return to units' }).click()
  await expect(loadout.locator('[data-slot="unit-profile"]')).toBeVisible()

  // Casualty presses count ahead of the service, so a squad can be tapped down while a write is in flight.
  const { promise: submitHeld, resolve: releaseSubmit } = Promise.withResolvers<void>()
  const { promise: started, resolve: submitStarted } = Promise.withResolvers<void>()
  await page.route('**/_serverFn/**', async (route) => {
    if (route.request().method() === 'POST') {
      submitStarted()
      await submitHeld
    }
    await route.continue()
  })

  // Models come off the squad, and what is left of the army says so behind the dialog.
  const removeModel = squad.getByRole('button', { name: 'Remove a model from Plague Marine in Plague Marines' })
  await removeModel.click()
  await started
  await removeModel.click()
  await expect(models).toHaveText(`${brought - 2}/${brought}`)
  await expect(army.getByRole('button', { name: 'Mark Foetid Bloat-drone destroyed' })).toBeEnabled()
  releaseSubmit()
  await expect(models).toHaveText(`${brought - 2}/${brought}`)
  await expect(loadout.locator('[data-slot="unit-profile"]')).toBeVisible()
  await expect(units).toHaveText('2/2')

  // A unit lost outright leaves the shelf it was read on, and is kept only to be taken back.
  await army
    .locator('[data-army-list] [data-unit="Foetid Bloat-drone"]')
    .getByRole('button', { name: 'Mark Foetid Bloat-drone destroyed' })
    .click()
  await expect(army.locator('[data-army-list] [data-unit="Foetid Bloat-drone"]')).toBeHidden()
  await expect(units).toHaveText('1/2')
  await army.getByRole('button', { name: 'Toggle Destroyed' }).click()
  await army
    .locator('[data-army-list] [data-unit="Foetid Bloat-drone"]')
    .getByRole('button', { name: 'Bring Foetid Bloat-drone back' })
    .click()
  await expect(units).toHaveText('2/2')
  // The shelf stays as the player left it while it empties and fills again, however the battle state arrives.
  await army
    .locator('[data-army-list] [data-unit="Foetid Bloat-drone"]')
    .getByRole('button', { name: 'Mark Foetid Bloat-drone destroyed' })
    .click()
  await army
    .locator('[data-army-list] [data-unit="Foetid Bloat-drone"]')
    .getByRole('button', { name: 'Bring Foetid Bloat-drone back' })
    .click()
  await expect(units).toHaveText('2/2')

  // A squad counts both whole models and the one taking damage, as a table does: the first wound leaves every
  // model standing, and the second takes the model and starts again on the one behind it.
  const drone = army.locator('[data-army-list] [data-unit="Foetid Bloat-drone"]')
  // The squad's total comes first; each kind of model counts its own wounds on its row.
  const squadModels = squad.locator('[data-count="models"]').first()
  const marineWounds = squad.locator('[data-model-line="Plague Marine"] [data-count="wounds"]')
  await expect(squadModels).toHaveText('3/5')
  await expect(marineWounds).toHaveText('2/2')
  await squad.getByRole('button', { name: 'Take a wound off Plague Marine in Plague Marines' }).click()
  await expect(marineWounds).toHaveText('1/2')
  await expect(squadModels).toHaveText('3/5')
  await squad.getByRole('button', { name: 'Take a wound off Plague Marine in Plague Marines' }).click()
  await expect(squadModels).toHaveText('2/5')
  await expect(marineWounds).toHaveText('2/2')
  // One model of ten wounds counts only the wounds: there are no models to count.
  await expect(drone.locator('[data-count="models"]')).toHaveCount(0)
  await expect(drone.locator('[data-count="wounds"]')).toHaveText('10/10')
  await drone.getByRole('button', { name: 'Take a wound off Foetid Bloat-drone' }).click()
  await expect(drone.locator('[data-count="wounds"]')).toHaveText('9/10')

  // Casualties are running counts rather than events, so the log and Undo leave them out.
  await army.getByRole('button', { name: 'Close' }).click()
  const report = page.locator('[data-battle-report-scroll]')
  await expect(report).toContainText(`${player} brought ${roster}`)
  await expect(report).not.toContainText(/Plague Marines|Foetid Bloat-drone/)
})
