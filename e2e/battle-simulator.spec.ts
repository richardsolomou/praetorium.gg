import { combatEstimate, holdCombatCalculations, openCombatControls, combatDamage } from './combat'
import { expect, test } from './test'
import {
  addUnit,
  expectNoHorizontalOverflow,
  addAllyPlace,
  attachRoster,
  createBattle,
  createRoster,
  signUp,
  startBattle,
  uniqueName,
  expectNoPageOverflow,
  practiceBattle,
  chooseOption,
  PHONE,
  playerPanel,
} from './account'

test('the battle matchup planner uses live survivors, isolates experiments, and refreshes after another tab records casualties', async ({
  page,
}) => {
  await signUp(page, 'Live planner')
  const roster = await createRoster(page, { faction: 'Space Marines', detachment: /Gladius Task Force/, name: 'Planner Marines' })
  for (const name of ['Intercessor Squad', 'Terminator Squad', 'Rhino']) await addUnit(page, name)
  await practiceBattle(page, roster)
  await startBattle(page)
  const panels = ([0, 1] as const).map((side) => playerPanel(page, side))
  for (const [side, panel] of panels.entries()) {
    await panel.getByRole('button', { name: `Units: ${roster}`, exact: true }).click()
    const army = page.locator('[data-army-roster]')
    const squad = army.locator('[data-unit="Intercessor Squad"]')
    for (let lost = 0; lost < side + 1; lost++) {
      await squad.getByRole('button', { name: 'Remove a model from Intercessor in Intercessor Squad', exact: true }).click()
      await expect(squad.locator('[data-count="models"]').first()).toHaveText(`${4 - lost}/5`)
    }
    await squad.getByRole('button', { name: 'Take a wound off Intercessor in Intercessor Squad', exact: true }).click()
    await expect(squad.locator('[data-model-line="Intercessor"] [data-count="wounds"]')).toHaveText('1/2')
    await army.locator('[data-unit="Rhino"]').getByRole('button', { name: 'Mark Rhino destroyed', exact: true }).click()
    await expect(army.getByRole('button', { name: 'Mark Rhino destroyed', exact: true })).toHaveCount(0)
    await army.getByRole('button', { name: 'Close', exact: true }).click()
  }
  await panels[0].getByRole('button', { name: "Simulate Live planner's combat", exact: true }).click()
  const planner = page.getByRole('dialog', { name: 'Combat simulator', exact: true }).first()
  await chooseOption(page, 'Attacking with', 'Live planner')
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
  await expect(await combatDamage(detail, 'Shooting')).toHaveText(baseline!)
  await expect(detail.getByRole('button', { name: /^Optimize/ })).toHaveCount(0)
  await detail.getByRole('button', { name: 'More defender remaining wounds', exact: true }).click()
  await detail.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(cell.locator('.readout')).toHaveText(baseline!)
  await page.setViewportSize(PHONE)
  await expect.poll(async () => (await planner.boundingBox())?.width).toBe(390)
  await expectNoHorizontalOverflow(planner.locator('[data-simulator-scroll]'))
  await page.setViewportSize({ width: 1440, height: 900 })
  await planner.getByRole('button', { name: 'Close', exact: true }).click()
  await panels[0].getByRole('button', { name: "Simulate Live planner's combat", exact: true }).click()
  await expect(await combatDamage(planner, 'Shooting')).toHaveText(/^\d+\.\d+$/)
  const cachedGate = await holdCombatCalculations(page)
  await chooseOption(page, 'Attacking with', 'Live planner')
  await expect(planner).toContainText('4 / 4 matchups · Complete')
  expect(await page.evaluate(() => window.PraetoriumCombatGate?.pending.length)).toBe(0)
  await cachedGate.release()
  const referee = await page.context().newPage()
  await referee.goto(page.url())
  const otherPanels = ([0, 1] as const).map((side) => playerPanel(referee, side))
  await otherPanels[0].getByRole('button', { name: `Units: ${roster}`, exact: true }).click()
  const otherArmy = referee.locator('[data-army-roster]')
  const otherSquad = otherArmy.locator('[data-unit="Intercessor Squad"]')
  await otherSquad.getByRole('button', { name: 'Remove a model from Intercessor in Intercessor Squad', exact: true }).click()
  await expect(otherSquad.locator('[data-count="models"]').first()).toHaveText('3/5')
  await expect(table.getByRole('rowheader').filter({ hasText: 'Intercessor Squad' })).toContainText('3 models · 6 wounds')
  await expect(planner).toContainText('4 / 4 matchups · Complete')
  await expect(cell.locator('.readout')).not.toHaveText(baseline!)
  await otherArmy.getByRole('button', { name: 'Close', exact: true }).click()
  await otherPanels[1].getByRole('button', { name: `Units: ${roster}`, exact: true }).click()
  await expect(otherSquad.locator('[data-model-line="Intercessor"] [data-count="wounds"]')).toHaveText('1/2')
  await otherSquad.getByRole('button', { name: 'Return a model to Intercessor in Intercessor Squad', exact: true }).click()
  await expect(otherSquad.locator('[data-count="models"]').first()).toHaveText('4/5')
  await expect(table.getByRole('columnheader').filter({ hasText: 'Intercessor Squad' })).toContainText('4 models · 8 wounds')
  await otherSquad.getByRole('button', { name: 'Take a wound off Intercessor in Intercessor Squad', exact: true }).click()
  await expect(table.getByRole('columnheader').filter({ hasText: 'Intercessor Squad' })).toContainText('4 models · 7 wounds')
  await expect(planner).toContainText('4 / 4 matchups · Complete')
  await otherArmy
    .locator('[data-unit="Terminator Squad"]')
    .getByRole('button', { name: 'Mark Terminator Squad destroyed', exact: true })
    .click()
  await expect(planner).toContainText('2 / 2 matchups · Complete')
  await expect(table.getByRole('columnheader').filter({ hasText: 'Terminator Squad' })).toHaveCount(0)
  await otherArmy.getByRole('button', { name: 'Close', exact: true }).click()
  await referee.close()
  await planner.getByRole('button', { name: 'Close', exact: true }).click()
  await panels[1].getByRole('button', { name: `Units: ${roster}`, exact: true }).click()
  await expect(
    page.locator('[data-army-roster] [data-unit="Intercessor Squad"] [data-model-line="Intercessor"] [data-count="wounds"]'),
  ).toHaveText('1/2')
})

