import { expect, type Locator, type Page, test } from './test'
import {
  attachRoster,
  createBattle,
  seededRoster,
  signUp,
  startBattle,
  uniqueName,
  waitForRosterSave,
  addUnit,
  chooseRosterAction,
  practiceBattle,
  desktopContext,
  playerPanel,
} from './account'
import { shot, closePicker } from './builder.harness'
import { lastPathSegment } from './storage'

const SQUAD = 'Plague Marines'
const ALPHA_NOTE = 'Hold the home objective'
const BRAVO_NOTE = 'Screen the left flank'

async function addSquads(page: Page, count: number) {
  for (let added = 0; added < count; added++) {
    await addUnit(page, SQUAD)
  }
  await closePicker(page)
  await expect(page.locator(`[data-unit="${SQUAD}"]`)).toHaveCount(count)
}

/** A unit's custom name with its datasheet name after it, whatever the card sets between them, such as its model count. */
const named = (name: string) => new RegExp(`${name}.*${SQUAD}`)
const squadButton = (card: Locator) => card.getByRole('button', { name: new RegExp(`^(?:.+ · )?${SQUAD}$`) })

/** Fills one card's custom name or note from its loadout pane, leaving the roster showing again. */
async function annotate(page: Page, card: Locator, field: 'Custom name' | 'Note', value: string) {
  await squadButton(card).click()
  const fields = page.getByRole('region', { name: 'Custom name and note' })
  await waitForRosterSave(page, () => fields.getByRole('textbox', { name: field, exact: true }).fill(value), value)
  const back = page.getByRole('button', { name: 'Back to roster' })
  if (await back.isVisible()) await back.click()
}

