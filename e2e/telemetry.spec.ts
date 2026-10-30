import { expect, test, type Page } from './test'
import { recordEvents, stubSupport } from './telemetry.harness'
import {
  addUnit,
  createRoster as newRoster,
  retryUntilVisible,
  signInAsPreview,
  signUp,
  uniqueName,
  visitorSetup,
  waitForRosterSave,
  chooseFaction,
  isRosterSave,
  PHONE,
} from './account'
import { add, attach, expectNoHorizontalOverflow } from './builder.harness'
import { chooseCombatUnit } from './combat'

test.use({ serviceWorkers: 'block' })

test('search reports empty results, dismissal, and successful selection without the query', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Search Praetorium' }).waitFor()
  const events = await recordEvents(page)
  const search = page.getByPlaceholder('Search everything…')
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
      properties: { selected: false, has_query: true, search_started: true, result_count: 0, pending: false, failed: false },
    })
  await page.getByRole('button', { name: 'Search Praetorium' }).click()
  await page.getByPlaceholder('Search everything…').fill('Factions')
  await expect.poll(() => events.filter((event) => event.name === 'global_search_completed').length).toBe(2)
  await page.getByRole('option', { name: 'Factions Datasheets and detachment references', exact: true }).click()
  await expect.poll(() => events.at(-1)?.properties.selected).toBe(true)
  expect(JSON.stringify(events)).not.toContain('private query')
})