test('battle combat uses frozen loadouts and live casualties', async ({ page, browser }) => {
  test.setTimeout(240_000)
  await signUp(page, 'Combat')
  const roster = await createRoster(page, { faction: 'Space Marines', detachment: /Gladius Task Force/, name: 'Combat Marines' })
  await addUnit(page, 'Intercessor Squad')
  await practiceBattle(page, roster)
  await startBattle(page)
  const panel = playerPanel(page, 0)
  const army = page.locator('[data-army-roster]')
  const squad = army.locator('[data-unit="Intercessor Squad"]')
  const simulator = page.getByRole('dialog', { name: 'Combat simulator', exact: true })
  const shooting = simulator.getByRole('region', { name: 'Shooting results' })
  const damage = simulator.getByRole('region', { name: 'Shooting estimate', includeHidden: true }).locator('.readout').first()
  for (const width of [1440, 390, 900]) {
    await page.setViewportSize({ width, height: 1000 })
    if (width < 1024) await page.getByRole('tab', { name: 'Your side', exact: true }).click()
    await expectNoPageOverflow(page)
    await panel.getByRole('button', { name: `Units: ${roster}` }).click()
    if (width === 1440) await squad.getByRole('button', { name: 'Remove a model from Intercessor in Intercessor Squad' }).click()
    await expect(squad.locator('[data-count="models"]').first()).toHaveText('4/5')
    if (width === 1440) await squad.getByRole('button', { name: 'Take a wound off Intercessor in Intercessor Squad' }).click()
    await expect(squad.locator('[data-model-line="Intercessor"] [data-count="wounds"]')).toHaveText('1/2')
    await expectNoHorizontalOverflow(army.locator('[data-army-list]'))
    await expect(army.getByRole('button', { name: 'Simulate Intercessor Squad', exact: true })).toBeVisible()
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
    await combatEstimate(simulator, 'Shooting')
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
      const woundedKills = Number(await (await combatEstimate(simulator, 'Melee')).locator('.readout').nth(1).textContent())
      await simulator.getByRole('button', { name: 'More defender remaining wounds', exact: true }).click()
      await expect
        .poll(async () => Number(await (await combatEstimate(simulator, 'Melee')).locator('.readout').nth(1).textContent()))
        .toBeLessThan(woundedKills)
    }
    await expectNoHorizontalOverflow(simulator.locator('[data-simulator-scroll]'))
    await simulator.getByRole('button', { name: 'Close', exact: true }).click()
    await panel.getByRole('button', { name: `Units: ${roster}` }).click()
    await expect(squad.locator('[data-count="models"]').first()).toHaveText('4/5')
    await expect(squad.locator('[data-model-line="Intercessor"] [data-count="wounds"]')).toHaveText('1/2')
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
  await playerPanel(referee, 0)
    .getByRole('button', { name: `Units: ${roster}` })
    .click()
  const otherSquad = referee.locator('[data-army-roster] [data-unit="Intercessor Squad"]')
  await otherSquad.getByRole('button', { name: 'Remove a model from Intercessor in Intercessor Squad' }).click()
  await expect(simulator.getByLabel('Attacker models', { exact: true })).toHaveText('3')
  await expect(cover).toHaveAttribute('aria-pressed', 'true')
  await otherSquad.getByRole('button', { name: 'Return a model to Intercessor in Intercessor Squad' }).click()
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
    await expectNoPageOverflow(serverPage)
    await serverContext.close()
  }
})

