import { expect, test } from '@playwright/test'
import { createRoster, signUp, waitForRosterSave } from './account'

/**
 * A list kept between battles. What is stored is the picks, so loading it re-prices
 * against the catalogue the instance currently holds — which is what a player
 * expects a saved list to do when the points change.
 */
test('a list is saved and loaded into another battle', async ({ browser }) => {
  const context = await browser.newContext()
  const page = await context.newPage()
  await page.setViewportSize({ width: 1600, height: 900 })

  await signUp(page, 'Alice')

  await createRoster(page, { faction: 'Necrons', detachment: /Awakened Dynasty/ })
  await page.getByLabel('Add a unit').fill('Immortals')
  await page.getByRole('button', { name: 'Add Immortals', exact: true }).first().click()
  await page.getByLabel('Add a unit').fill('Overlord')
  await page.getByRole('button', { name: 'Add Overlord', exact: true }).first().click()
  await page.locator('[data-unit="Overlord"]').getByRole('button', { name: 'Immortals', exact: true }).click()
  await expect(page.getByText('Leading')).toBeVisible()
  await page
    .getByRole('button', { name: /^Immortals/ })
    .first()
    .click()
  await page.getByRole('button', { name: /More models in Immortals/ }).click()

  const total = page.locator('[data-stat="points"]')
  // Wait for the resize to be priced; the preceding 160-point result can still be
  // visible while that request is in flight.
  await expect(total).toHaveText('230/2000')
  const priced = await total.innerText()

  // The name is offered, not demanded; this one is overridden on purpose.
  await waitForRosterSave(page, () => page.getByLabel('List name').fill('Nurgle 2k'), 'Nurgle 2k')

  await page.getByRole('link', { name: 'Rosters' }).click()
  await page.getByRole('link', { name: /Nurgle 2k/ }).click()
  await expect(page).toHaveURL(/\/rosters\/[^/]+$/)
  const editor = page.getByLabel('Add units').locator('xpath=ancestor::div[contains(@class,"bg-sunken")][1]')
  const editorBounds = await editor.boundingBox()
  expect(editorBounds?.x).toBe(0)
  expect(editorBounds?.width).toBe(1600)
  await expect(page.getByRole('button', { name: 'Characters 1', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Battleline 1', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Infantry 0', exact: true })).toHaveCount(0)
  await expect(total).toHaveText(priced)
  await page.reload()
  await expect(page.getByLabel('List name')).toHaveValue('Nurgle 2k')
  await expect(total).toHaveText(priced)
  await page
    .getByRole('button', { name: /^Immortals/ })
    .first()
    .click()

  const datasheet = page.locator('aside[aria-label="Datasheet"]')
  await expect(datasheet.locator('[data-slot="unit-profile"]')).toBeVisible()
  await expect(page.locator('aside[aria-label="Loadout"]').getByText('Gauss blaster', { exact: true }).first()).toBeVisible()
  await expect(page.getByLabel('List name')).toHaveValue('Nurgle 2k')
  await expect(page.getByLabel('Immortals models')).toHaveText('6')
  await page.screenshot({ path: 'test-results/saved-roster-edge-to-edge.png', fullPage: true })

  // A second visit, in the same browser, starts from the saved list.
  await page.goto('/rosters')
  await page.getByRole('link', { name: /Nurgle 2k/ }).click()

  await expect(total).toHaveText(priced)
  await page
    .getByRole('button', { name: /^Immortals/ })
    .first()
    .click()
  await expect(page.getByLabel('Immortals models')).toHaveText('6')
  await expect(page.getByText('Leading')).toBeVisible()
  await expect(page.getByText('Awakened Dynasty', { exact: true }).first()).toBeVisible()

  await page.goto('/rosters')
  await page.getByRole('button', { name: 'Actions for Nurgle 2k' }).click()
  await page.getByRole('menuitem', { name: 'Duplicate' }).click()
  await page.getByRole('link', { name: /Copy of Nurgle 2k/ }).click()
  await expect(page.getByLabel('List name')).toHaveValue('Copy of Nurgle 2k')
  await page.locator('[data-unit="Immortals"]').getByRole('button', { name: 'Immortals', exact: true }).click()
  await expect(page.getByLabel('Immortals models')).toHaveText('6')
  await page.goto('/rosters')
  await page.getByRole('button', { name: 'Actions for Copy of Nurgle 2k' }).click()
  const view = page.waitForEvent('popup')
  await page.getByRole('menuitem', { name: 'View' }).click()
  const roster = await view
  await expect(roster.getByLabel('List name')).toHaveValue('Copy of Nurgle 2k')
  await expect(roster.getByRole('button', { name: 'Immortals', exact: true })).toBeVisible()
  await roster.evaluate(() => {
    window.print = () => document.documentElement.setAttribute('data-print-called', 'true')
  })
  await roster.getByRole('button', { name: 'Print' }).click()
  await expect(roster.locator('html')).toHaveAttribute('data-print-called', 'true')
  await roster.emulateMedia({ media: 'print' })
  await roster.screenshot({ path: 'test-results/shared-roster-print.png', fullPage: true })
  const sharedUrl = roster.url()
  await roster.close()

  await page.getByRole('button', { name: 'Actions for Copy of Nurgle 2k' }).click()
  await page.getByRole('menuitem', { name: 'Edit setup' }).click()
  const setup = page.getByRole('dialog', { name: 'Edit roster setup' })
  await setup.getByRole('combobox', { name: 'Access' }).click()
  await page.getByRole('option', { name: 'Unlisted — anyone with the link' }).click()
  const promoted = page.waitForResponse((response) => response.ok() && Boolean(response.request().postData()?.includes('"unlisted"')))
  await setup.getByRole('button', { name: 'Save changes' }).click()
  await promoted

  const guestContext = await browser.newContext({ viewport: { width: 1600, height: 900 } })
  const guest = await guestContext.newPage()
  await guest.goto(sharedUrl)
  await expect(guest.getByLabel('List name')).toHaveValue('Copy of Nurgle 2k')
  await expect(guest.getByLabel('List name')).toHaveAttribute('readonly', '')
  await expect(guest.getByRole('button', { name: 'Roster actions' })).toHaveCount(0)
  await expect(guest.getByLabel('Add units')).toHaveCount(0)
  await expect(guest.getByRole('button', { name: 'Characters 1', exact: true })).toBeVisible()
  await expect(guest.getByRole('button', { name: 'Battleline 1', exact: true })).toBeVisible()
  await expect(guest.getByLabel('Unit actions for Immortals')).toHaveCount(0)
  await guest.getByRole('button', { name: 'Immortals', exact: true }).click()
  const guestLoadout = guest.locator('aside[aria-label="Loadout"]')
  await expect(guestLoadout.getByText('Gauss blaster', { exact: true }).first()).toBeVisible()
  await expect(guestLoadout.getByLabel('Gauss blaster count')).toHaveText('6')
  await expect(guestLoadout.getByRole('button', { name: 'More Gauss blaster' })).toHaveCount(0)
  await expect(guestLoadout.getByRole('button', { name: 'More models in Immortals' })).toHaveCount(0)
  await expect(guest.locator('aside[aria-label="Datasheet"]').getByText('Implacable Eradication')).toBeVisible()
  await guest.screenshot({ path: 'test-results/shared-roster-read-only.png', fullPage: true })
  await guest.setViewportSize({ width: 390, height: 844 })
  await expect(guestLoadout).toBeVisible()
  await guest.screenshot({ path: 'test-results/shared-roster-read-only-phone.png', fullPage: true })
  await guestContext.close()
})
