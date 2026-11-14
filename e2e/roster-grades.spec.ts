import { expect, test, type Page } from './test'
import { addUnit, chooseRosterAction, createRoster, expectNoPageOverflow, PHONE, signUp } from './account'
import { attach } from './builder.harness'

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
  await expect(dialog.locator('[data-grade-row="survive"]')).toContainText("takes 57% of a unit's wounds")
  await expect(dialog).toContainText('Nearby units’ auras, returning models and stratagems are not included.')
  await page.screenshot({ path: test.info().outputPath('mixed-unit-grades-desktop.png') })
  await page.setViewportSize(PHONE)
  await expectNoPageOverflow(page)
  await page.screenshot({ path: test.info().outputPath('mixed-unit-grades-phone.png') })
})

test('shows shooting and kill triggered unit generation without scoring it', async ({ page }) => {
  await signUp(page, 'Generated unit grades')
  await createRoster(page, {
    faction: 'Tyranids',
    detachment: /Invasion Fleet/,
    name: 'Generated unit grades',
    size: /King of the Colosseum/,
  })
  await addUnit(page, 'Biovores')
  await addUnit(page, 'Parasite of Mortrex')
  const dialog = await openGrades(page)
  const generation = dialog.locator('[data-grade-row="generation"]')
  await expect(generation).toContainText('SPORE MINES (uses shooting; once per turn across your army)')
  await expect(generation).toContainText('Ripper Swarms (requires a qualifying kill)')
  await expect(generation).toContainText('not scored')
  await generation.scrollIntoViewIfNeeded()
  await page.screenshot({ path: test.info().outputPath('generated-unit-grades-desktop.png') })
  await page.setViewportSize(PHONE)
  await generation.scrollIntoViewIfNeeded()
  await expectNoPageOverflow(page)
  await page.screenshot({ path: test.info().outputPath('generated-unit-grades-phone.png') })
})

test('updates leader weapon grants when a Prime joins and leaves Hormagaunts', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await signUp(page, 'Attached weapon grants')
  await createRoster(page, { faction: 'Tyranids', detachment: /Invasion Fleet/, size: /King of the Colosseum/ })
  await addUnit(page, 'Tyranid Prime with Lash Whip')
  await addUnit(page, 'Hormagaunts')
  const hormagaunts = page.locator('[data-unit="Hormagaunts"]')
  await hormagaunts.getByRole('button', { name: 'Hormagaunts', exact: true }).click()
  const weapon = page.getByRole('heading', { name: '10× Hormagaunt talons', exact: true }).locator('..')
  await expect(weapon).toBeVisible()
  await expect(weapon).not.toContainText('Sustained Hits 1')
  await attach(page, 'Tyranid Prime with Lash Whip', 'Hormagaunts')
  await expect(weapon).toContainText('Sustained Hits 1')
  await weapon.screenshot({ path: test.info().outputPath('prime-grants-sustained-hits.png') })
  const dialog = await openGrades(page)
  const movement = dialog.locator('[data-grade-row="movement"]')
  await expect(movement).toContainText('Advance and charge')
  await expect(dialog).toContainText('Charge & deployment')
  await movement.scrollIntoViewIfNeeded()
  await page.screenshot({ path: test.info().outputPath('movement-tools-desktop.png') })
  await page.setViewportSize(PHONE)
  await movement.scrollIntoViewIfNeeded()
  await expectNoPageOverflow(page)
  await page.screenshot({ path: test.info().outputPath('movement-tools-phone.png') })
  await dialog.getByRole('button', { name: 'Close', exact: true }).click()
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.getByRole('button', { name: 'Unit actions for Tyranid Prime with Lash Whip', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Detach from unit', exact: true }).click()
  await expect(weapon).not.toContainText('Sustained Hits 1')
})
