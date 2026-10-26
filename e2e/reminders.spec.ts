import { expect, test, type Page } from './test'
import { attach, expectNoHorizontalOverflow } from './builder.harness'
import {
  advance,
  chooseBattlefield,
  createRoster,
  desktopContext,
  PRACTICE_OPPONENT,
  recordFirstTurn,
  setupBattle,
  setupStep,
  signUp,
  takeTheTurn,
  uniqueName,
  waitForRosterSave,
  makeWarlord,
  saveAlert,
  expectNoPageOverflow,
  addUnit,
  practiceBattle,
  PHONE,
  startBattle,
} from './account'

/** The page fits at desktop and phone widths, leaving the viewport at the phone's. */
async function fitsBothWidths(page: Page) {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 })
    await expectNoPageOverflow(page)
  }
}

/** Turns off the battle's action reminders from its options menu. */
async function turnOffActionReminders(page: Page) {
  await page.getByRole('button', { name: 'Battle options' }).click()
  await page.getByRole('menuitemcheckbox', { name: 'Action reminders' }).click()
  await page.keyboard.press('Escape')
}

test('roster reminders cover selected rules and advances from another device', async ({ browser }) => {
  test.setTimeout(180_000)
  const page = await (await browser.newContext(desktopContext)).newPage()
  const opponent = await (await browser.newContext(desktopContext)).newPage()
  const opponentName = uniqueName('Reminder opponent')
  await signUp(opponent, opponentName)
  const opponentRoster = await createRoster(opponent, {
    faction: 'Death Guard',
    detachment: /Shamblerot Vectorium/,
    name: 'Reminder opponent test',
  })
  await signUp(page, uniqueName('Reminder player'))
  const roster = await createRoster(page, { faction: 'Necrons', detachment: /Awakened Dynasty/, name: 'Reminder test' })

  await addUnit(page, 'Plasmancer')
  await page
    .getByRole('button', { name: /^Plasmancer/ })
    .first()
    .click()
  await makeWarlord(page, 'Plasmancer')
  // A Support unit must join a Bodyguard unit for the list to be legal to field.
  await addUnit(page, 'Immortals')
  await waitForRosterSave(page, () => attach(page, 'Plasmancer', 'Immortals'))
  const plasmancer = page.locator('[data-unit="Plasmancer"]')

  const enhancements = page.getByRole('group', { name: 'Plasmancer Enhancements' })
  await waitForRosterSave(page, () => enhancements.getByRole('button', { name: 'Select Nether-realm Casket' }).click())
  await page.setViewportSize(PHONE)
  await expectNoPageOverflow(page)
  await expectNoHorizontalOverflow(enhancements)
  await page.setViewportSize(desktopContext.viewport)
  const enhancementAlert = enhancements.getByLabel('Set alert for Nether-realm Casket')
  await enhancementAlert.hover()
  await expect(page.getByRole('tooltip')).toHaveText('Set alert for Nether-realm Casket')
  await enhancementAlert.click()
  await expect(page.getByRole('dialog', { name: 'Nether-realm Casket' })).toBeVisible()
  await page.getByRole('dialog', { name: 'Nether-realm Casket' }).getByRole('button', { name: 'Cancel' }).click()

  await page.getByLabel('Set alert for Living Lightning').click()

  const editor = page.getByRole('dialog', { name: 'Living Lightning' })
  await expect(editor).toBeVisible()
  await expect(editor.getByText('Alert: Start of your Shooting phase')).toBeVisible()
  await saveAlert(editor, 'Living Lightning')
  await expect(plasmancer.getByLabel('1 alert set for Plasmancer')).toBeVisible()
  await page.getByLabel('Edit alert for Living Lightning').click()
  await editor.getByRole('button', { name: 'Add trigger' }).click()
  await editor.getByRole('combobox', { name: 'When' }).nth(1).click()
  await page.getByRole('option', { name: 'Start of phase' }).click()
  await editor.getByRole('combobox', { name: 'Phase' }).nth(1).click()
  await page.getByRole('option', { name: 'Fight' }).click()
  await editor.getByRole('combobox', { name: 'Whose turn' }).nth(1).click()
  await page.getByRole('option', { name: 'Either turn' }).click()
  await expect(editor.getByText('Alert: Start of either Fight phase')).toBeVisible()
  await saveAlert(editor, 'Living Lightning')
  await expect(plasmancer.getByLabel('2 alerts set for Plasmancer')).toBeVisible()
  await page.getByLabel('Edit alert for Living Lightning').click()
  await editor.getByRole('button', { name: 'Add trigger' }).click()
  await editor.getByRole('combobox', { name: 'When' }).nth(2).click()
  await page.getByRole('option', { name: 'End of phase' }).click()
  await editor.getByRole('combobox', { name: 'Phase' }).nth(2).click()
  await page.getByRole('option', { name: 'Movement' }).click()
  await editor.getByRole('combobox', { name: 'Whose turn' }).nth(2).click()
  await page.getByRole('option', { name: 'Your turn' }).click()
  await expect(editor.getByText('Alert: End of your Movement phase')).toBeVisible()

  await page.setViewportSize(PHONE)
  await expect(editor).toBeVisible()
  await expectNoPageOverflow(page)
  await expectNoHorizontalOverflow(editor)
  await editor.getByRole('button', { name: 'Save alert' }).scrollIntoViewIfNeeded()
  await expect(editor.getByRole('button', { name: 'Save alert' })).toBeVisible()
  await page.setViewportSize(desktopContext.viewport)

  await saveAlert(editor, 'Living Lightning')
  await expect(plasmancer.getByLabel('3 alerts set for Plasmancer')).toBeVisible()
  await expect(page.getByRole('button', { name: /all alerts/i })).toHaveCount(0)
  await page.reload()
  await expect(page.locator('[data-unit="Plasmancer"]').getByLabel('3 alerts set for Plasmancer')).toBeVisible()

  await setupBattle(page, opponent, {
    opponent: opponentName,
    hostRoster: roster,
    guestRoster: opponentRoster,
    openingSecondaries: ['Cleanse', 'Assassination'],
  })

  await page.getByRole('button', { name: 'Battle options' }).click()
  const actionReminders = page.getByRole('menuitemcheckbox', { name: 'Action reminders' })
  await expect(actionReminders).toHaveAttribute('aria-checked', 'true')
  await actionReminders.click()
  await page.reload()
  await page.getByRole('button', { name: 'Battle options' }).click()
  await expect(actionReminders).toHaveAttribute('aria-checked', 'false')
  await actionReminders.click()
  await page.keyboard.press('Escape')
  await expect(actionReminders).toBeHidden()
  await page.setViewportSize(PHONE)
  await page.getByRole('tab', { name: 'Battle', exact: true }).click()
  await page.getByRole('button', { name: 'Battle options' }).click()
  await expect(actionReminders).toBeVisible()
  await expectNoPageOverflow(page)
  await page.keyboard.press('Escape')
  await expect(actionReminders).toBeHidden()
  await page.setViewportSize(desktopContext.viewport)
  await advance(page, { dismissReminders: false })
  await expect(opponent.getByRole('heading', { name: 'movement phase' })).toBeVisible()
  await advance(opponent, { dismissReminders: false })

  const reminder = page.getByRole('dialog', { name: 'Battle reminder' })
  await expect(reminder).toContainText('End of your Movement phase')
  await reminder.getByRole('button', { name: 'Dismiss', exact: true }).click()
  await expect(reminder).toContainText('Living Lightning')
  await expect(reminder.getByRole('heading', { name: 'Cleanse', exact: true })).toBeVisible()
  await expect(reminder).toContainText('One friendly unit within range of one objective')
  await expect(reminder).toContainText('Start of your Shooting phase')
  await page.setViewportSize(PHONE)
  await expectNoPageOverflow(page)
  await expectNoHorizontalOverflow(reminder)
  await page.setViewportSize(desktopContext.viewport)
  await reminder.getByRole('button', { name: 'Hide Living Lightning for a period' }).click()
  await page.getByRole('menuitem', { name: 'This turn' }).click()
  await reminder.getByRole('button', { name: 'Dismiss', exact: true }).click()
  await expect(reminder).toBeHidden()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'shooting phase' })).toBeVisible()
  await expect(reminder).toBeHidden()

  await advance(page, { dismissReminders: false })
  await advance(page, { dismissReminders: false })
  await expect(reminder).toBeHidden()
  await advance(page, { dismissReminders: false })
  await advance(page, { dismissReminders: false })
  await advance(page, { dismissReminders: false })
  await advance(page, { dismissReminders: false })
  await expect(reminder).toBeHidden()
  await advance(page, { dismissReminders: false })
  await advance(page, { dismissReminders: false })
  await expect(reminder).toContainText("Start of opponent's Fight phase")

  await page.setViewportSize(PHONE)
  await expectNoPageOverflow(page)
  await expectNoHorizontalOverflow(reminder)

  const opponentReminder = opponent.getByRole('dialog', { name: 'Battle reminder' })
  while (await opponentReminder.isVisible()) {
    await opponentReminder.getByRole('button', { name: 'Dismiss', exact: true }).click()
  }
  await opponent
    .locator('[data-panel="player"][data-side="0"]')
    .getByRole('button', { name: `Open ${roster}` })
    .click()
  await opponent.locator('[data-army-roster] [data-unit="Plasmancer"]').getByRole('button', { name: 'Mark Plasmancer destroyed' }).click()
  await expect(reminder).toBeHidden()
})

