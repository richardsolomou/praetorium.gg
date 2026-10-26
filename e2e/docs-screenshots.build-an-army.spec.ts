import { expect, test } from './test'
import { signUp, waitForRosterSave, addUnit, chooseFaction, visitorSetup } from './account'
import { capture, docsScreenshots } from './docsScreenshots'

docsScreenshots()

test('build an army screenshots', async ({ page }) => {
  await signUp(page, 'Docs player')
  const setup = await visitorSetup(page)
  await chooseFaction(setup, 'Space Marines')
  await setup.getByRole('button', { name: /^Select Gladius Task Force$/ }).click()
  const dispositions = setup.getByRole('group', { name: 'Force disposition' })
  await dispositions.getByRole('button').first().click()
  await capture('build-an-army-setup', setup, dispositions)

  await setup.getByRole('button', { name: 'Create roster' }).click()
  await page.waitForURL(/\/rosters\/[^/]+$/)
  await waitForRosterSave(page, () => page.getByLabel('List name').fill('Gladius strike force'), 'Gladius strike force')

  const picker = page.getByLabel('Add a unit')
  if (!(await picker.isVisible())) await page.getByRole('button', { name: 'Add units', exact: true }).click()
  await expect(picker).toBeVisible()
  await addUnit(page, 'Intercessor Squad')
  await addUnit(page, 'Captain')
  await addUnit(page, 'Ancient')
  await page.getByLabel('Add a unit').fill('')
  await page.setViewportSize({ width: 1280, height: 620 })
  const pickerPane = page.locator('div[data-onboarding="roster-picker"]')
  const filters = pickerPane.locator('div.flex-wrap').filter({ has: page.getByRole('button', { name: 'Points fit' }) })
  await capture('build-an-army-picker', pickerPane, filters)
  await pickerPane.getByRole('button', { name: 'Format restrictions' }).click()
  await capture('build-an-army-format-restrictions', pickerPane, page.getByRole('menuitemcheckbox', { name: /Detachment points/ }))
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await expect(pickerPane).toBeHidden()
  await page.setViewportSize({ width: 1280, height: 900 })

  const loadout = page.locator('aside[data-pane="loadout"]')
  await page.locator('[data-unit="Intercessor Squad"]').getByRole('button', { name: 'Intercessor Squad', exact: true }).click()
  await expect(page.getByLabel('Intercessor Squad models')).toHaveText('5')
  await page.setViewportSize({ width: 1280, height: 560 })
  await capture('build-an-army-loadout', loadout, loadout.locator('[data-pane-actions]'))
  await page.setViewportSize({ width: 1280, height: 900 })

  const list = page.locator('[data-onboarding="roster-list"]')
  await page.locator('[data-unit="Ancient"]').getByRole('button', { name: 'Attach Ancient to unit' }).click()
  await capture('build-an-army-attach', list, page.getByRole('menu'))
  await page.keyboard.press('Escape')

  await page.setViewportSize({ width: 760, height: 620 })
  await loadout.getByRole('button', { name: 'Back to roster', exact: true }).click()
  await expect(loadout).toBeHidden()
  const footer = page.locator('footer').filter({ hasText: 'must be attached to a Bodyguard unit' })
  await capture('build-an-army-validation', footer, footer.locator('ul'))

  await page.getByRole('button', { name: 'Roster actions', exact: true }).click()
  await capture('build-an-army-roster-menu', page.locator('main'), page.getByRole('menuitem', { name: 'Edit roster setup', exact: true }))
})
