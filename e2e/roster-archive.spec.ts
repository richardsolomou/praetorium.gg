import { expect, test } from './test'
import { createRoster, signUp, uniqueName, expectNoPageOverflow, chooseLibraryAction } from './account'
import { productOperator, lastPathSegment } from './storage'

test('deleting offers to archive a roster, which leaves the library list and Home until it is unarchived', async ({ page }) => {
  test.setTimeout(180_000)
  await signUp(page, uniqueName('Archivist'))
  const kept = await createRoster(page, { faction: 'Necrons', detachment: /Awakened Dynasty/, name: 'Kept list' })
  const keptId = lastPathSegment(page.url())
  const name = await createRoster(page, { faction: 'Necrons', detachment: /Awakened Dynasty/, name: 'Shelved list' })
  const id = lastPathSegment(page.url())
  const operator = await productOperator()

  await page.goto('/rosters')
  const row = page.locator(`[data-roster="${name}"]`)
  await chooseLibraryAction(page, name, 'Delete')
  const confirm = page.getByRole('alertdialog')
  await expect(confirm.getByRole('button', { name: 'Delete roster' })).toBeVisible()
  await page.screenshot({ path: test.info().outputPath('archive-instead-1440.png') })
  await confirm.getByRole('button', { name: 'Archive roster' }).click()
  await expect.poll(async () => (await operator.roster(id))?.archived).toBe(true)

  const archived = page.getByRole('button', { name: /^Archived/ })
  // The section keeps its open state while the page stays, so it opens only when collapsed.
  const openArchived = async () => {
    if ((await archived.getAttribute('aria-expanded')) !== 'true') await archived.click()
    await expect(row).toBeVisible()
  }
  await expect(archived).toContainText('1')
  await expect(row).toHaveCount(0)
  await expect(page.locator(`[data-roster="${kept}"]`)).toBeVisible()
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await openArchived()
    await expectNoPageOverflow(page)
    await page.screenshot({ path: test.info().outputPath(`archived-library-${width}.png`) })
  }

  const home = await operator.homeRostersByUser((await operator.roster(id))!.userId)
  expect({ count: home.count, ids: home.rows.map((roster) => roster.id) }).toEqual({ count: 1, ids: [keptId] })

  await page.goto('/rosters')
  await page.waitForLoadState('networkidle')
  await openArchived()
  await chooseLibraryAction(page, name, 'Unarchive')
  await expect.poll(async () => (await operator.roster(id))?.archived).toBe(false)
  await expect(archived).toHaveCount(0)
  await expect(row).toBeVisible()

  await chooseLibraryAction(page, name, 'Archive')
  await openArchived()
  await chooseLibraryAction(page, name, 'Delete')
  await expect(confirm.getByRole('button', { name: 'Archive roster' })).toHaveCount(0)
  await confirm.getByRole('button', { name: 'Delete roster' }).click()
  await expect.poll(async () => await operator.roster(id)).toBeUndefined()
})
