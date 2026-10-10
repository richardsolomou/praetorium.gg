import { expect, type Page, test } from '@playwright/test'
import { signUp, uniqueName } from './account'
import { add } from './builder.harness'

/** A visitor starts a Necrons list on the builder, with no account behind them. */
async function startGuestRoster(page: Page) {
  await page.goto('/rosters')
  await page.waitForLoadState('networkidle')
  const setup = page.getByRole('region', { name: 'Create roster' })
  await setup.getByRole('combobox', { name: 'Faction' }).click()
  await page.getByPlaceholder('Search factions…').fill('Necrons')
  await page.getByRole('option', { name: 'Necrons', exact: true }).click()
  await setup.getByRole('button', { name: /^Select (?:Awakened Dynasty)$/ }).click()
  await setup.getByRole('group', { name: 'Force disposition' }).getByRole('button', { name: 'Take and Hold' }).click()
  await setup.getByRole('button', { name: 'Start building' }).click()
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
 * kept in the browser rather than anywhere else, so the only request that ever stores
 * it is the one made after the visitor has signed up.
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

const DRAFT_KEY = 'praetorium.guest-draft'

test("a visitor's list survives a reload and a new tab", async ({ page, context }) => {
  await startGuestRoster(page)
  await add(page, 'Necron Warriors')
  // Edits are kept once they settle, so the reload waits for the stored draft to hold the unit.
  await expect.poll(() => page.evaluate((key) => localStorage.getItem(key) ?? '', DRAFT_KEY)).toContain('"picks":[{')

  // The server cannot see the draft, only the cookie saying there is one, so its frame is the builder rather than the setup.
  const firstFrame = await (await page.request.get('/rosters')).text()
  expect(firstFrame).toContain('data-roster-builder')
  expect(firstFrame).not.toContain('aria-label="Create roster"')
  await page.reload()
  await expect(page.locator('[data-unit="Necron Warriors"]').first()).toBeVisible()

  const later = await context.newPage()
  await later.goto('/rosters')
  await expect(later.locator('[data-unit="Necron Warriors"]').first()).toBeVisible()
})

test("a visitor's list follows an edit made in another tab", async ({ page, context }) => {
  await startGuestRoster(page)
  await add(page, 'Necron Warriors')
  await expect.poll(() => page.evaluate((key) => localStorage.getItem(key) ?? '', DRAFT_KEY)).toContain('"picks":[{')
  const other = await context.newPage()
  await other.goto('/rosters')
  await other.waitForLoadState('networkidle')
  await add(other, 'Immortals')

  await expect(page.locator('[data-unit="Immortals"]').first()).toBeVisible()
})

test('a guest builder stays in the mobile viewport when storage refuses the draft', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/rosters')
  await page.waitForLoadState('networkidle')
  const setup = page.getByRole('region', { name: 'Create roster' })
  await setup.getByRole('combobox', { name: 'Faction' }).click()
  await page.getByPlaceholder('Search factions…').fill('Necrons')
  await page.getByRole('option', { name: 'Necrons', exact: true }).click()
  await setup.getByRole('button', { name: 'Select Awakened Dynasty' }).click()
  await setup.getByRole('group', { name: 'Force disposition' }).getByRole('button', { name: 'Take and Hold' }).click()
  await page.evaluate(() => {
    Object.defineProperty(localStorage, 'setItem', {
      value: () => {
        throw new DOMException('Storage full', 'QuotaExceededError')
      },
    })
  })
  await setup.getByRole('button', { name: 'Start building' }).click()

  await expect(page.getByRole('alert')).toContainText('This browser is not keeping the list')
  await expect(page.locator('[data-native-app-content]')).toHaveAttribute('data-immersive', 'true')
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight)).toBe(true)
  await page.screenshot({ path: 'test-results/guest-roster-mobile-unkept.png' })
})

