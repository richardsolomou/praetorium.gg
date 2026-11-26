import { chooseCombatUnit, closeCombatBreakdown, openCombatControls, holdCombatCalculations, combatDamage } from './combat'
import { expect, test, type Page } from './test'
import { addUnit, createRoster, signUp, waitForRosterSave, expectNoHorizontalOverflow, expectNoPageOverflow, chooseOption } from './account'

async function choose(page: Page, control: string, name: string) {
  await chooseOption(page, control, name)
  if (control.endsWith(' unit')) {
    await expect(
      page.getByRole('region', { name: control.split(' ')[0], exact: true }).getByRole('button', { name: 'Loadout', exact: true }),
    ).toBeEnabled()
    await openCombatControls(page)
  }
}

async function noOverflow(page: Page) {
  await expectNoPageOverflow(page)
  await expectNoHorizontalOverflow(page.locator('aside, [role=dialog], [data-slot=roster-units], [data-slot=scroll-area-viewport]'))
}

test('selected friendly support names its source and stays chosen through a swap', async ({ page }) => {
  await signUp(page, 'Selected support')
  await createRoster(page, { faction: 'Aeldari', detachment: /Warhost/ })
  await addUnit(page, 'Spiritseer')
  await addUnit(page, 'Wraithguard')
  await page.locator('[data-unit="Wraithguard"]').getByRole('button', { name: 'Wraithguard', exact: true }).click()
  await page.getByRole('button', { name: 'Simulate combat', exact: true }).click()
  const simulator = page.getByRole('dialog', { name: 'Combat simulator', exact: true })
  await chooseCombatUnit(page, 'Defender', 'Space Marines', 'Land Raider')
  const buff = simulator.getByRole('switch', { name: 'Attacker Spirit Mark (Psychic)', exact: true })
  const rules = simulator.getByRole('region', { name: 'Attacker rules', exact: true })
  await expect(buff).not.toBeChecked()
  await expect(rules).toContainText('Spiritseer · Selected unit within 6" · Against the selected target')
  await expect(rules).not.toContainText('Not calculated')
  await buff.click()
  await expect(simulator.getByRole('region', { name: 'Shooting results' })).toContainText('Sustained Hits 1')
  await buff.click()
  await choose(page, 'Attacker unit', 'Spiritseer')
  await expect(rules).not.toContainText('Spirit Mark')
  await choose(page, 'Attacker unit', 'Wraithguard')
  await expect(buff).not.toBeChecked()
  await buff.click()
  await simulator.getByRole('button', { name: 'Swap attacker and defender' }).click()
  await openCombatControls(simulator)
  await expect(simulator.getByRole('region', { name: 'Defender rules', exact: true })).not.toContainText('Spirit Mark')
  await simulator.getByRole('button', { name: 'Swap attacker and defender' }).click()
  await openCombatControls(simulator)
  await expect(buff).toBeChecked()
})

