import { expect, type Page, test } from './test'
import {
  retryUntilVisible,
  signUp,
  uniqueName,
  visitorSetup,
  shotAtWidths,
  chooseRosterAction,
  openRosterSetup,
  chooseFaction,
  chooseOption,
  recordSaves,
  PHONE,
} from './account'
import { add } from './builder.harness'
import { SIGN_IN_REQUIRED } from '../src/core/session'
import { lastPathSegment, guestDraft } from './storage'

/** A visitor starts a Necrons list from the rosters page, with no account behind them, and opens it in the builder. */
async function startGuestRoster(page: Page) {
  const setup = await visitorSetup(page)
  await chooseFaction(setup, 'Necrons')
  await setup.getByRole('button', { name: /^Select (?:Awakened Dynasty)$/ }).click()
  await setup.getByRole('group', { name: 'Force disposition' }).getByRole('button', { name: 'Take and Hold' }).click()
  await setup.getByRole('button', { name: 'Create roster' }).click()
  await page.waitForURL(/\/rosters\/[^/]+$/)
  await expect(page.getByLabel('Add a unit')).toBeVisible()
}

const DRAFT_KEY = 'praetorium.guest-draft'

/** A visitor's setup starts from the usual defaults without asking for an account's own. */
test('a visitor opens the roster setup without a refused account read', async ({ page }) => {
  const refused: Promise<boolean>[] = []
  page.on('response', (response) => {
    if (response.url().includes('/_serverFn/'))
      refused.push(
        response.text().then(
          (body) => body.includes(SIGN_IN_REQUIRED),
          () => false,
        ),
      )
  })
  await visitorSetup(page)
  expect(await Promise.all(refused)).not.toContain(true)
})

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
  await expect(page.locator('[data-slot="roster-meta"]')).toContainText('10 models')
  await page.getByRole('button', { name: 'Necron Warriors', exact: true }).click()
  await page.getByRole('button', { name: 'More models in Necron Warriors' }).click()
  await expect(page.locator('[data-slot="roster-meta"]')).toContainText('11 models')
  await expect.poll(() => guestDraft(page)).toContain('"models":11')
  await page.reload()
  await expect(page.locator('[data-slot="roster-meta"]')).toContainText('11 models')
  await expect(page.getByRole('button', { name: /to (your collection|favourite datasheets)$/ })).toHaveCount(0)
  expect(saves).toEqual([])
})

test("a visitor's list survives a reload and a new tab", async ({ page, context }) => {
  await startGuestRoster(page)
  await add(page, 'Necron Warriors')
  // Edits are kept once they settle, so the reload waits for the stored draft to hold the unit.
  await expect.poll(() => guestDraft(page)).toContain('"picks":[{')

  // The server cannot see the draft, only the cookie saying there is one, so its rosters page holds a row rather than saying there are none.
  const firstFrame = await (await page.request.get('/rosters')).text()
  expect(firstFrame).toContain('Loading your rosters')
  expect(firstFrame).not.toContain('No rosters yet')
  await page.reload()
  await expect(page.locator('[data-unit="Necron Warriors"]').first()).toBeVisible()

  const later = await context.newPage()
  await later.goto('/rosters')
  await later.locator('[data-roster]').getByRole('link').click()
  await expect(later.locator('[data-unit="Necron Warriors"]').first()).toBeVisible()
})

test("a visitor's list follows an edit made in another tab", async ({ page, context }) => {
  await startGuestRoster(page)
  await add(page, 'Necron Warriors')
  await expect.poll(() => guestDraft(page)).toContain('"picks":[{')
  const other = await context.newPage()
  await other.goto(page.url())
  await other.waitForLoadState('networkidle')
  await add(other, 'Immortals')

  await expect(page.locator('[data-unit="Immortals"]').first()).toBeVisible()
})

test('a visitor starting a list is told when storage refuses it, and stays on the setup', async ({ page }) => {
  await page.setViewportSize(PHONE)
  const setup = await visitorSetup(page)
  await chooseFaction(setup, 'Necrons')
  await setup.getByRole('button', { name: 'Select Awakened Dynasty' }).click()
  await setup.getByRole('group', { name: 'Force disposition' }).getByRole('button', { name: 'Take and Hold' }).click()
  await page.evaluate(() => {
    Object.defineProperty(localStorage, 'setItem', {
      value: () => {
        throw new DOMException('Storage full', 'QuotaExceededError')
      },
    })
  })
  await setup.getByRole('button', { name: 'Create roster' }).click()

  await expect(setup).toContainText('This browser is not keeping lists')
  expect(new URL(page.url()).pathname).toBe('/rosters')
  await page.screenshot({ path: test.info().outputPath('guest-roster-mobile-unkept.png') })
})

