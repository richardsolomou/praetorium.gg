import { expect, type Page, test } from './test'
import { addUnit, createRoster, signUp, uniqueName, waitForRosterSave } from './account'
import { expectNoHorizontalOverflow, shot } from './builder.harness'
import { productOperator } from './storage'

const UNIT = 'Immortals'
const LOADOUT = 'Six Immortals'
const NOTE = 'Loadout note stays in its roster'

const rosterId = (page: Page) => new URL(page.url()).pathname.split('/').at(-1)!

async function openPicker(page: Page) {
  const picker = page.getByLabel('Add a unit')
  if (!(await picker.isVisible())) await page.getByRole('button', { name: 'Add units', exact: true }).click()
  await expect(picker).toBeVisible()
}

async function closePicker(page: Page) {
  const dialog = page.getByRole('dialog', { name: 'Add units' })
  if (await dialog.isVisible()) await dialog.getByRole('button', { name: 'Close' }).click()
}

for (const [width, label] of [
  [390, 'phone'],
  [1440, 'desktop'],
] as const) {
  test(`a saved loadout is added to another roster of its army without its note (${label})`, async ({ browser }) => {
    test.setTimeout(180_000)
    const page = await (await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 } })).newPage()
    await signUp(page, uniqueName('Loadout keeper'))
    await createRoster(page, { faction: 'Necrons', detachment: /Awakened Dynasty/, name: uniqueName('Loadout source') })
    await addUnit(page, UNIT)
    await closePicker(page)
    await page.locator(`[data-unit="${UNIT}"]`).getByRole('button', { name: UNIT, exact: true }).click()
    await waitForRosterSave(page, () => page.getByRole('button', { name: `More models in ${UNIT}` }).click())
    await expect(page.getByLabel(`${UNIT} models`)).toHaveText('6')
    const fields = page.getByRole('region', { name: 'Note' })
    await waitForRosterSave(page, () => fields.getByRole('textbox', { name: 'Note', exact: true }).fill(NOTE), NOTE)
    const back = page.getByRole('button', { name: 'Back to roster' })
    if (await back.isVisible()) await back.click()

    await page
      .locator(`[data-unit="${UNIT}"]`)
      .getByRole('button', { name: `Unit actions for ${UNIT}` })
      .click()
    await page.getByRole('menuitem', { name: 'Save loadout' }).click()
    const dialog = page.getByRole('dialog', { name: 'Save loadout' })
    await dialog.getByLabel('Name').fill(LOADOUT)
    await shot(dialog, `test-results/unit-loadout-save-${label}.png`)
    await dialog.getByRole('button', { name: 'Save loadout' }).click()
    await expect(dialog).toBeHidden()

    await createRoster(page, { faction: 'Necrons', detachment: /Awakened Dynasty/, name: uniqueName('Loadout destination') })
    await openPicker(page)
    const saved = page.locator(`[data-saved-loadout="${LOADOUT}"]`)
    await expect(saved).toContainText(UNIT)
    const picker = page.locator('div[data-onboarding="roster-picker"]')
    await expectNoHorizontalOverflow(picker)
    await shot(picker, `test-results/unit-loadout-picker-${label}.png`)
    await waitForRosterSave(page, () => saved.getByRole('button', { name: `Add saved loadout ${LOADOUT}` }).click())
    await closePicker(page)
    await page.locator(`[data-unit="${UNIT}"]`).getByRole('button', { name: UNIT, exact: true }).click()
    await expect(page.getByLabel(`${UNIT} models`)).toHaveText('6')
    const destination = await (await productOperator()).roster(rosterId(page))
    expect(destination?.picks).not.toContain(NOTE)

    await createRoster(page, { faction: 'Orks', detachment: /War Horde/, name: uniqueName('Other army') })
    await openPicker(page)
    await expect(page.getByRole('button', { name: /^Add / }).first()).toBeVisible()
    await expect(page.locator('[data-saved-loadout]')).toHaveCount(0)
  })
}
