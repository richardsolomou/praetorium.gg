import { expect, type Page, test } from './test'
import {
  addUnit,
  chooseBattlefield,
  createRoster,
  setupStep,
  signUp,
  uniqueName,
  waitForRosterSave,
  practiceBattle,
  PHONE,
  desktopContext,
} from './account'
import { attach, expectNoHorizontalOverflow, shot, closePicker } from './builder.harness'
import { screenshot } from './screenshots'

const SIZES = [
  [{ viewport: PHONE }, 'phone'],
  [desktopContext, 'desktop'],
] as const
const SQUAD = 'Intercessor Squad'

test('the deployment checklist identifies two Land Raiders by their passengers', async ({ page }) => {
  await page.setViewportSize(PHONE)
  await signUp(page, uniqueName('Land Raider passengers'))
  const roster = await createRoster(page, { faction: 'Space Marines', detachment: /Gladius Task Force/ })
  for (const name of ['Land Raider', 'Land Raider', SQUAD, 'Terminator Squad']) await addUnit(page, name)
  await closePicker(page)
  for (const [unit, number] of [
    [SQUAD, 1],
    ['Terminator Squad', 2],
  ] as const) {
    await page
      .locator(`[data-unit="${unit}"]`)
      .getByRole('button', { name: `Embark in transport: ${unit}`, exact: true })
      .click()
    await waitForRosterSave(page, () =>
      page.getByRole('menuitem', { name: `Embark ${unit} in Land Raider #${number}`, exact: true }).click(),
    )
  }
  await practiceBattle(page, roster)
  await chooseBattlefield(page)
  const defender = page.getByRole('group', { name: 'Defender', exact: true })
  await defender.getByRole('button').first().click()
  await setupStep(page, 'Deploy')
  const deploy = page.getByRole('region', { name: 'Deploy', exact: true })
  const first = deploy.getByRole('button', { name: `Land Raider #1 Embarked: ${SQUAD}`, exact: true })
  const second = deploy.getByRole('button', { name: 'Land Raider #2 Embarked: Terminator Squad', exact: true })
  await expect(first).toBeVisible()
  await expect(second).toBeVisible()
  await first.click()
  await expect(first).toHaveAttribute('aria-pressed', 'true')
  await expect(second).toHaveAttribute('aria-pressed', 'false')
  await first.scrollIntoViewIfNeeded()
  await screenshot(page, 'land-raiders-phone.png')
})

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
    await page.locator('[data-unit="Captain"]').getByRole('button', { name: 'Attach to unit: Captain', exact: true }).click()
    await waitForRosterSave(page, () =>
      page
        .getByRole('menu')
        .getByRole('menuitem', { name: `Alpha · ${SQUAD}`, exact: true })
        .click(),
    )
    const carry = rhino.getByRole('button', { name: 'Embark unit: Rhino', exact: true })
    await carry.click()
    const alpha = page.getByRole('menuitem', { name: `Embark Alpha · ${SQUAD} #1 in Rhino`, exact: true })
    await expect(alpha).toContainText('With Commander · Captain')
    await expect(page.getByRole('menuitem', { name: `Embark Bravo · ${SQUAD} #2 in Rhino`, exact: true })).toBeVisible()
    await shot(page.getByRole('menu'), `roster-embark-custom-menu-${label}.png`)
    await waitForRosterSave(page, () => alpha.click(), 'embarkedIn')
    await expect(rhino).toContainText(`EmbarkedAlpha · ${SQUAD} #1 + Commander · Captain`)
    const led = page.locator('section[aria-label]').filter({ has: page.locator('[data-unit="Captain"]') })
    await expect(led.locator('[data-unit-actions]')).toContainText('Unit embarked inIronclad · Rhino')

    await page.reload()
    await cards(page)
    await page.getByRole('button', { name: 'View', exact: true }).click()
    await expect(rhino).toContainText(`EmbarkedAlpha · ${SQUAD} #1 + Commander · Captain`)
    await expectNoHorizontalOverflow(rhino)
    await shot(rhino, `roster-embark-custom-transport-${label}.png`)
    await shot(led, `roster-embark-custom-attached-${label}.png`)
    if (label === 'phone') {
      await page.evaluate(() => (document.documentElement.style.fontSize = '200%'))
      await expectNoHorizontalOverflow(rhino)
      await expectNoHorizontalOverflow(rhino.getByText(`Alpha · ${SQUAD} #1 + Commander · Captain`, { exact: true }))
      await shot(rhino, 'roster-embark-custom-large-text.png')
      await page.evaluate(() => (document.documentElement.style.fontSize = ''))
    }

    await practiceBattle(page, roster)
    await setupStep(page, 'Reserves')
    const reserves = page.getByRole('region', { name: 'Reserves', exact: true })
    await expect(reserves.getByText(`Embarked: Alpha · ${SQUAD} #1 with Commander · Captain`, { exact: true })).toHaveCount(2)
    await expect(reserves.getByText('Embarked in Ironclad · Rhino', { exact: true })).toHaveCount(2)
    await shot(reserves, `roster-embark-custom-setup-${label}.png`)
  })
}

