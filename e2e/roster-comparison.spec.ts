import { expect, test, type Locator, type Page } from './test'
import { addUnit, createRoster, signUp, expectNoPageOverflow, chooseOption, chooseRosterAction, PHONE, savedArmy } from './account'
import { holdCombatCalculations, openCombatBreakdown } from './combat'

test('new rosters compare customizable mixed-faction benchmarks and retain the target set', async ({ page }) => {
  await signUp(page, 'Benchmark builder')
  await createRoster(page, { faction: 'Space Marines', detachment: /Gladius Task Force/, name: 'Benchmark Marines' })
  await addUnit(page, 'Intercessor Squad')
  await addUnit(page, 'Terminator Squad')
  await chooseRosterAction(page, 'Test targets')
  let dialog = page.getByRole('dialog', { name: 'Test targets', exact: true })
  await expect(dialog.getByRole('group', { name: 'Attacking with', exact: true })).toContainText('Current roster')
  await expect(dialog.getByRole('group', { name: 'Defending with', exact: true })).toContainText('Benchmark targets')
  const benchmarks = dialog.getByRole('button', { name: 'Benchmark targets · 9', exact: true })
  await expect(benchmarks).toHaveAttribute('aria-expanded', 'false')
  await expect(dialog).toContainText('18 / 18 matchups · Complete')
  await expect(dialog).not.toContainText('Cached')
  await benchmarks.click()
  await expect(benchmarks).toHaveAttribute('aria-expanded', 'true')
  expect((await benchmarks.boundingBox())!.y).toBeLessThan((await dialog.getByRole('table').boundingBox())!.y)
  await expect(dialog.getByRole('group', { name: 'Attacking with', exact: true })).toBeVisible()
  await expect(dialog.getByRole('spinbutton', { name: 'Necron Warriors #2 benchmark models', exact: true })).toBeVisible()
  let table = dialog.getByRole('table')
  await expect(dialog.getByRole('combobox', { name: 'Highlight matchups', exact: true })).toContainText('Best attackers per target')
  await expect(table.getByRole('columnheader')).toHaveCount(10)
  for (const name of [
    'Cadian Shock Troops',
    'Necron Warriors',
    'Intercessor Squad',
    'Heavy Intercessor Squad',
    'Terminator Assault Squad',
    'Rhino',
    'Ballistus Dreadnought',
    'Leman Russ Battle Tank',
    'Land Raider',
  ]) {
    await expect(table.getByRole('columnheader').filter({ hasText: name }).first()).toBeVisible()
  }
  await expect(table.getByRole('cell')).toHaveCount(18)
  await expect(table.getByText('Not calculated', { exact: true })).toHaveCount(0)
  const firstTarget = table.locator('tbody tr td').filter({ has: page.locator('button[aria-label*="against Cadian Shock Troops #1:"]') })
  const damages = await firstTarget.locator('.readout').allTextContents()
  expect(new Set(damages).size).toBe(2)
  const bestAttacker = table
    .locator('tbody tr td[data-best-matchup]')
    .filter({ has: page.locator('button[aria-label*="against Cadian Shock Troops #1:"]') })
  expect(Number(await bestAttacker.locator('.readout').first().textContent())).toBe(Math.max(...damages.map(Number)))
  await chooseOption(page, 'Highlight matchups', 'Best targets per attacker')
  await expect(table.getByText('Best target', { exact: true })).not.toHaveCount(0)
  await chooseOption(page, 'Highlight matchups', 'Best attackers per target')
  await expect(dialog.getByRole('spinbutton', { name: 'Necron Warriors #2 benchmark models', exact: true })).toHaveValue('10')
  await dialog.evaluate((element) => {
    const observation = {
      loading: false,
      observer: new MutationObserver(() => {
        observation.loading ||= /Loading roster units|Calculating…/.test(element.textContent ?? '')
      }),
    }
    observation.observer.observe(element, { childList: true, subtree: true, characterData: true })
    Object.assign(window, { benchmarkEditObservation: observation })
  })
  await dialog.getByRole('button', { name: 'More Necron Warriors #2 benchmark models', exact: true }).click()
  await expect(dialog.getByRole('spinbutton', { name: 'Necron Warriors #2 benchmark models', exact: true })).toHaveValue('11')
  await dialog.getByRole('spinbutton', { name: 'Necron Warriors #2 benchmark models', exact: true }).fill('20')
  await dialog.getByRole('spinbutton', { name: 'Necron Warriors #2 benchmark models', exact: true }).press('Enter')
  await page.waitForTimeout(500)
  expect(
    await page.evaluate(() => {
      const observation = (window as unknown as { benchmarkEditObservation: { loading: boolean; observer: MutationObserver } })
        .benchmarkEditObservation
      observation.observer.disconnect()
      return observation.loading
    }),
  ).toBe(false)
  await expect(dialog.locator('[data-faction-mark]')).toHaveCount(10)
  await page.screenshot({ path: test.info().outputPath('comparison-target-editor-desktop.png'), animations: 'disabled' })
  await page.setViewportSize(PHONE)
  await expect.poll(async () => (await dialog.boundingBox())?.width).toBe(390)
  await page.screenshot({ path: test.info().outputPath('comparison-target-editor-phone.png'), animations: 'disabled' })
  await page.setViewportSize({ width: 1440, height: 900 })
  await dialog.getByRole('button', { name: 'Remove Rhino #6 benchmark', exact: true }).click()
  await dialog.getByRole('combobox', { name: 'Add benchmark target', exact: true }).click()
  await page.getByPlaceholder('Search benchmark units…').fill('Boyz Orks')
  await page.getByRole('option', { name: /^Boyz, Orks/ }).click()
  table = dialog.getByRole('table')
  await expect(table.getByRole('columnheader').filter({ hasText: 'Necron Warriors' })).toContainText('20 models')
  await expect(table).not.toContainText('Rhino')
  await expect(table.getByRole('columnheader').last()).toContainText('Boyz')
  await expect(dialog.getByRole('group', { name: 'Attacking with', exact: true })).toBeVisible()
  await expect(dialog.getByRole('spinbutton', { name: 'Necron Warriors #2 benchmark models', exact: true })).toBeVisible()
  await page.screenshot({ path: test.info().outputPath('roster-benchmarks-desktop.png'), animations: 'disabled' })
  await page.setViewportSize(PHONE)
  await expect.poll(async () => (await dialog.boundingBox())?.x).toBe(0)
  await expect.poll(async () => (await dialog.boundingBox())?.width).toBe(390)
  await expectNoPageOverflow(page)
  await page.screenshot({ path: test.info().outputPath('roster-benchmarks-phone.png'), animations: 'disabled' })
  await table.getByRole('button', { name: /^Intercessor Squad #1 against Necron Warriors #2:/ }).click()
  const detail = page.getByRole('dialog', { name: 'Combat simulator', exact: true }).last()
  await expect(detail.getByRole('combobox', { name: 'Defender unit', exact: true })).toContainText('Necron Warriors')
  await expect(detail.getByLabel('Defender models', { exact: true })).toHaveText('20')
  await detail.getByRole('button', { name: 'Close', exact: true }).click()
  await dialog.getByRole('button', { name: 'Close', exact: true }).click()
  await page.reload()
  await chooseRosterAction(page, 'Test targets')
  dialog = page.getByRole('dialog', { name: 'Test targets', exact: true })
  await dialog.getByRole('button', { name: 'Benchmark targets · 9', exact: true }).click()
  await expect(dialog.getByRole('spinbutton', { name: 'Necron Warriors #2 benchmark models', exact: true })).toHaveValue('20')
  await expect(dialog.getByRole('button', { name: 'Remove Boyz #9 benchmark', exact: true })).toBeVisible()
  await dialog.getByRole('button', { name: 'Reset benchmarks' }).click()
  await expect(dialog.getByRole('button', { name: 'Remove Rhino #6 benchmark', exact: true })).toBeVisible()
  for (let remaining = 9; remaining > 0; remaining--)
    await dialog
      .getByRole('button', { name: /^Remove .+ benchmark$/ })
      .first()
      .click()
  await expect(dialog.getByRole('heading', { name: /^Benchmark targets ·/ })).toHaveText('Benchmark targets · 0')
  await dialog.getByRole('button', { name: 'Close', exact: true }).click()
  await page.reload()
  await chooseRosterAction(page, 'Test targets')
  dialog = page.getByRole('dialog', { name: 'Test targets', exact: true })
  await expect(dialog.getByRole('heading', { name: /^Benchmark targets ·/ })).toHaveText('Benchmark targets · 0')
  await expect(dialog).toContainText('Add at least one benchmark target.')
  await dialog.getByRole('button', { name: 'Benchmark targets · 0', exact: true }).click()
  await dialog.getByRole('combobox', { name: 'Add benchmark target', exact: true }).click()
  await page.getByPlaceholder('Search benchmark units…').fill('Boyz Orks')
  await page.getByRole('option', { name: /^Boyz, Orks/ }).click()
  await expect(dialog).toContainText('2 / 2 matchups · Complete')
  await dialog.getByRole('button', { name: 'Close', exact: true }).click()
  await page.reload()
  await chooseRosterAction(page, 'Test targets')
  dialog = page.getByRole('dialog', { name: 'Test targets', exact: true })
  await expect(dialog.getByRole('heading', { name: /^Benchmark targets ·/ })).toHaveText('Benchmark targets · 1')
  await dialog.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(page.locator('[data-unit="Intercessor Squad"]')).toBeVisible()
  await expect(page.locator('[data-unit="Terminator Squad"]')).toBeVisible()
  await expect(page.locator('[data-unit="Boyz"]')).toHaveCount(0)
})

async function settledBox(locator: Locator) {
  let last: Awaited<ReturnType<Locator['boundingBox']>> = null
  await expect
    .poll(async () => {
      const box = await locator.boundingBox()
      const still = Boolean(box && last && box.x === last.x && box.y === last.y)
      last = box
      return still
    })
    .toBe(true)
  return last!
}

test('long matchup tables keep target headings and attacker names visible while scrolling', async ({ page }) => {
  const { id } = await savedArmy(page, 'Pinned matchup headings', { name: 'Long comparison' })
  await page.goto(`/rosters/${id}`)
  await chooseRosterAction(page, 'Test targets')
  const dialog = page.getByRole('dialog', { name: 'Test targets', exact: true })
  await expect(dialog).toContainText(/matchups · Complete/, { timeout: 120_000 })
  const grid = dialog.getByRole('region', { name: 'All unit matchups', exact: true })
  const corner = grid.getByRole('columnheader').first()
  const target = grid.getByRole('columnheader').nth(1)
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 })
    await grid.scrollIntoViewIfNeeded()
    await grid.evaluate((element) => {
      element.scrollTop = 0
      element.scrollLeft = 0
    })
    // A resize relays the dialog out over several frames, so the starting place is read once it holds still.
    const before = await settledBox(corner)
    const targetBefore = await settledBox(target)
    await grid.evaluate((element) => {
      element.scrollTop = 240
      element.scrollLeft = 160
    })
    expect(await grid.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
    await expect.poll(async () => Math.abs((await corner.boundingBox())!.y - before.y)).toBeLessThan(2)
    await expect.poll(async () => Math.abs((await target.boundingBox())!.y - targetBefore.y)).toBeLessThan(2)
    await expect.poll(async () => Math.abs((await corner.boundingBox())!.x - before.x)).toBeLessThan(2)
    await expectNoPageOverflow(page)
    await page.screenshot({ path: test.info().outputPath(`pinned-matchup-headings-${width}.png`) })
  }
})

