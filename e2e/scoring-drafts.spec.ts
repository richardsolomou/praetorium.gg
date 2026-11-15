import { expect, test } from './test'
import { advance, createRoster, desktopContext, PHONE, setupBattle, signUp, uniqueName } from './account'

test('a half-answered scoring prompt shows on the other phone and survives leaving the battle', async ({ page, browser }) => {
  test.setTimeout(180_000)
  const opponent = await (await browser.newContext(desktopContext)).newPage()
  await signUp(opponent, uniqueName('Draft opponent'))
  const theirs = await createRoster(opponent, { faction: 'Necrons', detachment: /Awakened Dynasty/, name: 'Watching army' })
  const hostName = uniqueName('Draft host')
  await signUp(page, hostName)
  const ours = await createRoster(page, { faction: 'Necrons', detachment: /Awakened Dynasty/, name: 'Scoring army' })
  const battleUrl = await setupBattle(page, opponent, { hostRoster: ours, guestRoster: theirs })
  for (const phone of [page, opponent]) await phone.setViewportSize(PHONE)
  for (let phase = 0; phase < 5; phase += 1) await advance(page)
  await page.getByRole('button', { name: 'Pass the turn', exact: true }).click()

  const scoring = page.getByRole('dialog', { name: /^Scoring end of turn points/ })
  const answer = scoring.getByRole('button', { name: /plus \d+$/ }).first()
  const scored = Number((await answer.innerText()).replace(/[^0-9]/g, ''))
  await answer.click()
  const total = scoring.locator('[data-slot="dialog-footer"] output')
  await expect(total).toHaveAccessibleName(`Scoring ${scored} VP`)

  const watching = opponent.getByRole('dialog', { name: /^Scoring end of turn points/ })
  await expect(watching.locator('[data-peer-answers]')).toContainText(`${hostName} has ${scored} VP marked, not yet confirmed.`)
  await expect(watching.locator('[data-peer-press]')).toHaveText(`${hostName} marked this`)
  await expect(watching.locator('[data-slot="dialog-footer"] output')).toHaveAccessibleName('Scoring 0 VP')
  await page.screenshot({ path: test.info().outputPath('answering-phone.png') })
  await opponent.screenshot({ path: test.info().outputPath('watching-phone.png') })

  const sections = page.getByRole('navigation', { name: 'Application sections' })
  await sections.getByRole('link', { name: 'Factions' }).click()
  await expect(page).toHaveURL('/factions')
  await sections.getByRole('link', { name: 'Battles' }).click()
  await expect(page).toHaveURL(battleUrl)
  await expect(total).toHaveAccessibleName(`Scoring ${scored} VP`)
})
