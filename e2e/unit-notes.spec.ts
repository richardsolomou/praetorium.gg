import { expect, type Locator, type Page, test } from '@playwright/test'
import {
  attachRoster,
  befriend,
  confirmRosterSetup,
  createBattle,
  createRoster,
  PRACTICE_OPPONENT,
  signUp,
  startBattle,
  uniqueName,
  waitForRosterSave,
} from './account'
import { shot } from './builder.harness'

const phone = { viewport: { width: 390, height: 844 } }
const desktop = { viewport: { width: 1440, height: 900 } }
const SQUAD = 'Plague Marines'
const ALPHA_NOTE = 'Hold the home objective'
const BRAVO_NOTE = 'Screen the left flank'

const rosterId = (page: Page) => new URL(page.url()).pathname.split('/').at(-1)!

async function addSquads(page: Page, count: number) {
  for (let added = 0; added < count; added++) {
    await page.getByLabel('Add a unit').fill(SQUAD)
    await waitForRosterSave(page, () =>
      page
        .getByRole('button', { name: `Add ${SQUAD}`, exact: true })
        .first()
        .click(),
    )
  }
  const picker = page.getByRole('dialog', { name: 'Add units' })
  if (await picker.isVisible()) await picker.getByRole('button', { name: 'Close' }).click()
  await expect(page.locator(`[data-unit="${SQUAD}"]`)).toHaveCount(count)
}

/** Writes one card's note from its loadout pane, leaving the roster showing again. */
async function writeNote(page: Page, card: Locator, note: string) {
  await card.getByRole('button', { name: SQUAD, exact: true }).click()
  const field = page.getByRole('region', { name: 'Note' }).getByRole('textbox', { name: 'Note', exact: true })
  await waitForRosterSave(page, () => field.fill(note), note)
  const back = page.getByRole('button', { name: 'Back to roster' })
  if (await back.isVisible()) await back.click()
}

async function setAccess(page: Page, name: string, value: string) {
  await page.getByRole('button', { name: 'Roster actions' }).click()
  await page.getByRole('menuitem', { name: 'Edit roster setup' }).click()
  const setup = page.getByRole('dialog', { name: 'Edit roster setup' })
  await setup.getByRole('combobox', { name: 'Access' }).click()
  await page.getByRole('option', { name }).click()
  await waitForRosterSave(page, () => confirmRosterSetup(setup), `"${value}"`)
}