test('roster simulations preserve the saved loadout', async ({ browser, page }) => {
  const desktop = { width: 1440, height: 1000 }
  await page.setViewportSize(desktop)
  await signUp(page, 'Simulator')
  await createRoster(page, { faction: 'Space Marines', detachment: /Gladius Task Force/ })
  await addUnit(page, 'Intercessor Squad')
  await noOverflow(page)
  const card = page.locator('[data-unit="Intercessor Squad"]')
  await card.getByRole('button', { name: 'Intercessor Squad', exact: true }).click()
  const pane = page.locator('aside[aria-label="Loadout"]')
  // The grenade launcher gives the squad a second kind of model, so the sergeant's options are counted on the sergeant's card.
  await waitForRosterSave(page, () => pane.getByRole('button', { name: 'More Plasma pistol', exact: true }).click())
  await expect(pane.getByLabel('Plasma pistol count', { exact: true })).toHaveText('1')
  await waitForRosterSave(page, () => pane.getByRole('button', { name: 'More models in Intercessor Squad', exact: true }).click())
  await expect(pane.getByLabel('Intercessor Squad models', { exact: true })).toHaveText('6')
  for (const width of [1440, 390, 900]) {
    await page.setViewportSize({ width, height: 1000 })
    await noOverflow(page)
  }
  await page.setViewportSize(desktop)

  for (const width of [1440, 390, 900]) {
    const serverContext = await browser.newContext({
      javaScriptEnabled: false,
      storageState: await page.context().storageState(),
      viewport: { width, height: 1000 },
    })
    const serverPage = await serverContext.newPage()
    await serverPage.goto(page.url())
    await noOverflow(serverPage)
    await serverContext.close()
  }

  const simulator = page.getByRole('dialog', { name: 'Combat simulator', exact: true })
  const shooting = simulator.getByRole('region', { name: 'Shooting results' })
  const melee = simulator.getByRole('region', { name: 'Melee results' })
  await pane.getByRole('button', { name: 'Simulate combat', exact: true }).click()
  await expect(simulator.getByLabel('Attacker models', { exact: true })).toHaveText('6')
  await expect(simulator.getByLabel('Attacker faction', { exact: true })).toContainText('Space Marines')
  await chooseCombatUnit(page, 'Defender', 'Necrons', 'Canoptek Reanimator')
  await expect(shooting).toHaveAttribute('aria-busy', 'false')
  await noOverflow(page)
  await expect(shooting).toContainText('5× ➤ Bolt Rifle - Focused Fire')
  await expect(shooting).toContainText('Plasma pistol')
  await expect(melee).toContainText('6× Knives and Fists')
  await expect(simulator.getByRole('region', { name: 'Defender', exact: true }).locator('[data-characteristic="FNP"] .readout')).toHaveText(
    '4+',
  )

  const previousDamage = await (await combatDamage(simulator, 'Shooting')).textContent()
  const calculation = await holdCombatCalculations(page)
  await simulator.getByRole('button', { name: 'More attacker models' }).click()
  await calculation.waitForStart()
  await expect(shooting).toHaveAttribute('aria-busy', 'true')
  await expect(await combatDamage(simulator, 'Shooting')).toHaveText(previousDamage!)
  await expect(simulator.getByLabel('Attacker models', { exact: true })).toHaveText('7')
  await calculation.release()
  await expect(shooting).toHaveAttribute('aria-busy', 'false')
  await expect(shooting).toContainText('6× ➤ Bolt Rifle - Focused Fire')

  await simulator.getByRole('region', { name: 'Attacker', exact: true }).getByRole('button', { name: 'Loadout', exact: true }).click()
  const loadout = page.getByRole('dialog', { name: 'Attacker · Intercessor Squad', exact: true })
  await loadout.getByRole('button', { name: 'More Power fist', exact: true }).click()
  await expect(loadout.getByLabel('Power fist count', { exact: true })).toHaveText('1')
  for (const width of [1440, 390, 900]) {
    await page.setViewportSize({ width, height: 1000 })
    await noOverflow(page)
  }
  await page.setViewportSize(desktop)
  await loadout.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(melee).toHaveAttribute('aria-busy', 'false')
  await expect(melee).toContainText('Power fist')
  await expect(melee).toContainText('6× Knives and Fists')
  await simulator.getByRole('button', { name: 'Swap attacker and defender' }).click()
  await openCombatControls(simulator)
  await expect(simulator.getByLabel('Defender models', { exact: true })).toHaveText('7')
  await expect(simulator.getByLabel('Defender faction', { exact: true })).toContainText('Space Marines')
  await expect(shooting).toHaveAttribute('aria-busy', 'false')
  await page.keyboard.press('Escape')
  await expect(pane.getByLabel('Intercessor Squad models', { exact: true })).toHaveText('6')
  await expect(card).toContainText('Plasma pistol')
  await expect(card).not.toContainText('Power fist')
  await pane.getByRole('button', { name: 'Simulate combat', exact: true }).click()
  await expect(simulator.getByLabel('Attacker models', { exact: true })).toHaveText('6')
  await simulator.getByRole('button', { name: 'Close', exact: true }).click()
  await page.reload()
  await expect(card).toContainText('5x Bolt Rifle')
  await expect(card).toContainText('Plasma pistol')
})

