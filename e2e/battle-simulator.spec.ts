import { holdCombatCalculations, openCombatBreakdown, openCombatControls } from './combat'
import { expect, test, type Locator } from './test'
import {
  attachRoster,
  befriend,
  createBattle,
  createRoster,
  PRACTICE_OPPONENT,
  signUp,
  startBattle,
  uniqueName,
  waitForRosterSave,
} from './account'

async function estimate(simulator: Locator, phase: 'Shooting' | 'Melee') {
  await openCombatControls(simulator)
  await openCombatBreakdown(simulator)
  return simulator.getByRole('region', { name: `${phase} estimate`, includeHidden: true })
}

test('the battle matchup planner uses live survivors, isolates experiments, and refreshes after another tab records casualties', async ({
  page,
}) => {
  await signUp(page, 'Live planner')
  const roster = await createRoster(page, { faction: 'Space Marines', detachment: /Gladius Task Force/, name: 'Planner Marines' })
  for (const name of ['Intercessor Squad', 'Terminator Squad', 'Rhino']) {
    await page.getByLabel('Add a unit').fill(name)
    await waitForRosterSave(page, () =>
      page
        .getByRole('button', { name: `Add ${name}`, exact: true })
        .first()
        .click(),
    )
  }
  await createBattle(page, { practice: true })
  await attachRoster(page, roster)
  await attachRoster(page, roster, { forPlayer: PRACTICE_OPPONENT })
  await startBattle(page)
  const panels = [0, 1].map((side) => page.locator(`[data-panel="player"][data-side="${side}"]`))
  for (const [side, panel] of panels.entries()) {
    await panel.getByRole('button', { name: `Open ${roster}`, exact: true }).click()
    const army = page.locator('[data-army-roster]')
    const squad = army.locator('[data-unit="Intercessor Squad"]')
    for (let lost = 0; lost < side + 1; lost++) {
      await squad.getByRole('button', { name: 'Remove a model from Intercessor Squad', exact: true }).click()
      await expect(squad.locator('[data-count="models"]')).toHaveText(`${4 - lost}/5`)
    }
    await squad.getByRole('button', { name: 'Take a wound off Intercessor Squad', exact: true }).click()
    await expect(squad.locator('[data-count="wounds"]')).toHaveText('1/2')
    await army.locator('[data-unit="Rhino"]').getByRole('button', { name: 'Mark Rhino lost', exact: true }).click()
    await expect(army.getByRole('button', { name: 'Mark Rhino lost', exact: true })).toHaveCount(0)
    await army.getByRole('button', { name: 'Close', exact: true }).click()
  }
  await panels[0].getByRole('button', { name: "Simulate Live planner's combat", exact: true }).click()
  const planner = page.getByRole('dialog', { name: 'Combat simulator', exact: true }).first()
  await planner.getByRole('tab', { name: 'Rosters', exact: true }).click()
  await expect(planner).toContainText('4 / 4 matchups · Complete')
  const table = planner.getByRole('table')
  await expect(table).not.toContainText('Rhino')
  await expect(table.getByRole('columnheader').filter({ hasText: 'Intercessor Squad' })).toContainText('3 models · 5 wounds')
  await expect(table.getByRole('rowheader').filter({ hasText: 'Intercessor Squad' })).toContainText('4 models · 7 wounds')
  const cell = table.getByRole('button', { name: /^Intercessor Squad #1 against Intercessor Squad #1:/ })
  const baseline = await cell.locator('.readout').textContent()
  await cell.click()
  const detail = page.getByRole('dialog', { name: 'Combat simulator', exact: true }).last()
  await expect(detail.getByLabel('Attacker models', { exact: true })).toHaveText('4')
  await expect(detail.getByLabel('Defender models', { exact: true })).toHaveText('3')
  await expect(detail.getByLabel('Defender remaining wounds', { exact: true })).toHaveText('1')
  await expect((await estimate(detail, 'Shooting')).locator('.readout').first()).toHaveText(baseline!)
  await expect(detail.getByRole('button', { name: /^Optimize/ })).toHaveCount(0)
  await detail.getByRole('button', { name: 'More defender remaining wounds', exact: true }).click()
  await detail.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(cell.locator('.readout')).toHaveText(baseline!)
  await page.setViewportSize({ width: 390, height: 844 })
  await expect.poll(async () => (await planner.boundingBox())?.width).toBe(390)
  expect(await planner.locator('[data-simulator-scroll]').evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true)
  await page.setViewportSize({ width: 1440, height: 900 })
  await planner.getByRole('button', { name: 'Close', exact: true }).click()
  await panels[0].getByRole('button', { name: "Simulate Live planner's combat", exact: true }).click()
  await expect((await estimate(planner, 'Shooting')).locator('.readout').first()).toHaveText(/^\d+\.\d+$/)
  const cachedGate = await holdCombatCalculations(page)
  await planner.getByRole('tab', { name: 'Rosters', exact: true }).click()
  await expect(planner).toContainText('4 / 4 matchups · Complete')
  expect(await page.evaluate(() => window.PraetoriumCombatGate?.pending.length)).toBe(0)
  await cachedGate.release()
  await page.setViewportSize({ width: 1440, height: 900 })
  const referee = await page.context().newPage()
  await referee.goto(page.url())
  const otherPanels = [0, 1].map((side) => referee.locator(`[data-panel="player"][data-side="${side}"]`))
  await otherPanels[0].getByRole('button', { name: `Open ${roster}`, exact: true }).click()
  const otherArmy = referee.locator('[data-army-roster]')
  const otherSquad = otherArmy.locator('[data-unit="Intercessor Squad"]')
  await otherSquad.getByRole('button', { name: 'Remove a model from Intercessor Squad', exact: true }).click()
  await expect(otherSquad.locator('[data-count="models"]')).toHaveText('3/5')
  await expect(table.getByRole('rowheader').filter({ hasText: 'Intercessor Squad' })).toContainText('3 models · 6 wounds')
  await expect(planner).toContainText('4 / 4 matchups · Complete')
  await expect(cell.locator('.readout')).not.toHaveText(baseline!)
  await otherArmy.getByRole('button', { name: 'Close', exact: true }).click()
  await otherPanels[1].getByRole('button', { name: `Open ${roster}`, exact: true }).click()
  await expect(otherSquad.locator('[data-count="wounds"]')).toHaveText('1/2')
  await otherSquad.getByRole('button', { name: 'Return a model to Intercessor Squad', exact: true }).click()
  await expect(otherSquad.locator('[data-count="models"]')).toHaveText('4/5')
  await expect(table.getByRole('columnheader').filter({ hasText: 'Intercessor Squad' })).toContainText('4 models · 8 wounds')
  await otherSquad.getByRole('button', { name: 'Take a wound off Intercessor Squad', exact: true }).click()
  await expect(table.getByRole('columnheader').filter({ hasText: 'Intercessor Squad' })).toContainText('4 models · 7 wounds')
  await expect(planner).toContainText('4 / 4 matchups · Complete')
  await otherArmy.locator('[data-unit="Terminator Squad"]').getByRole('button', { name: 'Mark Terminator Squad lost', exact: true }).click()
  await expect(planner).toContainText('2 / 2 matchups · Complete')
  await expect(table.getByRole('columnheader').filter({ hasText: 'Terminator Squad' })).toHaveCount(0)
  await otherArmy.getByRole('button', { name: 'Close', exact: true }).click()
  await referee.close()
  await planner.getByRole('button', { name: 'Close', exact: true }).click()
  await panels[1].getByRole('button', { name: `Open ${roster}`, exact: true }).click()
  await expect(page.locator('[data-army-roster] [data-unit="Intercessor Squad"] [data-count="wounds"]')).toHaveText('1/2')
})

test('unit-level equipment remains an explicit survivor choice after a casualty', async ({ page }) => {
  await signUp(page, 'Equipment')
  const roster = await createRoster(page, {
    faction: 'Agents of the Imperium',
    detachment: /Imperialis Fleet/,
    name: 'Breachers',
  })
  await page.getByLabel('Add a unit').fill('Imperial Navy Breachers')
  await waitForRosterSave(page, () => page.getByRole('button', { name: 'Add Imperial Navy Breachers', exact: true }).click())
  await page.locator('[data-unit="Imperial Navy Breachers"]').getByRole('button', { name: 'Imperial Navy Breachers', exact: true }).click()
  await waitForRosterSave(page, () => page.getByRole('button', { name: 'Select Demolition charge', exact: true }).click())
  await createBattle(page, { practice: true })
  await attachRoster(page, roster)
  await attachRoster(page, roster, { forPlayer: PRACTICE_OPPONENT })
  await startBattle(page)
  const panel = page.locator('[data-panel="player"][data-side="0"]')
  await panel.getByRole('button', { name: /Simulate .*combat/ }).click()
  const simulator = page.getByRole('dialog', { name: 'Combat simulator', exact: true })
  await expect(simulator.getByRole('region', { name: 'Shooting results' })).toContainText('Demolition charge')
  await simulator.getByRole('button', { name: 'Fewer attacker models', exact: true }).click()
  await expect(simulator).toContainText("Choose the attacker's surviving models and weapons")
  await simulator.getByRole('region', { name: 'Attacker', exact: true }).getByRole('button', { name: 'Survivors', exact: true }).click()
  const survivors = page.getByRole('dialog', { name: 'Attacker survivors', exact: true })
  await survivors.getByRole('button', { name: 'Fewer Navis Armsman survivors', exact: true }).click()
  const equipment = survivors
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Imperial Navy Breachers equipment', exact: true }) })
  await expect(equipment.getByLabel('Imperial Navy Breachers equipment surviving models', { exact: true })).toHaveCount(0)
  const count = equipment.getByLabel('Imperial Navy Breachers equipment surviving Demolition charge', { exact: true })
  await expect(count).toHaveText('1')
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    expect(await survivors.locator('[data-slot="dialog-body"]').evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true)
  }
  await survivors.getByRole('button', { name: 'Use survivors', exact: true }).click()
  const shooting = simulator.getByRole('region', { name: 'Shooting results' })
  await expect((await estimate(simulator, 'Shooting')).locator('.readout').first()).toHaveText(/^\d+\.\d+$/)
  await expect(shooting).toContainText('Demolition charge')
  await simulator.getByRole('region', { name: 'Attacker', exact: true }).getByRole('button', { name: 'Survivors', exact: true }).click()
  await equipment.getByRole('button', { name: 'Fewer Imperial Navy Breachers equipment surviving Demolition charge', exact: true }).click()
  await expect(count).toHaveText('0')
  await survivors.getByRole('button', { name: 'Use survivors', exact: true }).click()
  await expect(shooting).not.toContainText('Demolition charge')
  await expect((await estimate(simulator, 'Shooting')).locator('.readout').first()).toHaveText(/^\d+\.\d+$/)
  await simulator.getByRole('button', { name: 'Close', exact: true }).click()
  await panel.getByRole('button', { name: `Open ${roster}`, exact: true }).click()
  await expect(page.locator('[data-army-roster] [data-unit="Imperial Navy Breachers"] [data-count="models"]')).toHaveText('10/10')
})

test('battle combat uses frozen loadouts and live casualties', async ({ page, browser }) => {
  test.setTimeout(240_000)
  await signUp(page, 'Combat')
  const roster = await createRoster(page, { faction: 'Space Marines', detachment: /Gladius Task Force/, name: 'Combat Marines' })
  await page.getByLabel('Add a unit').fill('Intercessor Squad')
  await waitForRosterSave(page, () => page.getByRole('button', { name: 'Add Intercessor Squad', exact: true }).first().click())
  await page.locator('[data-unit="Intercessor Squad"]').getByRole('button', { name: 'Intercessor Squad', exact: true }).click()
  await createBattle(page, { practice: true })
  await attachRoster(page, roster)
  await attachRoster(page, roster, { forPlayer: PRACTICE_OPPONENT })
  await startBattle(page)
  const panel = page.locator('[data-panel="player"][data-side="0"]')
  const army = page.locator('[data-army-roster]')
  const squad = army.locator('[data-unit="Intercessor Squad"]')
  const simulator = page.getByRole('dialog', { name: 'Combat simulator', exact: true })
  const shooting = simulator.getByRole('region', { name: 'Shooting results' })
  const damage = simulator.getByRole('region', { name: 'Shooting estimate', includeHidden: true }).locator('.readout').first()
  for (const width of [1440, 390, 900]) {
    await page.setViewportSize({ width, height: 1000 })
    if (width < 1024) await page.getByRole('tab', { name: 'Your side', exact: true }).click()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await panel.getByRole('button', { name: `Open ${roster}` }).click()
    if (width === 1440) await squad.getByRole('button', { name: 'Remove a model from Intercessor Squad' }).click()
    await expect(squad.locator('[data-count="models"]')).toHaveText('4/5')
    if (width === 1440) await squad.getByRole('button', { name: 'Take a wound off Intercessor Squad' }).click()
    await expect(squad.locator('[data-count="wounds"]')).toHaveText('1/2')
    expect(await army.locator('[data-army-list]').evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true)
    await expect(army.getByRole('button', { name: /^Simulate/ })).toHaveCount(0)
    await army.getByRole('button', { name: 'Close', exact: true }).click()
    await panel.getByRole('button', { name: /Simulate .*combat/ }).click()
    if (width < 860) {
      await expect.poll(async () => (await simulator.boundingBox())?.x).toBe(0)
      const bounds = (await simulator.boundingBox())!
      expect(bounds.y).toBe(0)
      expect(bounds.width).toBe(width)
      expect(bounds.y + bounds.height).toBe((await page.locator('[data-native-app-tabs]').boundingBox())!.y)
    }
    await expect(simulator.getByLabel('Attacker models', { exact: true })).toHaveText('4')
    await expect(simulator.getByLabel('Attacker remaining wounds', { exact: true })).toHaveText('1')
    await expect(simulator.getByLabel('Defender models', { exact: true })).toHaveText('5')
    await estimate(simulator, 'Shooting')
    await expect(damage).toHaveText(/^\d+\.\d+$/)
    await expect(shooting).toContainText('4× ➤ Bolt Rifle - Focused Fire')
    await expect(simulator.getByRole('region', { name: 'Melee results' })).toContainText('4× Knives and Fists')
    // The rules behind these estimates do not depend on width, so the narrower layouts skip them.
    if (width === 1440) {
      const baseline = Number(await damage.textContent())
      await simulator.getByRole('tab', { name: /^Shooting/ }).click()
      await simulator.getByRole('button', { name: 'Cover (−1 BS)', exact: true }).click()
      await expect.poll(async () => Number(await damage.textContent())).toBeLessThan(baseline)
      await simulator.getByRole('tab', { name: /^Shooting/ }).click()
      await simulator.getByRole('button', { name: 'Cover (−1 BS)', exact: true }).click()
      await expect(simulator.getByRole('switch', { name: 'Defender Armour of Contempt', exact: true })).toBeVisible()
      await simulator.getByRole('button', { name: 'Swap attacker and defender' }).click()
      await openCombatControls(simulator)
      await expect(simulator.getByLabel('Defender models', { exact: true })).toHaveText('4')
      await expect(simulator.getByLabel('Defender remaining wounds', { exact: true })).toHaveText('1')
      await expect(damage).toHaveText(/^\d+\.\d+$/)
      await expect(shooting).toHaveAttribute('aria-busy', 'false')
      const woundedKills = Number(await (await estimate(simulator, 'Melee')).locator('.readout').nth(1).textContent())
      await simulator.getByRole('button', { name: 'More defender remaining wounds', exact: true }).click()
      await expect
        .poll(async () => Number(await (await estimate(simulator, 'Melee')).locator('.readout').nth(1).textContent()))
        .toBeLessThan(woundedKills)
    }
    expect(await simulator.locator('[data-simulator-scroll]').evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true)
    await simulator.getByRole('button', { name: 'Close', exact: true }).click()
    await panel.getByRole('button', { name: `Open ${roster}` }).click()
    await expect(squad.locator('[data-count="models"]')).toHaveText('4/5')
    await expect(squad.locator('[data-count="wounds"]')).toHaveText('1/2')
    await army.getByRole('button', { name: 'Close', exact: true }).click()
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
  await panel.getByRole('button', { name: /Simulate .*combat/ }).click()
  await expect(damage).toHaveText(/^\d+\.\d+$/)
  await openCombatControls(simulator)
  await simulator.getByRole('tab', { name: /^Shooting/ }).click()
  const cover = simulator.getByRole('button', { name: 'Cover (−1 BS)', exact: true })
  await cover.click()
  await expect(cover).toHaveAttribute('aria-pressed', 'true')
  const referee = await page.context().newPage()
  await referee.goto(page.url())
  await referee
    .locator('[data-panel="player"][data-side="0"]')
    .getByRole('button', { name: `Open ${roster}` })
    .click()
  const otherSquad = referee.locator('[data-army-roster] [data-unit="Intercessor Squad"]')
  await otherSquad.getByRole('button', { name: 'Remove a model from Intercessor Squad' }).click()
  await expect(simulator.getByLabel('Attacker models', { exact: true })).toHaveText('3')
  await expect(cover).toHaveAttribute('aria-pressed', 'true')
  await otherSquad.getByRole('button', { name: 'Return a model to Intercessor Squad' }).click()
  await expect(simulator.getByLabel('Attacker models', { exact: true })).toHaveText('4')
  await referee.close()
  await simulator.getByRole('button', { name: 'Close', exact: true }).click()
  for (const width of [1440, 390, 900]) {
    const serverContext = await browser.newContext({
      javaScriptEnabled: false,
      storageState: await page.context().storageState(),
      viewport: { width, height: 1000 },
    })
    const serverPage = await serverContext.newPage()
    await serverPage.goto(page.url())
    expect(await serverPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await serverContext.close()
  }
})

test('a team matchup switches allied armies and carries both sides through a swap', async ({ browser, page }) => {
  const allyContext = await browser.newContext()
  const ally = await allyContext.newPage()
  const allyName = uniqueName('Ally')
  const hostName = uniqueName('Captain')
  await signUp(ally, allyName)
  const allyRoster = await createRoster(ally, {
    faction: 'Necrons',
    detachment: /Cursed Legion/,
    name: 'Allied Necrons',
    size: /Incursion/,
  })
  await ally.getByLabel('Add a unit').fill('Canoptek Reanimator')
  await waitForRosterSave(ally, () => ally.getByRole('button', { name: 'Add Canoptek Reanimator', exact: true }).first().click())
  await signUp(page, hostName)
  const roster = await createRoster(page, {
    faction: 'Space Marines',
    detachment: /Gladius Task Force/,
    name: 'Allied Marines',
    size: /Incursion/,
  })
  await page.getByLabel('Add a unit').fill('Intercessor Squad')
  await waitForRosterSave(page, () => page.getByRole('button', { name: 'Add Intercessor Squad', exact: true }).first().click())
  const opponentRoster = await createRoster(page, { faction: 'Space Marines', detachment: /Gladius Task Force/, name: 'Opposing Marines' })
  await page.getByLabel('Add a unit').fill('Intercessor Squad')
  await waitForRosterSave(page, () => page.getByRole('button', { name: 'Add Intercessor Squad', exact: true }).first().click())
  await befriend(page, ally)
  const url = await createBattle(page, { yourAlly: allyName, practice: true })
  await ally.goto(url)
  await attachRoster(page, roster)
  await attachRoster(page, opponentRoster, { forPlayer: PRACTICE_OPPONENT })
  await attachRoster(ally, allyRoster)
  await expect(page.getByText(allyRoster, { exact: true }).first()).toBeVisible()
  await startBattle(page, `${hostName} & ${allyName}`)
  await page.getByRole('button', { name: `Simulate ${hostName}'s combat`, exact: true }).click()
  const simulator = page.getByRole('dialog', { name: 'Combat simulator', exact: true })
  await simulator.getByRole('combobox', { name: 'First army', exact: true }).click()
  await page.getByRole('option', { name: allyName, exact: true }).click()
  await expect(simulator.getByRole('region', { name: 'Attacker', exact: true }).locator('[data-combat-member]').first()).toContainText(
    'Canoptek Reanimator',
  )
  await expect(simulator.getByLabel('Defender faction', { exact: true })).toContainText('Space Marines')
  await expect((await estimate(simulator, 'Shooting')).locator('.readout').first()).toHaveText(/^\d+\.\d+$/)
  await simulator.getByRole('button', { name: 'Swap attacker and defender' }).click()
  await openCombatControls(simulator)
  await expect(simulator.getByRole('region', { name: 'Defender', exact: true }).locator('[data-combat-member]').first()).toContainText(
    'Canoptek Reanimator',
  )
  await expect(simulator.getByRole('region', { name: 'Defender', exact: true })).toContainText('4+')
  await simulator.getByRole('button', { name: 'Close', exact: true }).click()
  await allyContext.close()
})

test('battle support auras respect the recipient, role, conditions, and living sources', async ({ page }) => {
  await signUp(page, 'Auras')
  const roster = await createRoster(page, { faction: 'Necrons', detachment: /Cursed Legion/, name: 'Aura Necrons' })
  for (const name of ['Immortals', 'Nekrosor Ammentar', 'Illuminor Szeras', 'Skorpekh Destroyers', "C'tan Shard of the Nightbringer"]) {
    await page.getByLabel('Add a unit').fill(name)
    await waitForRosterSave(page, () =>
      page
        .getByRole('button', { name: `Add ${name}`, exact: true })
        .first()
        .click(),
    )
  }
  await createBattle(page, { practice: true })
  await attachRoster(page, roster)
  await attachRoster(page, roster, { forPlayer: PRACTICE_OPPONENT })
  await startBattle(page)
  const panel = page.locator('[data-panel="player"][data-side="0"]')
  const openedAt = Date.now()
  await panel.getByRole('button', { name: /Simulate .*combat/ }).click()
  const simulator = page.getByRole('dialog', { name: 'Combat simulator', exact: true })
  const damage = (await estimate(simulator, 'Shooting')).locator('.readout').first()
  await expect(damage).toHaveText(/^\d+\.\d+$/)
  console.log(`Battle simulator first result: ${Date.now() - openedAt} ms`)
  const baseline = Number(await damage.textContent())
  const attacker = simulator.getByRole('region', { name: 'Attacker buffs', exact: true })
  const defender = simulator.getByRole('region', { name: 'Defender buffs', exact: true })
  const aura = attacker.getByRole('switch', { name: /Infectious Murder/ })
  await expect(aura).not.toBeChecked()
  await attacker.getByRole('button', { name: /Infectious Murder.*rules/ }).hover()
  const tooltip = page.getByRole('tooltip').filter({ hasText: /Infectious Murder/ })
  await expect(tooltip).toContainText('SUSTAINED HITS 1')
  await expect(aura).not.toBeChecked()
  await page.mouse.move(0, 0)
  await expect(tooltip).toBeHidden()
  await expect(attacker).toContainText('Within 6" · Closest eligible target')
  await expect(defender).not.toContainText('Infectious Murder')
  await expect(attacker).not.toContainText('Nullstone Field Generator')
  await expect(defender).not.toContainText('Image of Death')
  await expect(defender.getByRole('switch', { name: /Nullstone Field Generator/ })).toBeVisible()
  await aura.click()
  await expect.poll(async () => Number(await damage.textContent())).toBeGreaterThan(baseline)
  const boosted = Number(await damage.textContent())
  await attacker.getByRole('switch', { name: /Mechanical Augmentation/ }).click()
  await expect.poll(async () => Number(await damage.textContent())).toBeGreaterThan(boosted)
  const penetrated = Number(await damage.textContent())
  await defender.getByRole('switch', { name: /Mechanical Augmentation/ }).click()
  await expect.poll(async () => Number(await damage.textContent())).toBeLessThan(penetrated)
  await expect(attacker).not.toContainText('Not calculated')
  await expect(defender).not.toContainText('Not calculated')
  for (const width of [390, 900]) {
    await page.setViewportSize({ width, height: 1000 })
    expect(await simulator.locator('[data-simulator-scroll]').evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true)
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
  await simulator.getByRole('combobox', { name: 'Attacker unit', exact: true }).click()
  await page.getByRole('option', { name: 'Skorpekh Destroyers', exact: true }).click()
  await expect(
    simulator.getByRole('region', { name: 'Attacker', exact: true }).getByRole('button', { name: 'Loadout', exact: true }),
  ).toBeEnabled()
  await openCombatControls(simulator)
  await expect(attacker).toContainText('Within 6"')
  await expect(attacker).not.toContainText('Closest eligible target')
  await expect(attacker.getByRole('switch', { name: /Prophet of Destruction/ })).toBeVisible()
  await expect(attacker.getByRole('switch', { name: /Cold Fervour/ })).toBeChecked()
  const melee = simulator.getByRole('region', { name: 'Melee results' })
  await expect(melee).toHaveAttribute('aria-busy', 'false')
  const beforePlasmacyte = Number(await (await estimate(simulator, 'Melee')).locator('.readout').first().textContent())
  await attacker.getByRole('switch', { name: /Plasmacyte/ }).click()
  await expect
    .poll(async () => Number(await (await estimate(simulator, 'Melee')).locator('.readout').first().textContent()))
    .toBeGreaterThan(beforePlasmacyte)
  await expect(attacker).not.toContainText('Not calculated')
  await simulator.getByRole('combobox', { name: 'Attacker unit', exact: true }).click()
  await page.getByRole('option', { name: "C'tan Shard of the Nightbringer", exact: true }).click()
  await expect(
    simulator.getByRole('region', { name: 'Attacker', exact: true }).getByRole('button', { name: 'Loadout', exact: true }),
  ).toBeEnabled()
  await openCombatControls(simulator)
  await expect(attacker).not.toContainText('Infectious Murder')
  await simulator.getByRole('button', { name: 'Close', exact: true }).click()
  await panel.getByRole('button', { name: `Open ${roster}` }).click()
  const army = page.locator('[data-army-roster]')
  await army.locator('[data-unit="Nekrosor Ammentar"]').getByRole('button', { name: 'Mark Nekrosor Ammentar lost', exact: true }).click()
  await expect(army.getByRole('button', { name: 'Mark Nekrosor Ammentar lost', exact: true })).toHaveCount(0)
  await army.getByRole('button', { name: 'Close', exact: true }).click()
  await panel.getByRole('button', { name: /Simulate .*combat/ }).click()
  await openCombatControls(simulator)
  await expect(damage).toHaveText(/^\d+\.\d+$/)
  await expect(attacker).not.toContainText('Infectious Murder')
  await expect(defender.getByRole('switch', { name: /Nullstone Field Generator/ })).toBeVisible()
})
