import type { Locator } from '@playwright/test'
import { expect, type Page, test } from './test'
import { createRoster, signUp, waitForRosterSave, addUnit, expectNoPageOverflow } from './account'
import { arrangeByRole, expectNoHorizontalOverflow, openBuilder, shot } from './builder.harness'

test.use({ hasTouch: true })
// These tests read the rows on each card that name the unit it joined.
test.beforeEach(({ page }) => arrangeByRole(page))

const attachMenu = (page: Page) => page.getByRole('menu')

async function closePickerOnPhone(page: Page, width: number) {
  if (width < 500) await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).tap()
}

test(`a unit's attach menu adds and attaches a new leader, then offers only its free support slot`, async ({ page }) => {
  await signUp(page, 'Richard')
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 })
    await createRoster(page, { faction: 'Necrons', detachment: /Awakened Dynasty/ })
    await expect(page.getByRole('combobox', { name: 'Unit relationships' })).toHaveCount(0)
    await addUnit(page, 'Immortals')
    await addUnit(page, 'Overlord')
    await closePickerOnPhone(page, width)

    const immortals = page.locator('[data-unit="Immortals"]')
    await immortals.getByRole('button', { name: 'Attach a unit to Immortals', exact: true }).click()
    const roster = attachMenu(page).getByRole('group', { name: 'In this roster' })
    const added = attachMenu(page).getByRole('group', { name: 'Add a new unit' })
    await expect(roster.getByRole('menuitem', { name: 'Overlord', exact: true })).toBeEnabled()
    const imotekh = added.getByRole('menuitem', { name: 'Add new Imotekh the Stormlord and attach', exact: true })
    await expect(imotekh).toBeEnabled()
    await expect(imotekh).toContainText(/\d+ pts/)
    await expect(added.getByRole('menuitem', { name: 'Add new Immortals and attach', exact: true })).toHaveCount(0)
    await expectNoHorizontalOverflow(attachMenu(page))
    await shot(attachMenu(page), test.info().outputPath(`attach-menu-bodyguard-${width}.png`))

    await waitForRosterSave(page, () => imotekh.click())
    const leader = page.locator('[data-unit="Imotekh the Stormlord"]')
    await expect(leader).toHaveCount(1)
    await expect(leader).toContainText('Immortals')
    await expect(immortals).toContainText('Imotekh the Stormlord')

    await immortals.getByRole('button', { name: 'Attach a unit to Immortals', exact: true }).click()
    await expect(added.getByRole('menuitem', { name: 'Add new Technomancer and attach', exact: true })).toBeEnabled()
    await expect(roster).toHaveCount(0)
    await expect(added.getByRole('menuitem', { name: 'Add new Overlord and attach', exact: true })).toHaveCount(0)
    await expect(added.getByRole('menuitem', { name: 'Add new Imotekh the Stormlord and attach', exact: true })).toHaveCount(0)
    await expectNoHorizontalOverflow(attachMenu(page))
    await expectNoPageOverflow(page)
    await shot(attachMenu(page), test.info().outputPath(`attach-menu-full-${width}.png`))
    await page.keyboard.press('Escape')

    await page.reload()
    await expect(leader).toHaveCount(1)
    await expect(leader).toContainText('Immortals')
    await page.screenshot({ path: test.info().outputPath(`attach-roster-${width}.png`) })
    await expect(page.locator('[data-unit="Overlord"]')).not.toContainText('Leading')
  }
})

test('a unit whose only leader slot is full offers no attach menu', async ({ page }) => {
  await signUp(page, 'Richard')
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 })
    await createRoster(page, { faction: 'Necrons', detachment: /Awakened Dynasty/ })
    await addUnit(page, 'Skorpekh Destroyers')
    await closePickerOnPhone(page, width)

    const destroyers = page.locator('[data-unit="Skorpekh Destroyers"]')
    const attachUnit = destroyers.getByRole('button', { name: 'Attach a unit to Skorpekh Destroyers', exact: true })
    await attachUnit.click()
    const added = attachMenu(page).getByRole('group', { name: 'Add a new unit' })
    await expect(added.getByRole('menuitem')).toHaveCount(1)
    await waitForRosterSave(page, () => added.getByRole('menuitem', { name: 'Add new Skorpekh Lord and attach', exact: true }).click())

    const lord = page.locator('[data-unit="Skorpekh Lord"]')
    await expect(destroyers).toContainText('Skorpekh Lord')
    await expect(attachUnit).toHaveCount(0)
    await expect(lord.getByRole('button', { name: 'Attach Skorpekh Lord to unit', exact: true })).toHaveCount(0)
    await expectNoPageOverflow(page)
    await shot(destroyers, test.info().outputPath(`attach-full-skorpekh-${width}.png`))
    await page.reload()
    await expect(destroyers).toContainText('Skorpekh Lord')
    await expect(attachUnit).toHaveCount(0)
  }
})