test(`repeated units keep their own custom names and private notes from the builder to a frozen battle army`, async ({ browser }) => {
  test.setTimeout(240_000)
  const owner = await (await browser.newContext(desktopContext)).newPage()
  await signUp(owner, uniqueName('Notes'))
  const roster = await seededRoster(owner, { faction: 'Death Guard', detachment: 'Shamblerot Vectorium', name: 'Noted Plague' })
  await addSquads(owner, 2)
  const cards = owner.locator(`[data-unit="${SQUAD}"]`)
  await annotate(owner, cards.nth(0), 'Custom name', 'Rot Alpha')
  await annotate(owner, cards.nth(0), 'Note', ALPHA_NOTE)
  await squadButton(cards.nth(1)).click()
  await expect(owner.getByRole('switch', { name: /Share unit notes/ })).toHaveCount(0)
  await shot(owner.getByRole('region', { name: 'Custom name and note' }), `unit-annotation-fields.png`)
  const back = owner.getByRole('button', { name: 'Back to roster' })
  if (await back.isVisible()) await back.click()
  await annotate(owner, cards.nth(1), 'Custom name', 'Rot Bravo')
  await annotate(owner, cards.nth(1), 'Note', BRAVO_NOTE)

  await owner.reload()
  await expect(cards.nth(0)).toContainText(named('Rot Alpha'))
  await expect(cards.nth(0)).toContainText(ALPHA_NOTE)
  await expect(cards.nth(1)).toContainText(named('Rot Bravo'))
  await expect(cards.nth(1)).toContainText(BRAVO_NOTE)
  await shot(owner.locator('[data-roster-builder]'), `unit-annotation-cards.png`)

  await chooseRosterAction(owner, 'Export')
  const exported = owner.getByRole('dialog', { name: 'Export roster' })
  await expect(exported.locator('pre')).toContainText('• Custom name: Rot Alpha')
  await expect(exported.locator('pre')).toContainText('• Custom name: Rot Bravo')
  await expect(exported.locator('pre')).not.toContainText(ALPHA_NOTE)
  await exported.getByRole('button', { name: 'Close' }).click()

  await owner.evaluate(() => {
    window.print = () => undefined
  })
  await chooseRosterAction(owner, 'Print')
  const pack = owner.locator('[data-battle-reference-pack]')
  await expect(pack.getByRole('heading', { name: `Rot Alpha · ${SQUAD}`, exact: false })).toBeVisible()
  await expect(pack).toContainText(`Note ${ALPHA_NOTE}`)
  await expect(pack).toContainText(`Note ${BRAVO_NOTE}`)
  await shot(pack.locator('.pack-unit').first(), `unit-note-print.png`)
  await owner.getByRole('button', { name: 'Return to roster' }).click()

  const original = lastPathSegment(owner.url())
  const opponentName = uniqueName('Opponent')
  const opponent = await (await browser.newContext(desktopContext)).newPage()
  await signUp(opponent, opponentName)
  const battle = await createBattle(owner, { opponent })
  await attachRoster(owner, roster)
  const token = lastPathSegment(battle)
  const fielded = `/rosters/${original}?battle=${token}`

  await opponent.goto(fielded)
  const frozen = opponent.locator(`[data-unit="${SQUAD}"]`)
  await expect(frozen.nth(0)).toContainText(named('Rot Alpha'))
  await expect(frozen.nth(1)).toContainText(named('Rot Bravo'))
  await expect(opponent.locator('body')).not.toContainText(ALPHA_NOTE)
  await expect(opponent.locator('body')).not.toContainText(BRAVO_NOTE)

  await owner.goto(`/rosters/${original}`)
  await annotate(owner, cards.nth(0), 'Custom name', 'Rot Prime')
  await annotate(owner, cards.nth(0), 'Note', 'Rush the centre')
  await owner.goto(fielded)
  await expect(owner.locator(`[data-unit="${SQUAD}"]`).nth(0)).toContainText(ALPHA_NOTE)
  await opponent.reload()
  await expect(frozen.nth(0)).toContainText('Rot Alpha')
  await expect(opponent.locator('body')).not.toContainText('Rot Prime')

  await owner.goto(`/rosters/${original}`)
  await chooseRosterAction(owner, 'Create variant')
  await owner.waitForURL((url) => !url.pathname.endsWith(original))
  await expect(cards.nth(0)).toContainText(named('Rot Prime'))
  await expect(cards.nth(0)).toContainText('Rush the centre')
  await expect(cards.nth(1)).toContainText(BRAVO_NOTE)
})

test(`the battle army window names units by their custom name and shows notes only on the player's own army`, async ({ browser }) => {
  test.setTimeout(180_000)
  const page = await (await browser.newContext(desktopContext)).newPage()
  await signUp(page, uniqueName('Army notes'))
  const roster = await seededRoster(page, { faction: 'Death Guard', detachment: 'Shamblerot Vectorium', name: 'Army Plague' })
  await addSquads(page, 1)
  await annotate(page, page.locator(`[data-unit="${SQUAD}"]`), 'Custom name', 'Rot Alpha')
  await annotate(page, page.locator(`[data-unit="${SQUAD}"]`), 'Note', ALPHA_NOTE)
  await practiceBattle(page, roster)
  await startBattle(page)

  const army = page.locator('[data-army-roster]')
  const squad = army.locator(`[data-unit="${SQUAD}"]`)
  await playerPanel(page, 0)
    .getByRole('button', { name: `Units: ${roster}` })
    .click()
  await expect(squad).toContainText(named('Rot Alpha'))
  await expect(squad).toContainText(ALPHA_NOTE)
  await shot(army, `unit-annotation-army.png`)
  await army.getByRole('button', { name: 'Close' }).click()

  const opponentTab = page.getByRole('tab', { name: 'Opponent' })
  if (await opponentTab.isVisible()) await opponentTab.click()
  await playerPanel(page, 1)
    .getByRole('button', { name: `Units: ${roster}` })
    .click()
  await expect(squad).toContainText(named('Rot Alpha'))
  await expect(squad).not.toContainText(ALPHA_NOTE)
})
