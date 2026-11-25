import { expect, test, type Page } from './test'
import { addUnit, chooseRosterAction, createRoster, expectNoPageOverflow, PHONE, signUp } from './account'

/** Grading simulates every unit against benchmark lists, which on a busy runner outlasts the usual wait. */
async function openGrades(page: Page) {
  await chooseRosterAction(page, 'Grade this roster')
  const dialog = page.getByRole('dialog', { name: 'Roster grades', exact: true })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('status', { name: 'Grading this roster' })).toBeHidden({ timeout: 60_000 })
  return dialog
}

test('grades a mixed model unit using its combined wounds', async ({ page }) => {
  await signUp(page, 'Mixed model grades')
  await createRoster(page, {
    faction: 'Chaos Space Marines',
    detachment: /Creations of Bile/,
    name: 'Mixed model grades',
    size: /King of the Colosseum/,
  })
  await addUnit(page, 'Accursed Cultists')
  const dialog = await openGrades(page)
  await expect(dialog.locator('[data-grade-row="survive"]')).toContainText("takes 43% of a unit's wounds")
  await expect(dialog).toContainText('Nearby units’ auras, returning models and stratagems are not included.')
  await page.screenshot({ path: test.info().outputPath('mixed-unit-grades-desktop.png') })
  await page.setViewportSize(PHONE)
  await expectNoPageOverflow(page)
  await page.screenshot({ path: test.info().outputPath('mixed-unit-grades-phone.png') })
})