for (const [size, label] of [
  [phone, 'phone'],
  [desktop, 'desktop'],
] as const) {
  test(`repeated units keep their own private notes from the builder to a frozen battle army (${label})`, async ({ browser }) => {
    test.setTimeout(240_000)
    const owner = await (await browser.newContext(size)).newPage()
    await signUp(owner, uniqueName('Notes'))
    const roster = await createRoster(owner, { faction: 'Death Guard', detachment: /Shamblerot Vectorium/, name: 'Noted Plague' })
    await addSquads(owner, 2)
    const cards = owner.locator(`[data-unit="${SQUAD}"]`)
    await writeNote(owner, cards.nth(0), ALPHA_NOTE)
    await cards.nth(1).getByRole('button', { name: SQUAD, exact: true }).click()
    await expect(owner.getByRole('switch', { name: /Share unit notes/ })).toHaveCount(0)
    await shot(owner.getByRole('region', { name: 'Note' }), `test-results/unit-note-field-${label}.png`)
    const back = owner.getByRole('button', { name: 'Back to roster' })
    if (await back.isVisible()) await back.click()
    await writeNote(owner, cards.nth(1), BRAVO_NOTE)

    await owner.reload()
    await expect(cards.nth(0)).toContainText(ALPHA_NOTE)
    await expect(cards.nth(1)).toContainText(BRAVO_NOTE)
    await shot(owner.locator('[data-roster-builder]'), `test-results/unit-note-cards-${label}.png`)

    await owner.getByRole('button', { name: 'Roster actions' }).click()
    await owner.getByRole('menuitem', { name: 'Export text' }).click()
    const exported = owner.getByRole('dialog', { name: 'Export roster' })
    await expect(exported.locator('pre')).toContainText(SQUAD)
    await expect(exported.locator('pre')).not.toContainText(ALPHA_NOTE)
    await exported.getByRole('button', { name: 'Close' }).click()

    await owner.evaluate(() => {
      window.print = () => undefined
    })
    await owner.getByRole('button', { name: 'Roster actions' }).click()
    await owner.getByRole('menuitem', { name: 'Print', exact: true }).click()
    const pack = owner.locator('[data-battle-reference-pack]')
    await expect(pack).toContainText(`Note: ${ALPHA_NOTE}`)
    await expect(pack).toContainText(`Note: ${BRAVO_NOTE}`)
    await shot(pack.locator('.pack-unit').first(), `test-results/unit-note-print-${label}.png`)
    await owner.getByRole('button', { name: 'Return to roster' }).click()

    const original = rosterId(owner)
    const opponentName = uniqueName('Opponent')
    const opponent = await (await browser.newContext(size)).newPage()
    await signUp(opponent, opponentName)
    await befriend(owner, opponent)
    const battle = await createBattle(owner, { opponent: opponentName })
    await attachRoster(owner, roster)
    const token = new URL(battle).pathname.split('/').at(-1)!
    const fielded = `/rosters/${original}?battle=${token}`

    await opponent.goto(fielded)
    await expect(opponent.locator(`[data-unit="${SQUAD}"]`)).toHaveCount(2)
    await expect(opponent.locator('body')).not.toContainText(ALPHA_NOTE)
    await expect(opponent.locator('body')).not.toContainText(BRAVO_NOTE)

    await owner.goto(`/rosters/${original}`)
    await writeNote(owner, cards.nth(0), 'Rush the centre')
    await owner.goto(fielded)
    await expect(owner.locator(`[data-unit="${SQUAD}"]`).nth(0)).toContainText(ALPHA_NOTE)

    await owner.goto(`/rosters/${original}`)
    await owner.getByRole('button', { name: 'Roster actions' }).click()
    await owner.getByRole('menuitem', { name: 'Create variant' }).click()
    await owner.waitForURL((url) => !url.pathname.endsWith(original))
    await expect(cards.nth(0)).toContainText('Rush the centre')
    await expect(cards.nth(1)).toContainText(BRAVO_NOTE)
  })

  test(`another account reading a public roster never sees its unit notes (${label})`, async ({ browser }) => {
    test.setTimeout(120_000)
    const owner = await (await browser.newContext(size)).newPage()
    await signUp(owner, uniqueName('Public notes'))
    await createRoster(owner, { faction: 'Death Guard', detachment: /Shamblerot Vectorium/, name: 'Public Plague' })
    await addSquads(owner, 1)
    await writeNote(owner, owner.locator(`[data-unit="${SQUAD}"]`), ALPHA_NOTE)
    await setAccess(owner, 'Public — listed on your profile', 'public')
    const path = new URL(owner.url()).pathname

    const reader = await (await browser.newContext(size)).newPage()
    await signUp(reader, uniqueName('Reader'))
    await reader.goto(path)
    await expect(reader.locator(`[data-unit="${SQUAD}"]`)).toBeVisible()
    await expect(reader.locator('body')).not.toContainText(ALPHA_NOTE)
  })

  test(`the battle army window shows notes only on the player's own army (${label})`, async ({ browser }) => {
    test.setTimeout(180_000)
    const page = await (await browser.newContext(size)).newPage()
    await signUp(page, uniqueName('Army notes'))
    const roster = await createRoster(page, { faction: 'Death Guard', detachment: /Shamblerot Vectorium/, name: 'Army Plague' })
    await addSquads(page, 1)
    await writeNote(page, page.locator(`[data-unit="${SQUAD}"]`), ALPHA_NOTE)
    await createBattle(page, { practice: true })
    await attachRoster(page, roster)
    await attachRoster(page, roster, { forPlayer: PRACTICE_OPPONENT })
    await startBattle(page)

    const army = page.locator('[data-army-roster]')
    const squad = army.locator(`[data-unit="${SQUAD}"]`)
    await page
      .locator('[data-panel="player"][data-side="0"]')
      .getByRole('button', { name: `Open ${roster}` })
      .click()
    await expect(squad).toContainText(ALPHA_NOTE)
    await shot(army, `test-results/unit-note-army-${label}.png`)
    await army.getByRole('button', { name: 'Close' }).click()

    const opponentTab = page.getByRole('tab', { name: 'Opponent' })
    if (await opponentTab.isVisible()) await opponentTab.click()
    await page
      .locator('[data-panel="player"][data-side="1"]')
      .getByRole('button', { name: `Open ${roster}` })
      .click()
    await expect(squad).toBeVisible()
    await expect(squad).not.toContainText(ALPHA_NOTE)
  })
}
