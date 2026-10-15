import { expect, test } from './test'
import { createRoster, signUp, uniqueName } from './account'
import { productOperator } from './storage'

test('deleting offers to archive a roster, which leaves the library list and Home until it is unarchived', async ({ page }) => {
  test.setTimeout(180_000)
  await signUp(page, uniqueName('Archivist'))
  const kept = await createRoster(page, { faction: 'Necrons', detachment: /Awakened Dynasty/, name: 'Kept list' })
  const keptId = new URL(page.url()).pathname.split('/').at(-1)!
  const name = await createRoster(page, { faction: 'Necrons', detachment: /Awakened Dynasty/, name: 'Shelved list' })
  const id = new URL(page.url()).pathname.split('/').at(-1)!
  const operator = await productOperator()

  await page.goto('/rosters')
  const row = page.locator(`[data-roster="${name}"]`)
  await row.getByRole('button', { name: `Actions for ${name}` }).click()
  await page.getByRole('menuitem', { name: 'Delete' }).click()
  const confirm = page.getByRole('alertdialog')
  await expect(confirm.getByRole('button', { name: 'Delete roster' })).toBeVisible()
  await page.screenshot({ path: test.info().outputPath('archive-instead-1440.png') })
  await confirm.getByRole('button', { name: 'Archive instead' }).click()
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
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
    await page.screenshot({ path: test.info().outputPath(`archived-library-${width}.png`) })
  }

  const home = await operator.homeRostersByUser((await operator.roster(id))!.userId)
  expect({ count: home.count, ids: home.rows.map((roster) => roster.id) }).toEqual({ count: 1, ids: [keptId] })

  await page.goto('/rosters')
  await page.waitForLoadState('networkidle')
  await openArchived()
  await row.getByRole('button', { name: `Actions for ${name}` }).click()
  await page.getByRole('menuitem', { name: 'Unarchive', exact: true }).click()
  await expect.poll(async () => (await operator.roster(id))?.archived).toBe(false)
  await expect(archived).toHaveCount(0)
  await expect(row).toBeVisible()

  await row.getByRole('button', { name: `Actions for ${name}` }).click()
  await page.getByRole('menuitem', { name: 'Archive', exact: true }).click()
  await openArchived()
  await row.getByRole('button', { name: `Actions for ${name}` }).click()
  await page.getByRole('menuitem', { name: 'Delete' }).click()
  await expect(confirm.getByRole('button', { name: 'Archive instead' })).toHaveCount(0)
  await confirm.getByRole('button', { name: 'Delete roster' }).click()
  await expect.poll(async () => await operator.roster(id)).toBeUndefined()
})