// roundReminderMoment in reminders.test.ts places the boundaries for either first side.
test('round alerts fire once at both boundaries when your opponent takes the first turn', async ({ page }) => {
  const playerName = uniqueName('Round alerts')
  await signUp(page, playerName)
  const roster = await createRoster(page, { faction: 'Aeldari', detachment: /Warhost/, name: 'Battle Focus alerts' })
  await waitForRosterSave(page, () => page.getByRole('button', { name: 'Add Asurmen', exact: true }).first().click())
  await page.locator('[data-unit="Asurmen"]').getByRole('button', { name: 'Asurmen', exact: true }).click()
  await page.getByLabel('Set alert for Battle Focus').click()
  const editor = page.getByRole('dialog', { name: 'Battle Focus', exact: true })
  await expect(editor.getByText('Alert: Start of round', { exact: true })).toBeVisible()
  await expect(editor.getByText('Alert: End of round', { exact: true })).toBeVisible()
  await expect(editor.getByRole('combobox', { name: 'Phase' }).first()).toBeDisabled()
  await expect(editor.getByRole('combobox', { name: 'Whose turn' }).first()).toBeDisabled()
  await editor.getByRole('combobox', { name: 'When' }).first().click()
  await page.getByRole('option', { name: 'Start of turn', exact: true }).click()
  await expect(editor.getByRole('combobox', { name: 'Whose turn' }).first()).toBeEnabled()
  await editor.getByRole('combobox', { name: 'When' }).first().click()
  await page.getByRole('option', { name: 'Start of round', exact: true }).click()
  await fitsBothWidths(page)
  await page.setViewportSize(desktopContext.viewport)
  await saveAlert(editor, 'Battle Focus')
  await page.reload()
  await page.locator('[data-unit="Asurmen"]').getByRole('button', { name: 'Asurmen', exact: true }).click()
  await page.getByLabel('Edit alert for Battle Focus').click()
  await expect(editor.getByText('Alert: Start of round', { exact: true })).toBeVisible()
  await expect(editor.getByText('Alert: End of round', { exact: true })).toBeVisible()
  await editor.getByRole('button', { name: 'Cancel', exact: true }).click()

  await practiceBattle(page, roster)
  await chooseBattlefield(page)
  await setupStep(page, 'Secondaries')
  await expect(page.locator('[data-secondary-deck-ready="false"]')).toHaveCount(0)
  await recordFirstTurn(page, PRACTICE_OPPONENT)
  await page.getByRole('button', { name: 'Start battle' }).click()

  const reminder = page.getByRole('dialog', { name: 'Battle reminder', exact: true })
  await expect(reminder.getByText('Start of round', { exact: true })).toBeVisible()
  await expect(reminder.getByRole('heading', { name: 'Battle Focus', exact: true })).toBeVisible()
  await fitsBothWidths(page)
  await page.setViewportSize(desktopContext.viewport)
  await reminder.getByRole('button', { name: 'Dismiss', exact: true }).click()
  await takeTheTurn(page)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'command phase' })).toBeVisible()
  await expect(reminder).toBeHidden()
  await turnOffActionReminders(page)
  for (let phase = 0; phase < 5; phase += 1) await advance(page, { dismissReminders: false })
  await expect(reminder).toBeHidden()
  await advance(page, { dismissReminders: false })
  await takeTheTurn(page)
  await expect(reminder).toBeHidden()
  for (let phase = 0; phase < 5; phase += 1) await advance(page, { dismissReminders: false })
  await expect(reminder.getByText('End of round', { exact: true })).toBeVisible()
  await reminder.getByRole('button', { name: 'Dismiss', exact: true }).click()
  await page.reload()
  await expect(reminder).toBeHidden()
  await page.getByRole('button', { name: 'Undo latest action', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'fight phase' })).toBeVisible()
  await advance(page, { dismissReminders: false })
  await expect(reminder.getByText('End of round', { exact: true })).toBeVisible()
  await reminder.getByRole('button', { name: 'Dismiss', exact: true }).click()
  await advance(page, { dismissReminders: false })
  await expect(reminder.getByText('Start of round', { exact: true })).toBeVisible()
  await expect(page.locator('[data-stat="round"]')).toHaveText('2')
})