test('saved rosters compare every pairing, reverse direction, and open isolated adjustments', async ({ page }) => {
  await signUp(page, 'Roster comparison')
  await createRoster(page, { faction: 'Necrons', detachment: /Cursed Legion/, name: 'Attacking Necrons' })
  await addUnit(page, 'Immortals')
  await addUnit(page, 'Skorpekh Destroyers')
  const attackerUrl = page.url()
  await createRoster(page, { faction: 'Space Marines', detachment: /Gladius Task Force/, name: 'Defending Marines' })
  await addUnit(page, 'Intercessor Squad')
  await addUnit(page, 'Terminator Squad')
  const defenderUrl = page.url()
  await page.goto('/simulator')
  await chooseWholeRoster(page, 'Attacking with', 'Attacking Necrons')
  const comparison = page.getByRole('region', { name: 'Roster comparison' })
  const firstGate = await holdCombatCalculations(page)
  await chooseWholeRoster(page, 'Defending with', 'Defending Marines')
  await firstGate.waitForStart()
  await comparison.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(comparison).toContainText('Cancelled')
  await firstGate.release()
  await comparison.getByRole('button', { name: 'Retry', exact: true }).click()
  await expect(comparison).toContainText('4 / 4 matchups · Complete')
  await expect(comparison.getByRole('group', { name: 'Attacking with', exact: true })).toContainText('Attacking Necrons')
  await expect(comparison.getByRole('group', { name: 'Defending with', exact: true })).toContainText('Defending Marines')
  const table = comparison.getByRole('table')
  await expect(table.getByRole('row')).toHaveCount(3)
  await expect(table.getByRole('cell')).toHaveCount(4)
  await expect(table.getByRole('cell').getByText('Pending', { exact: true })).toHaveCount(0)
  await expect(table.locator('[data-best-matchup]')).not.toHaveCount(0)
  const immortalCell = table.getByRole('button', { name: /^Immortals #1 against Intercessor Squad #1:/ })
  const damage = await immortalCell.locator('.readout').textContent()
  expect(Number(damage)).toBeGreaterThan(0)
  await page.screenshot({ path: test.info().outputPath('roster-comparison-desktop.png'), fullPage: true })
  await page.setViewportSize(PHONE)
  await expect.poll(async () => (await comparison.boundingBox())?.width).toBeLessThanOrEqual(390)
  await expectNoPageOverflow(page)
  await page.screenshot({ path: test.info().outputPath('roster-comparison-phone.png'), fullPage: true })
  await immortalCell.click()
  const matchup = page.getByRole('dialog', { name: 'Combat simulator', exact: true })
  await expect(matchup.getByRole('combobox', { name: 'Attacker unit', exact: true })).toContainText('Immortals')
  await expect(matchup.getByRole('combobox', { name: 'Defender unit', exact: true })).toContainText('Intercessor Squad')
  await openCombatBreakdown(matchup)
  const shooting = matchup.getByRole('region', { name: 'Shooting estimate' })
  await expect(shooting.locator('.readout').first()).toHaveText(damage!)
  await matchup.getByRole('button', { name: 'More attacker models', exact: true }).click()
  await matchup.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(immortalCell.locator('.readout')).toHaveText(damage!)
  await comparison.getByRole('tab', { name: 'Melee', exact: true }).click()
  await comparison.getByRole('button', { name: 'View options', exact: true }).click()
  await expect(immortalCell.locator('.readout')).not.toHaveText(damage!)
  await chooseOption(page, 'Comparison metric', 'Destruction chance')
  await expect(immortalCell.locator('.readout')).toHaveText(/%$/)
  await comparison.getByRole('button', { name: 'Reverse direction' }).click()
  await expect(page.getByRole('group', { name: 'Attacking with', exact: true })).toContainText('Defending Marines')
  await expect(comparison).toContainText('4 / 4 matchups · Complete')
  await expect(table.getByRole('columnheader').nth(1)).toContainText('Immortals')
  const gate = await holdCombatCalculations(page)
  await comparison.getByRole('button', { name: 'Reverse direction' }).click()
  await expect(table.getByRole('columnheader').nth(1)).toContainText('Intercessor Squad')
  await expect(comparison).toContainText('4 / 4 matchups · Complete')
  expect(await page.evaluate(() => window.PraetoriumCombatGate?.pending.length)).toBe(0)
  await gate.release()
  await page.goto(attackerUrl)
  await page.locator('[data-unit="Immortals"]').getByRole('button', { name: 'Immortals', exact: true }).click()
  await expect(page.getByLabel('Immortals models', { exact: true })).toHaveText('5')
  await page.goto(defenderUrl)
  await expect(page.locator('[data-unit="Intercessor Squad"]')).toBeVisible()
})

for (const width of [1440, 390]) {
  test(`roster actions group editing, tools and exports at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 })
    await signUp(page, 'Roster menus')
    await createRoster(page, { faction: 'Necrons', detachment: /Cursed Legion/, name: 'Menu roster' })
    if (width === 390) await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Test targets', exact: true })).toHaveCount(0)
    await page.getByRole('button', { name: 'Roster actions', exact: true }).click()
    const menu = page.getByRole('menu')
    await expect(menu.getByRole('menuitem')).toHaveText([
      'Start a battle',
      'Test targets',
      'Edit roster setup',
      'Create variant',
      'Lend to a friend',
      'Lock roster',
      'Copy link',
      'Export text',
      'Exchange code',
      'Print',
    ])
    await expect(menu.getByRole('menuitem', { name: 'Test targets', exact: true })).toHaveAttribute('aria-disabled', 'true')
    // Grouped under headings; a list with no attached unit has nothing to display differently.
    await expect(menu.getByRole('group')).toHaveText([/^Play/, /^Setup/, /^Copies and access/, /^Share/])
    await expect(menu.getByRole('separator')).toHaveCount(3)
    await page.screenshot({ path: test.info().outputPath(`builder-menu-${width}.png`) })
    await page.keyboard.press('Escape')
    await page.goto('/rosters')
    await page.getByRole('button', { name: 'Actions for Menu roster', exact: true }).click()
    await expect(menu.getByRole('menuitem')).toHaveText([
      'View',
      'Edit roster setup',
      'Create variant',
      'Duplicate',
      'Copy link',
      'Make private',
      'Export text',
      'Exchange code',
      'Print',
      'Lock roster',
      'Archive',
      'Delete',
    ])
    await expect(menu.getByRole('separator')).toHaveCount(4)
    await page.screenshot({ path: test.info().outputPath(`library-menu-${width}.png`) })
    await page.keyboard.press('Escape')
    await page.getByRole('link', { name: /Menu roster/ }).click({ button: 'right' })
    await expect(menu.getByRole('menuitem').first()).toHaveText('Edit roster setup')
    await expect(menu.getByRole('menuitem').last()).toHaveText('Delete')
    await expect(menu.getByRole('separator')).toHaveCount(4)
  })
}

/** Fields a whole roster on one side of the standalone simulator, which first lists the roster's units. */
async function chooseWholeRoster(page: Page, side: 'Attacking with' | 'Defending with', roster: string) {
  await chooseOption(page, side, roster)
  await page.getByRole('option', { name: 'The whole roster', exact: true }).click()
}
