import { expect, type Locator, type Page, test } from './test'
import { addUnit, createRoster, setupStep, signUp, uniqueName, waitForRosterSave, practiceBattle, PHONE, desktopContext } from './account'
import { attach, expectNoHorizontalOverflow, shot, closePicker } from './builder.harness'

const SIZES = [
  [{ viewport: PHONE }, 'phone'],
  [desktopContext, 'desktop'],
] as const
const SQUAD = 'Intercessor Squad'

/** The roster's cards, with the picker or loadout put away on a phone. */
async function cards(page: Page) {
  await closePicker(page)
  const back = page.locator('[data-pane="loadout"]').getByRole('button', { name: 'Back to roster' })
  if (await back.isVisible()) await back.click()
  await page.waitForLoadState('networkidle')
  return { squad: page.locator(`[data-unit="${SQUAD}"]`), rhino: page.locator('[data-unit="Rhino"]') }
}

for (const [size, label] of SIZES) {
  test(`custom names distinguish embarked squads and attached units (${label})`, async ({ browser }) => {
    const page = await (await browser.newContext(size)).newPage()
    await signUp(page, uniqueName('Named passengers'))
    const roster = await createRoster(page, { faction: 'Space Marines', detachment: /Gladius Task Force/, name: 'Named Marines' })
    for (const name of [SQUAD, SQUAD, 'Rhino', 'Captain']) await addUnit(page, name)
    const { squad, rhino } = await cards(page)

    for (const [card, name, nickname] of [
      [squad.first(), SQUAD, 'Alpha'],
      [squad.nth(1), SQUAD, 'Bravo'],
      [rhino, 'Rhino', 'Ironclad'],
      [page.locator('[data-unit="Captain"]'), 'Captain', 'Commander'],
    ] as const) {
      await card.getByRole('button', { name, exact: true }).click()
      await waitForRosterSave(page, () => page.getByRole('textbox', { name: 'Custom name', exact: true }).fill(nickname), nickname)
      await cards(page)
    }
    await page.locator('[data-unit="Captain"]').getByRole('button', { name: 'Attach Captain to unit', exact: true }).click()
    await waitForRosterSave(page, () => page.getByRole('menu').getByRole('menuitem', { name: SQUAD, exact: true }).first().click())
    const carry = rhino.getByRole('button', { name: 'Embark a unit in Rhino', exact: true })
    await carry.click()
    const alpha = page.getByRole('menuitem', { name: `Embark Alpha · ${SQUAD} #1 in Rhino`, exact: true })
    await expect(alpha).toContainText('With Commander · Captain')
    await expect(page.getByRole('menuitem', { name: `Embark Bravo · ${SQUAD} #2 in Rhino`, exact: true })).toBeVisible()
    await shot(page.getByRole('menu'), test.info().outputPath(`roster-embark-custom-menu-${label}.png`))
    await waitForRosterSave(page, () => alpha.click(), 'embarkedIn')
    await expect(rhino).toContainText(`EmbarkedAlpha · ${SQUAD} #1 + Commander · Captain`)
    const led = page.locator('section[aria-label]').filter({ has: page.locator('[data-unit="Captain"]') })
    await expect(led.locator('[data-unit-actions]')).toContainText('Unit embarked inIronclad · Rhino')

    await page.reload()
    await cards(page)
    await page.getByRole('button', { name: 'View', exact: true }).click()
    await expect(rhino).toContainText(`EmbarkedAlpha · ${SQUAD} #1 + Commander · Captain`)
    await expectNoHorizontalOverflow(rhino)
    await shot(rhino, test.info().outputPath(`roster-embark-custom-transport-${label}.png`))
    await shot(led, test.info().outputPath(`roster-embark-custom-attached-${label}.png`))
    if (label === 'phone') {
      await page.evaluate(() => (document.documentElement.style.fontSize = '200%'))
      await expectNoHorizontalOverflow(rhino)
      await expectNoHorizontalOverflow(rhino.getByText(`Alpha · ${SQUAD} #1 + Commander · Captain`, { exact: true }))
      await shot(rhino, test.info().outputPath('roster-embark-custom-large-text.png'))
      await page.evaluate(() => (document.documentElement.style.fontSize = ''))
    }

    await practiceBattle(page, roster)
    await setupStep(page, 'Reserves')
    const reserves = page.getByRole('region', { name: 'Reserves', exact: true })
    await expect(reserves.getByText(`Embarked: Alpha · ${SQUAD} #1 with Commander · Captain`, { exact: true })).toHaveCount(2)
    await expect(reserves.getByText('Embarked in Ironclad · Rhino', { exact: true })).toHaveCount(2)
    await shot(reserves, test.info().outputPath(`roster-embark-custom-setup-${label}.png`))
  })

  test(`a unit embarked in the builder starts in its transport at battle setup (${label})`, async ({ browser }) => {
    test.setTimeout(240_000)
    const page = await (await browser.newContext(size)).newPage()
    await signUp(page, uniqueName('Embark'))
    const roster = await createRoster(page, { faction: 'Space Marines', detachment: /Gladius Task Force/, name: 'Mounted Marines' })
    for (const name of [SQUAD, 'Rhino']) await addUnit(page, name)

    const { squad, rhino } = await cards(page)
    await squad.getByRole('button', { name: `Embark ${SQUAD} in transport`, exact: true }).click()
    const boarding = page.getByRole('menuitem', { name: `Embark ${SQUAD} in Rhino`, exact: true })
    await expect(boarding).toContainText('0/12 models')
    await shot(page.getByRole('menu'), test.info().outputPath(`roster-embark-board-menu-${label}.png`))
    await waitForRosterSave(page, () => boarding.click(), 'embarkedIn')
    await expect(squad).toContainText('Embarked inRhino')
    await expect(rhino).toContainText(`Embarked${SQUAD}Disembark`)
    await shot(squad, test.info().outputPath(`roster-embark-passenger-${label}.png`))
    await shot(rhino, test.info().outputPath(`roster-embark-transport-${label}.png`))

    await page.reload()
    await expect((await cards(page)).squad).toContainText('Embarked inRhino')
    await expect(rhino.getByRole('button', { name: 'Disembark', exact: true })).toBeVisible()

    await practiceBattle(page, roster)
    await setupStep(page, 'Reserves')
    const reserves = page.getByRole('region', { name: 'Reserves', exact: true })
    await expect(reserves.getByText('Embarked in Rhino')).toHaveCount(2)
    await shot(reserves, test.info().outputPath(`roster-embark-setup-${label}.png`))

    await reserves
      .getByRole('button', { name: `Start ${SQUAD} in Battlefield`, exact: true })
      .first()
      .click()
    await expect(reserves.getByText('Embarked in Rhino')).toHaveCount(1)
  })
}

