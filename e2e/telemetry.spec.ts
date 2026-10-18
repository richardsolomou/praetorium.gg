import { expect, type Page, test } from './test'
import { retryUntilVisible, signInAsPreview, signUp, uniqueName } from './account'
import { add } from './builder.harness'

test.use({ serviceWorkers: 'block' })

type Event = { name: string; properties: Record<string, unknown> }

async function recordEvents(page: Page) {
  const events: Event[] = []
  await page.exposeFunction('recordTelemetry', (name: string, properties: Record<string, unknown> = {}) =>
    events.push({ name, properties }),
  )
  await page.evaluate(async () => {
    const url = performance.getEntriesByType('resource').find((entry) => /\/assets\/telemetry-[^/]+\.js/.test(entry.name))?.name
    if (!url) throw new Error('The production telemetry chunk did not load')
    const exports = await import(url)
    const client = Object.values(exports).find(
      (value) =>
        value !== null &&
        typeof value === 'object' &&
        'capture' in value &&
        typeof value.capture === 'function' &&
        'identify' in value &&
        typeof value.identify === 'function',
    ) as
      | {
          capture: (name: string, properties?: Record<string, unknown>) => unknown
          captureException: (error: unknown, properties?: Record<string, unknown>) => void
        }
      | undefined
    if (!client) throw new Error('The telemetry chunk did not export the browser client')
    const record = (name: string, properties?: Record<string, unknown>) =>
      void (
        window as unknown as { recordTelemetry: (name: string, properties?: Record<string, unknown>) => Promise<void> }
      ).recordTelemetry(name, properties)
    // A queued event is what the SDK returns, so callers that check it see a sent event.
    client.capture = (name, properties) => (record(name, properties), { event: name, properties })
    // The SDK drops exceptions until it is configured, which browser test stacks never do.
    client.captureException = (error, properties) =>
      record('$exception', { message: error instanceof Error ? error.message : String(error), ...properties })
  })
  return events
}

test('search reports empty results, dismissal, and successful selection without the query', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Search Praetorium' }).waitFor()
  const events = await recordEvents(page)
  const search = page.getByPlaceholder('Search everything…')
  // The button answers only once the page has hydrated.
  await retryUntilVisible(search, () => page.getByRole('button', { name: 'Search Praetorium' }).click())
  await search.fill('private query zzzxyz987')
  await expect
    .poll(() => events.filter((event) => event.name === 'global_search_completed'))
    .toEqual([{ name: 'global_search_completed', properties: { outcome: 'success', result_count: 0 } }])
  await page.keyboard.press('Escape')
  await expect
    .poll(() => events.at(-1))
    .toEqual({
      name: 'global_search_closed',
      properties: { selected: false, has_query: true, result_count: 0, pending: false, failed: false },
    })
  await page.getByRole('button', { name: 'Search Praetorium' }).click()
  await page.getByPlaceholder('Search everything…').fill('Factions')
  await expect.poll(() => events.filter((event) => event.name === 'global_search_completed').length).toBe(2)
  await page.getByRole('option', { name: 'Factions Datasheets and detachment references', exact: true }).click()
  await expect.poll(() => events.at(-1)?.properties.selected).toBe(true)
  expect(JSON.stringify(events)).not.toContain('private query')
})

test('a failed search reports an error rather than a successful empty search', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Search Praetorium' }).waitFor()
  const events = await recordEvents(page)
  await page.route('**/_serverFn/**', (route) => route.abort())
  const search = page.getByPlaceholder('Search everything…')
  await retryUntilVisible(search, () => page.getByRole('button', { name: 'Search Praetorium' }).click())
  await search.fill('Necrons')
  await expect
    .poll(() => events.filter((event) => event.name === 'global_search_completed'))
    .toEqual([{ name: 'global_search_completed', properties: { outcome: 'error', result_count: 0 } }])
  await page.keyboard.press('Escape')
  await expect.poll(() => events.at(-1)?.properties.failed).toBe(true)
})

test('an unmatched import reports one failed attempt and no completed save', async ({ page }) => {
  await signUp(page, uniqueName('Import analytics'))
  await page.goto('/rosters')
  await page.waitForLoadState('networkidle')
  await page.getByRole('button', { name: 'Import roster', exact: true }).waitFor()
  const events = await recordEvents(page)
  await page.getByRole('button', { name: 'Import roster', exact: true }).click()
  await page.getByLabel('Roster text').fill('private unmatched roster')
  await page.getByRole('button', { name: 'Import pasted roster' }).click()
  await expect
    .poll(() => events)
    .toEqual([
      { name: 'roster_import_started', properties: { input: 'text' } },
      { name: 'roster_import_submitted', properties: { input: 'text' } },
      { name: 'roster_import_failed', properties: { reason: 'catalogue_unmatched', input: 'text' } },
      {
        name: 'survey sent',
        properties: expect.objectContaining({
          $survey_id: '01a14042-306c-0000-f070-c4fc0aadccf2',
          '$survey_response_38c2962f-d6ad-4daf-95b9-1a7b540d24ed': 'Problem',
          automatic: true,
          source: 'import_failure',
        }),
      },
    ])
  expect(events.at(-1)!.properties['$survey_response_1e9261de-1a9e-4465-b2a6-cc43acd873f4']).toMatch(
    /^Automatic report: roster import failed \(no faction matched\) from pasted text\.\n[\s\S]*\nInput:\nprivate unmatched roster$/,
  )
})