test('a detachment rule alert covers the whole army and fires in battle', async ({ page }) => {
  await signUp(page, uniqueName('Detachment alerts'))
  const roster = await createRoster(page, { faction: 'Necrons', detachment: /Cursed Legion/, name: 'Detachment rule alerts' })
  await waitForRosterSave(page, () => page.getByRole('button', { name: 'Add Skorpekh Lord', exact: true }).first().click())
  await waitForRosterSave(page, () => page.getByRole('button', { name: 'Add Immortals', exact: true }).first().click())
  await page.locator('[data-unit="Skorpekh Lord"]').getByRole('button', { name: 'Skorpekh Lord', exact: true }).click()
  await page.getByLabel('Set alert for Cold Fervour').click()
  const editor = page.getByRole('dialog', { name: 'Cold Fervour', exact: true })
  await editor.getByRole('combobox', { name: 'When' }).first().click()
  await page.getByRole('option', { name: 'Start of round', exact: true }).click()
  await saveAlert(editor, 'Cold Fervour')
  await page.reload()
  await page.locator('[data-unit="Immortals"]').getByRole('button', { name: 'Immortals', exact: true }).click()
  await expect(page.getByLabel('Edit alert for Cold Fervour')).toBeVisible()

  await practiceBattle(page, roster)
  await chooseBattlefield(page)
  await setupStep(page, 'Secondaries')
  await expect(page.locator('[data-secondary-deck-ready="false"]')).toHaveCount(0)
  await recordFirstTurn(page, PRACTICE_OPPONENT)
  await page.getByRole('button', { name: 'Start battle' }).click()

  const reminder = page.getByRole('dialog', { name: 'Battle reminder', exact: true })
  await expect(reminder.getByRole('heading', { name: 'Cold Fervour', exact: true })).toBeVisible()
})