const putBack = (squad: string) => `${squad} no longer fits in Rhino, so it starts on the battlefield.`

/** Both squads of a fresh list started in its Rhino, five models each. */
async function mountedSquads(page: Page, name: string, extra: string[] = []) {
  await signUp(page, uniqueName(name))
  await createRoster(page, { faction: 'Space Marines', detachment: /Gladius Task Force/, name })
  for (const unit of [SQUAD, SQUAD, 'Rhino', ...extra]) await addUnit(page, unit)
  const found = await cards(page)
  const carry = found.rhino.getByRole('button', { name: 'Embark a unit in Rhino', exact: true })
  for (const at of [1, 2]) {
    await carry.click()
    await waitForRosterSave(
      page,
      () => page.getByRole('menuitem', { name: `Embark ${SQUAD} #${at} in Rhino`, exact: true }).click(),
      'embarkedIn',
    )
  }
  await expect(found.rhino.getByRole('button', { name: 'Disembark', exact: true })).toHaveCount(2)
  return { ...found, carry }
}

/** Opens the squad's loadout and adds or removes models one at a time, each saved before the next. */
async function resize(page: Page, squad: Locator, change: 'More' | 'Fewer', count: number) {
  await squad.getByRole('button', { name: SQUAD, exact: true }).click()
  const button = page.getByRole('button', { name: `${change} models in ${SQUAD}`, exact: true })
  for (let step = 0; step < count; step++) await waitForRosterSave(page, () => button.click())
}

test('the squad an edit grows past its transport’s room is the one put back on the battlefield', async ({ browser }) => {
  test.setTimeout(180_000)
  const page = await (await browser.newContext(desktopContext)).newPage()
  const { squad, rhino, carry } = await mountedSquads(page, 'Overfilled Marines')

  await resize(page, squad.first(), 'More', 3)
  await expect(page.getByText(putBack(`${SQUAD} #1`), { exact: true })).toBeVisible()
  await expect(squad.nth(1)).toContainText('Embarked inRhino')
  await expect(rhino).toContainText(`Embarked${SQUAD} #2Disembark`)
  await carry.click()
  await expect(page.getByRole('menuitem', { name: `Embark ${SQUAD} #1 in Rhino`, exact: true })).toContainText(
    'This transport can carry at most 12 models.',
  )
  await page.keyboard.press('Escape')
})