test(`a character's attach menu adds and joins a new bodyguard`, async ({ page }) => {
  await signUp(page, 'Richard')
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 })
    await createRoster(page, { faction: 'Necrons', detachment: /Awakened Dynasty/ })
    await addUnit(page, 'Overlord')
    await closePickerOnPhone(page, width)

    const overlord = page.locator('[data-unit="Overlord"]')
    await overlord.getByRole('button', { name: 'Attach Overlord to unit', exact: true }).click()
    await expect(attachMenu(page).getByRole('group', { name: 'In this roster' })).toHaveCount(0)
    const immortals = attachMenu(page)
      .getByRole('group', { name: 'Add a new unit' })
      .getByRole('menuitem', { name: 'Add new Immortals and attach', exact: true })
    await expect(immortals).toContainText(/\d+ pts/)
    await shot(attachMenu(page), test.info().outputPath(`attach-menu-leader-${width}.png`))
    await waitForRosterSave(page, () => immortals.click())

    await expect(page.locator('[data-unit="Immortals"]')).toHaveCount(1)
    await expect(overlord).toContainText('Leading')
    await expect(overlord).toContainText('Immortals')
    await expect(overlord.getByRole('button', { name: 'Attach Overlord to unit', exact: true })).toHaveCount(0)
    await page.reload()
    await expect(page.locator('[data-unit="Immortals"]')).toHaveCount(1)
    await expect(overlord).toContainText('Immortals')
  }
})

test('a Loyal Protector joins a Command Squad', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await openBuilder(page, 'Astra Militarum', /Combined Arms/)
  await addUnit(page, 'Ogryn Bodyguard')

  const ogryn = page.locator('[data-unit="Ogryn Bodyguard"]')
  await ogryn.getByRole('button', { name: 'Attach Ogryn Bodyguard to unit', exact: true }).click()
  const squad = attachMenu(page)
    .getByRole('group', { name: 'Add a new unit' })
    .getByRole('menuitem', { name: 'Add new Cadian Command Squad and attach', exact: true })
  await shot(attachMenu(page), test.info().outputPath('attach-menu-loyal-protector.png'))
  await waitForRosterSave(page, () => squad.click())

  await expect(ogryn).toContainText('Cadian Command Squad')
  await page.screenshot({ path: test.info().outputPath('attach-loyal-protector-roster.png') })
})

test('a unit attaches a character already in the roster from its own card', async ({ page }) => {
  await openBuilder(page)
  await addUnit(page, 'Immortals')
  await addUnit(page, 'Overlord')
  await page.locator('[data-unit="Immortals"]').getByRole('button', { name: 'Attach a unit to Immortals', exact: true }).click()
  await waitForRosterSave(page, () =>
    attachMenu(page).getByRole('group', { name: 'In this roster' }).getByRole('menuitem', { name: 'Overlord', exact: true }).click(),
  )
  await expect(page.locator('[data-unit="Overlord"]')).toContainText('Leading')
  await expect(page.locator('[data-unit]')).toHaveCount(2)
})

/** A card's height once two readings a quarter-second apart agree: the picker can reflow while the roster's price arrives. */
async function settledHeight(card: Locator) {
  let last: number | undefined
  await expect
    .poll(
      async () => {
        const height = (await card.boundingBox())?.height
        const settled = height !== undefined && height === last
        last = height
        return settled
      },
      { intervals: [250] },
    )
    .toBe(true)
  return last!
}

