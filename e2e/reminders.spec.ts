import { expect, test } from '@playwright/test'
import {
  advance,
  attachRoster,
  chooseBattlefield,
  createBattle,
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
} from './account'

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

  await page.getByLabel('Add a unit').fill('Plasmancer')
  await waitForRosterSave(page, () => page.getByRole('button', { name: 'Add Plasmancer', exact: true }).first().click())
  await page
    .getByRole('button', { name: /^Plasmancer/ })
    .first()
    .click()
  await waitForRosterSave(page, () => page.getByRole('button', { name: 'Make Plasmancer Warlord' }).click())
  const plasmancer = page.locator('[data-unit="Plasmancer"]')
  const rosterUnits = page.locator('[data-slot="roster-units"]')
  const charactersToggle = rosterUnits.getByRole('button', { name: 'Toggle Characters' })
  await rosterUnits.getByText('Characters', { exact: true }).click()
  await expect(plasmancer).toBeVisible()
  await charactersToggle.click()
  await expect(plasmancer).toBeHidden()
  await charactersToggle.click()
  await expect(plasmancer).toBeVisible()

  const enhancements = page.getByRole('group', { name: 'Plasmancer Enhancements' })
  await waitForRosterSave(page, () => enhancements.getByRole('button', { name: 'Select Nether-realm Casket' }).click())
  await page.screenshot({ path: 'test-results/reminder-enhancement-desktop.png', fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
  expect(await enhancements.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
  await page.screenshot({ path: 'test-results/reminder-enhancement-phone.png', fullPage: true })
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
  await waitForRosterSave(page, () => editor.getByRole('button', { name: 'Save alert' }).click(), 'Living Lightning')
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
  await waitForRosterSave(page, () => editor.getByRole('button', { name: 'Save alert' }).click(), 'Living Lightning')
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
  await page.screenshot({ path: 'test-results/reminder-editor-desktop.png', fullPage: true })

  await page.setViewportSize({ width: 390, height: 844 })
  await expect(editor).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
  expect(await editor.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
  await page.screenshot({ path: 'test-results/reminder-editor-phone.png', fullPage: true })
  await editor.getByRole('button', { name: 'Save alert' }).scrollIntoViewIfNeeded()
  await expect(editor.getByRole('button', { name: 'Save alert' })).toBeVisible()
  await page.screenshot({ path: 'test-results/reminder-editor-phone-bottom.png', fullPage: true })
  await page.setViewportSize(desktopContext.viewport)

  await waitForRosterSave(page, () => editor.getByRole('button', { name: 'Save alert' }).click(), 'Living Lightning')
  await expect(plasmancer.getByLabel('3 alerts set for Plasmancer')).toBeVisible()
  await expect(page.getByRole('button', { name: /all alerts/i })).toHaveCount(0)
  await plasmancer.screenshot({ path: 'test-results/reminder-unit-card.png' })
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
  await page.screenshot({ path: 'test-results/reminder-action-toggle-desktop.png', fullPage: true })
  await actionReminders.click()
  await page.keyboard.press('Escape')
  await expect(actionReminders).toBeHidden()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('tab', { name: 'Battle', exact: true }).click()
  await page.getByRole('button', { name: 'Battle options' }).click()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
  await page.screenshot({ path: 'test-results/reminder-action-toggle-phone.png', fullPage: true })
  await page.keyboard.press('Escape')
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
  await page.screenshot({ path: 'test-results/reminder-battle-desktop.png', fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
  expect(await reminder.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
  await page.screenshot({ path: 'test-results/reminder-action-battle-phone.png', fullPage: true })
  await page.setViewportSize(desktopContext.viewport)
  await reminder.getByRole('button', { name: 'Dismiss Living Lightning for a period' }).click()
  await page.screenshot({ path: 'test-results/reminder-dismissal-menu-desktop.png', fullPage: true })
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

  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
  expect(await reminder.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
  await page.screenshot({ path: 'test-results/reminder-battle-phone.png', fullPage: true })

  const opponentReminder = opponent.getByRole('dialog', { name: 'Battle reminder' })
  while (await opponentReminder.isVisible()) {
    await opponentReminder.getByRole('button', { name: 'Dismiss', exact: true }).click()
  }
  await opponent
    .locator('[data-panel="player"][data-side="0"]')
    .getByRole('button', { name: `Open ${roster}` })
    .click()
  await opponent.locator('[data-army-roster] [data-unit="Plasmancer"]').getByRole('button', { name: 'Mark Plasmancer lost' }).click()
  await expect(reminder).toBeHidden()
  await page.screenshot({ path: 'test-results/reminder-after-unit-lost.png', fullPage: true })
})

for (const first of ['you', 'opponent'] as const) {
  test(`round alerts fire once at both boundaries when ${first === 'you' ? 'you take' : 'your opponent takes'} the first turn`, async ({
    page,
  }) => {
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
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 })
      await page.screenshot({ path: `test-results/round-alert-editor-${first}-${width}.png`, fullPage: true })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    }
    await waitForRosterSave(page, () => editor.getByRole('button', { name: 'Save alert' }).click(), 'Battle Focus')
    await page.setViewportSize(desktopContext.viewport)
    await page.reload()
    await page.locator('[data-unit="Asurmen"]').getByRole('button', { name: 'Asurmen', exact: true }).click()
    await page.getByLabel('Edit alert for Battle Focus').click()
    await expect(editor.getByText('Alert: Start of round', { exact: true })).toBeVisible()
    await expect(editor.getByText('Alert: End of round', { exact: true })).toBeVisible()
    await editor.getByRole('button', { name: 'Cancel', exact: true }).click()
    await page.setViewportSize(desktopContext.viewport)

    await createBattle(page, { practice: true })
    await attachRoster(page, roster)
    await attachRoster(page, roster, { forPlayer: PRACTICE_OPPONENT })
    await chooseBattlefield(page)
    await setupStep(page, 'Secondaries')
    await expect(page.locator('[data-secondary-deck-ready="false"]')).toHaveCount(0)
    await recordFirstTurn(page, first === 'you' ? playerName : PRACTICE_OPPONENT)
    await page.getByRole('button', { name: 'Start battle' }).click()

    const reminder = page.getByRole('dialog', { name: 'Battle reminder', exact: true })
    await expect(reminder.getByText('Start of round', { exact: true })).toBeVisible()
    await expect(reminder.getByRole('heading', { name: 'Battle Focus', exact: true })).toBeVisible()
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 })
      await page.screenshot({ path: `test-results/round-alert-start-${first}-${width}.png`, fullPage: true })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    }
    await page.setViewportSize(desktopContext.viewport)
    await reminder.getByRole('button', { name: 'Dismiss', exact: true }).click()
    await takeTheTurn(page)
    await page.reload()
    await expect(page.getByRole('heading', { name: 'command phase' })).toBeVisible()
    await expect(reminder).toBeHidden()
    await page.getByRole('button', { name: 'Battle options' }).click()
    await page.getByRole('menuitemcheckbox', { name: 'Action reminders' }).click()
    await page.keyboard.press('Escape')
    for (let phase = 0; phase < 5; phase += 1) await advance(page, { dismissReminders: false })
    await expect(reminder).toBeHidden()
    await advance(page, { dismissReminders: false })
    await takeTheTurn(page)
    await expect(reminder).toBeHidden()
    for (let phase = 0; phase < 5; phase += 1) await advance(page, { dismissReminders: false })
    await expect(reminder.getByText('End of round', { exact: true })).toBeVisible()
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 })
      await page.screenshot({ path: `test-results/round-alert-end-${first}-${width}.png`, fullPage: true })
    }
    await page.setViewportSize(desktopContext.viewport)
    await reminder.getByRole('button', { name: 'Dismiss', exact: true }).click()
    await page.reload()
    await expect(reminder).toBeHidden()
    await advance(page, { dismissReminders: false })
    await expect(reminder.getByText('Start of round', { exact: true })).toBeVisible()
    await expect(page.locator('[data-stat="round"]')).toHaveText('2')
    await reminder.getByRole('button', { name: 'Dismiss', exact: true }).click()
    await takeTheTurn(page)
    for (let phase = 0; phase < 6; phase += 1) await advance(page, { dismissReminders: false })
    await takeTheTurn(page)
    for (let phase = 0; phase < 5; phase += 1) await advance(page, { dismissReminders: false })
    await expect(reminder.getByText('End of round', { exact: true })).toBeVisible()
    await expect(page.locator('[data-stat="round"]')).toHaveText('2')
    await reminder.getByRole('button', { name: 'Dismiss', exact: true }).click()
    await page.getByRole('button', { name: 'Undo latest action', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'fight phase' })).toBeVisible()
    await advance(page, { dismissReminders: false })
    await expect(reminder.getByText('End of round', { exact: true })).toBeVisible()
  })
}

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
    await page.getByLabel('Add a unit').fill(scenario.unit)
    await waitForRosterSave(page, () =>
      page
        .getByRole('button', { name: `Add ${scenario.unit}`, exact: true })
        .first()
        .click(),
    )
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
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 })
      await page.screenshot({ path: `test-results/alert-${scenario.kind}-editor-${width}.png`, fullPage: true })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    }
    await waitForRosterSave(page, () => editor.getByRole('button', { name: 'Save alert' }).click(), scenario.ability)
    await page.setViewportSize(desktopContext.viewport)
    await page.reload()
    await page.locator(`[data-unit="${scenario.unit}"]`).getByRole('button', { name: scenario.unit, exact: true }).click()
    await page.getByLabel(`Edit alert for ${scenario.ability}`).click()
    await expect(editor.getByText(`Alert: ${scenario.label}`, { exact: true })).toBeVisible()
    if (scenario.kind === 'destroyed') await expect(editor.getByLabel('Show while unit is destroyed')).toBeChecked()
    await editor.getByRole('button', { name: 'Cancel', exact: true }).click()

    await createBattle(page, { practice: true })
    await attachRoster(page, roster)
    await attachRoster(page, roster, { forPlayer: PRACTICE_OPPONENT })
    await chooseBattlefield(page)
    await setupStep(page, 'Secondaries')
    await expect(page.locator('[data-secondary-deck-ready="false"]')).toHaveCount(0)
    await recordFirstTurn(page)
    await page.getByRole('button', { name: 'Start battle' }).click()
    const reminder = page.getByRole('dialog', { name: 'Battle reminder', exact: true })
    if (scenario.kind !== 'any-phase') {
      await expect(reminder.getByRole('heading', { name: scenario.ability, exact: true })).toBeVisible()
      await reminder.getByRole('button', { name: 'Dismiss', exact: true }).click()
    }
    await takeTheTurn(page)
    await page.getByRole('button', { name: 'Battle options' }).click()
    await page.getByRole('menuitemcheckbox', { name: 'Action reminders' }).click()
    await page.keyboard.press('Escape')
    if (scenario.kind === 'any-phase') {
      for (const phase of ['Command', 'Movement']) {
        await page.getByRole('button', { name: `End the ${phase.toLowerCase()} phase`, exact: true }).click()
        await expect(reminder.getByRole('heading', { name: scenario.ability, exact: true })).toBeVisible()
        await expect(reminder).toContainText(`End of your ${phase} phase`)
        for (const width of [1440, 390]) {
          await page.setViewportSize({ width, height: 900 })
          await page.screenshot({ path: `test-results/alert-any-phase-${phase}-${width}.png`, fullPage: true })
        }
        await page.setViewportSize(desktopContext.viewport)
        await reminder.getByRole('button', { name: 'End the phase', exact: true }).click()
        await expect(reminder).toBeHidden()
      }
      return
    }
    if (scenario.kind === 'destroyed') {
      await page
        .locator('[data-panel="player"][data-side="0"]')
        .getByRole('button', { name: `Open ${roster}`, exact: true })
        .click()
      const army = page.getByRole('dialog', { name: roster, exact: true })
      await army
        .locator(`[data-unit="${scenario.unit}"]`)
        .getByRole('button', { name: `Mark ${scenario.unit} lost` })
        .click()
      await army.getByRole('button', { name: 'Close', exact: true }).click()
    }
    for (let phase = 0; phase < 6; phase += 1) await advance(page, { dismissReminders: false })
    await takeTheTurn(page)
    for (let phase = 0; phase < 6; phase += 1) await advance(page, { dismissReminders: false })
    await expect(page.locator('[data-stat="round"]')).toHaveText('2')
    if (scenario.kind === 'first-round') {
      await takeTheTurn(page)
      await page.reload()
      await expect(page.getByRole('heading', { name: 'command phase' })).toBeVisible()
      await expect(reminder).toBeHidden()
    } else {
      await expect(reminder.getByRole('heading', { name: 'Reborn in Blood', exact: true })).toBeVisible()
      await page.reload()
      await expect(reminder.getByRole('heading', { name: 'Reborn in Blood', exact: true })).toBeVisible()
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 900 })
        await page.screenshot({ path: `test-results/alert-destroyed-battle-${width}.png`, fullPage: true })
      }
    }
  })
}
