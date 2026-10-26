import { expect, test } from './test'
import {
  createRoster,
  signUp,
  uniqueName,
  waitForRosterSave,
  expectNoPageOverflow,
  chooseRosterAction,
  chooseLibraryAction,
  PHONE,
} from './account'
import { productOperator, savedWork, lastPathSegment, expectWorkSynced } from './storage'

const LOCKED = 'This roster is locked. Unlock it to change it, or keep your changes as a new roster.'

test('a locked roster stays read-only until unlocked while its copies stay editable', async ({ page }) => {
  test.setTimeout(180_000)
  await signUp(page, uniqueName('Locked list'))
  const name = await createRoster(page, { faction: 'Necrons', detachment: /Awakened Dynasty/, name: 'Finished list' })
  const id = lastPathSegment(page.url())
  const operator = await productOperator()
  await waitForRosterSave(page, async () => {
    await page.getByLabel('Add a unit').fill('Immortals')
    await page.getByRole('button', { name: 'Add Immortals', exact: true }).first().click()
  })

  await chooseRosterAction(page, 'Lock roster')
  const listName = page.getByLabel('List name')
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 })
    await expect(page.getByText('Locked. Unlock to edit, or create a variant.')).toBeVisible()
    await expect(listName).not.toBeEditable()
    await listName.click()
    await page.keyboard.type(' edited')
    await expect(listName).toHaveValue(name)
    await expect(page.getByLabel('Add a unit')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Unit actions for Immortals' })).toHaveCount(0)
    expect((await operator.roster(id))?.locked).toBe(true)
    await expectNoPageOverflow(page)
    await page.screenshot({ path: test.info().outputPath(`locked-builder-${width}.png`) })
  }

  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/rosters')
  const row = page.locator(`[data-roster="${name}"]`)
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await expect(row.getByText('Locked', { exact: true })).toBeVisible()
    await page.screenshot({ path: test.info().outputPath(`locked-library-${width}.png`) })
    await row.getByRole('button', { name: `Actions for ${name}` }).click()
    await expect(page.getByRole('menuitem', { name: 'Edit roster setup' })).toBeDisabled()
    await expect(page.getByRole('menuitem', { name: 'Unlock roster' })).toBeEnabled()
    await page.screenshot({ path: test.info().outputPath(`locked-row-menu-${width}.png`) })
    if (width === 390) {
      await page.keyboard.press('Escape')
      await expect(page.getByRole('menuitem', { name: 'Duplicate' })).toHaveCount(0)
    }
  }
  await page.getByRole('menuitem', { name: 'Duplicate' }).click()
  const duplicate = page.locator(`[data-roster="Copy of ${name}"]`)
  await expect(duplicate).toBeVisible()
  await expect(duplicate.getByText('Locked', { exact: true })).toHaveCount(0)

  await page.goto(`/rosters/${id}`)
  await chooseRosterAction(page, 'Create variant')
  await page.waitForURL((url) => !url.pathname.endsWith(id))
  const variantId = lastPathSegment(page.url())
  await waitForRosterSave(page, () => page.getByLabel('List name').fill('Experimental variant'), 'Experimental variant')
  await expect.poll(async () => (await operator.roster(variantId))?.name).toBe('Experimental variant')
  expect((await operator.roster(id))?.name).toBe(name)

  await page.goto(`/rosters/${id}`)
  await page.getByRole('button', { name: 'Unlock', exact: true }).click()
  await expect(page.getByLabel('List name')).toHaveValue(name)
  await expect.poll(async () => (await operator.roster(id))?.locked).toBe(false)
  await waitForRosterSave(page, () => page.getByLabel('List name').fill('Reworked list'), 'Reworked list')
  await expect.poll(async () => (await operator.roster(id))?.name).toBe('Reworked list')
})

test('an edit queued offline is refused visibly after another device locks the roster', async ({ browser, context, page }) => {
  test.setTimeout(180_000)
  await signUp(page, uniqueName('Two devices'))
  const name = await createRoster(page, { faction: 'Necrons', detachment: /Awakened Dynasty/, name: 'Shared finished list' })
  const id = lastPathSegment(page.url())
  const operator = await productOperator()
  await expectWorkSynced(page)

  await context.setOffline(true)
  await page.getByLabel('List name').fill('Edited on the plane')
  await expect.poll(async () => (await savedWork(page))?.operations.length).toBe(1)

  const otherDevice = await browser.newContext({ storageState: await context.storageState() })
  try {
    const other = await otherDevice.newPage()
    await other.goto('/rosters')
    const row = other.locator(`[data-roster="${name}"]`)
    await chooseLibraryAction(other, name, 'Lock roster')
    await expect(row.getByText('Locked', { exact: true })).toBeVisible()
  } finally {
    await otherDevice.close()
  }
  expect((await operator.roster(id))?.locked).toBe(true)

  await context.setOffline(false)
  await page.evaluate(() => window.dispatchEvent(new Event('online')))
  await expect(page.getByText('Review saved changes', { exact: true })).toBeVisible({ timeout: 30_000 })
  await page.getByRole('button', { name: 'Details' }).click()
  const review = page.getByRole('dialog', { name: 'Saved changes' })
  await expect(review.getByText(LOCKED)).toBeVisible()
  expect((await operator.roster(id))?.name).toBe(name)
  await page.screenshot({ path: test.info().outputPath('locked-refusal-review-1440.png') })
  await page.setViewportSize(PHONE)
  await expect.poll(async () => (await review.boundingBox())?.width).toBe(390)
  await page.screenshot({ path: test.info().outputPath('locked-refusal-review-390.png') })

  await review.getByRole('button', { name: 'Keep as a new roster' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Discard changes' }).click()
  await expectWorkSynced(page)
  await page.keyboard.press('Escape')
  await page.goto('/rosters')
  await expect(page.locator('[data-roster="Edited on the plane (offline copy)"]')).toBeVisible()
  await expect(page.locator(`[data-roster="${name}"]`).getByText('Locked', { exact: true })).toBeVisible()
})