test('a team matchup switches allied armies and carries both sides through a swap', async ({ page }) => {
  const hostName = uniqueName('Captain')
  await signUp(page, hostName)
  // A 2v1 played alone, so the ally's list comes from this player's own library too.
  const allyRoster = await createRoster(page, {
    faction: 'Necrons',
    detachment: /Cursed Legion/,
    name: 'Allied Necrons',
    size: /Incursion/,
  })
  await addUnit(page, 'Canoptek Reanimator')
  const roster = await createRoster(page, {
    faction: 'Space Marines',
    detachment: /Gladius Task Force/,
    name: 'Allied Marines',
    size: /Incursion/,
  })
  await addUnit(page, 'Intercessor Squad')
  const opponentRoster = await createRoster(page, { faction: 'Space Marines', detachment: /Gladius Task Force/, name: 'Opposing Marines' })
  await addUnit(page, 'Intercessor Squad')
  await createBattle(page, { practice: true })
  await addAllyPlace(page, 0)
  await attachRoster(page, roster)
  await attachRoster(page, allyRoster, { side: 0 })
  await attachRoster(page, opponentRoster, { side: 1 })
  await startBattle(page, `${hostName} & ${allyRoster}`)
  await page.getByRole('button', { name: `Simulate ${hostName}'s combat`, exact: true }).click()
  const simulator = page.getByRole('dialog', { name: 'Combat simulator', exact: true })
  await chooseOption(page, 'First army', allyRoster)
  await expect(simulator.getByRole('region', { name: 'Attacker', exact: true }).locator('[data-combat-member]').first()).toContainText(
    'Canoptek Reanimator',
  )
  await expect(simulator.getByLabel('Defender faction', { exact: true })).toContainText('Space Marines')
  await expect(await combatDamage(simulator, 'Shooting')).toHaveText(/^\d+\.\d+$/)
  await simulator.getByRole('button', { name: 'Swap attacker and defender' }).click()
  await openCombatControls(simulator)
  await expect(simulator.getByRole('region', { name: 'Defender', exact: true }).locator('[data-combat-member]').first()).toContainText(
    'Canoptek Reanimator',
  )
  await expect(simulator.getByRole('region', { name: 'Defender', exact: true })).toContainText('4+')
  await simulator.getByRole('button', { name: 'Close', exact: true }).click()
})
