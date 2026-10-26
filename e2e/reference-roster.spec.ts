import { expect, type Page, test } from './test'
import { retryUntilVisible, chooseRosterAction } from './account'
import { add } from './builder.harness'
import { guestDraft } from './storage'

const DATASHEET = '/factions/necrons/datasheets/imotekh-the-stormlord'

async function addFromDatasheet(page: Page, datasheet = DATASHEET) {
  await page.goto(datasheet)
  await page.waitForLoadState('networkidle')
  await page.getByRole('button', { name: 'Add to roster', exact: true }).click()
}

/** Finishes the roster setup a datasheet's Add to roster opened, on a detachment and Take and Hold. */
async function createFromSetup(page: Page, detachment: string) {
  const setup = page.getByRole('dialog', { name: 'Create roster' })
  await setup.getByRole('button', { name: `Select ${detachment}`, exact: true }).click()
  await setup.getByRole('group', { name: 'Force disposition' }).getByRole('button', { name: 'Take and Hold', exact: true }).click()
  await setup.getByRole('button', { name: 'Create roster', exact: true }).click()
}

/** A reader of one datasheet reaches the builder with that unit, under the roster's own limits. */
test('a visitor starts a roster from a datasheet and is told when it cannot take another copy', async ({ page }) => {
  await addFromDatasheet(page)
  const setup = page.getByRole('dialog', { name: 'Create roster' })
  await expect(setup.getByRole('combobox', { name: 'Faction' })).toHaveText(/Necrons/)
  await createFromSetup(page, 'Awakened Dynasty')
  await expect(page).toHaveURL(/\/rosters\/[^/]+$/)
  await expect(page.locator('[data-unit]').filter({ hasText: 'Imotekh the Stormlord' })).toHaveCount(1)
  // Edits are kept once they settle, so leaving waits for the stored draft to hold the unit.
  await expect.poll(() => guestDraft(page)).toContain('"picks":[{')

  await addFromDatasheet(page)
  await page
    .getByRole('dialog', { name: 'Add Imotekh the Stormlord to a roster' })
    .getByRole('link', { name: /Your unsaved roster/ })
    .click()
  await expect(page.getByRole('alert').filter({ hasText: 'The unit was not added' })).toHaveText(
    'The unit was not added. Limit reached: 1 of 1 permitted copies in the roster.',
  )
  await expect(page.locator('[data-unit]').filter({ hasText: 'Imotekh the Stormlord' })).toHaveCount(1)
})

test('a visitor starts a roster from a faction page with that faction chosen', async ({ page }) => {
  await page.goto('/factions/necrons')
  const setup = page.getByRole('dialog', { name: 'Create roster' })
  await retryUntilVisible(setup, () => page.getByRole('button', { name: 'Start a roster', exact: true }).click())
  await expect(setup.getByRole('combobox', { name: 'Faction' })).toHaveText(/Necrons/)
})

test('a mission page opens a new roster setup on the rosters page', async ({ page }) => {
  await page.goto('/missions/chapter-approved-2026-2027')
  const setup = page.getByRole('dialog', { name: 'Create roster' })
  await retryUntilVisible(setup, () => page.getByRole('link', { name: 'Build a roster' }).click())
  await expect(page).toHaveURL(/\/rosters$/)
  await setup.getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.reload()
  await expect(page.getByRole('button', { name: 'New roster' })).toBeVisible()
  await expect(setup).toBeHidden()
})

test('a datasheet opens the simulator on the side the reader picks', async ({ page }) => {
  await page.goto(DATASHEET)
  await page.waitForLoadState('networkidle')
  await page.getByRole('button', { name: 'Simulate' }).click()
  await page.getByRole('menuitem', { name: 'As defender' }).click()
  await expect(page.getByRole('combobox', { name: 'Defender unit', exact: true })).toHaveText(/Imotekh the Stormlord/)
  await expect(page.getByRole('combobox', { name: 'Attacker unit', exact: true })).toHaveText(/Choose a unit/)
  await expect(page).not.toHaveURL(/from=/)
})

