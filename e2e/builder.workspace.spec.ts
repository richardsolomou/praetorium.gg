import { expect, test } from '@playwright/test'
import { NATIVE_BRIDGE_SCRIPT } from '../mobile/src/nativeActions'
import { createRoster, signUp, waitForRosterSave } from './account'
import {
  shot,
  expectNoHorizontalOverflow,
  expectInsideHorizontalBounds,
  fadedEdges,
  expectVerticalPanOnly,
  openBuilder,
  add,
} from './builder.harness'

test('the unit picker stays within the roster faction', async ({ page }) => {
  await openBuilder(page)
  await expect(page.getByRole('combobox', { name: 'Force' })).toHaveCount(0)
})

test('the roster workspace reserves the desktop picker while its book loads', async ({ browser, page }) => {
  await openBuilder(page)
  await page.getByLabel('Add a unit').fill('Immortals')
  await waitForRosterSave(page, () => page.getByRole('button', { name: 'Add Immortals', exact: true }).first().click())
  await expect(page.locator('[data-unit="Immortals"]')).toBeVisible()
  await page.getByLabel('Add a unit').fill('')
  await expect(page.getByRole('button', { name: 'Add Lychguard', exact: true }).first()).toBeVisible()

  const serverContext = await browser.newContext({
    javaScriptEnabled: false,
    storageState: await page.context().storageState(),
    viewport: { width: 1440, height: 900 },
  })
  const serverPage = await serverContext.newPage()
  await serverPage.goto(page.url())
  await expect(serverPage.getByLabel('Add units')).toBeVisible()
  await expect(serverPage.getByLabel('Loading units')).toBeVisible()
  await expect(serverPage.getByRole('button', { name: 'Add Lychguard', exact: true })).toHaveCount(0)
  await serverPage.screenshot({ path: 'test-results/loading-roster-workspace.png', fullPage: true })
  await serverContext.close()

  const clientUnitRequests: string[] = []
  page.on('request', (request) => {
    const url = decodeURIComponent(request.url())
    if (url.includes('/_serverFn/') && url.includes('"catalogueId"') && url.includes('"query"') && url.includes('"battleSize"')) {
      clientUnitRequests.push(url)
    }
  })

  await page.addInitScript(() => {
    const values: number[] = []
    Object.assign(window, { __rosterLayoutShiftValues: values })
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const shift = entry as PerformanceEntry & { value: number; hadRecentInput: boolean }
        if (!shift.hadRecentInput) values.push(shift.value)
      }
    }).observe({ type: 'layout-shift', buffered: true })
  })
  await page.reload()
  await expect(page.getByRole('button', { name: 'Add Lychguard', exact: true }).first()).toBeVisible()
  expect(clientUnitRequests.length).toBeGreaterThan(0)
  const response = await page.request.get(page.url())
  const body = await response.body()
  expect(body.byteLength).toBeLessThan(500_000)
  expect(body.toString()).not.toContain('["collection"]')
  await page.waitForTimeout(1_500)
  const values = await page.evaluate(() => (window as typeof window & { __rosterLayoutShiftValues: number[] }).__rosterLayoutShiftValues)
  expect(values.reduce((total, value) => total + value, 0)).toBeLessThan(0.05)
  await page.screenshot({ path: 'test-results/stable-roster-workspace.png', fullPage: true })

  await page.setViewportSize({ width: 364, height: 759 })
  clientUnitRequests.length = 0
  await page.reload()
  await expect(page.getByRole('button', { name: 'Add units', exact: true })).toBeVisible()
  expect(clientUnitRequests).toHaveLength(0)
  await expectNoHorizontalOverflow(page.locator('html'))
  const roster = page.locator('[data-slot="roster-units"]')
  await expectNoHorizontalOverflow(roster)
  await expectVerticalPanOnly(roster)
  await page.screenshot({ path: 'test-results/stable-roster-workspace-phone.png', fullPage: true })

  await page.getByRole('button', { name: 'Add units', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Add Lychguard', exact: true }).first()).toBeVisible()
  expect(clientUnitRequests.length).toBeGreaterThan(0)
  await page.getByRole('dialog', { name: 'Add units' }).getByRole('button', { name: 'Close' }).click()

  await page.locator('[data-unit="Immortals"]').getByRole('button', { name: 'Immortals', exact: true }).click()
  const loadout = page.locator('aside[aria-label="Loadout"]')
  await expect(loadout).toBeVisible()
  await expect(loadout.getByRole('heading', { name: 'Attachments' })).toBeVisible()
  await expectNoHorizontalOverflow(page.locator('html'))
  await expectNoHorizontalOverflow(loadout)
  const viewport = loadout.locator('[data-slot="scroll-area-viewport"]')
  await expectNoHorizontalOverflow(viewport)
  await expectVerticalPanOnly(viewport)
  await expectNoHorizontalOverflow(loadout.locator('[data-slot="unit-profile"]'))
  await page.screenshot({ path: 'test-results/stable-roster-loadout-phone.png', fullPage: true })
})

