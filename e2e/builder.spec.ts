import { expect, type Page, test } from '@playwright/test'

/**
 * The four things a player coming from another builder reaches for: squad size where
 * the roster is, the filters that narrow a book down to today's real options, and
 * characters standing with the units they lead.
 */
async function openBuilder(page: Page) {
  await page.goto('/')
  await page.getByLabel('Your name').fill('Richard')
  await page.getByRole('button', { name: 'Open a battle' }).click()
  await expect(page.getByLabel('Send this link to your opponent')).toHaveValue(/\/b\//)
  await page.getByRole('button', { name: 'Build from the catalogue' }).click()
  await page.getByRole('combobox', { name: 'Faction' }).click()
  await page.getByRole('option', { name: 'Xenos - Necrons' }).click()
  await page.getByRole('button', { name: 'Add detachment' }).click()
  await page.getByRole('menuitem', { name: /Awakened Dynasty/ }).click()
}

async function add(page: Page, name: string) {
  await page.getByLabel('Add a unit').fill(name)
  await page
    .getByRole('button', { name: `Add ${name}`, exact: true })
    .first()
    .click()
}

test('a supplement imports its shared detachment group', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Your name').fill('Richard')
  await page.getByRole('button', { name: 'Open a battle' }).click()
  await expect(page.getByLabel('Send this link to your opponent')).toHaveValue(/\/b\//)
  await page.getByRole('button', { name: 'Build from the catalogue' }).click()
  await page.getByRole('combobox', { name: 'Faction' }).click()
  await page.getByRole('option', { name: 'Imperium - Adeptus Astartes - Black Templars' }).click()
  await page.getByRole('button', { name: 'Add detachment' }).click()
  await page.getByRole('menuitem', { name: /Companions of Vehemence/ }).click()
  await add(page, 'Crusader Squad')
  await expect(page.locator('[data-unit="Crusader Squad"]')).toBeVisible()

  await page.getByRole('combobox', { name: 'Faction' }).click()
  await page.getByRole('option', { name: 'Imperium - Adeptus Astartes - Imperial Fists' }).click()
  await page.getByRole('button', { name: 'Add detachment' }).click()
  await expect(page.getByRole('menuitem', { name: /Emperor's Shield/ })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: /Imperialis Fleet/ })).toHaveCount(0)
})

test('detachment combinations follow the 11th edition allowance', async ({ page }) => {
  await openBuilder(page)
  await add(page, 'Immortals')

  await page.getByRole('combobox', { name: 'Battle size' }).click()
  await page.getByRole('option', { name: /Incursion/ }).click()
  await expect(page.getByText('3 DP detachment')).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await page.getByRole('button', { name: 'Remove Awakened Dynasty' }).click()
  await page.getByRole('button', { name: 'Add detachment' }).click()
  await page.getByRole('menuitem', { name: /Cryptek Conclave/ }).click()
  await page.getByRole('button', { name: 'Add detachment' }).click()
  await page.getByRole('menuitem', { name: /Hand of the Dynasty/ }).click()
  await expect(page.getByRole('alert')).toContainText('This combination costs 3 DP')
  await expect(page.getByRole('button', { name: 'Invalid detachments' })).toBeDisabled()
  await expect(page.getByText(/Detachment: allows at most 1/)).toBeHidden()
  await page.screenshot({ path: 'test-results/detachment-points.png', fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  const firstDetachment = page.getByRole('button', { name: 'Remove Cryptek Conclave' })
  await expect(firstDetachment).toBeVisible()
  await expect(page.getByRole('alert')).toBeVisible()
  const bounds = await firstDetachment.boundingBox()
  expect(bounds && bounds.x + bounds.width).toBeLessThanOrEqual(390)
  const steps = await page.getByRole('navigation', { name: 'Battle setup steps' }).getByRole('button').all()
  const stepBounds = await Promise.all(steps.map((step) => step.boundingBox()))
  for (let index = 0; index < stepBounds.length - 1; index += 1) {
    const current = stepBounds[index]
    const next = stepBounds[index + 1]
    expect(current && next && current.x + current.width <= next.x).toBe(true)
  }
  await page.screenshot({ path: 'test-results/detachment-points-phone.png', fullPage: true })
  await expect(page.getByRole('status')).toContainText('Saved automatically')

  await page.goto('/')
  await page.getByRole('button', { name: 'Open a battle' }).click()
  await page.getByRole('button', { name: 'Build from the catalogue' }).click()
  await page.getByRole('button', { name: 'Necrons — Cryptek Conclave', exact: true }).click()
  await expect(page.getByText('Cryptek Conclave', { exact: true })).toBeVisible()
  await expect(page.getByRole('alert')).toContainText('This combination costs 3 DP')
})

test('an allied force can be added from its own catalogue', async ({ page }) => {
  await openBuilder(page)
  await page.getByRole('combobox', { name: 'Force' }).click()
  await page.getByRole('option', { name: 'Chaos - Death Guard' }).click()
  await add(page, 'Plague Marines')

  const allied = page.locator('[data-unit="Plague Marines"]')
  await expect(allied).toContainText('Allied force · Chaos - Death Guard')
  await expect(page.getByText('allied-force eligibility is not present in the synced catalogue data')).toBeVisible()
  await expect(page.getByRole('status')).toContainText('Saved automatically')
  await page.screenshot({ path: 'test-results/allied-force.png', fullPage: true })
})

test('a squad grows from the roster itself', async ({ page }) => {
  await openBuilder(page)
  await add(page, 'Immortals')

  const total = page.locator('[data-stat="points"]')
  await expect(total).toHaveText('70/2000')
  // No pane opened, no unit selected: the stepper is on the card.
  await page.getByRole('button', { name: 'More models in Immortals' }).click()
  await expect(page.getByLabel('Immortals models')).toHaveText('6')
  await expect(total).not.toHaveText('70/2000')
  // And the wargear lines follow the models carrying it.
  await expect(page.getByText('6x Gauss blaster')).toBeVisible()
})

test('a unit duplicates with its configured model count', async ({ page }) => {
  await openBuilder(page)
  await add(page, 'Immortals')
  await page.getByRole('button', { name: 'More models in Immortals' }).click()
  await page.getByLabel('Unit actions for Immortals').click()
  await page.screenshot({ path: 'test-results/unit-actions.png', fullPage: true })
  await page.getByRole('menuitem', { name: 'Duplicate unit' }).click()

  await expect(page.locator('[data-unit="Immortals"]')).toHaveCount(2)
  await expect(page.getByLabel('Immortals models')).toHaveText(['6', '6'])
})

test('the filters narrow the book to what is worth taking', async ({ page }) => {
  await openBuilder(page)

  // Owned: nothing is, until something is said to be.
  await page.getByRole('button', { name: 'Owned' }).click()
  await expect(page.getByText('Everything is filtered out.')).toBeVisible()
  await page.getByRole('button', { name: 'Owned' }).click()

  await page.getByLabel('Add a unit').fill('Lychguard')
  const lychguard = page.getByRole('button', { name: 'Add Lychguard', exact: true }).first()
  await expect(lychguard).toBeVisible()
  await page.getByRole('button', { name: /Lychguard to your collection/ }).click()
  await page.getByRole('button', { name: 'Owned' }).click()
  await expect(lychguard).toBeVisible()
  await page.getByRole('button', { name: 'Owned' }).click()

  // Unit limit: three Lychguard is as many as the data allows.
  // One at a time on purpose: each click re-prices the list, and the next click's
  // effect is only meaningful once the previous one has landed.
  // eslint-disable-next-line no-await-in-loop
  for (let taken = 0; taken < 3; taken++) await lychguard.click()
  await expect(page.getByText('3/3 in roster')).toBeVisible()
  await page.locator('[data-unit="Lychguard"]').first().getByLabel('Unit actions for Lychguard').click()
  await expect(page.getByRole('menuitem', { name: 'Remove from collection' })).toBeVisible()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Unit limit' }).click()
  await expect(lychguard).toBeHidden()

  // Points fit hides what will not go in the room that is left, and only that.
  await page.getByRole('button', { name: 'Unit limit' }).click()
  await page.getByRole('combobox', { name: 'Battle size' }).click()
  await page.getByRole('option', { name: /Incursion/ }).click()
  // eslint-disable-next-line no-await-in-loop
  for (let taken = 0; taken < 6; taken++) await lychguard.click()
  await expect(page.locator('[data-stat="points"]')).toHaveText('720/1000')

  await page.getByLabel('Add a unit').fill('Deceiver')
  const ctan = page.getByRole('button', { name: "Add C'tan Shard of the Deceiver", exact: true })
  await expect(ctan).toBeVisible()
  await page.getByRole('button', { name: 'Points fit' }).click()
  // 330 points will not fit in the 280 that are left; 80 still will.
  await expect(ctan).toBeHidden()
  await page.getByLabel('Add a unit').fill('Lychguard')
  await expect(lychguard).toBeVisible()
})

test('a character joins the unit it leads, and both cards say so', async ({ page }) => {
  await openBuilder(page)
  await add(page, 'Overlord')
  await add(page, 'Plasmancer')
  await add(page, 'Immortals')

  // Each character offers the units its own rules name, and only those.
  const overlord = page.locator('[data-unit="Overlord"]')
  await overlord.getByRole('button', { name: 'Immortals', exact: true }).click()
  await expect(page.getByText('Leading')).toBeVisible()

  const plasmancer = page.locator('[data-unit="Plasmancer"]')
  await plasmancer.getByRole('button', { name: 'Immortals', exact: true }).click()

  // The unit states both, from its own side.
  await expect(page.getByText('Leader', { exact: true })).toBeVisible()
  await expect(page.getByText('Support', { exact: true })).toBeVisible()
  await expect(page.getByText('Supporting')).toBeVisible()

  // Detaching from the unit's side leaves the character in the list, alone.
  await page
    .locator('[data-unit="Immortals"]')
    .getByText('Leader', { exact: true })
    .locator('..')
    .getByRole('button', { name: 'Detach' })
    .click()
  await expect(page.getByText('Leading')).toBeHidden()
  await expect(page.locator('[data-unit="Overlord"]')).toBeVisible()
})

test('a unit that leads nothing is offered no one to lead', async ({ page }) => {
  await openBuilder(page)
  await add(page, 'Immortals')
  // Immortals lead nobody, so no attachment row is offered on their card.
  await expect(page.getByText('Leading')).toBeHidden()
  await expect(page.getByText('Support', { exact: true })).toBeHidden()
})

test('a character can be marked as the warlord from its card', async ({ page }) => {
  await openBuilder(page)
  await add(page, 'Overlord')
  const warlord = page.getByRole('button', { name: 'Make Overlord Warlord' })
  await warlord.click()
  await expect(page.getByRole('button', { name: 'Remove Overlord Warlord' })).toHaveAttribute('aria-pressed', 'true')
  await page
    .locator('[data-unit="Overlord"]')
    .getByRole('button', { name: /^Overlord/ })
    .click()
  const pane = page.locator('aside[aria-label="Loadout"]')
  await expect(pane.getByText('InSv')).toBeVisible()
  await expect(pane.getByText('4+')).toBeVisible()
  await expect(pane.getByText('Range').first()).toBeVisible()
})

test('a squad divides its weapons between two options', async ({ page }) => {
  await openBuilder(page)
  await add(page, 'Immortals')

  // Ten bodies, so there are ten guns to divide.
  // eslint-disable-next-line no-await-in-loop
  for (let grown = 0; grown < 5; grown++) await page.getByRole('button', { name: 'More models in Immortals' }).click()
  await expect(page.getByText('10x Gauss blaster')).toBeVisible()

  await page
    .locator('[data-unit="Immortals"]')
    .getByRole('button', { name: /^Immortals/ })
    .click()
  const pane = page.locator('aside[aria-label="Loadout"]')
  await expect(pane.getByText('Wargear options')).toBeVisible()
  await expect(pane.getByText('Weapons').first()).toBeVisible()
  await expect(pane.getByText('BS').first()).toBeVisible()
  await expect(pane.getByText('10/10')).toBeVisible()

  // The group is always full, so taking a carbine takes a blaster off a model.
  // eslint-disable-next-line no-await-in-loop
  for (let swapped = 0; swapped < 3; swapped++) await pane.getByRole('button', { name: 'More Tesla carbine' }).click()
  await expect(page.getByLabel('Tesla carbine count')).toHaveText('3')
  await expect(page.getByLabel('Gauss blaster count')).toHaveText('7')

  // The card reads as the datasheet would print it, and the squad is still legal.
  await expect(page.getByText('7x Gauss blaster')).toBeVisible()
  await expect(page.getByText('3x Tesla carbine')).toBeVisible()
  await expect(page.getByText('Within the points limit')).toBeAttached()
  await page.screenshot({ path: 'test-results/loadout.png', fullPage: true })
})
