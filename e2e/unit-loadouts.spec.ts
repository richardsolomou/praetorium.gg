import { expect, test } from './test'
import { addUnit, createRoster, signUp, uniqueName, waitForRosterSave } from './account'
import { expectNoHorizontalOverflow, shot, closePicker } from './builder.harness'
import { productOperator, userIdFor, lastPathSegment } from './storage'

const UNIT = 'Immortals'
const LOADOUT = 'Six Immortals'
const RENAMED = 'Tesla Immortals'
const NOTE = 'Loadout note stays in its roster'
const NICKNAME = 'Tesla Wall'
const RETIRED = 'Retired guard'

for (const [width, label] of [
  [390, 'phone'],
  [1440, 'desktop'],
] as const) {
  test(`a saved loadout is renamed and added to another roster of its army without its note (${label})`, async ({ browser }) => {
    test.setTimeout(180_000)
    const page = await (await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 } })).newPage()
    const account = await signUp(page, uniqueName('Loadout keeper'))
    await createRoster(page, { faction: 'Necrons', detachment: /Awakened Dynasty/, name: uniqueName('Loadout source') })
    await addUnit(page, UNIT)
    await closePicker(page)
    await page.locator(`[data-unit="${UNIT}"]`).getByRole('button', { name: UNIT, exact: true }).click()
    await waitForRosterSave(page, () => page.getByRole('button', { name: `More models in ${UNIT}` }).click())
    await expect(page.getByLabel(`${UNIT} models`)).toHaveText('6')
    const fields = page.getByRole('region', { name: 'Note' })
    await waitForRosterSave(page, () => fields.getByRole('textbox', { name: 'Note', exact: true }).fill(NOTE), NOTE)
    await waitForRosterSave(page, () => fields.getByRole('textbox', { name: 'Custom name', exact: true }).fill(NICKNAME), NICKNAME)
    const back = page.getByRole('button', { name: 'Back to roster' })
    if (await back.isVisible()) await back.click()

    await page
      .locator(`[data-unit="${UNIT}"]`)
      .getByRole('button', { name: `Unit actions for ${UNIT}` })
      .click()
    await page.getByRole('menuitem', { name: 'Save loadout' }).click()
    const dialog = page.getByRole('dialog', { name: 'Save loadout' })
    await dialog.getByLabel('Name').fill(LOADOUT)
    await shot(dialog, test.info().outputPath(`unit-loadout-save-${label}.png`))
    await dialog.getByRole('button', { name: 'Save loadout' }).click()
    await expect(dialog).toBeHidden()

    await createRoster(page, { faction: 'Necrons', detachment: /Awakened Dynasty/, name: uniqueName('Loadout destination') })
    const operator = await productOperator()
    const destinationRoster = await operator.roster(lastPathSegment(page.url()))
    await operator.saveUnitLoadout(
      crypto.randomUUID(),
      await userIdFor(account.email),
      { name: RETIRED, catalogueId: destinationRoster!.catalogueId, pick: { entryId: 'datasheet-this-rules-version-lacks' } },
      Date.now(),
    )
    const savedAs = (name: string) => page.locator(`[data-picker-unit="${UNIT}"] + [data-saved-loadout="${name}"]`)
    const saved = savedAs(LOADOUT)
    await expect(saved.locator('.chip')).toHaveText(/^\d+ pts$/)
    const search = page.getByLabel('Add a unit')
    await search.fill('six immortals')
    await expect(page.locator(`[data-picker-unit="${UNIT}"]`)).toBeVisible()
    await expect(page.locator('[data-picker-unit="Necron Warriors"]')).toHaveCount(0)
    await search.fill(UNIT)
    await expect(saved).toBeVisible()

    await saved.getByRole('button', { name: `Saved loadout actions for ${LOADOUT}` }).click()
    await page.getByRole('menuitem', { name: 'Rename loadout' }).click()
    const rename = page.getByRole('dialog', { name: 'Rename loadout' })
    await rename.getByLabel('Name').fill(RENAMED)
    await shot(rename, test.info().outputPath(`unit-loadout-rename-${label}.png`))
    await rename.getByRole('button', { name: 'Rename' }).click()
    await expect(rename).toBeHidden()
    const renamed = savedAs(RENAMED)
    await search.fill('tesla immortals')
    await expect(renamed).toBeVisible()
    await search.fill('six immortals')
    await expect(page.locator(`[data-picker-unit="${UNIT}"]`)).toHaveCount(0)
    await search.fill('')

    const retired = page.locator(`[data-saved-loadout="${RETIRED}"]`)
    await expect(retired).toContainText('This roster’s army does not include that unit.')
    await expect(retired.getByRole('button', { name: `Add saved loadout ${RETIRED}` })).toBeDisabled()
    const picker = page.locator('div[data-onboarding="roster-picker"]')
    await expectNoHorizontalOverflow(picker)
    await renamed.scrollIntoViewIfNeeded()
    await shot(picker, test.info().outputPath(`unit-loadout-picker-${label}.png`))
    await retired.scrollIntoViewIfNeeded()
    await shot(picker, test.info().outputPath(`unit-loadout-unavailable-${label}.png`))
    await retired.getByRole('button', { name: `Saved loadout actions for ${RETIRED}` }).click()
    await page.getByRole('menuitem', { name: 'Delete loadout' }).click()
    await page.getByRole('alertdialog', { name: 'Delete saved loadout?' }).getByRole('button', { name: 'Delete loadout' }).click()
    await expect(retired).toHaveCount(0)
    await waitForRosterSave(page, () => renamed.getByRole('button', { name: `Add saved loadout ${RENAMED}` }).click())
    await closePicker(page)
    await page
      .locator(`[data-unit="${UNIT}"]`)
      .getByRole('button', { name: `${NICKNAME} · ${UNIT}`, exact: true })
      .click()
    await expect(page.getByLabel(`${UNIT} models`)).toHaveText('6')
    const destination = await operator.roster(lastPathSegment(page.url()))
    expect(destination?.picks).not.toContain(NOTE)

    await createRoster(page, { faction: 'Orks', detachment: /War Horde/, name: uniqueName('Other army') })
    await expect(page.getByRole('button', { name: /^Add / }).first()).toBeVisible()
    await expect(page.locator('[data-saved-loadout]')).toHaveCount(0)
  })
}

