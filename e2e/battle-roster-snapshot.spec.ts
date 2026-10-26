import { expect, test } from './test'
import { createRoster, signUp, uniqueName, addUnit, practiceBattle, PHONE } from './account'
import { lastPathSegment } from './storage'

test('a fielded roster opens as the frozen read-only roster view', async ({ page }) => {
  await signUp(page, uniqueName('Snapshot'))
  const rosterName = await createRoster(page, { faction: 'Death Guard', detachment: /Shamblerot Vectorium/, name: 'Fielded Death Guard' })
  await addUnit(page, 'Lord of Virulence')
  const rosterId = lastPathSegment(page.url())

  const battleUrl = await practiceBattle(page, rosterName)
  await expect(page.locator('#setup-armies')).toHaveAttribute('data-complete', 'true')
  const token = lastPathSegment(battleUrl)
  await page.goto(`/rosters/${rosterId}?battle=${token}`)
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex')
  const rosterUrl = page.url()
  await page.setViewportSize(PHONE)
  await page.evaluate(() => {
    document.documentElement.dataset.nativeApp = 'true'
  })

  await expect(page.getByLabel('List name')).toHaveValue(rosterName)
  await expect(page.getByLabel('List name')).toHaveAttribute('readonly', '')
  await expect(page.getByText('Characters', { exact: true })).toBeVisible()
  await expect(page.getByText('1 unit', { exact: true })).toBeVisible()
  await expect(page.locator('[data-stat="points"]')).toContainText('/2000')
  await expect(page.locator('[data-unit="Lord of Virulence"]')).toContainText('Lord of Virulence')
  const unit = page.locator('[data-unit="Lord of Virulence"]')
  await unit.getByRole('button', { name: 'Lord of Virulence', exact: true }).click()
  const loadout = page.locator('[data-pane="loadout"]')
  await expect(loadout).toBeVisible()
  await expect(page.locator('[data-slot="unit-profile"]')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Open full datasheet in a new tab' })).toBeVisible()
  await expect(page.locator('pre')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Unit actions/ })).toHaveCount(0)

  await page.goBack()
  await expect(page).toHaveURL(rosterUrl)
  await expect(loadout).toBeHidden()
  await expect(unit).toBeVisible()

  await expect(page.getByRole('button', { name: 'Back to battle' })).toHaveCount(0)
  await page.goBack()
  await expect(page).toHaveURL(`/battles/${token}`)
  await expect(page.getByRole('heading', { name: 'Set up the battle' })).toBeVisible()
})
