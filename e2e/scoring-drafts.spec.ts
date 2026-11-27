import { expect, test } from './test'
import { advance, seededRoster, desktopContext, PHONE, setupBattle, signUp, uniqueName } from './account'
import { screenshot } from './screenshots'

test('both phones press the same scoring prompt, and the presses survive leaving the battle', async ({ page, browser }) => {
  test.setTimeout(180_000)
  const opponent = await (await browser.newContext(desktopContext)).newPage()
  await signUp(opponent, uniqueName('Draft opponent'))
  const theirs = await seededRoster(opponent, { faction: 'Necrons', detachment: 'Awakened Dynasty', name: 'Watching army' })
  await signUp(page, uniqueName('Draft host'))
  const ours = await seededRoster(page, { faction: 'Necrons', detachment: 'Awakened Dynasty', name: 'Scoring army' })
  const battleUrl = await setupBattle(page, opponent, { hostRoster: ours, guestRoster: theirs })
  for (const phone of [page, opponent]) await phone.setViewportSize(PHONE)
  for (let phase = 0; phase < 5; phase += 1) await advance(page)
  await page.getByRole('button', { name: 'Pass the turn', exact: true }).click()

  const scoring = page.getByRole('dialog', { name: /^Scoring end of turn points/ })
  const watching = opponent.getByRole('dialog', { name: /^Scoring end of turn points/ })
  const card = (dialog: typeof scoring, index: number) => dialog.locator('[data-due]').nth(index)
  const payout = (dialog: typeof scoring, index: number) =>
    card(dialog, index)
      .getByRole('button', { name: /plus \d+$/ })
      .first()
  const vp = async (button: ReturnType<typeof payout>) => Number((await button.innerText()).replace(/[^0-9]/g, ''))
  const total = (dialog: typeof scoring) => dialog.locator('[data-slot="dialog-footer"] output')

  const first = payout(scoring, 0)
  const scored = await vp(first)
  await first.click()
  await expect(total(scoring)).toHaveAccessibleName(`Scoring ${scored} VP`)
  await expect(payout(watching, 0)).toHaveAttribute('aria-pressed', 'true')
  await expect(total(watching)).toHaveAccessibleName(`Scoring ${scored} VP`)

  // Every card can be answered as not scored, whatever its payouts look like.
  await card(watching, 1)
    .getByRole('button', { name: /scored nothing$/ })
    .click()
  await expect(card(scoring, 1)).toHaveAttribute('data-answered', '')
  await expect(total(scoring)).toHaveAccessibleName(`Scoring ${scored} VP`)
  await screenshot(page, 'scoring-phone.png')
  await screenshot(opponent, 'other-phone.png')

  const sections = page.getByRole('navigation', { name: 'Application sections' })
  await sections.getByRole('link', { name: 'Factions' }).click()
  await expect(page).toHaveURL('/factions')
  await sections.getByRole('link', { name: 'Battles' }).click()
  await expect(page).toHaveURL(battleUrl)
  await expect(card(scoring, 1)).toHaveAttribute('data-answered', '')
  await expect(total(scoring)).toHaveAccessibleName(`Scoring ${scored} VP`)
})
