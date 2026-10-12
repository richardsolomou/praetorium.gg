import { expect, test } from '@playwright/test'
import { createRoster, signUp, uniqueName, waitForRosterSave } from './account'
import { productOperator, savedWork } from './storage'

const LOCKED = 'This roster is locked. Unlock it to change it, or keep your changes as a new roster.'

for (const width of [1440, 390]) {
  test(`a locked roster stays read-only until unlocked while its copies stay editable at ${width}px`, async ({ page }) => {
    test.setTimeout(180_000)
    await signUp(page, uniqueName('Locked list'))
    const name = await createRoster(page, { faction: 'Necrons', detachment: /Awakened Dynasty/, name: `Finished list ${width}` })
    const id = new URL(page.url()).pathname.split('/').at(-1)!
    const operator = await productOperator()
    await waitForRosterSave(page, async () => {
      await page.getByLabel('Add a unit').fill('Immortals')
      await page.getByRole('button', { name: 'Add Immortals', exact: true }).first().click()
    })
    await page.setViewportSize({ width, height: 900 })

    await page.getByRole('button', { name: 'Roster actions' }).click()
    await page.getByRole('menuitem', { name: 'Lock roster' }).click()
    await expect(page.getByText('Locked. Unlock to edit, or create a variant.')).toBeVisible()
    const listName = page.getByLabel('List name')
    await expect(listName).not.toBeEditable()
    await listName.click()
    await page.keyboard.type(' edited')
    await expect(listName).toHaveValue(name)
    await expect(page.getByLabel('Add a unit')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Unit actions for Immortals' })).toHaveCount(0)
    expect((await operator.roster(id))?.locked).toBe(true)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
    await page.screenshot({ path: test.info().outputPath(`locked-builder-${width}.png`) })

    await page.goto('/rosters')
    const row = page.locator(`[data-roster="${name}"]`)
    await expect(row.getByText('Locked', { exact: true })).toBeVisible()
    await page.screenshot({ path: test.info().outputPath(`locked-library-${width}.png`) })
    await row.getByRole('button', { name: `Actions for ${name}` }).click()
    await expect(page.getByRole('menuitem', { name: 'Edit setup' })).toBeDisabled()
    await expect(page.getByRole('menuitem', { name: 'Convert rules version' })).toBeDisabled()
    await expect(page.getByRole('menuitem', { name: 'Unlock roster' })).toBeEnabled()
    await page.screenshot({ path: test.info().outputPath(`locked-row-menu-${width}.png`) })
    await page.getByRole('menuitem', { name: 'Duplicate' }).click()
    const duplicate = page.locator(`[data-roster="Copy of ${name}"]`)
    await expect(duplicate).toBeVisible()
    await expect(duplicate.getByText('Locked', { exact: true })).toHaveCount(0)

    await page.goto(`/rosters/${id}`)
    await page.getByRole('button', { name: 'Roster actions' }).click()
    await page.getByRole('menuitem', { name: 'New variant' }).click()
    await page.waitForURL((url) => !url.pathname.endsWith(id))
    const variantId = new URL(page.url()).pathname.split('/').at(-1)!
    await waitForRosterSave(page, () => page.getByLabel('List name').fill('Experimental variant'), 'Experimental variant')
    await expect.poll(async () => (await operator.roster(variantId))?.name).toBe('Experimental variant')
    expect((await operator.roster(id))?.name).toBe(name)

    await page.goto(`/rosters/${id}`)
    await page.getByRole('button', { name: 'Unlock', exact: true }).click()
    await expect(page.getByLabel('List name')).toHaveValue(name)
    await expect.poll(async () => (await operator.roster(id))?.locked).toBe(false)
    await waitForRosterSave(page, () => page.getByLabel('List name').fill(`Reworked list ${width}`), `Reworked list ${width}`)
    await expect.poll(async () => (await operator.roster(id))?.name).toBe(`Reworked list ${width}`)
  })
}

test('an edit queued offline is refused visibly after another device locks the roster', async ({ browser, context, page }) => {
  test.setTimeout(180_000)
  await signUp(page, uniqueName('Two devices'))
  const name = await createRoster(page, { faction: 'Necrons', detachment: /Awakened Dynasty/, name: 'Shared finished list' })
  const id = new URL(page.url()).pathname.split('/').at(-1)!
  const operator = await productOperator()
  await expect.poll(async () => (await savedWork(page))?.operations.length).toBe(0)

  await context.setOffline(true)
  await page.getByLabel('List name').fill('Edited on the plane')
  await expect.poll(async () => (await savedWork(page))?.operations.length).toBe(1)

  const otherDevice = await browser.newContext({ storageState: await context.storageState() })
  try {
    const other = await otherDevice.newPage()
    await other.goto('/rosters')
    const row = other.locator(`[data-roster="${name}"]`)
    await row.getByRole('button', { name: `Actions for ${name}` }).click()
    await other.getByRole('menuitem', { name: 'Lock roster' }).click()
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
  await page.setViewportSize({ width: 390, height: 844 })
  await expect.poll(async () => (await review.boundingBox())?.width).toBe(390)
  await page.screenshot({ path: test.info().outputPath('locked-refusal-review-390.png') })

  await review.getByRole('button', { name: 'Keep as a new roster' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Discard changes' }).click()
  await expect.poll(async () => (await savedWork(page))?.operations.length).toBe(0)
  await page.keyboard.press('Escape')
  await page.goto('/rosters')
  await expect(page.locator('[data-roster="Edited on the plane (offline copy)"]')).toBeVisible()
  await expect(page.locator(`[data-roster="${name}"]`).getByText('Locked', { exact: true })).toBeVisible()
})