test('partial Eradicator squads retain their copy-tier prices through reload, view and export', { tag: '@catalogue' }, async ({ page }) => {
  const name = 'Eradicator Squad with Heavy Bolters'
  await addFromDatasheet(page, '/factions/space-marines/rules/mfm-1-6/datasheets/eradicator-squad-with-heavy-bolters')
  await createFromSetup(page, 'Assault Brethren')
  const cards = page.locator(`[data-unit="${name}"]`)
  await expect(cards).toHaveCount(1)
  await add(page, name)
  await expect(cards).toHaveCount(2)
  await add(page, name)
  await expect(cards).toHaveCount(3)
  for (const [index, points] of [100, 100, 130].entries()) await expect(cards.nth(index)).toContainText(`${points} pts`)
  for (const [index, points] of [215, 215, 245].entries()) {
    await cards.nth(index).getByRole('button', { name, exact: true }).click()
    await page.getByRole('button', { name: `More models in ${name}`, exact: true }).click()
    await expect(page.getByLabel(`${name} models`, { exact: true })).toHaveText('4')
    await expect(cards.nth(index)).toContainText(`${points} pts`)
  }
  await expect
    .poll(() =>
      page.evaluate(() => {
        const draft = localStorage.getItem('praetorium.guest-draft')
        return draft ? JSON.parse(draft).draft.picks.map((pick: { models: number }) => pick.models) : []
      }),
    )
    .toEqual([4, 4, 4])
  await page.reload()
  for (const [index, points] of [215, 215, 245].entries()) await expect(cards.nth(index)).toContainText(`${points} pts`)
  await expect(page.getByText('675/2000', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'View', exact: true }).click()
  await expect(page.getByText('675/2000', { exact: true })).toBeVisible()
  await chooseRosterAction(page, 'Export text')
  const exported = page.getByRole('dialog', { name: 'Export roster' }).locator('pre')
  await expect(exported).toContainText('675 Points')
  await expect(exported).toContainText(`${name} (245 Points)`)
})

for (const width of [1440, 390]) {
  for (const [name, slug, weapon] of [
    ['Prosecutor Squad', 'prosecutor-squad', 'Boltgun'],
    ['Witchseeker Squad', 'witchseeker-squad', 'Flamer'],
  ]) {
    test(`${name} fixed weapons remain visible through resizing, reload and view at ${width}px`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 900 })
      await addFromDatasheet(page, `/factions/adeptus-custodes/rules/custodes-codex-2026-10-17/datasheets/${slug}`)
      await createFromSetup(page, 'Aquilan Shield')
      const card = page.locator(`[data-unit="${name}"]`)
      await card.getByRole('button', { name, exact: true }).click()
      const ranged = page.getByRole('heading', { name: new RegExp(`^\\d+× ${weapon}$`) })
      const stock = page.getByRole('heading', { name: /^\d+× Gun Stock$/ })
      await expect(ranged).toBeVisible()
      await expect(stock).toBeVisible()
      await page.screenshot({ path: testInfo.outputPath(`${slug}-editor.png`) })
      await expect(ranged).toHaveText(`4× ${weapon}`)
      await expect(stock).toHaveText('4× Gun Stock')
      await page.getByRole('button', { name: `More models in ${name}`, exact: true }).click()
      await expect(page.getByLabel(`${name} models`, { exact: true })).toHaveText('5')
      await expect(ranged).toHaveText(`5× ${weapon}`)
      await expect(stock).toHaveText('5× Gun Stock')
      await expect.poll(() => guestDraft(page)).toContain('"models":5')
      if (width === 390) await page.getByRole('button', { name: 'Back to roster', exact: true }).click()
      await page.reload()
      await card.getByRole('button', { name, exact: true }).click()
      await expect(ranged).toBeVisible()
      await expect(stock).toBeVisible()
      if (width === 390) await page.getByRole('button', { name: 'Back to roster', exact: true }).click()
      await page.getByRole('button', { name: 'View', exact: true }).click()
      await card.getByRole('button', { name, exact: true }).click()
      await expect(ranged).toBeVisible()
      await expect(stock).toBeVisible()
    })
  }

  test(`Eradicator melta profiles remain visible through reload and view at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 })
    const name = 'Eradicator Squad with Melta Rifles'
    await addFromDatasheet(page, '/factions/space-marines/datasheets/eradicator-squad-with-melta-rifles')
    await createFromSetup(page, 'Assault Brethren')
    const card = page.locator(`[data-unit="${name}"]`)
    await card.getByRole('button', { name, exact: true }).click()
    const rifles = page.getByRole('listitem', { name: /Melta rifle/i }).first()
    const multi = page.getByRole('listitem', { name: /Multi-melta/i }).first()
    await expect(rifles.getByText('HUNTER:Monster/Vehicle', { exact: true })).toBeVisible()
    await expect(multi.getByText('HUNTER:Monster/Vehicle', { exact: true })).toBeVisible()
    await expect(rifles.getByText('2 profiles', { exact: true })).toBeVisible()
    await expect(multi.getByText('2 profiles', { exact: true })).toBeVisible()
    await rifles.screenshot({ path: testInfo.outputPath('melta-rifle-editor.png') })
    await multi.screenshot({ path: testInfo.outputPath('multi-melta-editor.png') })
    await expect.poll(() => guestDraft(page)).toContain('"picks":[{')
    if (width === 390) await page.getByRole('button', { name: 'Back to roster', exact: true }).click()
    await page.reload()
    await card.getByRole('button', { name, exact: true }).click()
    await expect(rifles.getByText('HUNTER:Monster/Vehicle', { exact: true })).toBeVisible()
    if (width === 390) await page.getByRole('button', { name: 'Back to roster', exact: true }).click()
    await page.getByRole('button', { name: 'View', exact: true }).click()
    await card.getByRole('button', { name, exact: true }).click()
    await expect(rifles.getByText('HUNTER:Monster/Vehicle', { exact: true })).toBeVisible()
  })
}
