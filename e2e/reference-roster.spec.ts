import { expect, type Page, test } from '@playwright/test'

const DATASHEET = '/factions/necrons/datasheets/imotekh-the-stormlord'

async function addFromDatasheet(page: Page) {
  await page.goto(DATASHEET)
  await page.waitForLoadState('networkidle')
  await page.getByRole('button', { name: 'Add to roster' }).click()
}

/** A reader of one datasheet reaches the builder with that unit, under the roster's own limits. */
test('a visitor starts a roster from a datasheet and is told when it cannot take another copy', async ({ page }) => {
  await addFromDatasheet(page)
  const setup = page.getByRole('dialog', { name: 'Create roster' })
  await expect(setup.getByRole('combobox', { name: 'Faction' })).toHaveText(/Necrons/)
  await setup.getByRole('button', { name: /^Select Awakened Dynasty$/ }).click()
  await setup.getByRole('group', { name: 'Force disposition' }).getByRole('button', { name: 'Take and Hold' }).click()
  await setup.getByRole('button', { name: 'Create roster' }).click()
  await expect(page).toHaveURL(/\/rosters$/)
  await expect(page.locator('[data-unit]').filter({ hasText: 'Imotekh the Stormlord' })).toHaveCount(1)
  // Edits are kept once they settle, so leaving waits for the stored draft to hold the unit.
  await expect.poll(() => page.evaluate(() => localStorage.getItem('praetorium.guest-draft') ?? '')).toContain('"picks":[{')

  await addFromDatasheet(page)
  await page
    .getByRole('dialog', { name: 'Add Imotekh the Stormlord to a roster' })
    .getByRole('link', { name: /Your unsaved roster/ })
    .click()
  await expect(page.getByRole('alert').filter({ hasText: 'The unit was not added' })).toContainText('Limit reached (1/1)')
  await expect(page.locator('[data-unit]').filter({ hasText: 'Imotekh the Stormlord' })).toHaveCount(1)
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
