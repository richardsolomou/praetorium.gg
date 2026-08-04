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
  await page.getByRole('combobox', { name: 'Detachment' }).click()
  await page.getByRole('option', { name: /Awakened Dynasty/ }).click()
}

async function add(page: Page, name: string) {
  await page.getByLabel('Add a unit').fill(name)
  await page
    .getByRole('button', { name: `Add ${name}`, exact: true })
    .first()
    .click()
}

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
  await page.getByRole('button', { name: 'Detach' }).first().click()
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