for (const scenario of [
  {
    kind: 'first-round',
    faction: 'Tyranids',
    detachment: /Invasion Fleet/,
    unit: 'Norn Assimilator',
    ability: 'Singular Purpose',
    label: 'Start of round · First round only',
  },
  {
    kind: 'any-phase',
    faction: 'Necrons',
    detachment: /Awakened Dynasty/,
    unit: 'Catacomb Command Barge',
    ability: 'Resurrection orb',
    label: 'End of any phase',
  },
  {
    kind: 'destroyed',
    faction: 'World Eaters',
    detachment: /Berzerker Warband/,
    unit: 'Angron',
    ability: 'Reborn in Blood',
    label: 'Start of round',
  },
] as const) {
  test(`saved alerts support ${scenario.kind} abilities`, async ({ page }) => {
    await signUp(page, uniqueName(`Alert ${scenario.kind}`))
    const roster = await createRoster(page, { ...scenario, name: `Alert ${scenario.unit}` })
    await addUnit(page, scenario.unit)
    await page.locator(`[data-unit="${scenario.unit}"]`).getByRole('button', { name: scenario.unit, exact: true }).click()
    if (scenario.kind === 'any-phase') {
      await waitForRosterSave(page, () => page.getByRole('button', { name: 'Select Resurrection orb', exact: true }).click())
    }
    await page.getByLabel(`Set alert for ${scenario.ability}`).click()
    const editor = page.getByRole('dialog', { name: scenario.ability, exact: true })
    await expect(editor.getByText(`Alert: ${scenario.label}`, { exact: true })).toBeVisible()
    if (scenario.kind === 'first-round') await expect(editor.getByLabel('First round only')).toBeChecked()
    if (scenario.kind === 'destroyed') await expect(editor.getByLabel('Show while unit is destroyed')).toBeChecked()
    if (scenario.kind === 'any-phase') {
      await expect(editor.getByRole('combobox', { name: 'Phase', exact: true }).locator('[data-slot="select-value"]')).toHaveText(
        'Any phase',
      )
      await expect(editor.getByLabel('Show while unit is destroyed')).not.toBeChecked()
    }
    await fitsBothWidths(page)
    await saveAlert(editor, scenario.ability)
    await page.setViewportSize(desktopContext.viewport)
    // The phone layout's pane leaves the address once the page is wide again; reloading first races that navigation.
    await expect(page).not.toHaveURL(/#roster-pane$/)
    await page.reload()
    await page.locator(`[data-unit="${scenario.unit}"]`).getByRole('button', { name: scenario.unit, exact: true }).click()
    await page.getByLabel(`Edit alert for ${scenario.ability}`).click()
    await expect(editor.getByText(`Alert: ${scenario.label}`, { exact: true })).toBeVisible()
    if (scenario.kind === 'destroyed') await expect(editor.getByLabel('Show while unit is destroyed')).toBeChecked()
    await editor.getByRole('button', { name: 'Cancel', exact: true }).click()
    // reminders.test.ts restricts first-round alerts and battleView.test.ts keeps destroyed-unit alerts for their owner.
    if (scenario.kind !== 'any-phase') return

    await practiceBattle(page, roster)
    await chooseBattlefield(page)
    await setupStep(page, 'Secondaries')
    await expect(page.locator('[data-secondary-deck-ready="false"]')).toHaveCount(0)
    await recordFirstTurn(page)
    await page.getByRole('button', { name: 'Start battle' }).click()
    const reminder = page.getByRole('dialog', { name: 'Battle reminder', exact: true })
    await takeTheTurn(page)
    await turnOffActionReminders(page)
    for (const phase of ['Command', 'Movement']) {
      await page.getByRole('button', { name: `End the ${phase.toLowerCase()} phase`, exact: true }).click()
      await expect(reminder.getByRole('heading', { name: scenario.ability, exact: true })).toBeVisible()
      await expect(reminder).toContainText(`End of your ${phase} phase`)
      await reminder.getByRole('button', { name: 'End the phase', exact: true }).click()
      await expect(reminder).toBeHidden()
    }
  })
}

test('an alert set in one roster follows the player into another and fires in battle', async ({ page }) => {
  await signUp(page, uniqueName('Shared alerts'))
  const unit = 'Catacomb Command Barge'
  const addBarge = async (name: string) => {
    const roster = await createRoster(page, { faction: 'Necrons', detachment: /Awakened Dynasty/, name })
    await addUnit(page, unit)
    await page.locator(`[data-unit="${unit}"]`).getByRole('button', { name: unit, exact: true }).click()
    await waitForRosterSave(page, () => page.getByRole('button', { name: 'Select Resurrection orb', exact: true }).click())
    return roster
  }
  await addBarge('First alerts')
  await page.getByLabel('Set alert for Resurrection orb').click()
  const editor = page.getByRole('dialog', { name: 'Resurrection orb', exact: true })
  await expect(editor).toContainText('every unit with this ability in all your rosters')
  await saveAlert(editor, 'Resurrection orb')
  await expect(page.locator(`[data-unit="${unit}"]`).getByLabel(`1 alert set for ${unit}`)).toBeVisible()

  const second = await addBarge('Second alerts')
  await expect(page.getByLabel('Edit alert for Resurrection orb')).toBeVisible()
  await expect(page.locator(`[data-unit="${unit}"]`).getByLabel(`1 alert set for ${unit}`)).toBeVisible()

  await practiceBattle(page, second)
  await startBattle(page)
  await turnOffActionReminders(page)
  await page.getByRole('button', { name: 'End the command phase', exact: true }).click()
  const reminder = page.getByRole('dialog', { name: 'Battle reminder', exact: true })
  await expect(reminder.getByRole('heading', { name: 'Resurrection orb', exact: true })).toBeVisible()
})