test('signing up keeps the list a visitor built', async ({ page }) => {
  const saves = recordSaves(page)
  await startGuestRoster(page)
  await add(page, 'Necron Warriors')
  await expect(page.locator('[data-stat="points"]')).not.toHaveText(/^0\//)

  await page.getByRole('button', { name: 'Save roster' }).click()
  await page.waitForURL(/\/sign-in\?next=%2Frosters&join=true$/)
  await page.waitForLoadState('networkidle')
  await page.getByLabel('Your name').fill(uniqueName('Visitor'))
  await page.getByLabel('Email').fill(`visitor-${crypto.randomUUID()}@example.test`)
  await page.getByLabel('Password').fill('a-long-enough-password')
  await page.getByRole('button', { name: 'Create account and save roster' }).click()

  await page.waitForURL(/\/rosters\/[^/]+$/)
  await expect(page.locator('[data-unit="Necron Warriors"]').first()).toBeVisible()
  await page.goto('/rosters')
  await expect(page.locator('[data-roster]')).toHaveCount(1)
  expect(saves).toHaveLength(1)
})

test('signing in later asks before saving a list left on the device', async ({ page }) => {
  const saves = recordSaves(page)
  await startGuestRoster(page)
  await add(page, 'Necron Warriors')
  await expect.poll(() => page.evaluate((key) => localStorage.getItem(key) ?? '', DRAFT_KEY)).toContain('"picks":[{')
  await signUp(page, uniqueName('Returning'))

  await page.goto('/rosters')
  await expect(page.getByRole('heading', { name: 'Save the roster you started?' })).toBeVisible()
  expect(saves).toEqual([])
  await page.getByRole('button', { name: 'Save it' }).click()
  await page.waitForURL(/\/rosters\/[^/]+$/)
  await expect(page.locator('[data-unit="Necron Warriors"]').first()).toBeVisible()
})

test('a list left on the device can be discarded after signing in', async ({ page }) => {
  await startGuestRoster(page)
  await add(page, 'Necron Warriors')
  await expect.poll(() => page.evaluate((key) => localStorage.getItem(key) ?? '', DRAFT_KEY)).toContain('"picks":[{')
  await signUp(page, uniqueName('Returning'))

  await page.goto('/rosters')
  await page.getByRole('button', { name: 'Discard it' }).click()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'No rosters yet' })).toBeVisible()
})

test("a visitor's list for an army the data no longer holds can be started again", async ({ page }) => {
  await page.goto('/rosters')
  await page.waitForLoadState('networkidle')
  await page.evaluate(
    (key) =>
      localStorage.setItem(
        key,
        JSON.stringify({
          version: 1,
          id: 'guest-missing-army',
          draft: { name: '', catalogueId: 'no-such-faction', detachmentIds: [], disposition: null, limit: 2000, picks: [], prep: null },
        }),
      ),
    DRAFT_KEY,
  )
  await page.reload()

  await expect(page.getByRole('heading', { name: 'This army is not available' })).toBeVisible()
  await page.getByRole('button', { name: 'Start a new list' }).click()
  await expect(page.getByRole('region', { name: 'Create roster' })).toBeVisible()
})