test('a connected legacy shell import reports saving only after the write succeeds, including a retry', async ({ page }) => {
  await page.addInitScript(() => {
    window.PraetoriumNative = { bridgeVersion: 3, capabilities: [] }
  })
  await signUp(page, uniqueName('Import retry analytics'))
  await page.goto('/rosters')
  await page.waitForLoadState('networkidle')
  await page.getByRole('button', { name: 'Import roster', exact: true }).waitFor()
  const events = await recordEvents(page)
  await page.route('**/_serverFn/**', (route) => {
    const body = route.request().postData() ?? ''
    return body.includes('"picks"') && body.includes('"visibility"')
      ? route.fulfill({ status: 503, body: 'save unavailable' })
      : route.continue()
  })
  await page.getByRole('button', { name: 'Import roster', exact: true }).click()
  await page.getByLabel('Roster text').fill(`Private imported army (2000 Points)

Necrons
Awakened Dynasty
Strike Force (2,000 Points)

CHARACTER

Technomancer (70 Points)
  • Warlord

Exported with BattleBase, Data Version: v20260812`)
  await page.getByRole('button', { name: 'Import pasted roster' }).click()
  await page.getByRole('dialog', { name: 'Import roster', exact: true }).getByRole('button', { name: 'Import roster', exact: true }).click()
  await expect.poll(() => events.at(-1)).toEqual({ name: 'roster_import_save_failed', properties: { reason: 'request' } })
  expect(events.filter((event) => event.name === 'roster_import_saved')).toEqual([])
  await page.unroute('**/_serverFn/**')
  await page.getByRole('dialog', { name: 'Import roster', exact: true }).getByRole('button', { name: 'Import roster', exact: true }).click()
  await expect
    .poll(() => events.filter((event) => event.name === 'roster_import_saved'))
    .toEqual([{ name: 'roster_import_saved', properties: { source: 'battlebase', pick_count: 1 } }])
  expect(JSON.stringify(events)).not.toContain('Private imported army')
  expect(events.filter((event) => event.name === 'roster_import_review_required')).toEqual([])
})

test('a matched import reports review only for unmatched entries', async ({ page }) => {
  await signUp(page, uniqueName('Import review analytics'))
  await page.goto('/rosters')
  await page.getByRole('button', { name: 'Import roster', exact: true }).waitFor()
  const events = await recordEvents(page)
  await page.getByRole('button', { name: 'Import roster', exact: true }).click()
  await page.getByLabel('Roster text').fill(`Private imported army (2000 Points)

Necrons
Awakened Dynasty
Strike Force (2,000 Points)

CHARACTER

Technomancer (70 Points)
  • Warlord

OTHER DATASHEETS

Private unknown unit (100 Points)
  • 1x Private weapon

Exported with BattleBase, Data Version: v20260812`)
  await page.getByRole('button', { name: 'Import pasted roster' }).click()
  await expect
    .poll(() => events.filter((event) => event.name === 'roster_import_review_required'))
    .toEqual([{ name: 'roster_import_review_required', properties: { missing_count: 1, unplaced_count: 0 } }])
})