test('a unit embarked in the builder starts in its transport at battle setup', async ({ browser }) => {
  test.setTimeout(240_000)
  const page = await (await browser.newContext(desktopContext)).newPage()
  await signUp(page, uniqueName('Embark'))
  const roster = await createRoster(page, { faction: 'Space Marines', detachment: /Gladius Task Force/, name: 'Mounted Marines' })
  for (const name of [SQUAD, 'Rhino']) await addUnit(page, name)

  const { squad, rhino } = await cards(page)
  await squad.getByRole('button', { name: `Embark in transport: ${SQUAD}`, exact: true }).click()
  const boarding = page.getByRole('menuitem', { name: `Embark ${SQUAD} in Rhino`, exact: true })
  await expect(boarding).toContainText('0/12 models')
  await shot(page.getByRole('menu'), `roster-embark-board-menu.png`)
  await waitForRosterSave(page, () => boarding.click(), 'embarkedIn')
  await expect(squad).toContainText('Embarked inRhino')
  await expect(rhino).toContainText(`Embarked${SQUAD}Disembark`)
  await shot(squad, `roster-embark-passenger.png`)
  await shot(rhino, `roster-embark-transport.png`)

  await page.reload()
  await expect((await cards(page)).squad).toContainText('Embarked inRhino')
  await expect(rhino.getByRole('button', { name: 'Disembark', exact: true })).toBeVisible()

  await practiceBattle(page, roster)
  await setupStep(page, 'Reserves')
  const reserves = page.getByRole('region', { name: 'Reserves', exact: true })
  await expect(reserves.getByText('Embarked in Rhino')).toHaveCount(2)
  await shot(reserves, `roster-embark-setup.png`)

  await reserves
    .getByRole('button', { name: `Start ${SQUAD} in Battlefield`, exact: true })
    .first()
    .click()
  await expect(reserves.getByText('Embarked in Rhino')).toHaveCount(1)
})

test('an attached unit is joined and embarked from its outline, not its cards', async ({ browser }) => {
  test.setTimeout(240_000)
  const page = await (await browser.newContext(desktopContext)).newPage()
  await signUp(page, uniqueName('Outlined'))
  await createRoster(page, { faction: 'Space Marines', detachment: /Gladius Task Force/, name: 'Outlined Marines' })
  for (const name of [SQUAD, 'Rhino', 'Captain', 'Ancient']) await addUnit(page, name)
  const { rhino } = await cards(page)
  await attach(page, 'Captain', SQUAD)

  const led = page.locator('section[aria-label]').filter({ has: page.locator('[data-unit="Captain"]') })
  const bar = led.locator('[data-unit-actions]')
  const inside = led.locator('[data-unit]')
  await bar.getByRole('button', { name: `Attach unit: ${SQUAD}`, exact: true }).click()
  await waitForRosterSave(page, () => page.getByRole('menu').getByRole('menuitem', { name: 'Ancient', exact: true }).click())
  await expect(led.locator('[data-unit="Ancient"]')).toBeVisible()
  await expect(bar.getByRole('button', { name: `Attach unit: ${SQUAD}`, exact: true })).toHaveCount(0)

  await bar.getByRole('button', { name: `Embark unit in transport: ${SQUAD}`, exact: true }).click()
  await waitForRosterSave(page, () => page.getByRole('menuitem', { name: `Embark ${SQUAD} in Rhino`, exact: true }).click(), 'embarkedIn')
  await expect(bar).toContainText('Unit embarked inRhino')
  await expect(inside.filter({ hasText: 'Embarked in' })).toHaveCount(0)
  await expect(inside.getByRole('button', { name: /^Embark / })).toHaveCount(0)
  await expect(rhino.getByRole('button', { name: 'Disembark', exact: true })).toHaveCount(1)
  await shot(led, `roster-embark-outline.png`)

  await page.getByRole('button', { name: 'View', exact: true }).click()
  await expect(bar).toContainText('Unit embarked inRhino')
  await expect(bar.getByRole('button')).toHaveCount(0)
  await expect(inside.filter({ hasText: 'Embarked in' })).toHaveCount(0)
  await shot(led, `roster-embark-outline-view.png`)
  await page.getByRole('button', { name: 'Build', exact: true }).click()

  await waitForRosterSave(page, () => bar.getByRole('button', { name: 'Remove', exact: true }).click(), 'embarkedIn')
  await expect(bar).not.toContainText('Unit embarked in')
  await expect(bar.getByRole('button', { name: `Embark unit in transport: ${SQUAD}`, exact: true })).toBeVisible()
})