test('the roster header fades whichever end of its facts it is hiding', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const page = await context.newPage()
  await openBuilder(page)
  const meta = page.locator('[data-slot="roster-meta"]')
  await expect(meta).toBeVisible()
  // The row grows as its pricing lands, so the cue is asserted once the facts have all arrived.
  await expect.poll(() => meta.evaluate((node) => node.scrollWidth > node.clientWidth)).toBe(true)
  await expect.poll(() => fadedEdges(meta)).toEqual({ start: false, end: true })

  await meta.evaluate((node) => node.scrollTo({ left: node.scrollWidth }))
  await expect.poll(() => fadedEdges(meta)).toEqual({ start: true, end: false })
  await context.close()
})

test('the roster header fades nothing when every fact fits', async ({ page }) => {
  await openBuilder(page)
  const meta = page.locator('[data-slot="roster-meta"]')
  await expectNoHorizontalOverflow(meta)
  await expect.poll(() => fadedEdges(meta)).toEqual({ start: false, end: false })
})

test('a native unit screen keeps the tab bar beside it', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 364, height: 759 } })
  await context.addInitScript({
    content: `window.ReactNativeWebView = { postMessage: () => {} };
${NATIVE_BRIDGE_SCRIPT}`,
  })
  const page = await context.newPage()
  await openBuilder(page, 'Space Marines', /Gladius Task Force/)
  await add(page, 'Intercessor Squad')
  await page.getByRole('dialog', { name: 'Add units' }).getByRole('button', { name: 'Close' }).click()
  await expectNoHorizontalOverflow(page.locator('html'))
  const roster = page.locator('[data-slot="roster-units"]')
  await expectNoHorizontalOverflow(roster)
  await expectVerticalPanOnly(roster)
  await page.locator('[data-unit="Intercessor Squad"]').getByRole('button', { name: 'Intercessor Squad', exact: true }).click()

  const loadout = page.locator('aside[aria-label="Loadout"]')
  const sections = page.getByRole('navigation', { name: 'Application sections' })
  await expect(loadout).toBeVisible()
  // A screen inside the roster tab, not a sheet over the application.
  await expect(loadout).not.toHaveAttribute('aria-modal', 'true')
  expect(await loadout.evaluate((pane) => Math.round(pane.getBoundingClientRect().bottom))).toBe(
    await sections.evaluate((tabs) => Math.round(tabs.getBoundingClientRect().top)),
  )
  expect(await sections.evaluate((tabs) => (tabs as HTMLElement).inert)).toBe(false)
  await expectNoHorizontalOverflow(page.locator('html'))
  await expectNoHorizontalOverflow(loadout)
  const viewport = loadout.locator('[data-slot="scroll-area-viewport"]')
  await expectNoHorizontalOverflow(viewport)
  await expectVerticalPanOnly(viewport)
  await expectNoHorizontalOverflow(loadout.locator('[data-slot="unit-profile"]'))
  await page.screenshot({ path: 'test-results/intercessor-native-phone.png', fullPage: true })

  await sections.getByRole('link', { name: 'Factions' }).click()
  await expect(page).toHaveURL('/factions')

  await context.close()
})

test('a mobile web unit screen keeps the tab bar beside it', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 364, height: 759 } })
  const page = await context.newPage()
  await openBuilder(page, 'Space Marines', /Gladius Task Force/)
  await add(page, 'Intercessor Squad')
  await page.getByRole('dialog', { name: 'Add units' }).getByRole('button', { name: 'Close' }).click()
  await page.locator('[data-unit="Intercessor Squad"]').getByRole('button', { name: 'Intercessor Squad', exact: true }).click()

  const loadout = page.locator('aside[aria-label="Loadout"]')
  const sections = page.getByRole('navigation', { name: 'Application sections' })
  await expect(loadout).toBeVisible()
  await expect(loadout.getByRole('heading', { name: 'Attachments' })).toBeVisible()
  await expect(loadout).not.toHaveAttribute('aria-modal', 'true')
  expect(await loadout.evaluate((pane) => Math.round(pane.getBoundingClientRect().bottom))).toBe(
    await sections.evaluate((tabs) => Math.round(tabs.getBoundingClientRect().top)),
  )
  expect(await sections.evaluate((tabs) => (tabs as HTMLElement).inert)).toBe(false)
  await page.screenshot({ path: 'test-results/intercessor-web-phone.png', fullPage: true })

  await sections.getByRole('link', { name: 'Factions' }).click()
  await expect(page).toHaveURL('/factions')

  await context.close()
})

