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

/** The squad's starting embark, opening its loadout unless a reload already restored that pane. */
async function openSquad(page: Page) {
  const embark = page.getByRole('region', { name: 'Starts embarked' })
  const picker = page.getByRole('dialog', { name: 'Add units' })
  if (await picker.isVisible()) await picker.getByRole('button', { name: 'Close' }).click()
  await page.waitForLoadState('networkidle')
  if (await embark.isVisible()) return embark
  await page.locator(`[data-unit="${SQUAD}"]`).getByRole('button', { name: SQUAD, exact: true }).click()
  return embark
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

    const embark = await openSquad(page)
    await expect(embark).toContainText('On the battlefield')
    await waitForRosterSave(page, () => embark.getByRole('button', { name: `Embark ${SQUAD} in Rhino`, exact: true }).click(), 'embarkedIn')
    await expect(embark).toContainText('In Rhino')
    await expect(embark).toContainText('5/12 models')
    await shot(embark, `test-results/roster-embark-builder-${label}.png`)

    await page.reload()
    await expect(await openSquad(page)).toContainText('In Rhino')
    await expect(page.getByRole('button', { name: `Disembark ${SQUAD} from Rhino`, exact: true })).toBeVisible()

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
  const embark = page.getByRole('region', { name: 'Starts embarked' })
  for (const at of [0, 1]) {
    await page.locator(`[data-unit="${SQUAD}"]`).nth(at).getByRole('button', { name: SQUAD, exact: true }).click()
    await waitForRosterSave(page, () => embark.getByRole('button', { name: `Embark ${SQUAD} in Rhino`, exact: true }).click(), 'embarkedIn')
  }
  await expect(embark).toContainText('10/12 models')
  const more = page.getByRole('button', { name: `More models in ${SQUAD}`, exact: true })
  for (const aboard of ['11/12', '12/12']) {
    await more.click()
    await expect(embark).toContainText(`${aboard} models`)
  }
  await more.click()
  await expect(embark).toContainText('On the battlefield')
  await expect(embark).toContainText('This transport can carry at most 12 models.')
})