for (const [size, label] of SIZES) {
  test(`a character joining an embarked squad that no longer fits takes that squad off the transport (${label})`, async ({ browser }) => {
    test.setTimeout(240_000)
    const page = await (await browser.newContext(size)).newPage()
    const { squad, rhino, carry } = await mountedSquads(page, 'Led Marines', ['Captain'])
    await resize(page, squad.nth(1), 'More', 2)
    await expect(rhino).toContainText(`Embarked${SQUAD} #2Disembark`)
    await cards(page)

    const captain = page.locator('[data-unit="Captain"]')
    await captain.getByRole('button', { name: 'Attach Captain to unit', exact: true }).click()
    await waitForRosterSave(page, () => page.getByRole('menu').getByRole('menuitem', { name: SQUAD, exact: true }).first().click())
    const led = page.locator('section[aria-label]').filter({ has: captain })
    const bar = led.locator('[data-unit-actions]')
    await expect(page.getByText(putBack(`${SQUAD} #1`), { exact: true })).toBeVisible()
    await expect(bar).not.toContainText('Unit embarked in')
    await expect(rhino).toContainText(`Embarked${SQUAD} #2Disembark`)
    await expect(rhino.getByRole('button', { name: 'Disembark', exact: true })).toHaveCount(1)
    await shot(led, test.info().outputPath(`roster-embark-put-back-${label}.png`))

    await resize(page, squad.nth(1), 'Fewer', 2)
    await cards(page)
    await carry.click()
    await waitForRosterSave(
      page,
      () => page.getByRole('menuitem', { name: `Embark ${SQUAD} #1 in Rhino`, exact: true }).click(),
      'embarkedIn',
    )
    await expect(bar).toContainText('Unit embarked inRhino')
    await expect(rhino).toContainText(`Embarked${SQUAD} #1 + CaptainDisembark`)
    await shot(led, test.info().outputPath(`roster-embark-led-aboard-${label}.png`))
    await shot(rhino, test.info().outputPath(`roster-embark-led-transport-${label}.png`))
  })
}

for (const [size, label] of SIZES) {
  test(`an attached unit is joined and embarked from its outline, not its cards (${label})`, async ({ browser }) => {
    test.setTimeout(240_000)
    const page = await (await browser.newContext(size)).newPage()
    await signUp(page, uniqueName('Outlined'))
    await createRoster(page, { faction: 'Space Marines', detachment: /Gladius Task Force/, name: 'Outlined Marines' })
    for (const name of [SQUAD, 'Rhino', 'Captain', 'Ancient']) await addUnit(page, name)
    const { rhino } = await cards(page)
    await attach(page, 'Captain', SQUAD)

    const led = page.locator('section[aria-label]').filter({ has: page.locator('[data-unit="Captain"]') })
    const bar = led.locator('[data-unit-actions]')
    const inside = led.locator('[data-unit]')
    await bar.getByRole('button', { name: `Attach a unit to ${SQUAD}`, exact: true }).click()
    await waitForRosterSave(page, () => page.getByRole('menu').getByRole('menuitem', { name: 'Ancient', exact: true }).click())
    await expect(led.locator('[data-unit="Ancient"]')).toBeVisible()
    await expect(bar.getByRole('button', { name: `Attach a unit to ${SQUAD}`, exact: true })).toHaveCount(0)

    await bar.getByRole('button', { name: `Embark ${SQUAD} in transport`, exact: true }).click()
    await waitForRosterSave(page, () => page.getByRole('menuitem', { name: `Embark ${SQUAD} in Rhino`, exact: true }).click(), 'embarkedIn')
    await expect(bar).toContainText('Unit embarked inRhino')
    await expect(inside.filter({ hasText: 'Embarked in' })).toHaveCount(0)
    await expect(inside.getByRole('button', { name: /^Embark / })).toHaveCount(0)
    await expect(rhino.getByRole('button', { name: 'Disembark', exact: true })).toHaveCount(1)
    await shot(led, test.info().outputPath(`roster-embark-outline-${label}.png`))

    await page.getByRole('button', { name: 'View', exact: true }).click()
    await expect(bar).toContainText('Unit embarked inRhino')
    await expect(bar.getByRole('button')).toHaveCount(0)
    await expect(inside.filter({ hasText: 'Embarked in' })).toHaveCount(0)
    await shot(led, test.info().outputPath(`roster-embark-outline-view-${label}.png`))
    await page.getByRole('button', { name: 'Build', exact: true }).click()

    await waitForRosterSave(page, () => bar.getByRole('button', { name: 'Remove', exact: true }).click(), 'embarkedIn')
    await expect(bar).not.toContainText('Unit embarked in')
    await expect(bar.getByRole('button', { name: `Embark ${SQUAD} in transport`, exact: true })).toBeVisible()
  })
}