test('roster buffs apply conditional shooting bonuses and defensive stratagems', async ({ page }) => {
  await signUp(page, 'Buffs')
  await createRoster(page, { faction: 'Space Marines', detachment: /Gladius Task Force/ })
  await addUnit(page, 'Intercessor Squad')
  await page.locator('[data-unit="Intercessor Squad"]').getByRole('button', { name: 'Intercessor Squad', exact: true }).click()
  await page.getByRole('button', { name: 'Simulate combat', exact: true }).click()
  const simulator = page.getByRole('dialog', { name: 'Combat simulator', exact: true })
  await chooseCombatUnit(page, 'Defender', 'Space Marines', 'Intercessor Squad')
  const shooting = simulator.getByRole('region', { name: 'Shooting results' })
  const damage = await combatDamage(simulator, 'Shooting')
  await expect(damage).toHaveText('2.22')
  const storm = simulator.getByRole('button', { name: 'Attacker Storm of devastation rules', exact: true })
  await expect(simulator.getByText('IGNORES COVER', { exact: false })).toHaveCount(0)
  await storm.hover()
  const tooltip = page.getByRole('tooltip').filter({ hasText: 'Storm of devastation' })
  await expect(tooltip).toContainText('IGNORES COVER')
  await storm.click()
  await page.keyboard.press('Escape')
  await expect(tooltip).toBeHidden()
  await expect(simulator).toBeVisible()
  await page.keyboard.press('Tab')
  await storm.focus()
  await expect(tooltip).toContainText('IGNORES COVER')
  const stormChoice = simulator.getByRole('switch', { name: 'Attacker Storm of devastation', exact: true })
  await expect(stormChoice).not.toBeChecked()
  await page.keyboard.press('Escape')
  await expect(simulator).toBeVisible()
  await simulator.getByRole('tab', { name: /^Shooting/ }).click()
  const cover = simulator.getByRole('button', { name: 'Cover (−1 BS)', exact: true })
  await cover.click()
  await expect.poll(async () => Number(await damage.textContent())).toBeLessThan(2.22)
  const covered = Number(await damage.textContent())
  await stormChoice.click()
  await expect(shooting).toContainText('IGNORES COVER', { ignoreCase: true })
  await expect.poll(async () => Number(await damage.textContent())).toBeGreaterThan(covered)
  await stormChoice.click()
  await cover.click()
  await expect(damage).toHaveText('2.22')
  await simulator.locator('[data-combat-buffs] > summary').scrollIntoViewIfNeeded()
  await simulator.getByRole('button', { name: 'Swap attacker and defender' }).click()
  await openCombatControls(simulator)
  await expect(damage).toHaveText('2.22')
  await simulator.getByRole('switch', { name: 'Defender Armour of Contempt', exact: true }).click()
  await expect.poll(async () => Number(await damage.textContent())).toBeLessThan(2.22)
  await expect(shooting.getByRole('button', { name: 'AP 0, modified from -1 by Armour of Contempt', exact: true })).toBeVisible()
  await simulator.getByRole('switch', { name: 'Defender Armour of Contempt', exact: true }).click()
  await expect(damage).toHaveText('2.22')
  await expect(simulator.getByRole('switch', { name: 'Attacker Armour of Contempt', exact: true })).toHaveCount(0)
  expect(
    await simulator.getByRole('region', { name: 'Attacker buffs', exact: true }).evaluate((element) => {
      const conditions = document.querySelector('[aria-label="Modifiers"]')!
      return Boolean(element.compareDocumentPosition(conditions) & Node.DOCUMENT_POSITION_FOLLOWING)
    }),
  ).toBe(true)
  const summary = simulator.getByLabel('Results summary')
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    await expect
      .poll(() =>
        summary.evaluate((element) => {
          const dialog = element.closest('[role=dialog]')!
          return Math.abs(element.getBoundingClientRect().bottom - dialog.getBoundingClientRect().bottom)
        }),
      )
      .toBeLessThanOrEqual(1)
    await closeCombatBreakdown(simulator)
    await noOverflow(page)
  }
  expect(await summary.evaluate((element) => element.getBoundingClientRect().height)).toBeLessThan(160)
  await simulator.locator('[data-simulator-scroll]').evaluate((element) => (element.scrollTop = element.scrollHeight))
  const footerTop = await summary.evaluate((element) => element.getBoundingClientRect().top)
  const modifiersBottom = await simulator
    .getByRole('region', { name: 'Applied modifiers' })
    .evaluate((element) => element.getBoundingClientRect().bottom)
  expect(modifiersBottom).toBeLessThanOrEqual(footerTop)
  await simulator.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(page.locator('[data-roster-builder]')).toHaveAttribute('data-saving', 'false')
})