test('the roster tab comes back to the unit it was left on', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  await context.addInitScript({
    content: `window.ReactNativeWebView = { postMessage: () => {} };
${NATIVE_BRIDGE_SCRIPT}`,
  })
  const page = await context.newPage()
  await openBuilder(page)
  await waitForRosterSave(page, () => add(page, 'Immortals'))
  await page.getByRole('dialog', { name: 'Add units' }).getByRole('button', { name: 'Close' }).click()
  const rosterUrl = page.url()
  await page.locator('[data-unit="Immortals"]').getByRole('button', { name: 'Immortals', exact: true }).click()
  const loadout = page.locator('aside[aria-label="Loadout"]')
  await expect(loadout).toBeVisible()
  await expect(page).toHaveURL(`${rosterUrl}#roster-pane`)

  const sections = page.getByRole('navigation', { name: 'Application sections' })
  await sections.getByRole('link', { name: 'Battles' }).click()
  await expect(page).toHaveURL('/battles')

  // The tab mounts straight onto the open pane, with nothing of the roster's behind it.
  await sections.getByRole('link', { name: 'Rosters' }).click()
  await expect(page).toHaveURL(`${rosterUrl}#roster-pane`)
  await expect(loadout).toBeVisible()

  // The tablet draws the same unit beside the roster, so the pane entry is replaced
  // where it stands rather than stepped back over and out of the tab.
  await sections.getByRole('link', { name: 'Battles' }).click()
  await expect(page).toHaveURL('/battles')
  await page.setViewportSize({ width: 1194, height: 834 })
  await sections.getByRole('link', { name: 'Rosters' }).click()
  await expect(page).toHaveURL(rosterUrl)
  await expect(loadout).toBeVisible()
  await expect(loadout).not.toHaveCSS('position', 'fixed')

  await context.close()
})

test('a unit that moved while the roster was open does not eject the roster tab', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  await context.addInitScript({
    content: `window.ReactNativeWebView = { postMessage: () => {} };
${NATIVE_BRIDGE_SCRIPT}`,
  })
  const page = await context.newPage()
  await openBuilder(page)
  await waitForRosterSave(page, () => add(page, 'Immortals'))
  await waitForRosterSave(page, () => add(page, 'Lychguard'))
  await page.getByRole('dialog', { name: 'Add units' }).getByRole('button', { name: 'Close' }).click()
  const rosterUrl = page.url()

  // Deleting the unit in front of it moves Lychguard, so the pane names a place in the
  // roster that is no longer its own once the workspace is mounted again.
  await page.locator('[data-unit="Immortals"]').getByLabel('Unit actions for Immortals').click()
  await waitForRosterSave(page, () => page.getByRole('menuitem', { name: 'Delete unit' }).click())
  await page.locator('[data-unit="Lychguard"]').getByRole('button', { name: 'Lychguard', exact: true }).click()
  await expect(page.locator('aside[aria-label="Loadout"]')).toBeVisible()

  const sections = page.getByRole('navigation', { name: 'Application sections' })
  await sections.getByRole('link', { name: 'Battles' }).click()
  await expect(page).toHaveURL('/battles')

  // The unit is unresolvable, so the roster it belongs to is what is left of the tab.
  await sections.getByRole('link', { name: 'Rosters' }).click()
  await expect(page).toHaveURL(rosterUrl)
  await expect(page.locator('[data-unit="Lychguard"]')).toBeVisible()

  await context.close()
})