test('signing up keeps the list a visitor built', async ({ page }) => {
  const saves = recordSaves(page)
  await startGuestRoster(page)
  await add(page, 'Necron Warriors')
  await expect(page.locator('[data-stat="points"]')).not.toHaveText(/^0\//)
  const id = lastPathSegment(page.url())

  await page.getByRole('button', { name: 'Save roster' }).click()
  await page.waitForURL(/\/sign-in\?next=%2Frosters&join=true$/)
  await page.waitForLoadState('networkidle')
  await page.getByLabel('Your name').fill(uniqueName('Visitor'))
  await page.getByLabel('Email').fill(`visitor-${crypto.randomUUID()}@example.test`)
  await page.getByLabel('Password').fill('a-long-enough-password')
  await page.getByRole('button', { name: 'Create account and save roster' }).click()

  await page.waitForURL(new RegExp(`/rosters/${id}$`))
  await expect(page.locator('[data-unit="Necron Warriors"]').first()).toBeVisible()
  expect(await guestDraft(page)).toBe('')
  await page.goto('/rosters')
  await expect(page.locator('[data-roster]')).toHaveCount(1)
  expect(saves).toHaveLength(1)
})

test('signing in later asks before saving a list left on the device', async ({ page }) => {
  const saves = recordSaves(page)
  await startGuestRoster(page)
  await add(page, 'Necron Warriors')
  await expect.poll(() => guestDraft(page)).toContain('"picks":[{')
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
  await expect.poll(() => guestDraft(page)).toContain('"picks":[{')
  await signUp(page, uniqueName('Returning'))

  await page.goto('/rosters')
  await page.getByRole('button', { name: 'Discard it' }).click()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'No rosters yet' })).toBeVisible()
})

test("a visitor's roster is listed on the rosters page as a saved one is", async ({ page }) => {
  await startGuestRoster(page)
  await add(page, 'Necron Warriors')
  await expect.poll(() => guestDraft(page)).toContain('"picks":[{')
  const builder = page.url()

  await page.goto('/rosters')
  const row = page.locator('[data-roster]')
  await expect(row).toHaveCount(1)
  await expect(row).toContainText('Necrons')
  await expect(row).toContainText('1 unit')
  await expect(row.locator('.readout')).not.toHaveText(/^—\//)
  await expect(page.getByRole('navigation', { name: 'Rosters' }).getByRole('link')).toHaveText(['Mine', 'Friends', 'Public', 'Played'])
  await shotAtWidths(page, 'round4-visitor-rosters')
  await row.getByRole('link').click()
  await expect(page).toHaveURL(builder)
})

test('a visitor keeping a roster is asked to sign up for a second one', async ({ page }) => {
  const saves = recordSaves(page)
  await startGuestRoster(page)
  await add(page, 'Necron Warriors')
  await expect.poll(() => guestDraft(page)).toContain('"picks":[{')
  const kept = await guestDraft(page)
  await page.goto('/rosters')
  await page.waitForLoadState('networkidle')
  const prompt = page.getByRole('dialog', { name: 'Keep more than one roster' })

  await retryUntilVisible(prompt, () => page.getByRole('button', { name: 'New roster', exact: true }).click())
  await expect(prompt.getByRole('link', { name: 'Create an account' })).toHaveAttribute('href', '/sign-in?next=%2Frosters&join=true')
  await shotAtWidths(page, 'round4-second-roster')
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Import roster' }).click()
  await expect(prompt).toBeVisible()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: /^Actions for / }).click()
  await page.getByRole('menuitem', { name: 'Duplicate' }).click()
  await expect(prompt).toBeVisible()
  await page.keyboard.press('Escape')
  await page.goto('/rosters?view=public')
  await expect(page.getByRole('heading', { name: 'Public rosters' })).toBeVisible()

  expect([await guestDraft(page), saves]).toEqual([kept, []])
})

