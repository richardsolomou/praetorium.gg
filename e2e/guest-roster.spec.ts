import { expect, type Page, test } from '@playwright/test'
import { uniqueName } from './account'
import { add } from './builder.harness'

/** A visitor starts a Necrons list on the builder, with no account behind them. */
async function startGuestRoster(page: Page) {
  await page.goto('/rosters/new')
  await page.waitForLoadState('networkidle')
  const dialog = page.getByRole('dialog', { name: 'Create roster' })
  await dialog.getByRole('combobox', { name: 'Faction' }).click()
  await page.getByPlaceholder('Search factions…').fill('Necrons')
  await page.getByRole('option', { name: 'Necrons', exact: true }).click()
  await dialog.getByRole('button', { name: /^Select (?:Awakened Dynasty)$/ }).click()
  await dialog.getByRole('button', { name: 'Create roster' }).click()
  await expect(page.getByLabel('Add a unit')).toBeVisible()
}

/** Every save a page sends, told apart from the price by the fields only a saved list carries. */
function recordSaves(page: Page) {
  const saves: string[] = []
  page.on('request', (request) => {
    const body = request.postData()
    if (request.method() === 'POST' && body?.includes('"visibility"') && body.includes('"picks"')) saves.push(body)
  })
  return saves
}

/**
 * Trying the builder is the one thing a visitor may make here.
 *
 * The list is priced by the same server functions an account's list is, and it is
 * kept in the tab rather than anywhere else, so the only request that ever stores it
 * is the one made after the visitor has signed up.
 */
test('a visitor builds and prices a list without saving it', async ({ page }) => {
  const saves = recordSaves(page)
  await startGuestRoster(page)
  await add(page, 'Necron Warriors')

  // Priced by the server, whatever the current data says the unit costs.
  await expect(page.locator('[data-stat="points"]')).not.toHaveText(/^0\//)
  await expect(page.getByRole('button', { name: /to your collection$/ })).toHaveCount(0)
  expect(saves).toEqual([])
})

test("a visitor's list survives a reload of its tab", async ({ page }) => {
  await startGuestRoster(page)
  await add(page, 'Necron Warriors')
  // Edits are kept once they settle, so the reload waits for the stored draft to hold the unit.
  await expect
    .poll(() => page.evaluate(() => sessionStorage.getItem('praetorium.workspace-state:/rosters/new:guest-draft') ?? ''))
    .toContain('"picks":[{')

  await page.reload()

  await expect(page.locator('[data-unit="Necron Warriors"]').first()).toBeVisible()
})

test('signing up keeps the list a visitor built', async ({ page }) => {
  const saves = recordSaves(page)
  await startGuestRoster(page)
  await add(page, 'Necron Warriors')
  await expect(page.locator('[data-stat="points"]')).not.toHaveText(/^0\//)

  await page.getByRole('button', { name: 'Sign up to save' }).click()
  await page.waitForURL(/\/sign-in\?next=%2Frosters%2Fnew&join=true$/)
  await page.waitForLoadState('networkidle')
  await page.getByLabel('Your name').fill(uniqueName('Visitor'))
  await page.getByLabel('Email').fill(`visitor-${crypto.randomUUID()}@example.test`)
  await page.getByLabel('Password').fill('a-long-enough-password')
  await page.getByRole('button', { name: 'Create the account' }).click()

  await page.waitForURL(/\/rosters\/(?!new$)[^/]+$/)
  await expect(page.locator('[data-unit="Necron Warriors"]').first()).toBeVisible()
  await page.goto('/rosters')
  await expect(page.locator('[data-roster]')).toHaveCount(1)
  expect(saves).toHaveLength(1)
})