test('search intent requires a usable query and survives clearing it without recording its contents', async ({ page }) => {
  await page.goto('/')
  const events = await recordEvents(page)
  const search = page.getByPlaceholder('Search everything…')
  const open = () => retryUntilVisible(search, () => page.getByRole('button', { name: 'Search Praetorium' }).click())
  const dismiss = async () => {
    await page.keyboard.press('Escape')
    await expect(search).not.toBeVisible()
  }
  const started = () => events.filter((event) => event.name === 'global_search_started')
  const closed = () => events.filter((event) => event.name === 'global_search_closed')
  await open()
  await dismiss()
  await expect.poll(() => closed().at(-1)?.properties.search_started).toBe(false)
  await open()
  await search.fill(' a ')
  await dismiss()
  await expect.poll(() => closed().length).toBe(2)
  expect(started()).toEqual([])
  await open()
  await search.fill('private search')
  await expect.poll(started).toEqual([{ name: 'global_search_started', properties: {} }])
  await search.fill('')
  await search.fill('Factions')
  await expect(page.getByRole('option', { name: 'Factions Datasheets and detachment references', exact: true })).toBeVisible()
  await search.fill('')
  await dismiss()
  await expect.poll(() => closed().at(-1)?.properties).toMatchObject({ has_query: false, search_started: true, selected: false })
  expect(started()).toHaveLength(1)
  await open()
  await search.fill('Factions')
  await expect.poll(started).toHaveLength(2)
  await page.getByRole('option', { name: 'Factions Datasheets and detachment references', exact: true }).click()
  await expect.poll(() => events.find((event) => event.name === 'global_search_result_opened')?.properties.search_started).toBe(true)
  await expect(page).toHaveURL('/factions')
  await expect(page.getByRole('heading', { name: 'Factions', exact: true })).toBeVisible()
  await open()
  await search.fill('private search')
  await expect.poll(started).toHaveLength(3)
  await search.fill('')
  await page
    .getByRole('region', { name: 'Recent' })
    .getByRole('button', { name: /^Factions / })
    .click()
  await expect
    .poll(() =>
      events
        .filter((event) => event.name === 'global_search_result_opened')
        .map(({ properties }) => ({ recent: properties.recent, search_started: properties.search_started })),
    )
    .toEqual([
      { recent: false, search_started: true },
      { recent: true, search_started: true },
    ])
  await expect(search).not.toBeVisible()
  expect(JSON.stringify(events)).not.toMatch(/private search|Factions/)
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
      {
        name: 'roster_import_failed',
        properties: { reason: 'catalogue_unmatched', input: 'text', format: 'unrecognized' },
      },
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

test('a New Recruit link that cannot be opened asks for the exported text and reports no list contents', async ({ page }) => {
  await signUp(page, uniqueName('Import link analytics'))
  await page.goto('/rosters')
  await page.waitForLoadState('networkidle')
  await page.getByRole('button', { name: 'Import roster', exact: true }).waitFor()
  const events = await recordEvents(page)
  await page.getByRole('button', { name: 'Import roster', exact: true }).click()
  await page.getByLabel('Roster text').fill('https://www.newrecruit.eu/app/list/AbC123xyz')
  await page.getByRole('button', { name: 'Import pasted roster' }).click()
  await expect(page.getByText('export the list as text and paste the text here.')).toBeVisible()
  await expect
    .poll(() => events)
    .toEqual([
      { name: 'roster_import_started', properties: { input: 'text' } },
      { name: 'roster_import_submitted', properties: { input: 'text' } },
      { name: 'roster_import_failed', properties: { reason: 'share_link', input: 'text', format: 'newrecruit' } },
    ])
})

test('a pasted roster file asks for the exported text and reports only its format', async ({ page }) => {
  await signUp(page, uniqueName('Import file analytics'))
  await page.goto('/rosters')
  await page.waitForLoadState('networkidle')
  await page.getByRole('button', { name: 'Import roster', exact: true }).waitFor()
  const events = await recordEvents(page)
  await page.getByRole('button', { name: 'Import roster', exact: true }).click()
  await page.getByLabel('Roster text').fill('<?xml version="1.0"?>\n<roster name="Private roster file">')
  await page.getByRole('button', { name: 'Import pasted roster' }).click()
  await expect(page.getByText('That looks like a .ros roster file')).toBeVisible()
  await expect
    .poll(() => events)
    .toEqual([
      { name: 'roster_import_started', properties: { input: 'text' } },
      { name: 'roster_import_submitted', properties: { input: 'text' } },
      { name: 'roster_import_failed', properties: { reason: 'structured_file', input: 'text', format: 'ros' } },
    ])
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
  await page.route('**/_serverFn/**', (route) =>
    isRosterSave(route.request()) ? route.fulfill({ status: 503, body: 'save unavailable' }) : route.continue(),
  )
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

test('building reports embarks and the roster arrangement without naming units', async ({ page }) => {
  test.setTimeout(240_000)
  await signUp(page, uniqueName('Embark telemetry'))
  await newRoster(page, { faction: 'Space Marines', detachment: /Gladius Task Force/ })
  for (const name of ['Intercessor Squad', 'Rhino', 'Captain']) await addUnit(page, name)
  await attach(page, 'Captain', 'Intercessor Squad')
  const events = await recordEvents(page)

  const bar = page.getByRole('region', { name: 'Intercessor Squad', exact: true }).locator('[data-unit-actions]')
  await bar.getByRole('button', { name: 'Embark Intercessor Squad in transport', exact: true }).click()
  await waitForRosterSave(
    page,
    () => page.getByRole('menuitem', { name: 'Embark Intercessor Squad in Rhino', exact: true }).click(),
    'embarkedIn',
  )
  await waitForRosterSave(page, () => bar.getByRole('button', { name: 'Remove', exact: true }).click(), 'embarkedIn')
  await page.getByRole('button', { name: 'Roster actions' }).click()
  await page.getByRole('menuitemcheckbox', { name: 'Group attached units' }).click()

  await expect
    .poll(() => events.filter((event) => ['roster_embark_updated', 'roster_arrangement_changed'].includes(event.name)))
    .toEqual([
      { name: 'roster_embark_updated', properties: { embarked: true } },
      { name: 'roster_embark_updated', properties: { embarked: false } },
      { name: 'roster_arrangement_changed', properties: { arrangement: 'role' } },
    ])
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
  await page.locator('[data-web-app-chrome]').getByRole('button', { name: 'Events', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Tournaments', exact: true }).click()
  await page.getByRole('button', { name: 'New tournament', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.locator('[data-web-app-chrome]').getByRole('link', { name: 'Simulator', exact: true }).click()
  await expect
    .poll(() => events.filter((event) => event.name.includes('_creation_') || event.name === 'combat_simulator_opened'))
    .toEqual([
      { name: 'roster_creation_started', properties: {} },
      { name: 'battle_creation_started', properties: {} },
      { name: 'sealed_event_creation_started', properties: {} },
      { name: 'combat_simulator_opened', properties: { source: 'standalone' } },
    ])
})

test('a wrong password reports invalid credentials without the email', async ({ page }) => {
  const { email } = await signUp(page, uniqueName('Wrong password'))
  await page.context().clearCookies()
  await page.goto('/sign-in')
  await page.waitForLoadState('networkidle')
  const events = await recordEvents(page)
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill('a-wrong-password')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect
    .poll(() => events.filter((event) => event.name === 'account_authentication_failed'))
    .toEqual([{ name: 'account_authentication_failed', properties: { method: 'email', action: 'sign_in', reason: 'invalid_credentials' } }])
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
  await page.getByRole('button', { name: 'Add to roster', exact: true }).click()
  const setup = page.getByRole('dialog', { name: 'Create roster' })
  await setup.getByRole('button', { name: 'Select Awakened Dynasty' }).click()
  await setup.getByRole('group', { name: 'Force disposition' }).getByRole('button', { name: 'Take and Hold' }).click()
  await setup.getByRole('button', { name: 'Create roster' }).click()
  await expect
    .poll(() =>
      events.filter((event) =>
        ['roster_add_started', 'roster_creation_started', 'guest_roster_started', 'roster_unit_added'].includes(event.name),
      ),
    )
    .toEqual([
      { name: 'roster_add_started', properties: { reference: 'datasheet' } },
      { name: 'roster_creation_started', properties: { reference: 'datasheet' } },
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

for (const [reference, path, signedIn, width] of [
  ['mission-pack', '/missions/chapter-approved-2026-2027', false, 390],
  ['mission-matchup', '/missions/chapter-approved-2026-2027/matchups/take-and-hold/disruption', true, 1440],
] as const) {
  test(`${reference} attributes setup and creation after clearing the handoff URL`, async ({ page }, testInfo) => {
    if (signedIn) await signUp(page, uniqueName('Mission reference'))
    await page.setViewportSize({ width, height: 900 })
    await page.goto(path)
    await page.waitForLoadState('networkidle')
    const events = await recordEvents(page)
    const setup = page.getByRole('dialog', { name: 'Create roster' })
    await page.getByRole('link', { name: 'Build a roster', exact: true }).click()
    await expect(setup).toBeVisible()
    await expect(page).toHaveURL(/\/rosters$/)
    await chooseFaction(setup, 'Necrons')
    await setup.getByRole('button', { name: 'Select Awakened Dynasty' }).click()
    await setup.getByRole('group', { name: 'Force disposition' }).getByRole('button', { name: 'Take and Hold' }).click()
    await page.screenshot({ path: testInfo.outputPath(`${reference}-setup.png`) })
    await setup.getByRole('button', { name: 'Create roster', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Add your first unit', exact: true })).toBeVisible()
    if (width < 768) await page.getByRole('button', { name: 'Add units', exact: true }).click()
    await expect(page.getByLabel('Add a unit')).toBeVisible()
    if (signedIn) await addUnit(page, 'Necron Warriors')
    else {
      await add(page, 'Necron Warriors')
      await expect
        .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('praetorium.guest-draft') ?? '{}').draft?.picks.length))
        .toBe(1)
    }
    await expect
      .poll(() =>
        events.filter((event) =>
          ['roster_creation_started', 'roster_creation_submitted', 'guest_roster_started', 'roster_unit_added'].includes(event.name),
        ),
      )
      .toEqual([
        { name: 'roster_creation_started', properties: { reference } },
        signedIn
          ? { name: 'roster_creation_submitted', properties: { reference } }
          : { name: 'guest_roster_started', properties: { reference, limit: 2000, detachment_count: 1 } },
        { name: 'roster_unit_added', properties: { unit_count: 1 } },
      ])
    await page.reload()
    await expect(page.locator('[data-unit="Necron Warriors"]')).toHaveCount(1)
  })
}

test('cancelling a mission setup does not attribute a later generic setup to it', async ({ page }) => {
  await page.goto('/missions/chapter-approved-2026-2027')
  await page.waitForLoadState('networkidle')
  const events = await recordEvents(page)
  await page.getByRole('link', { name: 'Build a roster', exact: true }).click()
  const setup = page.getByRole('dialog', { name: 'Create roster' })
  await setup.getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.getByRole('button', { name: 'New roster', exact: true }).click()
  await expect(setup).toBeVisible()
  await expect
    .poll(() => events.filter((event) => event.name === 'roster_creation_started'))
    .toEqual([
      { name: 'roster_creation_started', properties: { reference: 'mission-pack' } },
      { name: 'roster_creation_started', properties: {} },
    ])
})

for (const units of [[], ['Necron Warriors'], ['Necron Warriors', 'Overlord']]) {
  test(`a guest save attempt reports ${units.length} fielded units from the current draft`, async ({ page }) => {
    const setup = await visitorSetup(page)
    await chooseFaction(setup, 'Necrons')
    await setup.getByRole('button', { name: 'Select Awakened Dynasty' }).click()
    await setup.getByRole('group', { name: 'Force disposition' }).getByRole('button', { name: 'Take and Hold' }).click()
    const events = await recordEvents(page)
    await setup.getByRole('button', { name: 'Create roster' }).click()
    await expect(page.getByLabel('Add a unit')).toBeVisible()
    for (const unit of units) await add(page, unit)
    const save = page.getByRole('button', { name: 'Save roster', exact: true })
    if (!units.length) {
      await expect(save).toBeDisabled()
      return
    }
    await save.click()
    await expect
      .poll(() => events.filter((event) => event.name === 'guest_roster_save_started'))
      .toEqual([{ name: 'guest_roster_save_started', properties: { unit_count: units.length } }])
    await expect
      .poll(() => events.filter((event) => event.name === 'guest_roster_save_gate_viewed'))
      .toEqual([{ name: 'guest_roster_save_gate_viewed', properties: { unit_count: units.length, action: 'create' } }])
    if (units.length === 1) {
      await page.getByRole('button', { name: 'Create account and save roster', exact: true }).click()
      await expect
        .poll(() => events.filter((event) => event.name === 'guest_roster_save_validation_failed').map((event) => event.properties.field))
        .toEqual(['name', 'email', 'password'])
      expect(events.filter((event) => event.name === 'account_authentication_started')).toEqual([])
      await page.getByRole('button', { name: 'I already have an account', exact: true }).click()
      await expect.poll(() => events.filter((event) => event.name === 'guest_roster_save_gate_viewed').length).toBe(1)
      await page.getByRole('link', { name: 'Back to your roster', exact: true }).click()
      await expect(page.locator('[data-unit="Necron Warriors"]').first()).toBeVisible()
      expect(events.filter((event) => event.name === 'guest_roster_save_gate_interacted').map((event) => event.properties.action)).toEqual([
        'switch_to_sign_in',
        'return_to_draft',
      ])
    }
  })
}

test('simulator setup checkpoints carry no unit contents', { tag: '@catalogue' }, async ({ page }) => {
  await page.goto('/simulator')
  await page.waitForLoadState('networkidle')
  const events = await recordEvents(page)
  await chooseCombatUnit(page, 'Attacker', 'Space Marines', 'Intercessor Squad')
  await expect
    .poll(() => events.filter((event) => event.name === 'combat_simulator_setup_progressed'))
    .toEqual([{ name: 'combat_simulator_setup_progressed', properties: { source: 'standalone', step: 'attacker_selected' } }])
  await chooseCombatUnit(page, 'Defender', 'Necrons', 'Necron Warriors')
  await expect
    .poll(() => events.filter((event) => event.name === 'combat_simulator_setup_progressed'))
    .toEqual([
      { name: 'combat_simulator_setup_progressed', properties: { source: 'standalone', step: 'attacker_selected' } },
      { name: 'combat_simulator_setup_progressed', properties: { source: 'standalone', step: 'defender_selected' } },
      { name: 'combat_simulator_setup_progressed', properties: { source: 'standalone', step: 'ready' } },
    ])
  await page.getByRole('button', { name: 'More attacker models', exact: true }).click()
  await expect(page.getByLabel('Attacker models', { exact: true })).toHaveText('6')
  expect(events.filter((event) => event.name === 'combat_simulator_setup_progressed')).toHaveLength(3)
  expect(JSON.stringify(events)).not.toMatch(/Intercessor|Warrior|catalogueId|entryId/)
})

test('example and recent matchup entry actions are attributed without their contents', { tag: '@catalogue' }, async ({ page }) => {
  await signUp(page, uniqueName('Recent simulations'))
  await page.goto('/simulator')
  await page.waitForLoadState('networkidle')
  const events = await recordEvents(page)
  await page.getByRole('button', { name: 'Try an example', exact: true }).click()
  const recent = page.getByRole('region', { name: 'Recent simulations', exact: true })
  const link = recent.getByRole('link', { name: 'Intercessor Squad vs Necron Warriors', exact: true })
  await expect(link).toBeVisible()
  await link.click()
  await page.getByRole('link', { name: 'Praetorium', exact: true }).click()
  await expect(page).toHaveURL('/')
  await expect(page.getByRole('heading', { name: 'Combat simulator', exact: true, level: 1 })).toHaveCount(0)
  await link.click()
  await expect
    .poll(() => events.filter((event) => ['combat_simulator_example_started', 'combat_simulator_recent_opened'].includes(event.name)))
    .toEqual([
      { name: 'combat_simulator_example_started', properties: {} },
      { name: 'combat_simulator_recent_opened', properties: { surface: 'simulator' } },
      { name: 'combat_simulator_recent_opened', properties: { surface: 'home' } },
    ])
  expect(JSON.stringify(events)).not.toMatch(/Intercessor|Warrior|catalogueId|entryId/)
})

const SCREENSHOT = {
  name: 'screenshot.png',
  mimeType: 'image/png',
  buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'),
}
const SCREENSHOT_LINE = /\nScreenshot: (http:\/\/[^/]+\/api\/feedback-screenshots\/[0-9a-f-]{36})$/

/** Opens the factions page with the support service stubbed, once the page answers. */
async function supportOnFactions(page: Page) {
  await page.goto('/factions')
  await page.getByRole('button', { name: 'Search Praetorium' }).waitFor()
  return stubSupport(page)
}

async function openFeedback(page: Page) {
  const dialog = page.getByRole('dialog', { name: 'Send feedback' })
  await retryUntilVisible(dialog, async () => {
    await page.getByRole('button', { name: 'Account menu' }).filter({ visible: true }).click()
    await page.getByRole('menuitem', { name: 'Feedback' }).click()
  })
  return dialog
}

test('a guest sends feedback, reads the reply and answers it', async ({ page }) => {
  const support = await supportOnFactions(page)
  const dialog = await openFeedback(page)
  await dialog.getByRole('button', { name: 'Idea' }).click()
  await dialog.getByLabel('Message').fill('  Group factions by alliance  ')
  await dialog.getByLabel('Email for a reply (optional)').fill('guest@example.com')
  await dialog.getByLabel('Attach screenshot').setInputFiles(SCREENSHOT)
  await expect(dialog.getByRole('img', { name: 'Attached screenshot' })).toBeVisible()
  await dialog.getByRole('button', { name: 'Send feedback' }).click()

  // Sending opens the new conversation in the same panel, over the page the player was on.
  const panel = page.getByRole('dialog')
  await expect(panel.getByRole('status')).toHaveText('Thanks, your feedback was sent. Our reply will appear here.')
  await expect(page).toHaveURL(/\/factions$/)
  const [ticket] = await support.tickets()
  const opening = ticket.messages[0].content
  expect(opening).toMatch(/^Group factions by alliance\n\nIdea · Praetorium \d+\.\d+\.\d+\nScreenshot: /)
  const screenshot = await page.request.get(SCREENSHOT_LINE.exec(opening)![1])
  expect(screenshot.status()).toBe(401)

  await support.reply(ticket.id, 'Done in the next release')
  await panel.getByRole('button', { name: 'All conversations' }).click()
  await panel
    .getByRole('navigation', { name: 'Conversations' })
    .getByRole('button', { name: /Group factions by alliance/ })
    .click()
  const conversation = panel.getByRole('region', { name: 'Conversation' })
  await expect(conversation.getByText('Done in the next release')).toBeVisible()
  await expect(conversation.getByText('Internal note')).toHaveCount(0)
  await conversation.getByLabel('Reply').fill('Thanks!')
  await conversation.getByRole('button', { name: 'Send reply' }).click()
  await expect(conversation.getByText('Thanks!')).toBeVisible()
  expect(
    (await support.tickets())[0].messages.filter((message) => message.author_type === 'customer').map((message) => message.content),
  ).toEqual([opening, 'Thanks!'])
})

test('a message being written stays when earlier conversations load behind it', async ({ page }) => {
  await page.goto('/factions')
  await page.getByRole('button', { name: 'Search Praetorium' }).waitFor()
  // Support has not answered yet, so the panel opens straight to a new message.
  const dialog = await openFeedback(page)
  await dialog.getByLabel('Message').fill('The picker will not scroll')
  await stubSupport(page, 1)

  await expect(dialog.getByRole('button', { name: 'All conversations' })).toBeVisible()
  await expect(dialog.getByLabel('Message')).toHaveValue('The picker will not scroll')
})

test('an unread reply marks the account menu until the player reads it', async ({ page }) => {
  const support = await supportOnFactions(page)
  const dialog = await openFeedback(page)
  await dialog.getByLabel('Message').fill('The picker will not scroll')
  await dialog.getByRole('button', { name: 'Send feedback' }).click()
  await expect(page.getByRole('region', { name: 'Conversation' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  const [ticket] = await support.tickets()
  await support.reply(ticket.id, 'Fixed, thanks')

  // Opening the menu rereads the list once it is stale.
  const replies = page.getByRole('menuitem', { name: 'Feedback 1 new' })
  await retryUntilVisible(replies, async () => {
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Account menu' }).filter({ visible: true }).click()
  })
  await expect(page.getByRole('button', { name: 'Account menu, 1 unread feedback reply' }).filter({ visible: true })).toBeVisible()
  await replies.click()
  await page
    .getByRole('dialog')
    .getByRole('navigation', { name: 'Conversations' })
    .getByRole('button', { name: /Fixed, thanks/ })
    .click()
  await expect(page.getByRole('region', { name: 'Conversation' }).getByText('Fixed, thanks')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'Account menu' }).filter({ visible: true })).toHaveAccessibleName('Account menu')
})

test('a long feedback history loads page by page as the player scrolls it', async ({ page }) => {
  const support = await supportOnFactions(page)
  await support.seed(45)
  const yours = page.getByRole('menuitem', { name: 'Feedback' })
  await retryUntilVisible(yours, async () => {
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Account menu' }).filter({ visible: true }).click()
  })
  await yours.click()

  const list = page.getByRole('dialog').getByRole('navigation', { name: 'Conversations' })
  const conversation = (subject: string) => list.getByRole('button').filter({ has: page.getByText(subject, { exact: true }) })
  await expect(conversation('Feedback 45')).toBeVisible()
  // Only the rows in view are rendered: fewer than the first page of 20, and not the oldest until the list reaches it.
  expect(await list.getByRole('button').count()).toBeLessThan(20)
  await expect(conversation('Feedback 1')).toHaveCount(0)
  await expect(async () => {
    await list.evaluate((element) => element.parentElement!.scrollTo({ top: element.parentElement!.scrollHeight }))
    await expect(conversation('Feedback 1')).toBeVisible({ timeout: 500 })
  }).toPass()
  await conversation('Feedback 1').click()
  await expect(page.getByRole('region', { name: 'Conversation' }).getByText('Feedback 1', { exact: true })).toBeVisible()
})

test('a reply appears in an open conversation without reloading it', async ({ page }) => {
  const support = await supportOnFactions(page)
  const dialog = await openFeedback(page)
  await dialog.getByLabel('Message').fill('Missions page is slow')
  await dialog.getByRole('button', { name: 'Send feedback' }).click()
  const conversation = page.getByRole('region', { name: 'Conversation' })
  await expect(conversation.getByText('Missions page is slow')).toBeVisible()

  const [ticket] = await support.tickets()
  await support.reply(ticket.id, 'Looking into it')
  await expect(conversation.getByText('Looking into it')).toBeVisible({ timeout: 15_000 })
})

test('a link from a reply email opens that conversation over the support page', async ({ page }) => {
  const support = await supportOnFactions(page)
  await support.seed(3)
  const [, linked] = await support.tickets()
  await support.reply(linked.id, 'We fixed it')

  // The stand-in lives in this page, so the link is followed in place rather than loaded fresh.
  await page.evaluate((id) => {
    history.pushState({}, '', `/support?conversation=${id}`)
    dispatchEvent(new PopStateEvent('popstate'))
  }, linked.id)

  const panel = page.getByRole('dialog')
  await expect(panel.getByRole('region', { name: 'Conversation' }).getByText('We fixed it')).toBeVisible()
  await expect(page).toHaveURL(/\/support$/)
})

test('an administrator opens the screenshot attached to feedback', async ({ page }) => {
  await signInAsPreview(page)
  const support = await supportOnFactions(page)
  const dialog = await openFeedback(page)
  await expect(dialog.getByLabel('Email for a reply (optional)')).toHaveCount(0)
  await dialog.getByLabel('Message').fill('Attached the broken layout')
  await dialog.getByLabel('Attach screenshot').setInputFiles(SCREENSHOT)
  await expect(dialog.getByRole('img', { name: 'Attached screenshot' })).toBeVisible()
  await dialog.getByRole('button', { name: 'Send feedback' }).click()

  await expect(page.getByRole('dialog').getByRole('status')).toHaveText('Thanks, your feedback was sent. Our reply will appear here.')
  const [ticket] = await support.tickets()
  const screenshot = await page.request.get(SCREENSHOT_LINE.exec(ticket.messages[0].content)![1])
  expect([screenshot.status(), screenshot.headers()['content-type'], screenshot.headers()['cache-control']]).toEqual([
    200,
    expect.stringMatching(/^image\/(?:webp|jpeg)$/),
    'private, no-store',
  ])
})

test('feedback that cannot be sent keeps the message and offers the issue tracker', async ({ page }) => {
  await page.setViewportSize(PHONE)
  await page.goto('/factions')
  const dialog = page.getByRole('dialog', { name: 'Send feedback' })
  const feedback = page.getByRole('menuitem', { name: 'Feedback' })
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
  await expectNoHorizontalOverflow(dialog)
})