test("a visitor's account-only roster actions ask them to sign up", async ({ page }) => {
  await startGuestRoster(page)
  await add(page, 'Necron Warriors')
  await page.locator('[data-unit="Necron Warriors"]').getByRole('button', { name: 'Unit actions for Necron Warriors' }).click()
  await page.getByRole('menuitem', { name: 'Save loadout' }).click()
  await expect(page.getByRole('dialog', { name: 'Save loadouts with an account' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect.poll(() => guestDraft(page)).toContain('"picks":[{')
  await page.goto('/rosters')
  await page.getByRole('button', { name: /^Actions for / }).click()
  await page.getByRole('menuitem', { name: 'Create variant' }).click()

  await expect(page.getByRole('dialog', { name: 'Make variants with an account' })).toBeVisible()
})

test('a visitor starting a battle from their roster is asked to sign up', async ({ page }) => {
  await startGuestRoster(page)
  await chooseRosterAction(page, 'Start a battle')

  await expect(page.getByRole('dialog', { name: 'Start battles with an account' })).toBeVisible()
})

test("a visitor's Friends tab offers an account rather than an empty list", async ({ page }) => {
  await page.goto('/rosters?view=friends')

  await expect(page.getByRole('heading', { name: 'See what your friends are building' })).toBeVisible()
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
  await page.goto('/rosters/guest-missing-army')

  await expect(page.getByRole('heading', { name: 'This army is not available' })).toBeVisible()
  await page.getByRole('button', { name: 'Start a new list' }).click()
  await page.waitForURL(/\/rosters$/)
  await expect(page.getByRole('heading', { name: 'No rosters yet' })).toBeVisible()
})

for (const width of [1440, 390]) {
  test(`allied roster slots unlock and explain exhausted limits at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    const setup = await visitorSetup(page)
    await chooseFaction(setup, 'Chaos Knights')
    await setup.getByRole('button', { name: 'Select Infernal Lance' }).click()
    await setup.getByRole('group', { name: 'Force disposition' }).getByRole('button', { name: 'Priority Assets' }).click()
    await setup.getByRole('button', { name: 'Create roster' }).click()
    if (width < 1300) await page.getByRole('button', { name: 'Add units', exact: true }).click()
    await page.getByLabel('Add a unit').fill('Beasts of Nurgle')
    await page.getByRole('button', { name: 'Toggle Daemons Library' }).click()
    await expect(page.getByRole('button', { name: 'Add Beasts of Nurgle', exact: true })).toBeDisabled()
    await expect(page.locator('[data-picker-unit="Beasts of Nurgle"]')).toContainText(
      'No copies available with the current detachments and prerequisite units.',
    )
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
    await expect(page.locator('[data-picker-unit="Beasts of Nurgle"]')).not.toContainText('Limit reached')
    await expect(page.locator('[data-picker-unit="Beasts of Nurgle"]')).toContainText('1/1 in roster')
    await expect(page.locator('[data-picker-unit="Beasts of Nurgle"]')).not.toContainText('construction rules')
    await page.screenshot({ path: test.info().outputPath(`allied-limits-${width}.png`) })
    if (width < 1300) await page.getByRole('button', { name: 'Close', exact: true }).click()
    await page.getByRole('button', { name: 'Save roster', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Save your roster' })).toBeVisible()
    await page.screenshot({ path: test.info().outputPath(`guest-save-${width}.png`), fullPage: true })
    await page.getByRole('link', { name: 'Back to your roster' }).click()
    await expect(page.locator('[data-unit="Beasts of Nurgle"]')).toBeVisible()
    const edit = await openRosterSetup(page)
    await chooseOption(page, 'Battle size', /^Onslaught/)
    await edit.getByRole('group', { name: 'Force disposition' }).getByRole('button', { name: 'Priority Assets', exact: true }).click()
    await edit.getByRole('button', { name: 'Review changes' }).click()
    const review = page.getByRole('dialog', { name: 'Review roster changes' })
    const unchanged = review.locator('details')
    await expect(unchanged.locator('summary')).toHaveText('2 unchanged units')
    await expect(unchanged).not.toHaveAttribute('open')
    await unchanged.locator('summary').click()
    await expect(unchanged.getByText('Beasts of Nurgle', { exact: false })).toBeVisible()
    await expect(unchanged.getByText('Nurglings', { exact: false })).toBeVisible()
    await expect(review).toContainText('Avoid editing it in another tab while confirming.')
    await review.getByRole('button', { name: 'Confirm changes' }).click()
    await expect(review).toBeHidden()
    await page.reload()
    await expect(page.locator('[data-unit="Beasts of Nurgle"]')).toBeVisible()
    await expect(page.locator('[data-unit="Nurglings"]')).toBeVisible()
    await expect(page.locator('[data-slot="roster-meta"]')).toContainText('Onslaught')
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
  await page.route('**/assets/reference-*.bin', (route) => route.abort())
  await startGuestRoster(page)
  await add(page, 'Necron Warriors')
  await expect(page.locator('[data-unit="Necron Warriors"]')).toBeVisible()
  await expect(page.locator('[data-stat="points"]')).not.toHaveText(/^0\//)
  await page.route('**/_serverFn/**', async (route) => {
    if (route.request().method() === 'POST') await route.abort()
    else await route.continue()
  })
  await add(page, 'Immortals')
  await expect(page.getByRole('alert')).toContainText('Could not check unit limits')
  await page.getByLabel('Add a unit').fill('Overlord')
  await expect(page.getByRole('button', { name: 'Add Overlord', exact: true })).toBeDisabled()
  await page.unroute('**/_serverFn/**')
  // The search above queues its own price check, which can land first and clear the failure.
  const retry = page.getByRole('button', { name: 'Retry', exact: true })
  await expect(async () => {
    if (await retry.isVisible()) await retry.click({ timeout: 1_000 })
    await expect(page.locator('[data-unit="Immortals"]')).toBeVisible({ timeout: 1_000 })
  }).toPass()
  await expect(page.getByRole('button', { name: 'Add Overlord', exact: true })).toBeEnabled()
})

for (const width of [1440, 390]) {
  test(`the picker retains checked rows during loadout repricing at ${width}px`, async ({ page }) => {
    await startGuestRoster(page)
    await add(page, 'Necron Warriors')
    await page.getByLabel('Add a unit').fill('')
    await expect(page.getByRole('button', { name: 'Add Overlord', exact: true })).toBeEnabled()
    const checkedRow = (await page.locator('[data-picker-unit="Necron Warriors"]').textContent())!
    await page.setViewportSize({ width, height: 900 })
    await page.getByRole('button', { name: 'Necron Warriors', exact: true }).click()
    const more = page.getByRole('button', { name: 'More models in Necron Warriors' })
    await expect(more).toBeEnabled()
    let intercepted = false
    const { promise: gate, resolve: release } = Promise.withResolvers<void>()
    await page.route('**/_serverFn/**', async (route) => {
      if (route.request().method() === 'POST') {
        intercepted = true
        await gate
      }
      await route.continue()
    })
    try {
      await more.click()
      await expect.poll(() => intercepted).toBe(true)
      if (width < 1300) {
        await page.getByRole('button', { name: 'Back to roster', exact: true }).click()
        await page.getByRole('button', { name: 'Add units', exact: true }).click()
      }
      const picker = page.locator('div[data-onboarding="roster-picker"]')
      await expect(picker).not.toContainText('Checking unit limits')
      await expect(picker.locator('[data-picker-unit="Necron Warriors"]')).toHaveText(checkedRow)
      await expect(page.getByRole('button', { name: 'Add Overlord', exact: true })).toBeEnabled()
      await picker.screenshot({ path: test.info().outputPath(`picker-repricing-${width}.png`) })
      release()
      await expect(page.getByRole('button', { name: 'Add Overlord', exact: true })).toBeEnabled()
      await expect(picker).not.toContainText('Checking unit limits')
    } finally {
      release()
      await page.unrouteAll({ behavior: 'wait' })
    }
  })
}

test('a visitor draft built on the retired Marine codex opens and prices on the current book', async ({ page }) => {
  const retired = (entry: string) => `profile-unit-e0af-67df-9d63-8fb8-${entry}`
  const id = crypto.randomUUID()
  await page.goto('/rosters')
  await page.evaluate(
    ({ draftId, captain, intercessors }) => {
      sessionStorage.setItem(
        'praetorium.workspace-state:/rosters:guest-draft',
        JSON.stringify({
          version: 1,
          id: draftId,
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
    { draftId: id, captain: retired('024a-3fea-7765-4e82'), intercessors: retired('34c7-75dd-fcff-ec94') },
  )
  await page.goto(`/rosters/${id}`)
  await expect(page.locator('[data-unit="Captain"]')).toBeVisible()
  await expect(page.locator('[data-unit="Intercessor Squad"]')).toContainText(/\d+ pts/)
  await expect(page.getByText(/This army is not available|Army book replaced|no longer available/)).toHaveCount(0)
})

for (const width of [390, 1280]) {
  test(`a detachment card selects from its name and opens its reference only from the reference icon at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    const setup = await visitorSetup(page)
    await chooseFaction(setup, 'Necrons')
    const card = setup.getByRole('button', { name: 'Select Awakened Dynasty', exact: true })
    const reference = page.getByRole('dialog', { name: 'Awakened Dynasty' })

    await card.getByText('Awakened Dynasty', { exact: true }).click()
    await expect(card).toHaveAttribute('aria-pressed', 'true')
    await expect(reference).toHaveCount(0)

    await setup.getByRole('button', { name: 'View Awakened Dynasty detachment reference' }).click()
    await expect(reference).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(reference).toBeHidden()
    await expect(card).toHaveAttribute('aria-pressed', 'true')

    await card.getByText('Awakened Dynasty', { exact: true }).click()
    await expect(card).toHaveAttribute('aria-pressed', 'false')
  })
}
