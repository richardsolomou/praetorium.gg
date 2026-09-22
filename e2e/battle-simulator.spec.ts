import { expect, test } from '@playwright/test'
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

for (const width of [1440, 390, 900]) {
  test(`battle combat uses frozen loadouts and live casualties at ${width}px`, async ({ page, browser }) => {
    await signUp(page, 'Combat')
    const roster = await createRoster(page, { faction: 'Space Marines', detachment: /Gladius Task Force/, name: 'Combat Marines' })
    await page.getByLabel('Add a unit').fill('Intercessor Squad')
    await waitForRosterSave(page, () => page.getByRole('button', { name: 'Add Intercessor Squad', exact: true }).first().click())
    await page.locator('[data-unit="Intercessor Squad"]').getByRole('button', { name: 'Intercessor Squad', exact: true }).click()
    await waitForRosterSave(page, () => page.getByRole('button', { name: 'Select Power fist', exact: true }).click())
    await createBattle(page, { practice: true })
    await attachRoster(page, roster)
    await attachRoster(page, roster, { forPlayer: PRACTICE_OPPONENT })
    await startBattle(page)
    await page.setViewportSize({ width, height: 1000 })
    if (width < 1024) await page.getByRole('tab', { name: 'Your side', exact: true }).click()
    const panel = page.locator('[data-panel="player"][data-side="0"]')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await panel.getByRole('button', { name: `Open ${roster}` }).click()
    const army = page.locator('[data-army-roster]')
    const squad = army.locator('[data-unit="Intercessor Squad"]')
    await squad.getByRole('button', { name: 'Remove a model from Intercessor Squad' }).click()
    await expect(squad.locator('[data-count="models"]')).toHaveText('4/5')
    await squad.getByRole('button', { name: 'Take a wound off Intercessor Squad' }).click()
    await expect(squad.locator('[data-count="wounds"]')).toHaveText('1/2')
    expect(await army.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true)
    await squad.getByRole('button', { name: 'Simulate Intercessor Squad', exact: true }).click()
    const simulator = page.getByRole('dialog', { name: 'Combat simulator', exact: true })
    await expect(simulator.getByLabel('Attacker models', { exact: true })).toHaveText('4')
    await expect(simulator.getByLabel('Attacker remaining wounds', { exact: true })).toHaveText('1')
    await expect(simulator.getByLabel('Defender models', { exact: true })).toHaveText('5')
    await expect(
      simulator.getByText("Choose the attacker's surviving models and weapons to calculate attacks.", { exact: true }),
    ).toBeVisible()
    await simulator.getByRole('region', { name: 'Attacker', exact: true }).getByRole('button', { name: 'Survivors', exact: true }).click()
    const survivors = page.getByRole('dialog', { name: 'Attacker survivors', exact: true })
    await survivors.getByRole('button', { name: 'Fewer Intercessor survivors', exact: true }).click()
    await survivors.getByRole('button', { name: 'Use survivors', exact: true }).click()
    const shooting = simulator.getByRole('region', { name: 'Shooting results' })
    const damage = shooting.locator('.readout').first()
    await expect(damage).toHaveText(/^\d+\.\d+$/)
    await expect(shooting).toContainText('4× Bolt Rifle')
    await expect(simulator.getByRole('region', { name: 'Melee results' })).toContainText('Power fist')
    const baseline = Number(await damage.textContent())
    await simulator.getByRole('switch', { name: 'Attacker Hail of Bolts', exact: true }).click()
    await expect.poll(async () => Number(await damage.textContent())).toBeGreaterThan(baseline)
    await expect(simulator.getByRole('switch', { name: 'Defender Armour of Contempt', exact: true })).toBeVisible()
    await simulator.getByRole('button', { name: 'Swap attacker and defender' }).click()
    await expect(simulator.getByLabel('Defender models', { exact: true })).toHaveText('4')
    await expect(simulator.getByLabel('Defender remaining wounds', { exact: true })).toHaveText('1')
    await expect(damage).toHaveText(/^\d+\.\d+$/)
    await expect(shooting).toHaveAttribute('aria-busy', 'false')
    const woundedKills = Number(await shooting.locator('.readout').nth(1).textContent())
    await simulator.getByRole('button', { name: 'More defender remaining wounds', exact: true }).click()
    await expect.poll(async () => Number(await shooting.locator('.readout').nth(1).textContent())).toBeLessThan(woundedKills)
    expect(await simulator.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true)
    await simulator.evaluate((node) => {
      const content = node.querySelector('.overflow-y-auto')
      if (content) content.scrollTop = 0
    })
    await simulator.screenshot({ path: `test-results/battle-simulator-${width}.png` })
    await simulator.getByRole('button', { name: 'Close', exact: true }).click()
    await panel.getByRole('button', { name: `Open ${roster}` }).click()
    await expect(squad.locator('[data-count="models"]')).toHaveText('4/5')
    await expect(squad.locator('[data-count="wounds"]')).toHaveText('1/2')
    await army.getByRole('button', { name: 'Close', exact: true }).click()
    if (width === 1440) {
      await panel.getByRole('button', { name: /Simulate .*combat/ }).click()
      const referee = await page.context().newPage()
      await referee.goto(page.url())
      await referee
        .locator('[data-panel="player"][data-side="0"]')
        .getByRole('button', { name: `Open ${roster}` })
        .click()
      const otherSquad = referee.locator('[data-army-roster] [data-unit="Intercessor Squad"]')
      await otherSquad.getByRole('button', { name: 'Remove a model from Intercessor Squad' }).click()
      await expect(simulator.getByLabel('Attacker models', { exact: true })).toHaveText('3')
      await otherSquad.getByRole('button', { name: 'Return a model to Intercessor Squad' }).click()
      await expect(simulator.getByLabel('Attacker models', { exact: true })).toHaveText('4')
      await referee.close()
      await simulator.getByRole('button', { name: 'Close', exact: true }).click()
    }
    const serverContext = await browser.newContext({
      javaScriptEnabled: false,
      storageState: await page.context().storageState(),
      viewport: { width, height: 1000 },
    })
    const serverPage = await serverContext.newPage()
    await serverPage.goto(page.url())
    expect(await serverPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await serverPage.screenshot({ path: `test-results/battle-simulator-ssr-${width}.png`, fullPage: true })
    await serverContext.close()
  })
}

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
  await expect(simulator.getByRole('combobox', { name: 'Attacker unit', exact: true })).toContainText('Canoptek Reanimator')
  await expect(simulator.getByLabel('Defender faction', { exact: true })).toContainText('Space Marines')
  await expect(simulator.getByRole('region', { name: 'Shooting results' }).locator('.readout').first()).toHaveText(/^\d+\.\d+$/)
  await simulator.getByRole('button', { name: 'Swap attacker and defender' }).click()
  await expect(simulator.getByRole('combobox', { name: 'Defender unit', exact: true })).toContainText('Canoptek Reanimator')
  await expect(simulator.getByRole('region', { name: 'Defender', exact: true })).toContainText('4+')
  await simulator.screenshot({ path: 'test-results/battle-simulator-team.png' })
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
  const shooting = simulator.getByRole('region', { name: 'Shooting results' })
  const damage = shooting.locator('.readout').first()
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
  await attacker.scrollIntoViewIfNeeded()
  await simulator.screenshot({ path: 'test-results/battle-simulator-auras.png' })
  for (const width of [390, 900]) {
    await page.setViewportSize({ width, height: 1000 })
    expect(await simulator.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true)
    await attacker.scrollIntoViewIfNeeded()
    await simulator.screenshot({ path: `test-results/battle-simulator-auras-${width}.png` })
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
  await simulator.getByRole('combobox', { name: 'Attacker unit', exact: true }).click()
  await page.getByRole('option', { name: 'Skorpekh Destroyers', exact: true }).click()
  await expect(attacker).toContainText('Within 6"')
  await expect(attacker).not.toContainText('Closest eligible target')
  await expect(attacker.getByRole('switch', { name: /Prophet of Destruction/ })).toBeVisible()
  await expect(attacker.getByRole('switch', { name: /Cold Fervour/ })).toBeChecked()
  const melee = simulator.getByRole('region', { name: 'Melee results' })
  await expect(melee).toHaveAttribute('aria-busy', 'false')
  const beforePlasmacyte = Number(await melee.locator('.readout').first().textContent())
  await attacker.getByRole('switch', { name: /Plasmacyte/ }).click()
  await expect.poll(async () => Number(await melee.locator('.readout').first().textContent())).toBeGreaterThan(beforePlasmacyte)
  await expect(attacker).not.toContainText('Not calculated')
  await simulator.getByRole('combobox', { name: 'Attacker unit', exact: true }).click()
  await page.getByRole('option', { name: "C'tan Shard of the Nightbringer", exact: true }).click()
  await expect(attacker).not.toContainText('Infectious Murder')
  await simulator.getByRole('button', { name: 'Close', exact: true }).click()
  await panel.getByRole('button', { name: `Open ${roster}` }).click()
  const army = page.locator('[data-army-roster]')
  await army.locator('[data-unit="Nekrosor Ammentar"]').getByRole('button', { name: 'Mark Nekrosor Ammentar lost', exact: true }).click()
  await expect(army.getByRole('button', { name: 'Mark Nekrosor Ammentar lost', exact: true })).toHaveCount(0)
  await army.getByRole('button', { name: 'Close', exact: true }).click()
  await panel.getByRole('button', { name: /Simulate .*combat/ }).click()
  await expect(damage).toHaveText(/^\d+\.\d+$/)
  await expect(attacker).not.toContainText('Infectious Murder')
  await expect(defender.getByRole('switch', { name: /Nullstone Field Generator/ })).toBeVisible()
})
