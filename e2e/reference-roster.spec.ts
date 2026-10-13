import { expect, type Page, test } from '@playwright/test'
import { retryUntilVisible } from './account'
import { add } from './builder.harness'

const DATASHEET = '/factions/necrons/datasheets/imotekh-the-stormlord'

async function addFromDatasheet(page: Page, datasheet = DATASHEET) {
  await page.goto(datasheet)
  await page.waitForLoadState('networkidle')
  await page.getByRole('button', { name: 'Add to', exact: true }).click()
  await page.getByRole('button', { name: 'Roster…' }).click()
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
  await expect(page.getByRole('alert').filter({ hasText: 'The unit was not added' })).toHaveText(
    'The unit was not added. Limit reached: 1 of 1 permitted copies in the roster.',
  )
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

test('partial Eradicator squads retain their copy-tier prices through reload, view and export', { tag: '@catalogue' }, async ({ page }) => {
  const name = 'Eradicator Squad with Heavy Bolters'
  await addFromDatasheet(
    page,
    '/factions/space-marines/rules/space-marines-points-2026-10-13/datasheets/eradicator-squad-with-heavy-bolters',
  )
  const setup = page.getByRole('dialog', { name: 'Create roster' })
  await setup.getByRole('button', { name: 'Select Assault Brethren', exact: true }).click()
  await setup.getByRole('group', { name: 'Force disposition' }).getByRole('button', { name: 'Take and Hold', exact: true }).click()
  await setup.getByRole('button', { name: 'Create roster', exact: true }).click()
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
  await retryUntilVisible(page.getByRole('menuitem', { name: 'Export text' }), () =>
    page.getByRole('button', { name: 'Roster actions' }).click(),
  )
  await page.getByRole('menuitem', { name: 'Export text' }).click()
  const exported = page.getByRole('dialog', { name: 'Export roster' }).locator('pre')
  await expect(exported).toContainText('675 Points')
  await expect(exported).toContainText(`${name} (245 Points)`)
})
