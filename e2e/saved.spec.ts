import { expect, test } from '@playwright/test'
import { createRoster, signUp, uniqueName, waitForRosterSave } from './account'

test('the roster library reserves its rows while the first page loads', async ({ browser, page }) => {
  await signUp(page, 'Loading')
  const rosterName = await createRoster(page, { faction: 'Necrons', detachment: /Awakened Dynasty/, name: 'Loading roster' })

  const firstFrameContext = await browser.newContext({ javaScriptEnabled: false, storageState: await page.context().storageState() })
  const firstFrame = await firstFrameContext.newPage()
  await firstFrame.goto('/rosters')
  const firstFrameRubric = firstFrame.locator('main section').last().locator('.rubric')
  await expect(firstFrameRubric.getByText('Rosters', { exact: true })).toBeVisible()
  await expect(firstFrameRubric.getByLabel('Loading roster count')).toBeVisible()
  await expect(firstFrame.getByRole('button', { name: 'Create editable roster' })).toBeVisible()
  await expect(firstFrame.getByLabel('Loading roster creation options')).toHaveCount(0)
  await firstFrame.screenshot({ path: 'test-results/loading-roster-library-no-js.png', fullPage: true })
  await firstFrame.setViewportSize({ width: 390, height: 844 })
  expect(await firstFrame.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  await firstFrame.screenshot({ path: 'test-results/loading-roster-library-no-js-phone.png', fullPage: true })
  await firstFrameContext.close()

  await page.goto('/')
  let release: () => void = () => {}
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('**/_serverFn/**', async (route) => {
    await held
    await route.continue()
  })

  await page.getByRole('link', { name: 'Rosters', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'My rosters' })).toBeVisible()
  const libraryRubric = page.locator('main section').last().locator('.rubric')
  await expect(libraryRubric.getByText('Rosters', { exact: true })).toBeVisible()
  await expect(libraryRubric.getByLabel('Loading roster count')).toBeVisible()
  const createRosterButton = page.getByRole('button', { name: 'Create editable roster' })
  await expect(createRosterButton).toBeVisible()
  await expect(page.getByLabel('Loading roster creation options')).toHaveCount(0)
  await createRosterButton.click()
  await expect(page.getByRole('heading', { name: 'Create roster' })).toBeVisible()
  await page.keyboard.press('Escape')
  await page.screenshot({ path: 'test-results/loading-roster-library.png', fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  await page.screenshot({ path: 'test-results/loading-roster-library-phone.png', fullPage: true })
  release()
  await expect(page.locator(`[data-roster="${rosterName}"]`)).toBeVisible()
  await page.unroute('**/_serverFn/**')
})

test('the guest roster page shows its account gate without library loaders', async ({ page }) => {
  await page.goto('/rosters')

  await expect(page.getByRole('heading', { name: 'Your rosters' })).toBeVisible()
  await expect(page.getByRole('main').getByRole('link', { name: 'Sign in' })).toBeVisible()
  await expect(page.getByLabel(/^Loading roster/)).toHaveCount(0)
})

test('a failed roster library read is not shown as an empty library', async ({ page }) => {
  await signUp(page, 'Library failure')
  await page.goto('/')
  await page.route('**/_serverFn/**', (route) => route.abort('failed'))

  await page.getByRole('link', { name: 'Rosters', exact: true }).click()

  await expect(page.getByRole('heading', { name: 'Could not load rosters' })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole('heading', { name: 'No rosters yet' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible()
})

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
  await page.locator('[data-unit="Overlord"]').getByRole('button', { name: 'Attach Overlord to unit' }).click()
  await page.getByRole('menu').getByRole('menuitem', { name: 'Immortals', exact: true }).click()
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
  // The library prices every list in one answer, so each row asks for nothing of its own.
  await expect(page.locator('[data-roster="Nurgle 2k"]')).toContainText('230/2000')
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

  const loadout = page.locator('aside[aria-label="Loadout"]')
  await expect(loadout.locator('[data-slot="unit-profile"]')).toBeVisible()
  await expect(loadout.getByText('Gauss blaster', { exact: true }).first()).toBeVisible()
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
  await roster.emulateMedia({ media: 'print' })
  await roster.screenshot({ path: 'test-results/shared-roster-print.png', fullPage: true })
  const sharedUrl = roster.url()
  await roster.close()

  await context.addInitScript(() => {
    window.print = () => document.documentElement.setAttribute('data-print-called', 'true')
  })
  await page.getByRole('button', { name: 'Actions for Copy of Nurgle 2k' }).click()
  const print = page.waitForEvent('popup')
  await page.getByRole('menuitem', { name: 'Print' }).click()
  const printedRoster = await print
  await expect(printedRoster.locator('html')).toHaveAttribute('data-print-called', 'true')
  await printedRoster.close()

  await page.getByRole('button', { name: 'Actions for Copy of Nurgle 2k' }).click()
  await page.getByRole('menuitem', { name: 'Edit setup' }).click()
  const setup = page.getByRole('dialog', { name: 'Edit roster setup' })
  await setup.getByRole('combobox', { name: 'Access' }).click()
  await page.getByRole('option', { name: 'Unlisted — anyone with the link' }).click()
  const promoted = page.waitForResponse((response) => response.ok() && Boolean(response.request().postData()?.includes('"unlisted"')))
  await setup.getByRole('button', { name: 'Save changes' }).click()
  await promoted

  // Public reads exactly as unlisted does. What it adds is being listed on the
  // owner's profile, which is the only place the two values look different.
  await page.getByRole('button', { name: 'Actions for Copy of Nurgle 2k' }).click()
  await page.getByRole('menuitem', { name: 'Edit setup' }).click()
  const publishing = page.getByRole('dialog', { name: 'Edit roster setup' })
  await publishing.getByRole('combobox', { name: 'Access' }).click()
  await page.getByRole('option', { name: 'Public — listed on your profile' }).click()
  const published = page.waitForResponse((response) => response.ok() && Boolean(response.request().postData()?.includes('"public"')))
  await publishing.getByRole('button', { name: 'Save changes' }).click()
  await published

  await page.getByRole('button', { name: 'Account menu for Alice' }).click()
  await page.getByRole('menuitem', { name: 'My profile' }).click()
  const rostersTab = page.getByRole('tab', { name: /rosters/i })
  await expect(async () => {
    await rostersTab.click()
    await expect(page.locator('[data-player-rosters]')).toBeVisible({ timeout: 1000 })
  }).toPass()
  await expect(page.locator('[data-player-rosters]')).toContainText('Copy of Nurgle 2k')

  // Back to unlisted, so the rest of this test reads the link the way it did before.
  await page.goto('/rosters')
  await page.getByRole('button', { name: 'Actions for Copy of Nurgle 2k' }).click()
  await page.getByRole('menuitem', { name: 'Edit setup' }).click()
  const reverting = page.getByRole('dialog', { name: 'Edit roster setup' })
  await reverting.getByRole('combobox', { name: 'Access' }).click()
  await page.getByRole('option', { name: 'Unlisted — anyone with the link' }).click()
  const relisted = page.waitForResponse((response) => response.ok() && Boolean(response.request().postData()?.includes('"unlisted"')))
  await reverting.getByRole('button', { name: 'Save changes' }).click()
  await relisted

  const firstFrameContext = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1600, height: 900 } })
  const firstFrame = await firstFrameContext.newPage()
  await firstFrame.goto(sharedUrl)
  await expect(firstFrame.locator('[data-unit="Immortals"]')).toBeVisible()
  await expect(firstFrame.locator('[data-unit="Overlord"]')).toBeVisible()
  await expect(firstFrame.getByText('This roster has no units.')).toHaveCount(0)
  await expect(firstFrame.getByLabel('Loading roster units')).toHaveCount(0)
  await firstFrameContext.close()

  const guestContext = await browser.newContext({ viewport: { width: 1600, height: 900 } })
  const guest = await guestContext.newPage()
  await guest.goto(sharedUrl)
  await expect(guest.getByLabel('List name')).toHaveValue('Copy of Nurgle 2k')
  await expect(guest.getByLabel('List name')).toHaveAttribute('readonly', '')
  await guest.getByRole('button', { name: 'Roster actions' }).click()
  await expect(guest.getByRole('menuitem', { name: 'Sign in to duplicate' })).toHaveAttribute('href', /\/sign-in\?next=/)
  await expect(guest.getByRole('menuitem', { name: 'Export GW text' })).toBeVisible()
  await expect(guest.getByRole('menuitem', { name: 'Print' })).toBeVisible()
  await guest.screenshot({ path: 'test-results/shared-roster-actions.png', fullPage: true })
  await guest.keyboard.press('Escape')
  await expect(guest.getByLabel('Add units')).toHaveCount(0)
  await expect(guest.getByRole('button', { name: 'Characters 1', exact: true })).toBeVisible()
  await expect(guest.getByRole('button', { name: 'Battleline 1', exact: true })).toBeVisible()
  await expect(guest.getByLabel('Unit actions for Immortals')).toHaveCount(0)
  let releaseLoadout: () => void = () => {}
  const loadoutHeld = new Promise<void>((resolve) => {
    releaseLoadout = resolve
  })
  await guest.route('**/_serverFn/**', async (route) => {
    await loadoutHeld
    await route.continue()
  })
  await guest.getByRole('button', { name: 'Immortals', exact: true }).click()
  const guestLoadout = guest.locator('aside[aria-label="Loadout"]')
  await expect(guestLoadout.getByLabel('Loading loadout')).toBeVisible()
  await expect(guestLoadout.getByText('Select a unit from the roster to see its loadout.')).toHaveCount(0)
  releaseLoadout()
  await expect(guestLoadout.getByText('Gauss blaster', { exact: true }).first()).toBeVisible()
  await guest.unroute('**/_serverFn/**')
  await expect(guest.locator('[data-unit="Immortals"]')).toContainText('6x Gauss blaster')
  await expect(guestLoadout.getByRole('button', { name: 'More Gauss blaster' })).toHaveCount(0)
  await expect(guestLoadout.getByRole('button', { name: /^Select / })).toHaveCount(0)
  await expect(guestLoadout.getByRole('button', { name: 'More models in Immortals' })).toHaveCount(0)
  await expect(guestLoadout.getByText('Implacable Eradication')).toBeVisible()
  await guest.screenshot({ path: 'test-results/shared-roster-read-only.png', fullPage: true })
  await guest.setViewportSize({ width: 390, height: 844 })
  await expect(guestLoadout).toBeVisible()
  expect(await guest.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
  expect(await guestLoadout.evaluate((pane) => pane.scrollWidth <= pane.clientWidth)).toBe(true)
  await guest.screenshot({ path: 'test-results/shared-roster-read-only-phone.png', fullPage: true })
  await guestLoadout.getByRole('button', { name: 'Back to roster' }).click()
  await guest.getByRole('button', { name: 'Roster actions' }).click()
  await expect(guest.getByRole('menuitem', { name: 'Sign in to duplicate' })).toBeVisible()
  expect(await guest.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
  await guest.screenshot({ path: 'test-results/shared-roster-actions-phone.png', fullPage: true })
  await guest.keyboard.press('Escape')

  await signUp(guest, uniqueName('Reader'))
  await guest.goto(sharedUrl)
  await guest.getByRole('button', { name: 'Roster actions' }).click()
  await guest.getByRole('menuitem', { name: 'Duplicate to my rosters' }).click()
  await expect.poll(() => guest.url()).not.toBe(sharedUrl)
  await expect(guest).toHaveURL(/\/rosters\/[^/]+$/)
  await expect(guest.getByLabel('List name')).toHaveValue('Copy of Copy of Nurgle 2k')
  await expect(guest.getByLabel('List name')).not.toHaveAttribute('readonly', '')
  await guest.goto('/rosters')
  const duplicated = guest.locator('[data-roster="Copy of Copy of Nurgle 2k"]')
  await expect(duplicated).toBeVisible()
  await expect(duplicated).toContainText('Private')
  await guestContext.close()
})