test('native roster details use pane history without adding a route back action', async ({ page }) => {
  await openBuilder(page)
  await add(page, 'Immortals')
  await add(page, 'Lychguard')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.evaluate(() => {
    document.documentElement.dataset.nativeApp = 'true'
  })
  const rosterUrl = page.url()
  const unit = page.locator('[data-unit="Lychguard"]')
  const unitButton = unit.getByRole('button', { name: 'Lychguard', exact: true })
  const sections = page.getByRole('navigation', { name: 'Application sections' })
  await expect(page.getByRole('banner', { name: 'Application' })).toHaveCount(0)
  await expect(sections).toBeVisible()
  await expect(sections.getByRole('link', { name: 'Rosters' })).toHaveAttribute('aria-current', 'page')

  await unitButton.click()
  const loadout = page.locator('aside[aria-label="Loadout"]')
  await expect(loadout).toBeVisible()
  const back = loadout.getByRole('button', { name: 'Back to roster' })
  await expect(back).toBeFocused()
  const backBox = await back.boundingBox()
  expect(backBox?.x).toBe(0)
  expect(backBox?.width).toBeGreaterThanOrEqual(44)
  expect(backBox?.height).toBeGreaterThanOrEqual(44)
  await page.keyboard.press('Tab')
  expect(await page.evaluate(() => document.activeElement?.closest('aside[aria-label="Loadout"], [data-native-app-tabs]') !== null)).toBe(
    true,
  )
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  expect(await loadout.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
  await page.screenshot({ path: 'test-results/compact-roster-details-phone.png', fullPage: true })

  await page.goBack()
  await expect(page).toHaveURL(rosterUrl)
  await expect(loadout).toBeHidden()
  await expect(unit).toBeVisible()
  await expect(unitButton).toBeFocused()
  await expect(page.getByRole('button', { name: 'Back to rosters' })).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  expect(await page.locator('[data-slot="roster-units"]').evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
  await page.screenshot({ path: 'test-results/compact-roster-after-back-phone.png', fullPage: true })

  await page.goForward()
  await expect(loadout).toBeVisible()
  await back.click()
  await expect(page).toHaveURL(rosterUrl)
  await expect(loadout).toBeHidden()

  await unit.getByRole('button', { name: 'Unit actions for Lychguard' }).click()
  await page.getByRole('menuitem', { name: 'Delete unit' }).click()
  await expect(unit).toBeHidden()
  const immortals = page.locator('[data-unit="Immortals"]')
  await immortals.getByRole('button', { name: 'Unit actions for Immortals' }).click()
  await page.getByRole('menuitem', { name: 'Duplicate unit' }).click()
  await page.goForward()
  await expect(page).toHaveURL(rosterUrl)
  await expect(loadout).toBeHidden()
  await page.goBack()
  await expect(page).not.toHaveURL(rosterUrl)
})

test('portrait tablets keep roster details as a full-screen view', async ({ page }) => {
  await openBuilder(page)
  await add(page, 'Immortals')
  await add(page, 'Lychguard')
  await page.setViewportSize({ width: 1100, height: 800 })
  const immortalsButton = page.locator('[data-unit="Immortals"]').getByRole('button', { name: 'Immortals', exact: true })
  const lychguardButton = page.locator('[data-unit="Lychguard"]').getByRole('button', { name: 'Lychguard', exact: true })
  await immortalsButton.click()
  await lychguardButton.click()
  await expect(lychguardButton).toBeFocused()
  const rosterUrl = page.url()
  await page.setViewportSize({ width: 820, height: 1180 })

  const loadout = page.locator('aside[aria-label="Loadout"]')
  const sections = page.getByRole('navigation', { name: 'Application sections' })
  await expect(loadout).toHaveCSS('position', 'fixed')
  await expect(loadout).not.toHaveAttribute('aria-modal', 'true')
  await expect(sections).toBeVisible()
  expect(await sections.evaluate((tabs) => (tabs as HTMLElement).inert)).toBe(false)
  expect(await loadout.evaluate((pane) => Math.round(pane.getBoundingClientRect().bottom))).toBe(
    await sections.evaluate((tabs) => Math.round(tabs.getBoundingClientRect().top)),
  )
  await page.setViewportSize({ width: 900, height: 1180 })
  await expect(loadout).toHaveAttribute('aria-modal', 'true')
  await expect(sections).toBeHidden()
  await expect(loadout.getByRole('button', { name: 'Back to roster' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(900)
  expect(await loadout.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
  await page.screenshot({ path: 'test-results/compact-roster-details-tablet.png', fullPage: true })

  await page.setViewportSize({ width: 1024, height: 768 })
  await expect(loadout).toHaveCSS('position', 'static')
  await expect(lychguardButton).toBeFocused()
  await expect(page).toHaveURL(rosterUrl)
})

test('mid-width picker hands off to the inline loadout', async ({ page }) => {
  await openBuilder(page)
  await add(page, 'Immortals')
  await page.setViewportSize({ width: 1100, height: 800 })
  const rosterUrl = page.url()

  await page.locator('[data-unit="Immortals"]').getByRole('button', { name: 'Immortals', exact: true }).click()
  await expect(page.locator('aside[aria-label="Loadout"]')).toHaveCSS('position', 'static')
  await page.getByRole('button', { name: 'Add units', exact: true }).click()
  const picker = page.getByRole('dialog', { name: 'Add units' })
  await expect(picker).toBeVisible()
  await picker.getByRole('button', { name: 'Loadout' }).click()

  await expect(picker).toBeHidden()
  await expect(page.locator('aside[aria-label="Loadout"]')).toHaveCSS('position', 'static')
  await expect(page).toHaveURL(rosterUrl)
})

test('the whole book is on the shelves, not the first page of it', async ({ page }) => {
  // A Space Marine book runs to well over a hundred datasheets and the picker sorts
  // them by name, so a cut-off page ended mid-alphabet: the infantry shelf stopped at
  // Inner Circle Companions and Sternguard Veterans could only be found by searching.
  await openBuilder(page, 'Space Marines', /Gladius Task Force/)
  await expect(page.getByRole('button', { name: 'Add Sternguard Veteran Squad', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Add Whirlwind', exact: true })).toBeVisible()
})

test('a mixed-model squad shows its own profile instead of an optional model', async ({ page }) => {
  await openBuilder(page, 'Space Marines', /Gladius Task Force/)
  await page.getByLabel('Add a unit').fill('Outrider Squad')
  await page.getByRole('button', { name: 'View Outrider Squad datasheet' }).click()

  const datasheet = page.locator('aside[aria-label="Datasheet"]')
  await expect(datasheet.locator('[data-slot="unit-profile"]')).toContainText(/M\s*12"\s*T\s*5\s*Sv\s*3\+\s*W\s*4\s*LD\s*6\+\s*OC\s*2/)

  await add(page, 'Outrider Squad')
  await page.locator('[data-unit="Outrider Squad"]').getByRole('button', { name: 'Outrider Squad', exact: true }).click()

  const loadout = page.locator('aside[aria-label="Loadout"]')
  const profile = loadout.locator('[data-slot="unit-profile"]')
  await expect(profile).toContainText(/M\s*12"\s*T\s*5\s*Sv\s*3\+\s*W\s*4\s*LD\s*6\+\s*OC\s*2/)

  await page.setViewportSize({ width: 390, height: 844 })
  await expect(profile).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  expect(await loadout.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
  await page.screenshot({ path: 'test-results/outrider-profile-phone.png', fullPage: true })
})

test('datasheet metadata is searchable in the picker and global search', async ({ page }) => {
  await openBuilder(page)
  await expect(page.getByRole('button', { name: 'Add Immortals', exact: true })).toBeVisible()
  const pickerRequests: string[] = []
  page.on('request', (request) => {
    const url = decodeURIComponent(request.url())
    if (url.includes('/_serverFn/') && url.includes('"catalogueId"') && url.includes('"query"')) pickerRequests.push(url)
  })
  await page.getByLabel('Add a unit').fill('cryptek')

  await expect(page.locator('[data-picker-unit="Technomancer"]')).toContainText('Matches Cryptek keyword')
  await expect(page.locator('[data-picker-unit="Cryptothralls"]')).toContainText('Matches Cryptek Retinue ability')
  await expect(page.locator('[data-picker-unit="Necron Warriors"]')).toHaveCount(0)
  await page.getByLabel('Add a unit').fill('cryptek staff')
  await expect(page.locator('[data-picker-unit="Technomancer"]')).toContainText('Matches Cryptek keyword · Staff of light weapon')
  expect(pickerRequests).toHaveLength(0)
  await shot(page.locator('[data-pane="picker"]'), 'test-results/roster-picker-metadata-search.png')

  await page.getByRole('button', { name: 'Search Praetorium' }).click()
  await page.getByRole('combobox').fill('cryptek')
  await expect(page.getByRole('option', { name: 'Technomancer Necrons Matches Cryptek keyword' })).toBeVisible()
  await page.getByRole('combobox').fill('cryptek staff')
  await expect(page.getByRole('option', { name: 'Technomancer Necrons Matches Cryptek keyword · Staff of light weapon' })).toBeVisible()
  await page.getByRole('combobox').fill('destroyer cult')
  await expect(page.getByRole('option', { name: 'Hexmark Destroyer Necrons Matches Destroyer Cult keyword' })).toBeVisible()
  await expect(page.getByRole('option', { name: /Hexmark Destroyer Necrons/ })).not.toContainText('**')

  await page.keyboard.press('Escape')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.reload()
  await page.getByRole('button', { name: 'Add units', exact: true }).click()
  await page.getByLabel('Add a unit').fill('cryptek')
  await expect(page.locator('[data-picker-unit="Technomancer"]')).toContainText('Matches Cryptek keyword')
  await expect
    .poll(() => page.locator('[data-slot="drawer-popup"]').evaluate((element) => getComputedStyle(element).transform))
    .toBe('matrix(1, 0, 0, 1, 0, 0)')
  await page.screenshot({ path: 'test-results/mobile-roster-picker-metadata-search.png' })
})

test('a filter that found nothing can be emptied without selecting it', async ({ page }) => {
  await openBuilder(page)
  const filter = page.getByLabel('Add a unit')
  await filter.fill('nothing by this name')
  await expect(page.getByText('No matching units.')).toBeVisible()
  await page.getByRole('button', { name: 'Empty the picker filter' }).click()
  await expect(filter).toHaveValue('')
  await expect(page.getByRole('button', { name: 'Empty the picker filter' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Add Immortals', exact: true })).toBeVisible()
})

test('the roster workspace preserves picker and read-only state', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 })
  await openBuilder(page)

  await page.getByLabel('Add a unit').fill('Immortals')
  await page.getByRole('button', { name: 'Owned', exact: true }).click()
  await page.setViewportSize({ width: 1200, height: 800 })
  await expect(page.getByLabel('Add a unit')).toHaveCount(0)
  await page.getByRole('button', { name: 'Add units', exact: true }).click()
  await expect(page.getByLabel('Add a unit')).toHaveValue('Immortals')
  await expect(page.getByRole('button', { name: 'Owned', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('dialog', { name: 'Add units' }).getByRole('button', { name: 'Close' }).click()

  await page.setViewportSize({ width: 1600, height: 900 })
  await expect(page.getByLabel('Add a unit')).toHaveValue('Immortals')
  await expect(page.getByRole('button', { name: 'Owned', exact: true })).toHaveAttribute('aria-pressed', 'true')

  await page.reload()
  await waitForRosterSave(page, () => page.getByRole('button', { name: 'Add Immortals', exact: true }).first().click())

  await page.getByRole('button', { name: 'View', exact: true }).click()
  await page.reload()
  await expect(page.getByRole('button', { name: 'View', exact: true })).toHaveAttribute('aria-pressed', 'true')
  // The owner keeps the picker while viewing the roster without its card or loadout controls.
  await expect(page.getByLabel('Add a unit')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Add Immortals', exact: true }).first()).toBeVisible()
  await expect(page.getByRole('button', { name: /Unit actions for Immortals/ })).toHaveCount(0)
  await page.screenshot({ path: 'test-results/owner-view-sidebar.png', fullPage: true })
  await page.locator('[data-unit="Immortals"]').getByRole('button', { name: 'Immortals', exact: true }).click()
  await expect(page.getByRole('button', { name: /More models in Immortals/ })).toHaveCount(0)
  // What the datasheet says about the unit is a fact about it, not an edit.
  const loadout = page.locator('aside[aria-label="Loadout"]')
  await expect(loadout.getByRole('heading', { name: 'Attachments' })).toBeVisible()

  await page.setViewportSize({ width: 390, height: 844 })
  await loadout.getByRole('button', { name: 'Back to roster' }).click()
  await expect(page.getByRole('button', { name: 'Add units', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Add units', exact: true }).click()
  const compactPicker = page.getByRole('dialog', { name: 'Add units' })
  await expect(compactPicker.getByLabel('Add a unit')).toBeVisible()
  await expect
    .poll(() => page.locator('[data-slot="drawer-popup"]').evaluate((element) => getComputedStyle(element).transform))
    .toBe('matrix(1, 0, 0, 1, 0, 0)')
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  expect(await compactPicker.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
  await page.screenshot({ path: 'test-results/owner-view-sidebar-phone.png', fullPage: true })
  await compactPicker.getByRole('button', { name: 'Close' }).click()

  await page.setViewportSize({ width: 1600, height: 900 })
  await page.locator('[data-unit="Immortals"]').getByRole('button', { name: 'Immortals', exact: true }).click()
  await page.getByRole('button', { name: 'Build', exact: true }).click()
  await expect(page.getByLabel('Add a unit')).toBeVisible()
  await expect(page.getByRole('button', { name: /Unit actions for Immortals/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /More models in Immortals/ })).toBeVisible()
})

test('Deathwatch excludes Scouts from its unit picker', async ({ page }) => {
  await openBuilder(page, 'Deathwatch', /Black Spear Task Force/)
  await page.getByLabel('Add a unit').fill('Scout')
  await expect(page.getByRole('button', { name: /Add Scout/ })).toHaveCount(0)
})

test('Black Templars exclude Codex datasheets and Psykers from their unit picker', async ({ page }) => {
  await openBuilder(page, 'Black Templars', /Companions of Vehemence/)
  await page.getByLabel('Add a unit').fill('Librarian')
  await expect(page.getByText('No matching units.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Add Librarian', exact: true })).toHaveCount(0)
  // Their own Gladiator Lancer carries the Black Templars keyword and is legal; the
  // Codex one the book imports is not, so exactly one is offered.
  await page.getByLabel('Add a unit').fill('Gladiator Lancer')
  await expect(page.getByRole('button', { name: 'Add Gladiator Lancer', exact: true })).toHaveCount(1)
  await page.screenshot({ path: 'test-results/black-templars-restrictions.png', fullPage: true })
})

test('adding a unit keeps the confirmed roster visible while pricing catches up', async ({ page }) => {
  await openBuilder(page)
  await add(page, 'Immortals')
  const immortals = page.locator('[data-unit="Immortals"]')
  await expect(immortals).toBeVisible()

  await page.route('**/_serverFn/**', async (route) => {
    if (route.request().method() === 'POST') await new Promise((resolve) => setTimeout(resolve, 1000))
    await route.continue()
  })
  await add(page, 'Skorpekh Destroyers')

  await expect(immortals).toBeVisible({ timeout: 250 })
  await expect(page.locator('[data-unit]')).toHaveCount(1, { timeout: 250 })
  await expect(page.locator('[data-unit="Skorpekh Destroyers"]')).toBeVisible()
  await page.screenshot({ path: 'test-results/roster-visible-while-adding.png', fullPage: true })
})

test('deleting a unit keeps the rest of the roster visible while pricing catches up', async ({ page }) => {
  await openBuilder(page)
  await add(page, 'Immortals')
  await add(page, 'Overlord')
  await add(page, 'Necron Warriors')
  await expect(page.locator('[data-unit]')).toHaveCount(3)

  await page.route('**/_serverFn/**', async (route) => {
    if (route.request().method() === 'POST') await new Promise((resolve) => setTimeout(resolve, 1000))
    await route.continue()
  })
  await page.locator('[data-unit="Overlord"]').getByLabel('Unit actions for Overlord').click()
  await page.getByRole('menuitem', { name: 'Delete unit' }).click()

  // The two that are left stay on screen: the roster is drawn from the price, and the
  // price is a round trip behind, so discarding it emptied the list in front of you.
  await expect(page.getByText('Pick a unit to start building.')).toBeHidden({ timeout: 250 })
  await expect(page.locator('[data-unit]')).toHaveCount(2, { timeout: 250 })
  await expect(page.locator('[data-unit="Immortals"]')).toBeVisible()
  await expect(page.locator('[data-unit="Necron Warriors"]')).toBeVisible()
  await page.screenshot({ path: 'test-results/roster-visible-while-deleting.png', fullPage: true })
})

test('collection changes do not reorder roster and reference rows', async ({ page }) => {
  await openBuilder(page)
  await add(page, 'Necron Warriors')
  await add(page, 'Immortals')

  await page.locator('[data-unit="Necron Warriors"]').getByLabel('Unit actions for Necron Warriors').click()
  const collected = page.waitForResponse((response) => response.ok() && response.request().method() === 'POST')
  await page.getByRole('menuitemcheckbox', { name: 'Add to collection' }).click()
  await collected

  await expect(page.locator('[data-unit]').first()).toHaveAttribute('data-unit', 'Immortals')
  await page.goto('/factions/necrons/datasheets')
  const datasheets = page.getByRole('link', { name: /^(Immortals|Necron Warriors)/ })
  await expect(datasheets.first()).toHaveAccessibleName(/^Immortals/)
  await page.screenshot({ path: 'test-results/stable-collection-order.png', fullPage: true })
})

test('contained faction datasheet rows stay accessible and resize without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 1512, height: 774 })
  await page.goto('/factions/space-marines/datasheets')
  const rows = page.locator('[data-datasheet]')
  const offscreenName = 'Sternguard Veteran Squad'
  const offscreenRow = page.locator(`[data-datasheet="${offscreenName}"]`)
  await expect(offscreenRow).toHaveCount(1)
  expect(await offscreenRow.evaluate((row) => row.getBoundingClientRect().top)).toBeGreaterThan(
    await page.evaluate(() => window.innerHeight),
  )
  const session = await page.context().newCDPSession(page)
  const tree = await session.send('Accessibility.getFullAXTree')
  expect(
    tree.nodes.some(
      (node) => node.role?.value === 'link' && node.name?.value.toLocaleLowerCase().startsWith(offscreenName.toLocaleLowerCase()),
    ),
  ).toBe(true)
  await rows.last().scrollIntoViewIfNeeded()

  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  await expect(rows.last()).toBeVisible()
  await page.screenshot({ path: 'test-results/faction-datasheets-mobile-bottom.png' })
})

test('favourite detachments rise to the top of roster setup', async ({ page }) => {
  await signUp(page, 'Richard')
  await page.goto('/rosters')
  await page.getByRole('button', { name: 'Create editable roster' }).click()
  const dialog = page.getByRole('dialog', { name: 'Create roster' })
  await dialog.getByRole('combobox', { name: 'Faction' }).click()
  await page.getByPlaceholder('Search factions…').fill('Necrons')
  await page.getByRole('option', { name: 'Necrons', exact: true }).click()

  const favourite = dialog.getByRole('button', { name: 'Add Cursed Legion to favourite detachments' })
  const favourited = page.waitForResponse((response) => response.ok() && response.request().method() === 'POST')
  await favourite.click()
  await favourited
  const kept = dialog.getByRole('button', { name: 'Remove Cursed Legion from favourite detachments' })
  await expect(kept).toBeVisible()
  await expect(dialog.getByRole('button', { name: /^Select (Cursed Legion|Awakened Dynasty)$/ }).first()).toHaveAccessibleName(
    'Select Cursed Legion',
  )

  await page.goto('/factions/necrons')
  await expect(page.getByRole('link', { name: /^(Cursed Legion|Awakened Dynasty)/ }).first()).toHaveAccessibleName(/^Cursed Legion/)
})

test('King of the Colosseum creation keeps exactly one detachment selected', async ({ page }) => {
  await signUp(page, 'Richard')
  await page.goto('/rosters')
  await page.getByRole('button', { name: 'Create editable roster' }).click()
  const dialog = page.getByRole('dialog', { name: 'Create roster' })
  await dialog.getByRole('combobox', { name: 'Faction' }).click()
  await page.getByPlaceholder('Search factions…').fill('Necrons')
  await page.getByRole('option', { name: 'Necrons', exact: true }).click()
  await dialog.getByRole('combobox', { name: 'Battle size' }).click()
  await expect(page.getByRole('option', { name: /King of the Colosseum/ })).toHaveCount(1)
  await page.screenshot({ path: 'test-results/kotc-size-options.png', fullPage: true })
  await page.getByRole('option', { name: /King of the Colosseum/ }).click()

  const awakened = dialog.getByRole('button', { name: 'Select Awakened Dynasty' })
  const cryptek = dialog.getByRole('button', { name: 'Select Cryptek Conclave' })
  await awakened.click()
  await cryptek.click()

  await expect(dialog.getByRole('button', { name: 'Select Awakened Dynasty' })).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Remove Cryptek Conclave' })).toBeVisible()

  await dialog.getByRole('button', { name: 'Create roster' }).click()
  await page.waitForURL(/\/rosters\/[^/]+$/)
  await expect(page.getByText('King of the Colosseum', { exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'King of the Colosseum' })).toHaveCount(0)
  for (const excluded of ['Imotekh the Stormlord', 'Monolith']) {
    await page.getByLabel('Add a unit').fill(excluded)
    await expect(page.getByRole('button', { name: `Add ${excluded}`, exact: true })).toHaveCount(0)
  }
  await page.getByLabel('Add a unit').fill('Chronomancer')
  const addChronomancer = page.getByRole('button', { name: 'Add Chronomancer', exact: true })
  await addChronomancer.click()
  await expect(page.getByText('1/1 in roster')).toBeVisible()
  await expect(addChronomancer).toBeDisabled()
  await page.getByLabel('Add a unit').fill('Immortals')
  const addImmortals = page.getByRole('button', { name: 'Add Immortals', exact: true })
  await addImmortals.click()
  await expect(page.getByText('1/2 in roster')).toBeVisible()
  await expect(addImmortals).toBeEnabled()
  await addImmortals.click()
  await expect(page.getByText('2/2 in roster')).toBeVisible()
  await expect(addImmortals).toBeDisabled()
  await page.screenshot({ path: 'test-results/kotc-picker-rules.png', fullPage: true })

  /*
   * A waived restriction is waived wherever the list is read, including on the next
   * document request. Switching Epic Heroes off puts Imotekh back in the book, and the
   * reloaded page does not report the unit the list now allows — the saved roster is
   * priced through a different path from the editing one, and that path forgot the
   * waivers once.
   */
  await page.getByRole('button', { name: 'Format restrictions' }).click()
  await waitForRosterSave(page, () => page.getByRole('menuitemcheckbox', { name: /No Epic Heroes/ }).click())
  await page.keyboard.press('Escape')
  await page.getByLabel('Add a unit').fill('Imotekh the Stormlord')
  const addImotekh = page.getByRole('button', { name: 'Add Imotekh the Stormlord', exact: true })
  await expect(addImotekh).toBeVisible()
  await waitForRosterSave(page, () => addImotekh.click())
  await page.reload()
  await expect(page.locator('[data-unit="Imotekh the Stormlord"]')).toBeVisible()
  await expect(page.getByText('does not allow Epic Heroes')).toHaveCount(0)
  const waived = page.getByRole('region', { name: 'Format restrictions switched off' })
  await expect(waived).toContainText('No Epic Heroes')
  await page.screenshot({ path: 'test-results/kotc-waived-epic-heroes.png', fullPage: true })

  // Dismissing says "I know", and it stays said for this list until the set changes.
  await waived.getByRole('button', { name: 'Dismiss the format restriction warning' }).click()
  await expect(waived).toHaveCount(0)
  await page.reload()
  await expect(page.locator('[data-unit="Imotekh the Stormlord"]')).toBeVisible()
  await expect(page.getByRole('region', { name: 'Format restrictions switched off' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Format restrictions' }).click()
  await waitForRosterSave(page, () => page.getByRole('menuitemcheckbox', { name: /Toughness cap/ }).click())
  await page.keyboard.press('Escape')
  await expect(page.getByRole('region', { name: 'Format restrictions switched off' })).toContainText('Toughness cap')

  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: 'Add units', exact: true }).click()
  const mobilePicker = page.getByRole('dialog', { name: 'Add units' })
  await expect(mobilePicker.getByText('2/2 in roster')).toBeVisible()
  await mobilePicker.screenshot({ path: 'test-results/kotc-picker-rules-mobile.png' })
})

test('a waived format restriction cannot widen the mobile roster', async ({ page }) => {
  await signUp(page, 'Richard')
  await createRoster(page, {
    faction: 'Necrons',
    detachment: /Awakened Dynasty/,
    size: /King of the Colosseum/,
  })

  await page.getByRole('button', { name: 'Format restrictions' }).click()
  await page.getByRole('menuitemcheckbox', { name: /No Epic Heroes/ }).click()
  await page.keyboard.press('Escape')
  await expect(page.getByText('1 format restriction is switched off', { exact: true })).toBeVisible()
  await add(page, 'Imotekh the Stormlord')

  await page.setViewportSize({ width: 390, height: 844 })
  const imotekh = page.locator('[data-unit="Imotekh the Stormlord"]')
  await expect(imotekh).toBeVisible()
  await expectNoHorizontalOverflow(page.locator('html'))
  await page.evaluate(() => window.scrollTo({ left: 100, behavior: 'instant' }))
  expect(await page.evaluate(() => window.scrollX)).toBe(0)
  await page.screenshot({ path: 'test-results/waived-roster-mobile.png', fullPage: true })

  await imotekh.getByRole('button', { name: 'Imotekh the Stormlord', exact: true }).click()
  const loadout = page.locator('aside[aria-label="Loadout"]')
  await expect(loadout.getByText('Equipped ranged weapons', { exact: true })).toBeVisible()
  await expectNoHorizontalOverflow(page.locator('html'))
  await expectInsideHorizontalBounds(loadout, loadout.locator('[data-slot="unit-profile"] > div:first-child > div'))
  await expectInsideHorizontalBounds(loadout, loadout.locator('[data-slot="datasheet-content"] [class*="grid-cols-6"] > div'))
  await page.screenshot({ path: 'test-results/imotekh-mobile-loadout.png', fullPage: true })

  await loadout.getByRole('button', { name: 'Back to roster' }).click()
  await expectNoHorizontalOverflow(page.locator('html'))
  await page.screenshot({ path: 'test-results/waived-roster-after-loadout-mobile.png', fullPage: true })
})
