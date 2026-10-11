import { expect, test } from '@playwright/test'
import { createRoster, signUp, waitForRosterSave } from './account'
import { add, attach, expectNoHorizontalOverflow, openBuilder, shot } from './builder.harness'

test.use({ hasTouch: true })

for (const width of [1600, 390]) {
  test(`relationship discovery explains current limits and links missions at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    expect(await page.evaluate(() => window.innerWidth)).toBe(width)
    await openBuilder(page)
    await waitForRosterSave(page, () => add(page, 'Immortals'))
    await page.getByLabel('Add a unit').clear()
    const picker = page.locator('div[data-onboarding="roster-picker"]')
    const relationships = picker.getByRole('combobox', { name: 'Unit relationships' })
    if (width < 500) {
      await relationships.tap()
      await page.getByRole('option', { name: 'Leaders for Immortals (1)', exact: true }).tap()
    } else {
      await relationships.focus()
      await relationships.press('Enter')
      await page.getByRole('option', { name: 'Leaders for Immortals (1)', exact: true }).press('Enter')
    }
    const imotekh = picker.locator('[data-picker-unit="Imotekh the Stormlord"]')
    await expect(imotekh).toContainText('Compatible leader for Immortals')
    await expect(picker.locator('[data-picker-unit="Plasmancer"]')).toHaveCount(0)
    await waitForRosterSave(page, () => imotekh.getByRole('button', { name: 'Add Imotekh the Stormlord', exact: true }).click())
    await expect(imotekh).toContainText('Limit reached: 1 of 1 permitted copies in the roster.')
    await expect(imotekh.getByRole('button', { name: 'Add Imotekh the Stormlord', exact: true })).toBeDisabled()
    if (width < 500) await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).tap()
    await waitForRosterSave(page, () => attach(page, 'Imotekh the Stormlord', 'Immortals'))
    if (width < 500) {
      await page.getByRole('button', { name: 'Add units', exact: true }).tap()
      await relationships.tap()
      await page.getByRole('option', { name: 'Leaders for Immortals (1)', exact: true }).tap()
    }
    await expect(imotekh).toContainText('Leader limit reached on Immortals.')
    await expect(imotekh).not.toContainText('Can be added separately.')
    const otherLeader = picker.locator('[data-picker-unit="Overlord"]')
    await expect(otherLeader).toContainText('Leader limit reached on Immortals. Can be added separately.')
    await expect(otherLeader.getByRole('button', { name: 'Add Overlord', exact: true })).toBeEnabled()
    await expectNoHorizontalOverflow(picker)
    await expectNoHorizontalOverflow(page.locator('html'))
    await shot(picker, `test-results/builder-guidance-leaders-${width}.png`)

    await relationships.click()
    await page.getByRole('option', { name: 'Bodyguards for Imotekh the Stormlord (2)', exact: true }).click()
    await expect(picker.locator('[data-picker-unit="Immortals"]')).toContainText(
      'Already attached; detach before choosing another bodyguard.',
    )
    await shot(picker, `test-results/builder-guidance-bodyguards-${width}.png`)
    await relationships.click()
    await page.getByRole('option', { name: 'All units', exact: true }).click()
    await picker.locator('summary').filter({ hasText: 'Mission matchups' }).click()
    const matchup = picker.getByRole('link').filter({ hasText: /^vs / }).first()
    const href = await matchup.getAttribute('href')
    expect(href).toMatch(/^\/missions\/[^/]+\/matchups\/take-and-hold\//)
    await shot(picker, `test-results/builder-guidance-missions-${width}.png`)
    const rosterURL = page.url()
    await matchup.click()
    await expect(page.getByRole('heading', { name: 'Primary missions', exact: true })).toBeVisible()
    await page.goto(rosterURL)
    await expect(page.locator('[data-unit="Imotekh the Stormlord"]')).toHaveCount(1)
    await expect(page.locator('[data-unit="Imotekh the Stormlord"]')).toContainText('Immortals')
  })
}

test('a relationship with no matches remains distinct from structured search', async ({ page }) => {
  await openBuilder(page)
  await add(page, "C'tan Shard of the Deceiver")
  await page.getByLabel('Add a unit').clear()
  await page.getByRole('combobox', { name: 'Unit relationships' }).click()
  await page.getByRole('option', { name: "Leaders for C'tan Shard of the Deceiver (1)", exact: true }).click()
  await expect(page.getByText('No matching relationships in this rules version.', { exact: true })).toBeVisible()
  await page.getByRole('combobox', { name: 'Unit relationships' }).click()
  await page.getByRole('option', { name: 'All units', exact: true }).click()
  await page.getByLabel('Add a unit').fill('Leader')
  await expect(page.locator('[data-picker-unit="Imotekh the Stormlord"]')).toBeVisible()
})

test('budget guidance explains the base cost while preserving an over-budget saved choice', async ({ page }) => {
  await signUp(page, 'Richard')
  await createRoster(page, { faction: 'Necrons', detachment: /Awakened Dynasty/, size: /Incursion/ })
  await waitForRosterSave(page, () => add(page, "C'tan Shard of the Nightbringer"))
  await waitForRosterSave(page, () => add(page, "C'tan Shard of the Void Dragon"))
  await page.getByLabel('Add a unit').fill('Monolith')
  const monolith = page.locator('[data-picker-unit="Monolith"]')
  await expect(monolith).toContainText('125 pts over the remaining budget at base cost.')
  await expect(monolith.getByRole('button', { name: 'Add Monolith', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Points fit', exact: true }).click()
  await expect(monolith).toHaveCount(0)
  await page.getByRole('button', { name: 'Points fit', exact: true }).click()
  await waitForRosterSave(page, () => monolith.getByRole('button', { name: 'Add Monolith', exact: true }).click())
  await expect(page.locator('[data-stat="points"]')).toHaveText('1125/1000')
  await page.reload()
  await expect(page.locator('[data-unit="Monolith"]')).toHaveCount(1)
  await expect(page.locator('[data-stat="points"]')).toHaveText('1125/1000')
  await expect(page.getByText('Over the points limit', { exact: true }).first()).toBeAttached()
})
