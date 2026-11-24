import { expect, test } from './test'
import { addUnit, createRoster, PHONE, signUp, uniqueName } from './account'
import { productOperator, lastPathSegment } from './storage'
import type { RosterPick } from '../src/core/roster'
import { closePicker } from './builder.harness'

/** A unit card's wargear line; the separator drawn after all but the last is not read aloud. */
const wargear = (count: number, weapon: string) => new RegExp(`^${count}x ${weapon}(?:\u00a0· )?$`)

test('Fireknife suits keep both weapons and up to two different drones per model', async ({ page }, testInfo) => {
  await page.setViewportSize(PHONE)
  await signUp(page, uniqueName('Fireknife loadout'))
  await createRoster(page, { faction: "T'au Empire", detachment: /Retaliation Cadre/ })
  const name = 'Crisis Fireknife Battlesuits'
  await addUnit(page, name)
  await closePicker(page)
  await page.locator(`[data-unit="${name}"]`).getByRole('button', { name, exact: true }).click()
  const loadout = page.getByRole('complementary', { name: 'Loadout', exact: true })
  const leader = loadout.getByLabel(/Shas.vre models/).locator('xpath=ancestor::section[1]')
  const squad = loadout.getByLabel(/Shas.ui models/).locator('xpath=ancestor::section[1]')
  const add = (gear: string) => leader.getByRole('button', { name: `More ${gear}`, exact: true })
  const count = (gear: string) => leader.getByLabel(`${gear} count`, { exact: true })

  await add('Missile pod').click()
  await expect(count('Plasma rifle')).toHaveText('1')
  await add('Plasma rifle').click()
  await expect(count('Plasma rifle')).toHaveText('2')
  await add('Gun Drone').click()
  await expect(count('Gun Drone')).toHaveText('1')
  await expect(add('Gun Drone')).toBeDisabled()
  await add('Shield Drone').click()
  await expect(count('Shield Drone')).toHaveText('1')
  await expect(add('Marker Drone')).toBeDisabled()
  await expect(count('Plasma rifle')).toHaveText('2')
  await leader.getByRole('button', { name: 'Fewer Gun Drone', exact: true }).click()
  await add('Marker Drone').click()
  await expect(count('Marker Drone')).toHaveText('1')
  await expect(count('Shield Drone')).toHaveText('1')
  await leader.getByRole('button', { name: 'Fewer Shield Drone', exact: true }).click()
  await add('Gun Drone').click()
  await expect(count('Gun Drone')).toHaveText('1')
  await expect(count('Marker Drone')).toHaveText('1')
  await count('Gun Drone').scrollIntoViewIfNeeded()
  await page.screenshot({ path: testInfo.outputPath('fireknife-phone.png') })

  for (const [drone, amount] of [
    ['Gun Drone', 1],
    ['Marker Drone', 1],
    ['Shield Drone', 2],
  ] as const) {
    for (let index = 0; index < amount; index += 1) {
      await squad.getByRole('button', { name: `More ${drone}`, exact: true }).click()
      await expect(squad.getByLabel(`${drone} count`, { exact: true })).toHaveText(String(index + 1))
    }
  }
  await expect(squad.getByLabel('Shield Drone count', { exact: true })).toHaveText('2')
})

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
  const launchas = loadout
    .getByRole('region', { name: /busta rokkit launcha profiles/i })
    .getByRole('heading', { name: /^6× busta rokkit launcha/i })
  await expect(launchas).toBeVisible()
  await launchas.scrollIntoViewIfNeeded()
  await page.screenshot({ path: testInfo.outputPath('doubled-view.png') })
})