for (const width of [1440, 390]) {
  test(`allied roster slots unlock and explain exhausted limits at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/rosters')
    await page.waitForLoadState('networkidle')
    const setup = page.getByRole('region', { name: 'Create roster' })
    await setup.getByRole('combobox', { name: 'Faction' }).click()
    await page.getByPlaceholder('Search factions…').fill('Chaos Knights')
    await page.getByRole('option', { name: 'Chaos Knights', exact: true }).click()
    await setup.getByRole('button', { name: 'Select Infernal Lance' }).click()
    await setup.getByRole('group', { name: 'Force disposition' }).getByRole('button', { name: 'Priority Assets' }).click()
    await setup.getByRole('button', { name: 'Start building' }).click()
    if (width < 1300) await page.getByRole('button', { name: 'Add units', exact: true }).click()
    await page.getByLabel('Add a unit').fill('Beasts of Nurgle')
    await page.getByRole('button', { name: 'Toggle Daemons Library' }).click()
    await expect(page.getByRole('button', { name: 'Add Beasts of Nurgle', exact: true })).toBeDisabled()
    await expect(page.locator('[data-picker-unit="Beasts of Nurgle"]')).toContainText('Unavailable with the current roster')
    await page.getByLabel('Add a unit').fill('Nurglings')
    await page.getByRole('button', { name: 'Add Nurglings', exact: true }).click()
    await page.getByLabel('Add a unit').fill('Beasts of Nurgle')
    await page.getByRole('button', { name: 'View Beasts of Nurgle datasheet', exact: true }).click()
    await page.getByRole('button', { name: 'Add to list', exact: true }).click()
    await expect(page.locator('[data-unit="Beasts of Nurgle"]')).toBeVisible()
    if (width < 1300) {
      await page.getByRole('button', { name: 'Back to units', exact: true }).click()
      await page.getByRole('button', { name: 'Toggle Daemons Library' }).click()
    }
    await page.getByLabel('Add a unit').fill('Beasts of Nurgle')
    await expect(page.getByRole('button', { name: 'Add Beasts of Nurgle', exact: true })).toBeDisabled()
    await expect(page.locator('[data-picker-unit="Beasts of Nurgle"]')).toContainText('Limit reached')
    await expect(page.locator('[data-picker-unit="Beasts of Nurgle"]')).toContainText('1/1 in roster')
    await expect(page.locator('[data-picker-unit="Beasts of Nurgle"]')).not.toContainText('construction rules')
    await page.screenshot({ path: `test-results/allied-limits-${width}.png` })
    if (width < 1300) await page.getByRole('button', { name: 'Close', exact: true }).click()
    await page.getByRole('button', { name: 'Save roster', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Save your roster' })).toBeVisible()
    await page.screenshot({ path: `test-results/guest-save-${width}.png`, fullPage: true })
    await page.getByRole('link', { name: 'Back to your roster' }).click()
    await expect(page.locator('[data-unit="Beasts of Nurgle"]')).toBeVisible()
  })
}

test('saving a guest roster does not discard it when browser storage is unavailable', async ({ page }) => {
  await startGuestRoster(page)
  await add(page, 'Necron Warriors')
  await page.evaluate(() =>
    Object.defineProperty(localStorage, 'setItem', {
      value: () => {
        throw new DOMException('Storage unavailable', 'QuotaExceededError')
      },
    }),
  )
  await page.getByRole('button', { name: 'Save roster', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Allow browser storage to save it')
  await expect(page.locator('[data-unit="Necron Warriors"]')).toBeVisible()
})

test('a failed unit-limit check can be retried without losing the roster', async ({ page }) => {
  await startGuestRoster(page)
  await add(page, 'Necron Warriors')
  await expect(page.locator('[data-unit="Necron Warriors"]')).toBeVisible()
  await page.route('**/_serverFn/**', async (route) => {
    if (route.request().method() === 'POST') await route.abort()
    else await route.continue()
  })
  await add(page, 'Immortals')
  await expect(page.getByRole('alert')).toContainText('Could not check unit limits')
  await page.getByLabel('Add a unit').fill('Overlord')
  await expect(page.getByRole('button', { name: 'Add Overlord', exact: true })).toBeDisabled()
  await page.unroute('**/_serverFn/**')
  await page.getByRole('button', { name: 'Retry', exact: true }).click()
  await expect(page.locator('[data-unit="Immortals"]')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Add Overlord', exact: true })).toBeEnabled()
})

test('a visitor draft built on the retired Marine codex opens and prices on the current book', async ({ page }) => {
  const retired = (entry: string) => `profile-unit-e0af-67df-9d63-8fb8-${entry}`
  await page.goto('/rosters')
  await page.evaluate(
    ({ captain, intercessors }) => {
      sessionStorage.setItem(
        'praetorium.workspace-state:/rosters:guest-draft',
        JSON.stringify({
          version: 1,
          id: crypto.randomUUID(),
          draft: {
            name: '',
            catalogueId: 'e0af-67df-9d63-8fb8',
            detachmentIds: ['profile-detachment-option-e0af-67df-9d63-8fb8-f367-3240-47c1-7e1a'],
            disposition: 'priority-assets',
            limit: 1000,
            waivedRules: [],
            optionalRules: [],
            borrowedDetachmentId: null,
            visibility: 'private',
            picks: [{ entryId: captain }, { entryId: intercessors }],
            prep: null,
            source: 'editable',
          },
        }),
      )
    },
    { captain: retired('024a-3fea-7765-4e82'), intercessors: retired('34c7-75dd-fcff-ec94') },
  )
  await page.reload()
  await expect(page.locator('[data-unit="Captain"]')).toBeVisible()
  await expect(page.locator('[data-unit="Intercessor Squad"]')).toContainText(/\d+ pts/)
  await expect(page.getByText(/This army is not available|Army book replaced|no longer available/)).toHaveCount(0)
})