test('cancelled creation forms report intent without submissions, and opening the simulator reports its source', async ({ page }) => {
  await signUp(page, uniqueName('Feature analytics'))
  await page.goto('/rosters')
  await page.getByRole('button', { name: 'New roster', exact: true }).waitFor()
  const events = await recordEvents(page)
  const createRoster = page.getByRole('dialog', { name: 'Create roster' })
  await retryUntilVisible(createRoster, () => page.getByRole('button', { name: 'New roster', exact: true }).click())
  await createRoster.getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.locator('[data-web-app-chrome]').getByRole('link', { name: 'Battles', exact: true }).click()
  await page.getByRole('button', { name: 'New battle', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.locator('[data-web-app-chrome]').getByRole('link', { name: 'Leagues', exact: true }).click()
  await page.getByRole('button', { name: 'New league', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.locator('[data-web-app-chrome]').getByRole('link', { name: 'Simulator', exact: true }).click()
  await expect
    .poll(() => events.filter((event) => event.name.includes('_creation_') || event.name === 'combat_simulator_opened'))
    .toEqual([
      { name: 'roster_creation_started', properties: {} },
      { name: 'battle_creation_started', properties: {} },
      { name: 'league_creation_started', properties: {} },
      { name: 'combat_simulator_opened', properties: { source: 'standalone' } },
    ])
})

test('a page that fails to load reports one exception from the error page', async ({ page }) => {
  await page.route(/\/assets\/simulator-[^/]+\.js$/, (route) =>
    route.fulfill({ contentType: 'text/javascript', body: "throw new Error('Simulator failed to load')" }),
  )
  await page.goto('/')
  const simulator = page.locator('[data-web-app-chrome]').getByRole('link', { name: 'Simulator', exact: true })
  // A link pressed before hydration loads a new document that the recorder does not observe; the search button answers only after it.
  const search = page.getByPlaceholder('Search everything…')
  await retryUntilVisible(search, () => page.getByRole('button', { name: 'Search Praetorium' }).click())
  await page.keyboard.press('Escape')
  await expect(search).toBeHidden()
  const events = await recordEvents(page)
  await simulator.click()
  await expect(page.getByRole('heading', { name: 'Something went wrong' })).toBeVisible()
  await expect
    .poll(() => events.filter((event) => event.name === '$exception'))
    .toEqual([{ name: '$exception', properties: { message: 'Simulator failed to load', operation: 'route' } }])
})

test('a datasheet reader who starts a roster or the simulator is attributed to the reference page', async ({ page }) => {
  await page.goto('/factions/necrons/datasheets/imotekh-the-stormlord')
  await page.waitForLoadState('networkidle')
  const events = await recordEvents(page)
  await page.getByRole('button', { name: 'Add to', exact: true }).click()
  await page.getByRole('button', { name: 'Roster…' }).click()
  const setup = page.getByRole('dialog', { name: 'Create roster' })
  await setup.getByRole('button', { name: 'Select Awakened Dynasty' }).click()
  await setup.getByRole('group', { name: 'Force disposition' }).getByRole('button', { name: 'Take and Hold' }).click()
  await setup.getByRole('button', { name: 'Create roster' }).click()
  await expect
    .poll(() => events.filter((event) => ['roster_add_started', 'guest_roster_started', 'roster_unit_added'].includes(event.name)))
    .toEqual([
      { name: 'roster_add_started', properties: { reference: 'datasheet' } },
      { name: 'guest_roster_started', properties: { limit: 2000, detachment_count: 1, reference: 'datasheet' } },
      { name: 'roster_unit_added', properties: { unit_count: 1, reference: 'datasheet' } },
    ])
  await page.goBack()
  await page.getByRole('button', { name: 'Simulate' }).click()
  await page.getByRole('menuitem', { name: 'As attacker' }).click()
  await expect
    .poll(() => events.filter((event) => event.name === 'combat_simulator_opened'))
    .toEqual([{ name: 'combat_simulator_opened', properties: { source: 'standalone', reference: 'datasheet' } }])
})

for (const units of [[], ['Necron Warriors'], ['Necron Warriors', 'Overlord']]) {
  test(`a guest save attempt reports ${units.length} fielded units from the current draft`, async ({ page }) => {
    await page.goto('/rosters')
    await page.waitForLoadState('networkidle')
    const setup = page.getByRole('region', { name: 'Create roster' })
    await setup.getByRole('combobox', { name: 'Faction' }).click()
    await page.getByPlaceholder('Search factions…').fill('Necrons')
    await page.getByRole('option', { name: 'Necrons', exact: true }).click()
    await setup.getByRole('button', { name: 'Select Awakened Dynasty' }).click()
    await setup.getByRole('group', { name: 'Force disposition' }).getByRole('button', { name: 'Take and Hold' }).click()
    const events = await recordEvents(page)
    await setup.getByRole('button', { name: 'Start building' }).click()
    await expect(page.getByLabel('Add a unit')).toBeVisible()
    for (const unit of units) await add(page, unit)
    const save = page.getByRole('button', { name: 'Save roster', exact: true })
    if (!units.length) {
      await expect(save).toBeDisabled()
      expect(events.filter((event) => event.name === 'guest_roster_save_started')).toEqual([])
      return
    }
    await save.click()
    await expect
      .poll(() => events.filter((event) => event.name === 'guest_roster_save_started'))
      .toEqual([{ name: 'guest_roster_save_started', properties: { unit_count: units.length } }])
  })
}

const SCREENSHOT = {
  name: 'screenshot.png',
  mimeType: 'image/png',
  buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'),
}
const SCREENSHOT_URL = /^http:\/\/[^/]+\/api\/feedback-screenshots\/[0-9a-f-]{36}$/

test('feedback is sent as a survey response from the page the player is on', async ({ page }) => {
  await page.goto('/factions')
  await page.getByRole('button', { name: 'Search Praetorium' }).waitFor()
  const events = await recordEvents(page)
  const dialog = page.getByRole('dialog', { name: 'Send feedback' })
  await retryUntilVisible(dialog, () => page.locator('[data-web-app-footer]').getByRole('button', { name: 'Send feedback' }).click())
  await dialog.getByRole('button', { name: 'Idea' }).click()
  await dialog.getByLabel('Message').fill('  Group factions by alliance  ')
  await dialog.getByLabel('Email for a reply (optional)').fill('guest@example.com')
  await dialog.getByLabel('Attach screenshot').setInputFiles(SCREENSHOT)
  await expect(dialog.getByRole('img', { name: 'Attached screenshot' })).toBeVisible()
  await dialog.getByRole('button', { name: 'Send feedback' }).click()

  await expect(dialog.getByRole('status')).toHaveText('Thanks, your feedback was sent.')
  await expect(page).toHaveURL(/\/factions$/)
  expect(events.filter((event) => event.name === 'survey sent')).toEqual([
    {
      name: 'survey sent',
      properties: expect.objectContaining({
        $survey_id: '01a14042-306c-0000-f070-c4fc0aadccf2',
        $survey_completed: true,
        '$survey_response_38c2962f-d6ad-4daf-95b9-1a7b540d24ed': 'Idea',
        '$survey_response_1e9261de-1a9e-4465-b2a6-cc43acd873f4': 'Group factions by alliance',
        '$survey_response_70a4cb45-54cf-44c4-aabf-bbdb555b9caf': 'guest@example.com',
        '$survey_response_c743390b-5aff-42e4-976a-d2d28d0ea1ee': expect.stringMatching(SCREENSHOT_URL),
      }),
    },
  ])
  const screenshot = await page.request.get(
    events.find((event) => event.name === 'survey sent')!.properties['$survey_response_c743390b-5aff-42e4-976a-d2d28d0ea1ee'] as string,
  )
  expect(screenshot.status()).toBe(401)
})

test('an administrator sends feedback without an email field and opens its screenshot', async ({ page }) => {
  await signInAsPreview(page)
  await page.goto('/factions')
  await page.getByRole('button', { name: 'Search Praetorium' }).waitFor()
  const events = await recordEvents(page)
  const dialog = page.getByRole('dialog', { name: 'Send feedback' })
  await retryUntilVisible(dialog, () => page.locator('[data-web-app-footer]').getByRole('button', { name: 'Send feedback' }).click())
  await expect(dialog.getByLabel('Email for a reply (optional)')).toHaveCount(0)
  await dialog.getByLabel('Message').fill('Attached the broken layout')
  await dialog.getByLabel('Attach screenshot').setInputFiles(SCREENSHOT)
  await expect(dialog.getByRole('img', { name: 'Attached screenshot' })).toBeVisible()
  await dialog.getByRole('button', { name: 'Send feedback' }).click()

  await expect(dialog.getByRole('status')).toHaveText('Thanks, your feedback was sent.')
  const sent = events.find((event) => event.name === 'survey sent')!
  expect(sent.properties).not.toHaveProperty('$survey_response_70a4cb45-54cf-44c4-aabf-bbdb555b9caf')
  const screenshot = await page.request.get(sent.properties['$survey_response_c743390b-5aff-42e4-976a-d2d28d0ea1ee'] as string)
  expect([screenshot.status(), screenshot.headers()['content-type'], screenshot.headers()['cache-control']]).toEqual([
    200,
    expect.stringMatching(/^image\/(?:webp|jpeg)$/),
    'private, no-store',
  ])
})

test('feedback that cannot be sent keeps the message and offers the issue tracker', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/factions')
  const dialog = page.getByRole('dialog', { name: 'Send feedback' })
  const feedback = page.getByRole('menuitem', { name: 'Send feedback' })
  await retryUntilVisible(dialog, async () => {
    if (!(await feedback.isVisible())) await page.locator('[data-mobile-app-header]').getByRole('button', { name: 'Account menu' }).click()
    await feedback.click({ timeout: 1_000 })
  })
  await dialog.getByLabel('Message').fill('The list will not scroll')
  await dialog.getByRole('button', { name: 'Send feedback' }).click()

  await expect(dialog.getByRole('alert').getByRole('link', { name: 'report it on GitHub' })).toHaveAttribute(
    'href',
    'https://github.com/richardsolomou/praetorium.gg/issues/new',
  )
  await expect(dialog.getByLabel('Message')).toHaveValue('The list will not scroll')
  await expect(page).toHaveURL(/\/factions$/)
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
})
