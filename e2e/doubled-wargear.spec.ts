import { expect, test } from './test'
import { addUnit, createRoster, signUp, uniqueName } from './account'
import { productOperator, lastPathSegment } from './storage'
import type { RosterPick } from '../src/core/roster'
import { closePicker } from './builder.harness'

/** A unit card's wargear line; the separator drawn after all but the last is not read aloud. */
const wargear = (count: number, weapon: string) => new RegExp(`^${count}x ${weapon}(?:\u00a0· )?$`)

test(`saved Tankbustas count doubled fixed weapons through reload and view at 390px`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 900 })
  await signUp(page, uniqueName('Doubled Tankbustas'))
  await createRoster(page, { faction: 'Orks', detachment: /War Horde/ })
  await expect(page.getByRole('link', { name: 'Orks', exact: true, includeHidden: true })).toHaveAttribute(
    'href',
    '/factions/orks/rules/mfm-1-6',
  )
  await addUnit(page, 'Tankbustas')
  await closePicker(page)
  const operator = await productOperator()
  const id = lastPathSegment(page.url())
  await expect.poll(async () => (await operator.roster(id))?.picks ?? '').toContain('8fe6-8fee-a58c-2ed')
  const roster = (await operator.roster(id))!
  const picks = JSON.parse(roster.picks) as RosterPick[]
  picks[0].spreads = { '11f1-91c0-0fb4-b6a4': { '3697-d01c-ebcd-835d': 1 } }
  await operator.saveRoster({ ...roster, picks: JSON.stringify(picks), now: Date.now() })
  await page.reload()
  const card = page.locator('[data-unit="Tankbustas"]')
  await expect(card.getByRole('listitem').filter({ hasText: 'Busta Rokkit Launcha' })).toHaveText(wargear(6, 'Busta Rokkit Launcha'))
  await card.getByRole('button', { name: 'Tankbustas', exact: true }).click()
  const loadout = page.getByRole('complementary', { name: 'Loadout', exact: true })
  await expect(loadout.getByLabel('Busta Rokkit Launcha count', { exact: true }).last()).toHaveText('2')
  await loadout.getByLabel('Busta Rokkit Launcha count', { exact: true }).last().scrollIntoViewIfNeeded()
  await page.screenshot({ path: testInfo.outputPath('doubled-editor.png') })
  await page.getByRole('button', { name: 'Back to roster', exact: true }).click()
  await page.getByRole('button', { name: 'View', exact: true }).click()
  await expect(card.getByRole('listitem').filter({ hasText: 'Busta Rokkit Launcha' })).toHaveText(wargear(6, 'Busta Rokkit Launcha'))
  await card.getByRole('button', { name: 'Tankbustas', exact: true }).click()
  await expect(loadout.getByLabel('Busta Rokkit Launcha count', { exact: true }).last()).toHaveText('2')
  await loadout.getByLabel('Busta Rokkit Launcha count', { exact: true }).last().scrollIntoViewIfNeeded()
  await page.screenshot({ path: testInfo.outputPath('doubled-view.png') })
})
