import { expect, type Page, test } from './test'
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
import { shot } from './builder.harness'

const phone = { viewport: { width: 390, height: 844 } }
const desktop = { viewport: { width: 1440, height: 900 } }
const SQUAD = 'Intercessor Squad'

/** The roster's cards, with the picker put away on a phone. */
async function cards(page: Page) {
  const picker = page.getByRole('dialog', { name: 'Add units' })
  if (await picker.isVisible()) await picker.getByRole('button', { name: 'Close' }).click()
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

test('a squad grown past its transport’s room starts on the battlefield again', async ({ browser }) => {
  test.setTimeout(180_000)
  const page = await (await browser.newContext(desktop)).newPage()
  await signUp(page, uniqueName('Overfill'))
  await createRoster(page, { faction: 'Space Marines', detachment: /Gladius Task Force/, name: 'Overfilled Marines' })
  for (const name of [SQUAD, SQUAD, 'Rhino']) await addUnit(page, name)
  const { squad, rhino } = await cards(page)
  const carry = rhino.getByRole('button', { name: 'Embark a unit in Rhino', exact: true })
  for (const at of [1, 2]) {
    await carry.click()
    await waitForRosterSave(
      page,
      () => page.getByRole('menuitem', { name: `Embark ${SQUAD} #${at} in Rhino`, exact: true }).click(),
      'embarkedIn',
    )
  }
  await expect(rhino.getByRole('button', { name: 'Disembark', exact: true })).toHaveCount(2)

  await squad.nth(1).getByRole('button', { name: SQUAD, exact: true }).click()
  const more = page.getByRole('button', { name: `More models in ${SQUAD}`, exact: true })
  for (const aboard of ['6/12', '7/12']) {
    await more.click()
    await expect(rhino).toContainText(`${SQUAD} #2${aboard} models`)
  }
  await more.click()
  await expect(squad.nth(1)).not.toContainText('Embarked in')
  await expect(rhino.getByRole('button', { name: 'Disembark', exact: true })).toHaveCount(1)
  await carry.click()
  await expect(page.getByRole('menuitem', { name: `Embark ${SQUAD} #2 in Rhino`, exact: true })).toContainText(
    'This transport can carry at most 12 models.',
  )
})
