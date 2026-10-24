import { expect, type Locator, type Page, test } from './test'
import {
  addUnit,
  attachRoster,
  createBattle,
  createRoster,
  PRACTICE_OPPONENT,
  setupStep,
  signUp,
  uniqueName,
  waitForRosterSave,
} from './account'
import { attach, shot } from './builder.harness'

const phone = { viewport: { width: 390, height: 844 } }
const desktop = { viewport: { width: 1440, height: 900 } }
const SQUAD = 'Intercessor Squad'

/** The roster's cards, with the picker or loadout put away on a phone. */
async function cards(page: Page) {
  const picker = page.getByRole('dialog', { name: 'Add units' })
  if (await picker.isVisible()) await picker.getByRole('button', { name: 'Close' }).click()
  const back = page.locator('[data-pane="loadout"]').getByRole('button', { name: 'Back to roster' })
  if (await back.isVisible()) await back.click()
  await page.waitForLoadState('networkidle')
  return { squad: page.locator(`[data-unit="${SQUAD}"]`), rhino: page.locator('[data-unit="Rhino"]') }
}

for (const [size, label] of [
  [phone, 'phone'],
  [desktop, 'desktop'],
] as const) {
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
    await shot(page.getByRole('menu'), `test-results/roster-embark-board-menu-${label}.png`)
    await waitForRosterSave(page, () => boarding.click(), 'embarkedIn')
    await expect(squad).toContainText('Embarked inRhino')
    await expect(rhino).toContainText(`Embarked${SQUAD}5/12 models`)
    await shot(squad, `test-results/roster-embark-passenger-${label}.png`)
    await shot(rhino, `test-results/roster-embark-transport-${label}.png`)

    await page.reload()
    await expect((await cards(page)).squad).toContainText('Embarked inRhino')
    await expect(rhino.getByRole('button', { name: 'Disembark', exact: true })).toBeVisible()

    await createBattle(page, { practice: true })
    await attachRoster(page, roster)
    await attachRoster(page, roster, { forPlayer: PRACTICE_OPPONENT })
    await setupStep(page, 'Reserves')
    const reserves = page.getByRole('region', { name: 'Reserves', exact: true })
    await expect(reserves.getByText('Embarked in Rhino')).toHaveCount(2)
    await shot(reserves, `test-results/roster-embark-setup-${label}.png`)

    await reserves
      .getByRole('button', { name: `Start ${SQUAD} in Battlefield`, exact: true })
      .first()
      .click()
    await expect(reserves.getByText('Embarked in Rhino')).toHaveCount(1)
  })
}

const PUT_BACK = 'No longer fits in Rhino, so it starts on the battlefield'

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
  const page = await (await browser.newContext(desktop)).newPage()
  const { squad, rhino, carry } = await mountedSquads(page, 'Overfilled Marines')

  await resize(page, squad.first(), 'More', 3)
  await expect(squad.first()).toContainText(PUT_BACK)
  await expect(squad.nth(1)).toContainText('Embarked inRhino')
  await expect(rhino).toContainText(`${SQUAD} #25/12 models`)
  await carry.click()
  await expect(page.getByRole('menuitem', { name: `Embark ${SQUAD} #1 in Rhino`, exact: true })).toContainText(
    'This transport can carry at most 12 models.',
  )
  await page.keyboard.press('Escape')

  await waitForRosterSave(page, () => page.getByRole('button', { name: `Fewer models in ${SQUAD}`, exact: true }).click())
  await expect(squad.first()).not.toContainText(PUT_BACK)
})

for (const [size, label] of [
  [phone, 'phone'],
  [desktop, 'desktop'],
] as const) {
  test(`a character joining an embarked squad that no longer fits takes that squad off the transport (${label})`, async ({ browser }) => {
    test.setTimeout(240_000)
    const page = await (await browser.newContext(size)).newPage()
    const { squad, rhino, carry } = await mountedSquads(page, 'Led Marines', ['Captain'])
    await resize(page, squad.nth(1), 'More', 2)
    await expect(rhino).toContainText(`${SQUAD} #27/12 models`)
    await cards(page)

    const captain = page.locator('[data-unit="Captain"]')
    await captain.getByRole('button', { name: 'Attach Captain to unit', exact: true }).click()
    await waitForRosterSave(page, () => page.getByRole('menu').getByRole('menuitem', { name: SQUAD, exact: true }).first().click())
    const led = page.locator('section[aria-label]').filter({ has: captain })
    const bar = led.locator('[data-unit-actions]')
    await expect(bar).toContainText(PUT_BACK)
    await expect(led.locator(`[data-unit="${SQUAD}"]`)).not.toContainText(PUT_BACK)
    await expect(rhino).toContainText(`${SQUAD} #27/12 models`)
    await expect(rhino.getByRole('button', { name: 'Disembark', exact: true })).toHaveCount(1)
    await shot(led, `test-results/roster-embark-put-back-${label}.png`)

    await resize(page, squad.nth(1), 'Fewer', 2)
    await cards(page)
    await carry.click()
    await waitForRosterSave(
      page,
      () => page.getByRole('menuitem', { name: `Embark ${SQUAD} #1 in Rhino`, exact: true }).click(),
      'embarkedIn',
    )
    await expect(bar).not.toContainText(PUT_BACK)
    await expect(bar).toContainText('Unit embarked inRhino')
    await expect(rhino).toContainText(`${SQUAD} #16/12 models`)
    await shot(led, `test-results/roster-embark-led-aboard-${label}.png`)
    await shot(rhino, `test-results/roster-embark-led-transport-${label}.png`)
  })
}

for (const [size, label] of [
  [phone, 'phone'],
  [desktop, 'desktop'],
] as const) {
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
    await shot(led, `test-results/roster-embark-outline-${label}.png`)

    await page.getByRole('button', { name: 'View', exact: true }).click()
    await expect(bar).toContainText('Unit embarked inRhino')
    await expect(bar.getByRole('button')).toHaveCount(0)
    await expect(inside.filter({ hasText: 'Embarked in' })).toHaveCount(0)
    await shot(led, `test-results/roster-embark-outline-view-${label}.png`)
    await page.getByRole('button', { name: 'Build', exact: true }).click()

    await waitForRosterSave(page, () => bar.getByRole('button', { name: 'Remove', exact: true }).click(), 'embarkedIn')
    await expect(bar).not.toContainText('Unit embarked in')
    await expect(bar.getByRole('button', { name: `Embark ${SQUAD} in transport`, exact: true })).toBeVisible()
  })
}