test('an attached unit is saved and added to another roster already attached', async ({ page }) => {
  test.setTimeout(180_000)
  await page.setViewportSize({ width: 1440, height: 900 })
  await signUp(page, uniqueName('Attached unit keeper'))
  await createRoster(page, { faction: 'Necrons', detachment: /Awakened Dynasty/, name: uniqueName('Attached source') })
  await addUnit(page, UNIT)
  await addUnit(page, 'Overlord')
  await closePicker(page)
  const immortals = page.locator(`[data-unit="${UNIT}"]`)
  await immortals.getByRole('button', { name: `Unit actions for ${UNIT}` }).click()
  await expect(page.getByRole('menuitem', { name: 'Save loadout' })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: 'Save attached unit' })).toHaveCount(0)
  await page.keyboard.press('Escape')

  await immortals.getByRole('button', { name: `Attach a unit to ${UNIT}`, exact: true }).click()
  const inRoster = page.getByRole('menu').getByRole('group', { name: 'In this roster' })
  await waitForRosterSave(page, () => inRoster.getByRole('menuitem', { name: 'Overlord', exact: true }).click())
  const leader = page.locator('[data-unit="Overlord"]')
  await expect(leader).toContainText('Leader')

  await leader.getByRole('button', { name: 'Unit actions for Overlord' }).click()
  await shot(page.getByRole('menu'), test.info().outputPath('unit-attached-menu.png'))
  await page.getByRole('menuitem', { name: 'Save attached unit' }).click()
  const dialog = page.getByRole('dialog', { name: 'Save attached unit' })
  await expect(dialog.getByLabel('Name')).toHaveValue(`${UNIT} + Overlord`)
  const preview = dialog.locator('[data-saving-preview]')
  await expect(preview.locator('[data-unit]')).toHaveCount(2)
  await expect(preview).toContainText('Gauss blaster')
  await expect(preview).toContainText('Tachyon arrow')
  await shot(dialog, test.info().outputPath('unit-attached-save.png'))
  await dialog.getByRole('button', { name: 'Save attached unit' }).click()
  await expect(dialog).toBeHidden()

  await createRoster(page, { faction: 'Necrons', detachment: /Awakened Dynasty/, name: uniqueName('Attached destination') })
  const saved = page.locator(`[data-saved-loadout="${UNIT} + Overlord"]`)
  await expect(saved).toContainText(`${UNIT} · Overlord`)
  await expect(saved.locator('.chip')).toHaveText(/^\d+ pts$/)
  await saved.scrollIntoViewIfNeeded()
  await shot(page.locator('div[data-onboarding="roster-picker"]'), test.info().outputPath('unit-attached-picker.png'))
  await waitForRosterSave(page, () => saved.getByRole('button', { name: `Add saved attached unit ${UNIT} + Overlord` }).click())
  await closePicker(page)
  await expect(leader).toContainText('Leader')
  await page.screenshot({ path: test.info().outputPath('unit-attached-added.png') })
})
