import { expect, type Page, test } from '@playwright/test'
import { signUp, uniqueName } from './account'
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
          capture: (name: string, properties?: Record<string, unknown>) => void
        }
      | undefined
    if (!client) throw new Error('The telemetry chunk did not export the browser client')
    client.capture = (name, properties) => {
      void (
        window as unknown as { recordTelemetry: (name: string, properties?: Record<string, unknown>) => Promise<void> }
      ).recordTelemetry(name, properties)
    }
  })
  return events
}

test('search reports empty results, dismissal, and successful selection without the query', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Search Praetorium' }).waitFor()
  const events = await recordEvents(page)
  await page.getByRole('button', { name: 'Search Praetorium' }).click()
  await page.getByPlaceholder('Search everything…').fill('private query zzzxyz987')
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
  await page.getByRole('button', { name: 'Search Praetorium' }).click()
  await page.getByPlaceholder('Search everything…').fill('Necrons')
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
    ])
})

test('an import reports saving only after the write succeeds, including a retry', async ({ page }) => {
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
  await expect.poll(() => events.at(-1)).toEqual({ name: 'roster_import_save_failed', properties: { reason: 'request' } })
  expect(events.filter((event) => event.name === 'roster_import_saved')).toEqual([])
  await page.unroute('**/_serverFn/**')
  await page.getByRole('button', { name: 'Import pasted roster' }).click()
  await expect
    .poll(() => events.filter((event) => event.name === 'roster_import_saved'))
    .toEqual([{ name: 'roster_import_saved', properties: { source: 'battlebase', pick_count: 1 } }])
  expect(JSON.stringify(events)).not.toContain('Private imported army')
})

test('cancelled creation forms report intent without submissions, and opening the simulator reports its source', async ({ page }) => {
  await signUp(page, uniqueName('Feature analytics'))
  await page.goto('/rosters')
  await page.getByRole('button', { name: 'Create editable roster' }).waitFor()
  const events = await recordEvents(page)
  await page.getByRole('button', { name: 'Create editable roster' }).click()
  await page.getByRole('dialog', { name: 'Create roster' }).getByRole('button', { name: 'Cancel', exact: true }).click()
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
