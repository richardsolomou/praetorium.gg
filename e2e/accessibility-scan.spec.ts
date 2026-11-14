import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Page } from './test'
import { addUnit, createRoster, practiceBattle, signUp, startBattle, uniqueName } from './account'

/**
 * Fails on the serious and critical WCAG A and AA violations axe finds on the page as it stands.
 * Lesser findings and rules outside those levels are judged by eye.
 */
async function expectNoSeriousViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
  const serious = violations
    .filter(({ impact }) => impact === 'serious' || impact === 'critical')
    .map(({ id, help, nodes }) => ({ id, help, nodes: nodes.map(({ html }) => html) }))
  expect(serious).toEqual([])
}

test('home has no serious accessibility violations', async ({ page }) => {
  await page.goto('/')
  await expectNoSeriousViolations(page)
})

test('the roster builder has no serious accessibility violations', async ({ page }) => {
  await signUp(page, 'Alice')
  await createRoster(page, { faction: 'Necrons', detachment: /Awakened Dynasty/ })
  await addUnit(page, 'Necron Warriors')
  await expectNoSeriousViolations(page)
})

test('a practice battle has no serious accessibility violations', async ({ page }) => {
  await signUp(page, 'Alice')
  const roster = await createRoster(page, { faction: 'Necrons', detachment: /Awakened Dynasty/ })
  await practiceBattle(page, roster)
  await expectNoSeriousViolations(page)
  await startBattle(page)
  await expect(page.getByRole('button', { name: 'End the command phase' })).toBeVisible()
  await expectNoSeriousViolations(page)
})

test('a datasheet has no serious accessibility violations', async ({ page }) => {
  await page.goto('/factions/space-marines/datasheets/judiciar')
  await expect(page.getByRole('button', { name: 'Fights First', exact: true })).toBeVisible()
  await expectNoSeriousViolations(page)
})

test('a tournament has no serious accessibility violations', async ({ page }) => {
  await signUp(page, 'Alice')
  await page.goto('/tournaments')
  const dialog = page.getByRole('dialog', { name: 'New tournament' })
  await expect(async () => {
    await page.getByRole('button', { name: 'New tournament' }).click()
    await expect(dialog).toBeVisible({ timeout: 1_000 })
  }).toPass({ timeout: 10_000 })
  await dialog.getByLabel('Name').fill(uniqueName('Open'))
  await dialog.getByRole('button', { name: 'Create tournament' }).click()
  await expect(page.locator('[data-entry-status]')).toBeVisible()
  await expectNoSeriousViolations(page)
})
