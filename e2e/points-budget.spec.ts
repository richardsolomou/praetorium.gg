import { expect, test, type Page } from './test'
import { attachRoster, createBattle, PRACTICE_OPPONENT, setupStep, signUp, uniqueName, waitForRosterSave } from './account'
import { productOperator, withAuthSql } from './storage'
import { expectNoHorizontalOverflow } from './builder.harness'

async function savedArmy(page: Page, name: string) {
  const account = await signUp(page, uniqueName('Points budget'))
  const operator = await productOperator()
  const source = (await operator.roster('preview-necrons-cursed-skyshroud'))!
  const user = (await withAuthSql((database) => database.prepare('SELECT id FROM user WHERE email = ?').get(account.email))) as {
    id: string
  }
  const id = crypto.randomUUID()
  await operator.saveRoster({ ...source, id, userId: user.id, name, automaticName: false, visibility: 'private', now: Date.now() })
  await page.goto(`/rosters/${id}`)
  await expect(page.getByLabel('List name')).toHaveValue(name)
  return { id, operator }
}

async function openSetup(page: Page) {
  await page.getByRole('button', { name: 'Roster actions' }).click()
  await page.getByRole('menuitem', { name: 'Edit roster setup' }).click()
  return page.getByRole('dialog', { name: 'Edit roster setup' })
}

async function setBudget(page: Page, budget: string) {
  const setup = await openSetup(page)
  await setup.getByLabel('Custom points budget').fill(budget)
  await setup.getByRole('button', { name: 'Review changes' }).click()
  const review = page.getByRole('dialog', { name: 'Review roster changes' })
  await expect(review.getByLabel('Roster change preview')).toBeVisible()
  return review
}

const desktop = { width: 1440, height: 900 }
const phone = { width: 390, height: 900 }

test('a custom points budget is validated, enforced, saved and fielded', async ({ page }) => {
  test.setTimeout(180_000)
  await page.setViewportSize(desktop)
  const name = 'Budget army'
  const { id, operator } = await savedArmy(page, name)
  const points = page.locator('[data-stat="points"]')
  await expect(points).toContainText('/2000')

  const setup = await openSetup(page)
  const budget = setup.getByLabel('Custom points budget')
  for (const viewport of [desktop, phone]) {
    await page.setViewportSize(viewport)
    await expect(setup).toContainText('Strike Force still sets detachment points, enhancement and unit limits.')
    for (const [typed, problem] of [
      ['abc', 'Enter a whole number of points.'],
      ['1500.5', 'Enter a whole number of points.'],
      ['499', 'Choose between 500 and 10,000 points.'],
      ['10001', 'Choose between 500 and 10,000 points.'],
    ]) {
      await budget.fill(typed)
      await expect(setup.getByRole('alert').filter({ hasText: problem })).toBeVisible()
      await expect(setup.getByRole('button', { name: 'Review changes' })).toBeDisabled()
    }
    await budget.fill('1000')
    await expect(setup.getByRole('alert')).toHaveCount(0)
    await setup.screenshot({ path: test.info().outputPath(`budget-setup-${viewport.width}.png`) })
  }
  await page.setViewportSize(desktop)
  await setup.getByRole('button', { name: 'Cancel', exact: true }).click()

  let review = await setBudget(page, '1000')
  for (const viewport of [desktop, phone]) {
    await page.setViewportSize(viewport)
    await expect(review.getByRole('region', { name: 'Setup changes' })).not.toContainText('Battle size')
    await expect(review).toContainText('2000 → 1000')
    await expect(review).toContainText('Over budget by')
    await expect(review).not.toContainText('Removed:')
    await expect(review).not.toContainText('may cost at most')
    await expectNoHorizontalOverflow(review)
    await review.screenshot({ path: test.info().outputPath(`budget-review-${viewport.width}.png`) })
  }
  await page.setViewportSize(desktop)
  await waitForRosterSave(page, () => review.getByRole('button', { name: 'Confirm changes' }).click())
  for (const viewport of [desktop, phone]) {
    await page.setViewportSize(viewport)
    await expect(points).toContainText('/1000')
    await expect(page.getByText('Over the points limit', { exact: true })).toBeAttached()
    await expect(page.locator('[data-slot="roster-meta"]')).toContainText('Strike Force · 1000-point budget')
    await page.screenshot({ path: test.info().outputPath(`budget-over-${viewport.width}.png`) })
  }
  await page.setViewportSize(desktop)

  await page.reload()
  for (const viewport of [desktop, phone]) {
    await page.setViewportSize(viewport)
    await expect(points).toContainText('/1000')
  }
  await page.setViewportSize(desktop)
  expect(await operator.roster(id)).toMatchObject({ limit: 2000, pointsBudget: 1000 })

  // A client built before custom budgets saves without one and keeps the stored budget.
  const { pointsBudget: _unstated, ...stale } = (await operator.roster(id))!
  await operator.saveRoster({ ...stale, name: `${name} renamed`, automaticName: false, now: Date.now() })
  expect(await operator.roster(id)).toMatchObject({ name: `${name} renamed`, pointsBudget: 1000 })
  await page.reload()
  review = await setBudget(page, '2500')
  for (const viewport of [desktop, phone]) {
    await page.setViewportSize(viewport)
    await expect(page.getByLabel('List name')).toHaveValue(`${name} renamed`)
    await expect(review).toContainText('1000 → 2500')
    await expect(review).toContainText('No reported legality problems.')
  }
  await page.setViewportSize(desktop)
  await waitForRosterSave(page, () => review.getByRole('button', { name: 'Confirm changes' }).click())
  for (const viewport of [desktop, phone]) {
    await page.setViewportSize(viewport)
    await expect(points).toContainText('/2500')
    await expect(page.getByText('Within the points limit', { exact: true })).toBeAttached()
  }
  await page.setViewportSize(desktop)

  await page.goto('/rosters')
  for (const viewport of [desktop, phone]) {
    await page.setViewportSize(viewport)
    await expect(page.locator(`[data-roster="${name} renamed"]`)).toContainText('Strike Force · 2500-point budget')
    await page.screenshot({ path: test.info().outputPath(`budget-library-${viewport.width}.png`) })
  }
  await page.setViewportSize(desktop)

  await createBattle(page, { practice: true })
  await attachRoster(page, `${name} renamed`)
  await attachRoster(page, `${name} renamed`, { forPlayer: PRACTICE_OPPONENT })
  await setupStep(page, 'Armies')
  const armies = page.getByRole('region', { name: 'Armies' })
  for (const viewport of [desktop, phone]) {
    await page.setViewportSize(viewport)
    await expect(armies).toContainText('Strike Force · 2500-point budget')
    await expect(armies.getByText(/of 2500 points$/).first()).toBeVisible()
    await expect(page.locator('nav[aria-label="Setup sections"] button[data-step="Armies"]')).toHaveAttribute('data-complete', 'true')
    await expectNoHorizontalOverflow(armies)
    await armies.screenshot({ path: test.info().outputPath(`budget-battle-${viewport.width}.png`) })
  }
})
