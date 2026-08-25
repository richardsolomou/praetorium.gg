import { expect, test } from '@playwright/test'
import { attachRoster, createBattle, createRoster, PRACTICE_OPPONENT, signUp, startBattle, uniqueName, waitForRosterSave } from './account'

test('an army is read and its losses recorded without leaving the battle', async ({ page }) => {
  const player = uniqueName('Attrition')
  await signUp(page, player)
  const roster = await createRoster(page, { faction: 'Death Guard', detachment: /Shamblerot Vectorium/, name: 'Attrition Guard' })
  for (const unit of ['Plague Marines', 'Foetid Bloat-drone']) {
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
  await startBattle(page)

  // The list opens over the battle rather than on a page of its own.
  const panel = page.locator('[data-panel="player"][data-side="0"]')
  const units = panel.locator('[data-army-units]')
  const models = panel.locator('[data-army-models]')
  await expect(units).toHaveText('2/2')
  // Read off the army rather than written in, so the assertion holds whatever the
  // catalogue says a Plague Marine squad comes in.
  const brought = Number((await models.textContent())?.split('/')[1])
  expect(brought).toBeGreaterThan(1)
  await expect(models).toHaveText(`${brought}/${brought}`)

  await panel.getByRole('button', { name: `Open ${roster}` }).click()
  const army = page.locator('[data-army-roster]')
  const squad = army.locator('[data-unit="Plague Marines"]')

  // A model comes off the squad, and what is left of the army says so behind the dialog.
  await squad.getByRole('button', { name: 'Remove a model from Plague Marines' }).click()
  await expect(models).toHaveText(`${brought - 1}/${brought}`)
  await expect(units).toHaveText('2/2')

  // A unit lost outright leaves the shelf it was read on, and is kept only to be taken back.
  await army.locator('[data-unit="Foetid Bloat-drone"]').getByRole('button', { name: 'Mark Foetid Bloat-drone lost' }).click()
  await expect(army.locator('[data-unit="Foetid Bloat-drone"]')).toBeHidden()
  await expect(units).toHaveText('1/2')
  await army.getByRole('button', { name: /^lost/i }).click()
  await army.locator('[data-unit="Foetid Bloat-drone"]').getByRole('button', { name: 'Bring Foetid Bloat-drone back' }).click()
  await expect(units).toHaveText('2/2')

  // Every casualty is a command like any other, so the log has all of it.
  await army.getByRole('button', { name: 'Close' }).click()
  await expect(page.getByText(`${player} loses 1 model from Plague Marines`)).toBeVisible()
  await expect(page.getByText(`${player} loses Foetid Bloat-drone`)).toBeVisible()
  await expect(page.getByText(`${player} brings Foetid Bloat-drone back`)).toBeVisible()
})

test('a multi-wound model is tracked in wounds, and losing them all takes the model', async ({ page }) => {
  const player = uniqueName('Wounds')
  await signUp(page, player)
  const roster = await createRoster(page, { faction: 'Death Guard', detachment: /Shamblerot Vectorium/, name: 'Wounded Guard' })
  for (const unit of ['Plague Marines', 'Foetid Bloat-drone']) {
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
  await startBattle(page)

  const panel = page.locator('[data-panel="player"][data-side="0"]')
  await panel.getByRole('button', { name: `Open ${roster}` }).click()
  const army = page.locator('[data-army-roster]')
  const squad = army.locator('[data-unit="Plague Marines"]')
  const drone = army.locator('[data-unit="Foetid Bloat-drone"]')

  // A squad counts both, because a table does: whole models, and the one taking damage.
  await expect(squad.locator('[data-count="models"]')).toHaveText('5/5')
  await expect(squad.locator('[data-count="wounds"]')).toHaveText('2/2')

  // The first wound leaves every model standing.
  await squad.getByRole('button', { name: 'Take a wound off Plague Marines' }).click()
  await expect(squad.locator('[data-count="wounds"]')).toHaveText('1/2')
  await expect(squad.locator('[data-count="models"]')).toHaveText('5/5')

  // The second takes the model, and the count starts again on the one behind it.
  await squad.getByRole('button', { name: 'Take a wound off Plague Marines' }).click()
  await expect(squad.locator('[data-count="models"]')).toHaveText('4/5')
  await expect(squad.locator('[data-count="wounds"]')).toHaveText('2/2')

  // One model of ten wounds counts only the wounds: there are no models to count.
  await expect(drone.locator('[data-count="models"]')).toHaveCount(0)
  await expect(drone.locator('[data-count="wounds"]')).toHaveText('10/10')
  await drone.getByRole('button', { name: 'Take a wound off Foetid Bloat-drone' }).click()
  await expect(drone.locator('[data-count="wounds"]')).toHaveText('9/10')

  await army.getByRole('button', { name: 'Close' }).click()
  await expect(page.getByText(`${player} takes 1 wound on Foetid Bloat-drone`)).toBeVisible()
  await expect(page.getByText(`${player} takes 1 wound on Plague Marines`).first()).toBeVisible()
})