test('picker card height stays stable as the roster crosses the points budget', async ({ page }) => {
  await signUp(page, 'Richard')
  await createRoster(page, { faction: 'Necrons', detachment: /Awakened Dynasty/, size: /Incursion/ })
  await addUnit(page, "C'tan Shard of the Nightbringer")
  await page.getByLabel('Add a unit').fill('Monolith')
  const monolith = page.locator('[data-picker-unit="Monolith"]')
  await expect(monolith).toBeVisible()
  const before = await settledHeight(monolith)
  await addUnit(page, "C'tan Shard of the Void Dragon")
  await page.getByLabel('Add a unit').fill('Monolith')
  await expect(monolith).toBeVisible()
  expect(await settledHeight(monolith)).toBe(before)
  await expect(monolith).not.toContainText('over the remaining budget')
  await expect(monolith.getByRole('button', { name: 'Add Monolith', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Points fit', exact: true }).click()
  await expect(monolith).toHaveCount(0)
  await page.getByRole('button', { name: 'Points fit', exact: true }).click()
  await waitForRosterSave(page, () => monolith.getByRole('button', { name: 'Add Monolith', exact: true }).click())
  await expect(page.locator('[data-stat="points"]')).toHaveText('1125/1000')
  await page.reload()
  await expect(page.locator('[data-unit="Monolith"]')).toHaveCount(1)
  await expect(page.locator('[data-stat="points"]')).toHaveText('1125/1000')
  await expect(page.locator('[data-stat="points-left"]')).toHaveText('125 over')
  await expect(page.getByText('Over the points limit', { exact: true }).first()).toBeAttached()
})

test('accepts an Add click while the preceding edit is being priced', async ({ page }) => {
  await openBuilder(page)
  await page.getByLabel('Add a unit').clear()
  const immortals = page.getByRole('button', { name: 'Add Immortals', exact: true })
  const overlord = page.getByRole('button', { name: 'Add Overlord', exact: true })
  await expect(immortals).toBeEnabled()
  await expect(overlord).toBeEnabled()
  const { promise: held, resolve: release } = Promise.withResolvers<void>()
  const { promise: started, resolve: began } = Promise.withResolvers<void>()
  await page.route('**/_serverFn/**', async (route) => {
    if (route.request().method() === 'POST') {
      began()
      await held
    }
    await route.continue()
  })
  try {
    await immortals.click()
    await started
    await expect(overlord).toBeEnabled()
    await overlord.click()
  } finally {
    release()
  }
  await expect(page.locator('[data-unit="Immortals"]')).toHaveCount(1)
  await expect(page.locator('[data-unit="Overlord"]')).toHaveCount(1)
  await expect(page.locator('[data-stat="points"]')).toHaveText('155/2000')
  await expect(page.locator('[data-stat="points-left"]')).toHaveText('1845 left')
})

test('a picker favourite stays selected throughout a delayed save', async ({ page }) => {
  await openBuilder(page)
  await page.getByLabel('Add a unit').fill('Immortals')
  const row = page.locator('[data-picker-unit="Immortals"]')
  const heart = row.getByRole('button', { name: /Immortals (to|from) favourite datasheets/ })
  await expect(heart).toHaveAttribute('aria-pressed', 'false')
  await heart.evaluate((button) => {
    const frames: string[] = []
    Object.assign(window, { favouriteFrames: frames })
    new MutationObserver(() => {
      frames.push(button.getAttribute('aria-pressed')!)
    }).observe(button, { attributes: true, attributeFilter: ['aria-pressed'] })
  })
  const { promise: held, resolve: release } = Promise.withResolvers<void>()
  await page.route('**/_serverFn/**', async (route) => {
    if (route.request().method() === 'POST') await held
    await route.continue()
  })
  try {
    await heart.click()
    await expect(heart).toHaveAttribute('aria-pressed', 'true')
    await expect(heart).toBeEnabled()
  } finally {
    release()
  }
  await expect.poll(async () => page.evaluate(() => window.PraetoriumLocalState?.state?.operations.length)).toBe(0)
  expect(await page.evaluate(() => (window as unknown as { favouriteFrames: string[] }).favouriteFrames)).toEqual(['true'])
  await page.reload()
  await page.getByLabel('Add a unit').fill('Immortals')
  await expect(heart).toHaveAttribute('aria-pressed', 'true')
})
