import { expect, type Locator, type Page, test } from '@playwright/test'
import { createRoster, signUp, waitForRosterSave } from './account'

/**
 * A picture of one element, taken again if the page moved under it.
 *
 * A panel re-renders as its deferred pricing arrives, which replaces the node a
 * locator resolved to a moment before — so on a cold first run the element a passing
 * assertion just read could be gone by the time it is photographed.
 */
async function shot(element: Locator, path: string) {
  await expect(async () => {
    await element.screenshot({ path })
  }).toPass({ timeout: 10_000 })
}

/**
 * The four things a player coming from another builder reaches for: squad size where
 * the roster is, the filters that narrow a book down to today's real options, and
 * characters standing with the units they lead.
 */
async function openBuilder(page: Page, faction = 'Necrons', detachment = /Awakened Dynasty/) {
  await signUp(page, 'Richard')
  await createRoster(page, { faction, detachment })
}

async function add(page: Page, name: string) {
  await page.getByLabel('Add a unit').fill(name)
  await page
    .getByRole('button', { name: `Add ${name}`, exact: true })
    .first()
    .click()
}

async function attach(page: Page, unit: string, target: string) {
  await page
    .locator(`[data-unit="${unit}"]`)
    .first()
    .getByRole('button', { name: `Attach ${unit} to unit` })
    .click()
  await page.getByRole('menu').getByRole('menuitem', { name: target, exact: true }).click()
}

test('the unit picker stays within the roster faction', async ({ page }) => {
  await openBuilder(page)
  await expect(page.getByRole('combobox', { name: 'Force' })).toHaveCount(0)
})

test('the roster workspace stays in place while the desktop picker hydrates', async ({ page }) => {
  await openBuilder(page)
  await page.getByLabel('Add a unit').fill('Immortals')
  await waitForRosterSave(page, () => page.getByRole('button', { name: 'Add Immortals', exact: true }).first().click())
  await expect(page.locator('[data-unit="Immortals"]')).toBeVisible()

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
  await page.waitForTimeout(1_500)
  const values = await page.evaluate(() => (window as typeof window & { __rosterLayoutShiftValues: number[] }).__rosterLayoutShiftValues)
  expect(values.reduce((total, value) => total + value, 0)).toBeLessThan(0.05)
  await page.screenshot({ path: 'test-results/stable-roster-workspace.png', fullPage: true })

  await page.setViewportSize({ width: 390, height: 844 })
  await page.reload()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  expect(await page.locator('[data-slot="roster-units"]').evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
  await page.screenshot({ path: 'test-results/stable-roster-workspace-phone.png', fullPage: true })

  await page.locator('[data-unit="Immortals"]').getByRole('button', { name: 'Immortals', exact: true }).click()
  const loadout = page.locator('aside[aria-label="Loadout"]')
  await expect(loadout).toBeVisible()
  await expect(loadout.getByRole('heading', { name: 'Attachments' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  expect(await loadout.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
  await page.screenshot({ path: 'test-results/stable-roster-loadout-phone.png', fullPage: true })
})

test('the whole book is on the shelves, not the first page of it', async ({ page }) => {
  // A Space Marine book runs to well over a hundred datasheets and the picker sorts
  // them by name, so a cut-off page ended mid-alphabet: the infantry shelf stopped at
  // Inner Circle Companions and Sternguard Veterans could only be found by searching.
  await openBuilder(page, 'Space Marines', /Gladius Task Force/)
  await expect(page.getByRole('button', { name: 'Add Sternguard Veteran Squad', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Add Whirlwind', exact: true })).toBeVisible()
})

test('datasheet metadata is searchable in the picker and global search', async ({ page }) => {
  await openBuilder(page)
  await page.getByLabel('Add a unit').fill('cryptek')

  await expect(page.locator('[data-picker-unit="Technomancer"]')).toContainText('Matches Cryptek keyword')
  await expect(page.locator('[data-picker-unit="Cryptothralls"]')).toContainText('Matches Cryptek Retinue ability')
  await expect(page.locator('[data-picker-unit="Necron Warriors"]')).toHaveCount(0)
  await page.getByLabel('Add a unit').fill('cryptek staff')
  await expect(page.locator('[data-picker-unit="Technomancer"]')).toContainText('Matches Cryptek keyword · Staff of light weapon')
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

  await page.getByRole('button', { name: 'View', exact: true }).click()
  await page.reload()
  await expect(page.getByRole('button', { name: 'View', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Add Immortals', exact: true }).click()
  await page.locator('[data-unit="Immortals"]').getByRole('button', { name: 'Immortals', exact: true }).click()
  await expect(page.getByRole('button', { name: /More models in Immortals/ })).toHaveCount(0)
  const loadout = page.locator('aside[aria-label="Loadout"]')
  await expect(loadout.getByRole('heading', { name: 'Attachments' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Build', exact: true }).click()
  await expect(loadout.getByRole('heading', { name: 'Attachments' })).toBeVisible()
})

test('Deathwatch excludes Scouts from its unit picker', async ({ page }) => {
  await openBuilder(page, 'Deathwatch', /Black Spear Task Force/)
  await page.getByLabel('Add a unit').fill('Scout')
  await expect(page.getByRole('button', { name: /Add Scout/ })).toHaveCount(0)
})

test('Black Templars exclude prohibited datasheets and Psykers from their unit picker', async ({ page }) => {
  await openBuilder(page, 'Black Templars', /Companions of Vehemence/)
  for (const name of ['Gladiator Lancer', 'Librarian']) {
    await page.getByLabel('Add a unit').fill(name)
    await expect(page.getByText('No matching units.')).toBeVisible()
    await expect(page.getByRole('button', { name: `Add ${name}`, exact: true })).toHaveCount(0)
  }
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

test('owned units rise to the top of their roster and picker groups', async ({ page }) => {
  await openBuilder(page)
  await add(page, 'Necron Warriors')
  await add(page, 'Immortals')

  await page.locator('[data-unit="Immortals"]').getByLabel('Unit actions for Immortals').click()
  const collected = page.waitForResponse((response) => response.ok() && response.request().method() === 'POST')
  await page.getByRole('menuitemcheckbox', { name: 'Add to collection' }).click()
  await collected

  await expect(page.locator('[data-unit]').first()).toHaveAttribute('data-unit', 'Immortals')
  await expect(page.locator('aside[aria-label="Add units"] [data-picker-unit]').first()).toHaveAttribute('data-picker-unit', 'Immortals')
  await page.goto('/factions/necrons/datasheets')
  const datasheets = page.getByRole('link', { name: /^(Immortals|Necron Warriors)/ })
  await expect(datasheets.first()).toHaveAccessibleName(/^Immortals/)
  await page.screenshot({ path: 'test-results/owned-units-first.png', fullPage: true })
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
  await expect(page.getByRole('option', { name: /King of the Colosseum/ })).toHaveCount(2)
  await page.screenshot({ path: 'test-results/kotc-size-options.png', fullPage: true })
  await page.getByRole('option', { name: /King of the Colosseum \(600\)/ }).click()

  const awakened = dialog.getByRole('button', { name: 'Select Awakened Dynasty' })
  const cryptek = dialog.getByRole('button', { name: 'Select Cryptek Conclave' })
  await awakened.click()
  await cryptek.click()

  await expect(dialog.getByRole('button', { name: 'Select Awakened Dynasty' })).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Remove Cryptek Conclave' })).toBeVisible()

  await dialog.getByRole('button', { name: 'Create roster' }).click()
  await page.waitForURL(/\/rosters\/[^/]+$/)
  await expect(page.getByText('King of the Colosseum (600)', { exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'King of the Colosseum (600)' })).toHaveCount(0)
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
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: 'Add units', exact: true }).click()
  const mobilePicker = page.getByRole('dialog', { name: 'Add units' })
  await expect(mobilePicker.getByText('2/2 in roster')).toBeVisible()
  await mobilePicker.screenshot({ path: 'test-results/kotc-picker-rules-mobile.png' })
})

test('enhancement choices show descriptions when rule and catalogue names differ', async ({ page }) => {
  await openBuilder(page, 'Necrons', /Cursed Legion/)
  await add(page, 'Skorpekh Lord')
  await page
    .getByRole('button', { name: /^Skorpekh Lord/ })
    .first()
    .click()

  const enhancements = page.getByRole('group', { name: /Skorpekh Lord Enhancements/ })
  const mark = enhancements.getByRole('button', { name: 'Select Mark of the Nekrosor' })
  await expect(mark).toBeVisible()
  const option = mark.locator('xpath=ancestor::article')
  await expect(option).toContainText('add 1 to the Hit roll')
  await shot(option, 'test-results/nekrosor-enhancement.png')
})

test("Pantheon of Woe adds a C'tan shard's required enhancement", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 })
  await openBuilder(page, 'Necrons', /Pantheon of Woe/)
  await add(page, "C'tan Shard of the Deceiver")

  const card = page.locator('[data-unit="C\'tan Shard of the Deceiver"]')
  await expect(card).toContainText('375 pts')
  await expect(card).toContainText('Enhancement')
  await expect(card).toContainText('Singularity Matrix')
  await expect(card.getByText('1x Singularity Matrix', { exact: true })).toHaveCount(0)
  await shot(card, 'test-results/pantheon-forced-enhancement.png')

  await page
    .getByRole('button', { name: /^C'tan Shard of the Deceiver/ })
    .first()
    .click()
  const unit = page.locator('aside[aria-label="Loadout"]')
  await expect(unit.getByRole('button', { name: 'Feel No Pain 5+' })).toBeVisible()
  await expect(unit.getByRole('button', { name: 'Deadly Demise D6' })).toBeVisible()
  await shot(unit, 'test-results/pantheon-datasheet-abilities.png')
  const matrix = unit.getByRole('heading', { name: 'Singularity Matrix' }).locator('..')
  await expect(matrix).toContainText('Lord of Deceit (Aura)')
  await shot(matrix, 'test-results/pantheon-singularity-matrix.png')

  await page.getByLabel('Add a unit').fill('Imotekh the Stormlord')
  await page.getByRole('button', { name: 'View Imotekh the Stormlord datasheet' }).click()
  const datasheet = page.locator('aside[aria-label="Datasheet"]')
  const noble = datasheet.getByText('Noble', { exact: true })
  await expect(noble).toHaveCSS('color', 'rgb(137, 184, 157)')
  await expect(datasheet.getByText('Character', { exact: true })).toHaveCSS('color', 'rgb(137, 184, 157)')
  await expect(datasheet.getByRole('button', { name: 'Leader', exact: true })).toBeVisible()
  const canLead = datasheet.getByRole('heading', { name: 'Can lead' }).locator('..')
  await expect(canLead.getByRole('button', { name: 'Immortals', exact: true })).toBeVisible()
  await expect(datasheet.getByRole('button', { name: 'Add to list' })).toBeVisible()
  await expect(datasheet.getByRole('button', { name: 'Ignores Cover', exact: true })).toHaveCSS('font-size', '13.5px')
  await shot(datasheet, 'test-results/imotekh-datasheet-tags.png')
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(noble).toBeVisible()
  await shot(datasheet, 'test-results/imotekh-datasheet-tags-phone.png')

  await page.setViewportSize({ width: 1600, height: 900 })
  await page.getByLabel('Add a unit').fill('Plasmancer')
  await page.getByRole('button', { name: 'View Plasmancer datasheet' }).click()
  await expect(datasheet.getByRole('heading', { name: 'Harbinger of Destruction' })).toBeVisible()
  await expect(datasheet.getByRole('button', { name: 'Support', exact: true })).toBeVisible()
  const canSupport = datasheet.getByRole('heading', { name: 'Can support' }).locator('..')
  await canSupport.getByRole('button', { name: 'Immortals', exact: true }).click()
  await expect(datasheet.getByRole('heading', { name: 'Immortals', exact: true })).toBeVisible()
  await expect(datasheet.getByRole('heading', { name: 'Can be led by' })).toBeVisible()
  await expect(datasheet.getByRole('heading', { name: 'Can be supported by' })).toBeVisible()
  await datasheet.getByRole('button', { name: 'Add to list' }).click()
  await expect(page.locator('[data-unit="Immortals"]')).toBeVisible()
  await shot(datasheet, 'test-results/plasmancer-roster-datasheet.png')

  await page.goto('/factions/necrons/datasheets/imotekh-the-stormlord')
  const referenceHeader = page.locator('main > header')
  await expect(referenceHeader.locator('[data-faction-mark="necrons"]')).toBeVisible()
  await expect(referenceHeader.getByText('Noble', { exact: true })).toHaveCSS('color', 'rgb(137, 184, 157)')
  await shot(referenceHeader, 'test-results/imotekh-reference-tags.png')
  await page.goto('/factions/necrons/datasheets/lokhust-lord')
  const lokhustProfile = page.locator('main section').first()
  await expect(page.getByText('Models', { exact: true })).toHaveCount(0)
  await expect(lokhustProfile.getByText('Invulnerable save', { exact: true })).toBeVisible()
  await expect(lokhustProfile.getByText('4+', { exact: true })).toBeVisible()
  await shot(lokhustProfile, 'test-results/lokhust-lord-characteristics.png')
})

test('unit upgrades stay separate from character enhancements', async ({ page }) => {
  await openBuilder(page, 'Necrons', /Skyshroud Spearhead/)
  await add(page, 'Lokhust Destroyers')
  await page
    .getByRole('button', { name: /^Lokhust Destroyers/ })
    .first()
    .click()

  const upgrades = page.getByRole('group', { name: 'Lokhust Destroyers Unit upgrades' })
  const madness = upgrades.getByRole('button', { name: 'Select Deepening Madness' })
  await expect(madness).toBeVisible()
  await upgrades.getByRole('button', { name: 'ASSAULT' }).hover()
  await expect(page.getByRole('tooltip')).toContainText('assault shooting')
  await page.mouse.move(0, 0)
  await expect(page.getByRole('tooltip')).toBeHidden()
  const madnessOption = madness.locator('xpath=ancestor::article')
  await expect(madnessOption.locator('.font-rules')).toHaveCSS('font-family', /^Barlow,/)
  await expect(madness).toHaveCSS('font-family', /Barlow Semi Condensed/)
  await shot(madnessOption, 'test-results/deepening-madness-option.png')
  await page.setViewportSize({ width: 390, height: 844 })
  await shot(madnessOption, 'test-results/deepening-madness-option-phone.png')
  await page.setViewportSize({ width: 1280, height: 720 })
  const optionBox = await madnessOption.boundingBox()
  await madnessOption.click({ position: { x: 20, y: (optionBox?.height ?? 20) - 10 } })
  await expect(madness).toHaveAttribute('aria-pressed', 'true')
  const card = page.locator('[data-unit="Lokhust Destroyers"]')
  await expect(card).toContainText('Upgrade')
  await expect(card).toContainText('Deepening Madness')
  await expect(card.getByText('1x Deepening Madness', { exact: true })).toHaveCount(0)
  await shot(card, 'test-results/deepening-madness-upgrade.png')

  await page.getByRole('button', { name: 'Roster actions' }).click()
  await page.getByRole('menuitem', { name: 'Export GW text' }).click()
  const exportDialog = page.getByRole('dialog', { name: 'Games Workshop text' })
  await expect(exportDialog).toContainText('Enhancement: Deepening Madness')
  await shot(exportDialog, 'test-results/deepening-madness-export.png')
  await exportDialog.getByRole('button', { name: 'Close' }).click()

  // The upgrade appends [ASSAULT] to the weapon, and a keyword nothing on the
  // datasheet links is still a rule a player can read — with what put it there.
  const assault = page.getByRole('button', { name: 'Assault', exact: true }).first()
  await expect(assault).toBeVisible()
  await assault.hover()
  await expect(page.getByRole('tooltip')).toContainText('assault shooting')
  await expect(page.getByRole('tooltip')).toContainText('Added by Deepening Madness')
  await expect(assault).toHaveClass(/text-info/)
  await shot(page.getByRole('tooltip'), 'test-results/added-keyword-tooltip.png')
  await page.mouse.move(0, 0)
  await expect(page.getByRole('tooltip')).toBeHidden()

  await page.setViewportSize({ width: 1600, height: 900 })
  await add(page, 'Lokhust Heavy Destroyers')
  await page
    .getByRole('button', { name: /^Lokhust Heavy Destroyers/ })
    .first()
    .click()
  await page
    .getByRole('group', { name: 'Lokhust Heavy Destroyers Unit upgrades' })
    .getByRole('button', { name: 'Select Deepening Madness' })
    .click()
  await expect(page.getByText('Could not validate every catalogue rule')).toHaveCount(0)
  await page.screenshot({ path: 'test-results/shared-deepening-madness.png', fullPage: true })

  await page.goto('/factions/necrons/reference/detachments/skyshroud-spearhead')
  const unitUpgrades = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Unit upgrades' }) })
  await expect(unitUpgrades).toContainText('Deepening Madness')
  const enhancements = page.locator('section').filter({ has: page.getByText('Enhancements', { exact: true }) })
  await expect(enhancements).not.toContainText('Deepening Madness')
  await page.screenshot({ path: 'test-results/skyshroud-unit-upgrades.png', fullPage: true })
})

test('a unit upgrade shows the core ability it grants', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 })
  await openBuilder(page, 'Necrons', /Hand of the Dynasty/)
  await add(page, 'Necron Warriors')
  await page.locator('[data-unit="Necron Warriors"]').getByRole('button', { name: 'Necron Warriors', exact: true }).click()

  const loadout = page.locator('aside[aria-label="Loadout"]')
  await loadout.getByRole('button', { name: 'Select Enlivened Sentinels' }).click()
  const scouts = loadout.getByRole('button', { name: 'Scouts 5"', exact: true })
  await expect(scouts).toHaveClass(/text-info/)
  await scouts.hover()
  await expect(page.getByRole('tooltip')).toContainText('Added by Enlivened Sentinels')
  await shot(loadout, 'test-results/enlivened-sentinels-granted-ability.png')

  await page.setViewportSize({ width: 390, height: 844 })
  await shot(loadout, 'test-results/enlivened-sentinels-granted-ability-phone.png')
})

test('wargear abilities are explained beside their choices', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 })
  await openBuilder(page)
  await add(page, 'Tomb Blades')
  await page
    .getByRole('button', { name: /^Tomb Blades/ })
    .first()
    .click()

  const loadout = page.locator('aside[aria-label="Loadout"]')
  for (const name of ['Shadowloom', 'Nebuloscope']) {
    const option = loadout.getByRole('listitem').filter({ hasText: name })
    await expect(option.locator('[data-slot="option-abilities"] p')).not.toHaveCount(0)
  }

  await expect(loadout.getByLabel('Tomb Blades models')).toHaveText('3')
  await loadout.getByRole('button', { name: 'More Shadowloom' }).click()
  await expect(loadout.getByLabel('Shadowloom count')).toHaveText('1')
  await expect(loadout.getByLabel('Tomb Blades models')).toHaveText('3')
  await expect(page.locator('[data-roster-builder]')).toHaveAttribute('data-saving', 'false')
  await expect(loadout.getByLabel('Tomb Blades models')).toHaveText('3')
  await expect(page.locator('[data-unit="Tomb Blades"]')).toBeVisible()
  await loadout.getByRole('button', { name: 'Fewer Shadowloom' }).click()
  await expect(loadout.getByLabel('Shadowloom count')).toHaveText('0')
  await expect(page.locator('[data-roster-builder]')).toHaveAttribute('data-saving', 'false')
  await expect(loadout.getByLabel('Tomb Blades models')).toHaveText('3')
  await loadout.getByRole('button', { name: 'More models in Tomb Blades' }).click()
  await expect(loadout.getByLabel('Tomb Blades models')).toHaveText('4')
  await loadout.getByRole('button', { name: 'Fewer models in Tomb Blades' }).click()
  await expect(loadout.getByLabel('Tomb Blades models')).toHaveText('3')

  for (const models of ['4', '5', '6']) {
    await loadout.getByRole('button', { name: 'More models in Tomb Blades' }).click()
    await expect(loadout.getByLabel('Tomb Blades models')).toHaveText(models)
  }
  await loadout.getByRole('button', { name: 'More Shadowloom' }).click()
  await expect(loadout.getByLabel('Shadowloom count')).toHaveText('1')
  await loadout.getByRole('button', { name: 'More Shadowloom' }).click()
  await expect(loadout.getByLabel('Shadowloom count')).toHaveText('2')
  await expect(page.locator('[data-roster-builder]')).toHaveAttribute('data-saving', 'false')
  await loadout.getByRole('button', { name: 'Fewer models in Tomb Blades' }).click()
  await expect(loadout.getByLabel('Tomb Blades models')).toHaveText('5')
  await loadout.getByRole('button', { name: 'Fewer models in Tomb Blades' }).click()
  await loadout.getByRole('button', { name: 'Fewer models in Tomb Blades' }).click()
  await expect(loadout.getByLabel('Tomb Blades models')).toHaveText('3')

  // Each press asks the server what the squad now holds, and the next press divides
  // whatever comes back. Pressing again before the answer arrives divides the old
  // numbers, so the two are taken one at a time here.
  await loadout.getByRole('button', { name: 'More Particle beamer' }).click()
  await expect(loadout.getByLabel('Particle beamer count')).toHaveText('1')
  await loadout.getByRole('button', { name: 'More Twin tesla carbine' }).click()
  await expect(loadout.getByLabel('Twin tesla carbine count')).toHaveText('1')
  await expect(loadout.getByLabel('Twin gauss blaster count')).toHaveText('1')
  await expect(loadout.getByLabel('Particle beamer count')).toHaveText('1')
  await expect(loadout.getByLabel('Twin tesla carbine count')).toHaveText('1')

  await expect(loadout.getByLabel('Shieldvanes count')).toHaveText('0')
  for (const count of ['1', '2', '3']) {
    await loadout.getByRole('button', { name: 'More Shieldvanes' }).click()
    await expect(loadout.getByLabel('Shieldvanes count')).toHaveText(count)
  }
  await expect(page.getByRole('button', { name: /M 8", modified from 12"/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Sv 3\+, modified from 4\+/ })).toBeVisible()
  await page.screenshot({ path: 'test-results/tomb-blades-shieldvanes.png', fullPage: true })
})

test('destroyer plasmacytes follow the unit size', async ({ page }) => {
  await openBuilder(page)
  for (const name of ['Skorpekh Destroyers', 'Ophydian Destroyers']) {
    await add(page, name)
    await page.locator(`[data-unit="${name}"]`).getByRole('button', { name, exact: true }).click()
    const loadout = page.locator('aside[aria-label="Loadout"]')
    await expect(loadout.getByLabel('Plasmacyte count')).toHaveText('1')
    await expect(page.locator(`[data-unit="${name}"]`)).toContainText('1x Plasmacyte')
    await loadout.getByRole('button', { name: `More models in ${name}` }).click()
    await loadout.getByRole('button', { name: `More models in ${name}` }).click()
    await loadout.getByRole('button', { name: `More models in ${name}` }).click()
    await expect(loadout.getByLabel(`${name} models`)).toHaveText('6')
    await expect(loadout.getByLabel('Plasmacyte count')).toHaveText('2')
    await expect(page.locator(`[data-unit="${name}"]`)).toContainText('2x Plasmacyte')
    await page.screenshot({ path: `test-results/${name.toLowerCase().replaceAll(' ', '-')}-plasmacytes.png`, fullPage: true })
    await loadout.getByRole('button', { name: 'Fewer Plasmacyte' }).click()
    await expect(loadout.getByLabel('Plasmacyte count')).toHaveText('1')
  }
})

/**
 * An enhancement changes what the bearer's weapons do, and the loadout has to say so:
 * its weapon rows were drawn from the sheet fetched to learn what a unit *could*
 * take, which is fetched without the list and so cannot see an enhancement at all.
 */
test('an enhancement changes the weapons of the model bearing it', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 })
  await openBuilder(page, 'Necrons', /Cursed Legion/)
  await add(page, 'Overlord')
  await page
    .locator('[data-unit="Overlord"]')
    .getByRole('button', { name: /^Overlord/ })
    .click()

  const loadout = page.locator('aside[aria-label="Loadout"]')
  await expect(loadout.getByText("Overlord's blade")).not.toHaveCount(0)
  await expect(page.getByRole('button', { name: /A 6, modified from 4/ })).toHaveCount(0)

  await loadout.getByRole('button', { name: 'Select Destroyer Ankh' }).click()
  await expect(page.locator('[data-roster-builder]')).toHaveAttribute('data-saving', 'false')

  // The ankh adds two to the Move of the bearer's unit and two to the Attacks of the
  // melee weapons it carries, and says as much on both.
  await expect(page.getByRole('button', { name: /M 7", modified from 5" by Destroyer Ankh/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /A 6, modified from 4 by Destroyer Ankh/ }).first()).toBeVisible()
  await page.screenshot({ path: 'test-results/destroyer-ankh.png', fullPage: true })

  // A weapon the Overlord could take rather than the one it holds says what it would
  // do in this list, which is the point of showing it before the choice is made.
  await expect(loadout.getByText('Staff of light')).not.toHaveCount(0)
  await expect(page.getByRole('button', { name: /S 7, modified from 5 by Destroyer Ankh/ }).first()).toBeVisible()

  // Attached, the two are one unit: the ankh moves the models it has joined, and
  // leaves their weapons alone.
  await add(page, 'Immortals')
  await attach(page, 'Overlord', 'Immortals')
  await expect(page.locator('[data-roster-builder]')).toHaveAttribute('data-saving', 'false')
  await expect(page.locator('[data-unit="Overlord"]')).toContainText('Leading')
  await page.locator('[data-unit="Immortals"]').getByRole('button', { name: 'Immortals', exact: true }).click()
  await expect(page.getByRole('button', { name: /M 7", modified from 5" by Destroyer Ankh/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /modified from 2 by Destroyer Ankh/ })).toHaveCount(0)
  await page.screenshot({ path: 'test-results/destroyer-ankh-attached.png', fullPage: true })

  /*
   * A supporting character joins the same unit, which makes the three of them one
   * unit: the ankh moves every model in it, so the Chronomancer's own relic and the
   * Overlord's both reach it. Reading only what a character is attached to told it
   * nothing about the character standing beside it.
   */
  await add(page, 'Chronomancer')
  const chronomancer = page.locator('[data-unit="Chronomancer"]')
  await attach(page, 'Chronomancer', 'Immortals')
  await expect(page.locator('[data-roster-builder]')).toHaveAttribute('data-saving', 'false')
  await chronomancer.getByRole('button', { name: 'Chronomancer', exact: true }).click()
  await loadout.getByRole('button', { name: 'Select Murdermind' }).click()
  await expect(page.locator('[data-roster-builder]')).toHaveAttribute('data-saving', 'false')
  // Three inches from the relic it bears, two from the one its unit's Overlord bears.
  await expect(page.getByRole('button', { name: 'M 10", modified from 5" by Destroyer Ankh, Murdermind' })).toBeVisible()
  await page.screenshot({ path: 'test-results/attached-unit-modifiers.png', fullPage: true })

  // The rows under a unit's name are part of its card: the one saying who it is
  // standing with opens it, as clicking the name does.
  const supporting = chronomancer.getByText('Supporting', { exact: true })
  const row = (await supporting.boundingBox())!
  await page.mouse.click(row.x + row.width / 2, row.y + row.height / 2)
  await expect(chronomancer.getByRole('button', { name: 'Chronomancer', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.locator('[data-unit="Immortals"]').getByRole('button', { name: 'Immortals', exact: true }).click()
  await expect(chronomancer.getByRole('button', { name: 'Chronomancer', exact: true })).toHaveAttribute('aria-pressed', 'false')
  const enhancement = chronomancer.getByText('Murdermind', { exact: true })
  const enhancementRow = (await enhancement.boundingBox())!
  await page.mouse.click(enhancementRow.x + enhancementRow.width / 2, enhancementRow.y + enhancementRow.height / 2)
  await expect(chronomancer.getByRole('button', { name: 'Chronomancer', exact: true })).toHaveAttribute('aria-pressed', 'true')

  // And a unit is led by one character, so the second Overlord is not offered it.
  await add(page, 'Overlord')
  const second = page.locator('[data-unit="Overlord"]').nth(1)
  await expect(second).toBeVisible()
  await expect(second.getByRole('button', { name: 'Attach Overlord to unit' })).toHaveCount(0)

  // One relic, one army. The catalogue says so itself, and it is the player's to undo.
  await second.getByRole('button', { name: 'Overlord', exact: true }).click()
  await loadout.getByRole('button', { name: 'Select Destroyer Ankh' }).click()
  await expect(page.getByText('Destroyer Ankh: allows at most 1, has 2')).toHaveCount(1)
  await page.screenshot({ path: 'test-results/enhancement-once-per-army.png', fullPage: true })
})

/**
 * The same shape of enhancement in another book, and the scopes the data uses for it.
 * A Master Artisan adds one to the bearer's Wounds — written against the model — and
 * one to the Toughness of every model in its unit, written against the whole group.
 * The first of those scopes went unresolved, so half the relic did nothing.
 */
test('an enhancement adds to the bearer and to the unit around it', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 })
  await openBuilder(page, 'Drukhari', /Covenite Coterie/)
  await add(page, 'Haemonculus')
  await page
    .locator('[data-unit="Haemonculus"]')
    .getByRole('button', { name: /^Haemonculus/ })
    .click()

  const loadout = page.locator('aside[aria-label="Loadout"]')
  await loadout.getByRole('button', { name: 'Select Master Artisan' }).click()
  await expect(page.locator('[data-roster-builder]')).toHaveAttribute('data-saving', 'false')

  await expect(page.getByRole('button', { name: /W \d+, modified from \d+ by Master Artisan/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /T \d+, modified from \d+ by Master Artisan/ })).toBeVisible()
  await page.screenshot({ path: 'test-results/master-artisan.png', fullPage: true })
})

/**
 * Two sources name the same weapon: the catalogue prints a staff of light as two
 * rows, and the rules source spells the same two as "Staff of light (Ranged)" and
 * "(Melee)". Both drawn, a character appeared to carry the staff twice over.
 */
test('a weapon both sources name is drawn once', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 })
  await openBuilder(page)
  await add(page, 'Lokhust Lord')
  await page
    .locator('[data-unit="Lokhust Lord"]')
    .getByRole('button', { name: /^Lokhust Lord/ })
    .click()

  const loadout = page.locator('aside[aria-label="Loadout"]')
  await expect(loadout.getByRole('heading', { name: 'Staff of light', exact: true })).toHaveCount(2)
  await expect(loadout.getByRole('heading', { name: /Staff of light \(/ })).toHaveCount(0)
  // The catalogue's own two rows: one to shoot with, one to fight with. Read at the
  // weapon level rather than the profile, the fighting one printed its range as
  // `Melee"` and asked for a ballistic skill.
  await expect(loadout.getByText('Melee"')).toHaveCount(0)
  await expect(loadout.getByText('WS', { exact: true })).not.toHaveCount(0)
  await page.screenshot({ path: 'test-results/lokhust-lord-staff.png', fullPage: true })
})

/**
 * A squad divides itself between the weapons its models carry, and a specialist takes
 * a body from a squadmate to carry his. Arming the specialist used to come out of
 * whatever the squad held most of, so a player filling a squad with combi-weapons
 * found them quietly turning back into bolt rifles somewhere around half the squad.
 */
test('a squad keeps the weapons it was given while a specialist is armed', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 })
  await openBuilder(page, 'Dark Angels', /Wrath of the Rock/)
  await add(page, 'Sternguard Veteran Squad')
  await page
    .getByRole('button', { name: /^Sternguard Veteran Squad/ })
    .first()
    .click()

  const loadout = page.locator('aside[aria-label="Loadout"]')
  for (const models of ['6', '7', '8', '9', '10']) {
    await loadout.getByRole('button', { name: 'More models in Sternguard Veteran Squad' }).click()
    await expect(loadout.getByLabel('Sternguard Veteran Squad models')).toHaveText(models)
  }
  // The sergeant carries his own weapons, so every count here is the squad's.
  const veterans = loadout.locator('section').filter({ has: page.getByLabel('Sternguard Veteran models', { exact: true }) })
  await expect(veterans.getByLabel('Sternguard Bolt Rifle count')).toHaveText('9')

  await veterans.getByRole('button', { name: 'More Pyrecannon' }).click()
  await expect(veterans.getByLabel('Pyrecannon count')).toHaveText('1')
  await expect(veterans.getByLabel('Sternguard Bolt Rifle count')).toHaveText('8')
  await expect(page.locator('[data-roster-builder]')).toHaveAttribute('data-saving', 'false')

  for (const count of ['1', '2', '3', '4', '5', '6', '7', '8']) {
    await veterans.getByRole('button', { name: 'More Combi-weapon' }).click()
    await expect(veterans.getByLabel('Combi-weapon count')).toHaveText(count)
    await expect(veterans.getByLabel('Pyrecannon count')).toHaveText('1')
  }
  await expect(veterans.getByLabel('Sternguard Bolt Rifle count')).toHaveText('0')
  await expect(page.locator('[data-roster-builder]')).toHaveAttribute('data-saving', 'false')
  await expect(page.locator('[data-unit="Sternguard Veteran Squad"]')).toContainText('1x Pyrecannon')
  await page.screenshot({ path: 'test-results/sternguard-combi-weapons.png', fullPage: true })

  // Putting the pyrecannon down hands its body back rather than shrinking the squad.
  await veterans.getByRole('button', { name: 'Fewer Pyrecannon' }).click()
  await expect(veterans.getByLabel('Pyrecannon count')).toHaveText('0')
  await expect(veterans.getByLabel('Sternguard Veteran models')).toHaveText('9')
  await expect(loadout.getByLabel('Sternguard Veteran Squad models')).toHaveText('10')
})

/**
 * Free swaps live in the rules source rather than the community catalogue, so a card
 * counting the catalogue's own selection went on naming the weapon that was traded
 * away. Card and loadout answer the same question and have to agree.
 */
test('a free swap shows on the roster card as well as the loadout', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 })
  await openBuilder(page, 'Deathwatch', /Black Spear Task Force/)
  await add(page, 'Decimus Kill Team')
  await page
    .getByRole('button', { name: /^Decimus Kill Team/ })
    .first()
    .click()

  // A kill team joins at its smallest, one veteran of each kind.
  const card = page.locator('[data-unit="Decimus Kill Team"]')
  await expect(card).toContainText('1x Heavy thunder hammer')
  await expect(card).toContainText('1x Power weapon')
  await expect(card).not.toContainText('Astartes shield')

  const loadout = page.locator('aside[aria-label="Loadout"]')
  const swap = 'Power weapon and Astartes shield'
  await expect(loadout.getByLabel(`${swap} count`)).toHaveText('0')
  await loadout.getByRole('button', { name: `More ${swap}` }).click()
  await expect(loadout.getByLabel(`${swap} count`)).toHaveText('1')
  await expect(page.locator('[data-roster-builder]')).toHaveAttribute('data-saving', 'false')

  // The hammer was the only one, so it goes: the shield and a second power weapon
  // are what that veteran holds now.
  await expect(card).toContainText('1x Astartes shield')
  await expect(card).toContainText('2x Power weapon')
  await expect(card).not.toContainText('Heavy thunder hammer')
  await page.screenshot({ path: 'test-results/decimus-swap-on-card.png', fullPage: true })

  await loadout.getByRole('button', { name: 'More Heavy thunder hammer' }).click()
  await expect(loadout.getByLabel(`${swap} count`)).toHaveText('0')
  await expect(card).toContainText('1x Heavy thunder hammer')
  await expect(card).not.toContainText('Astartes shield')
})

test('Cursed Legion does not modify Immortals without an eligible leader', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 })
  await openBuilder(page, 'Necrons', /Cursed Legion/)
  await page.getByLabel('Add a unit').fill('Immortals')
  await page.getByRole('button', { name: 'View Immortals datasheet' }).click()
  const datasheet = page.locator('aside[aria-label="Datasheet"]')
  await expect(datasheet).toBeVisible()
  await expect(datasheet.getByRole('heading', { name: 'Gauss blaster' }).locator('..').getByText('5', { exact: true })).toBeVisible()
  await expect(page.locator('[data-unit="Immortals"]')).toHaveCount(0)
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).fontSize)).toBe('18px')
  await page.screenshot({ path: 'test-results/unit-preview.png' })

  await add(page, 'Immortals')
  await page
    .getByRole('button', { name: /^Immortals/ })
    .first()
    .click()

  const loadout = page.locator('aside[aria-label="Loadout"]')
  const gauss = loadout.locator('article').filter({ hasText: 'Gauss blaster' }).first()
  await expect(gauss.getByText('5', { exact: true }).first()).toBeVisible()
  await expect(page.getByRole('button', { name: /modified from 5 by Cursed Legion/ })).toHaveCount(0)
})

test('a supplement imports shared Space Marine units and its detachment group', async ({ page }) => {
  await signUp(page, 'Richard')
  await createRoster(page, { faction: 'Black Templars', detachment: /Companions of Vehemence/ })
  await add(page, 'Intercessor Squad')
  await expect(page.locator('[data-unit="Intercessor Squad"]')).toBeVisible()
  await add(page, 'Crusader Squad')
  await expect(page.locator('[data-unit="Crusader Squad"]')).toBeVisible()

  await page.getByRole('button', { name: 'Roster actions' }).click()
  await page.getByRole('menuitem', { name: 'Edit roster setup' }).click()
  const setup = page.getByRole('dialog', { name: 'Edit roster setup' })
  await setup.getByRole('combobox', { name: 'Faction' }).click()
  await page.getByRole('option', { name: 'Imperial Fists', exact: true }).click()
  await expect(setup.getByRole('button', { name: "Select Emperor's Shield" })).toBeVisible()
  await expect(setup.getByRole('button', { name: /Select Imperialis Fleet/ })).toHaveCount(0)
})

test('detachment combinations follow the 11th edition allowance', async ({ page }) => {
  await openBuilder(page)
  await add(page, 'Immortals')

  await page.getByRole('button', { name: 'Roster actions' }).click()
  await page.getByRole('menuitem', { name: 'Edit roster setup' }).click()
  const setup = page.getByRole('dialog', { name: 'Edit roster setup' })
  await setup.getByRole('combobox', { name: 'Battle size' }).click()
  await page.getByRole('option', { name: /Incursion/ }).click()
  await expect(setup.getByText('3/2 DP used')).toBeVisible()
  await expect(setup.getByRole('alert')).toHaveCount(0)
  await setup.getByRole('combobox', { name: 'Battle size' }).click()
  await page.getByRole('option', { name: /Strike Force/ }).click()
  await setup.getByRole('button', { name: 'Remove Awakened Dynasty' }).click()
  await setup.getByRole('button', { name: 'Select Cryptek Conclave' }).click()
  await setup.getByRole('button', { name: 'Select Hand of the Dynasty' }).click()
  await setup.getByRole('combobox', { name: 'Battle size' }).click()
  await page.getByRole('option', { name: /Incursion/ }).click()
  await expect(setup.getByRole('alert')).toContainText('This combination costs 3 DP')
  await expect(setup.getByRole('button', { name: 'Save changes' })).toBeDisabled()
  await page.screenshot({ path: 'test-results/detachment-points.png', fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  const firstDetachment = setup.getByRole('button', { name: 'Remove Cryptek Conclave' })
  await expect(firstDetachment).toBeVisible()
  await expect(setup.getByRole('alert')).toBeVisible()
  const bounds = await firstDetachment.boundingBox()
  expect(bounds && bounds.x + bounds.width).toBeLessThanOrEqual(390)
  await page.screenshot({ path: 'test-results/detachment-points-phone.png', fullPage: true })
})

test('a squad grows from its unit editor', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 })
  await openBuilder(page)
  await add(page, 'Immortals')

  const card = page.locator('[data-unit="Immortals"]')
  await add(page, 'Flayed Ones')
  await card.click({ position: { x: 4, y: 4 } })
  await expect(page.locator('aside[aria-label="Loadout"]').getByRole('heading', { name: 'Immortals' })).toBeVisible()
  const loadout = page.locator('aside[aria-label="Loadout"]')
  await expect(loadout.getByText('Battleline', { exact: true })).toBeVisible()
  const profile = loadout.locator('[data-slot="unit-profile"]')
  await expect(profile).toBeVisible()
  await loadout.evaluate((pane) => {
    new MutationObserver(() => {
      if (pane.querySelector('[aria-label="Loading datasheet"]')) document.documentElement.dataset.datasheetReloaded = 'true'
    }).observe(pane, { childList: true, subtree: true })
  })

  const total = page.locator('[data-stat="points"]')
  await expect(total).toHaveText('125/2000')
  // The stepper lives with the rest of the selected unit's configuration.
  await page.getByRole('button', { name: 'More models in Immortals' }).click()
  await expect(page.getByLabel('Immortals models')).toHaveText('6')
  await expect(total).not.toHaveText('125/2000')
  await expect(page.locator('html')).not.toHaveAttribute('data-datasheet-reloaded', 'true')
  // And the wargear lines follow the models carrying it.
  await expect(page.getByText('6x Gauss blaster')).toBeVisible()
  await expect(loadout.getByRole('heading', { name: 'Tools of Dominion' })).toHaveCount(0)
  await page.screenshot({ path: 'test-results/unit-editor-model-count.png', fullPage: true })
})

test('a unit duplicates with its configured model count', async ({ page }) => {
  await openBuilder(page)
  await add(page, 'Immortals')
  await page.locator('[data-unit="Immortals"]').getByRole('button', { name: 'Immortals', exact: true }).click()
  await page.getByRole('button', { name: 'More models in Immortals' }).click()
  await page.getByLabel('Unit actions for Immortals').click()
  await page.screenshot({ path: 'test-results/unit-actions.png', fullPage: true })
  await page.getByRole('menuitem', { name: 'Duplicate unit' }).click()

  const copies = page.locator('[data-unit="Immortals"]')
  await expect(copies).toHaveCount(2)
  await copies.nth(0).getByRole('button', { name: 'Immortals', exact: true }).click()
  await expect(page.getByLabel('Immortals models')).toHaveText('6')
  await copies.nth(1).getByRole('button', { name: 'Immortals', exact: true }).click()
  await expect(page.getByLabel('Immortals models')).toHaveText('6')
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
  const ownLychguard = page.getByRole('button', { name: /Lychguard to your collection/ })
  await ownLychguard.click()
  await expect(page.getByRole('button', { name: /Lychguard from your collection/ })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Owned' }).click()
  await expect(lychguard).toBeVisible()
  await page.getByRole('button', { name: 'Owned' }).click()

  // Unit limit: three Lychguard is as many as the data allows.
  // One at a time on purpose: each click re-prices the list, and the next click's
  // effect is only meaningful once the previous one has landed.
  for (let taken = 0; taken < 3; taken++) await lychguard.click()
  await expect(page.getByText('3/3 in roster')).toBeVisible()
  await page.locator('[data-unit="Lychguard"]').first().getByLabel('Unit actions for Lychguard').click()
  await expect(page.getByRole('menuitemcheckbox', { name: 'Remove from collection' })).toBeVisible()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Unit limit' }).click()
  await expect(lychguard).toBeHidden()

  // Points fit hides what will not go in the room that is left, and only that.
  await page.getByRole('button', { name: 'Unit limit' }).click()
  await page.getByRole('button', { name: 'Roster actions' }).click()
  await page.getByRole('menuitem', { name: 'Edit roster setup' }).click()
  const setup = page.getByRole('dialog', { name: 'Edit roster setup' })
  await setup.getByRole('combobox', { name: 'Battle size' }).click()
  await page.getByRole('option', { name: /Incursion/ }).click()
  await setup.getByRole('button', { name: 'Save changes' }).click()
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
  await attach(page, 'Overlord', 'Immortals')
  await expect(page.getByText('Leading')).toBeVisible()

  await attach(page, 'Plasmancer', 'Immortals')

  await add(page, 'Chronomancer')
  await expect(page.locator('[data-unit="Chronomancer"]').getByRole('button', { name: 'Attach Chronomancer to unit' })).toHaveCount(0)

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

test('Murdermind lets a Chronomancer support Destroyer Cult units', async ({ page }) => {
  await openBuilder(page, 'Necrons', /Cursed Legion/)
  await add(page, 'Chronomancer')
  await add(page, 'Lokhust Heavy Destroyers')
  const chronomancer = page.locator('[data-unit="Chronomancer"]')
  const attachButton = chronomancer.getByRole('button', { name: 'Attach Chronomancer to unit' })
  await expect(attachButton).toHaveCount(0)

  await chronomancer.getByRole('button', { name: 'Chronomancer', exact: true }).click()
  await page.locator('aside[aria-label="Loadout"]').getByRole('button', { name: 'Select Murdermind' }).click()
  await expect(attachButton).toBeVisible()
  await attachButton.click()
  await page.getByRole('menu').getByRole('menuitem', { name: 'Lokhust Heavy Destroyers', exact: true }).click()

  await expect(chronomancer).toContainText('Supporting')
  await expect(chronomancer).toContainText('Lokhust Heavy Destroyers')
  await page.screenshot({ path: 'test-results/murdermind-destroyer-support.png', fullPage: true })
})

test('a unit that leads nothing is offered no one to lead', async ({ page }) => {
  await openBuilder(page)
  await add(page, 'Immortals')
  // Immortals lead nobody, so no attachment row is offered on their card.
  await expect(page.getByText('Leading')).toBeHidden()
  await expect(page.getByText('Support', { exact: true })).toBeHidden()
})

test('a tank is armed but not crowned', async ({ page }) => {
  // The pintle mounts sit in the same uncapped group as the guns the tank always has,
  // and were never offered; the Warlord entry sits under an upgrade only a couple of
  // detachments unlock, and was offered to every vehicle in the game.
  await page.setViewportSize({ width: 1600, height: 900 })
  await openBuilder(page, 'Space Marines', /Gladius Task Force/)
  await add(page, 'Land Raider Redeemer')
  await page
    .locator('[data-unit="Land Raider Redeemer"]')
    .getByRole('button', { name: /^Land Raider Redeemer/ })
    .click()
  const loadout = page.locator('aside[aria-label="Loadout"]')
  for (const weapon of ['Hunter-killer missile', 'Multi-melta', 'Storm bolter']) {
    await expect(loadout.getByRole('button', { name: `More ${weapon}` })).toBeVisible()
  }
  await expect(page.getByRole('button', { name: /Land Raider Redeemer Warlord/ })).toHaveCount(0)

  await add(page, 'Captain')
  await page
    .locator('[data-unit="Captain"]')
    .getByRole('button', { name: /^Captain/ })
    .click()
  await expect(page.getByRole('button', { name: 'Make Captain Warlord' })).toBeVisible()
})

test('the detachment that makes a tank a character hands it the crown', async ({ page }) => {
  // Tank Ace Character is a lone upgrade hung on the datasheet rather than sitting in
  // a group, so nothing offered it and the Headhunter Task Force rule was unreachable.
  await page.setViewportSize({ width: 1600, height: 900 })
  await openBuilder(page, 'Space Marines', /Headhunter Task Force/)
  await add(page, 'Land Raider Redeemer')
  await page
    .locator('[data-unit="Land Raider Redeemer"]')
    .getByRole('button', { name: /^Land Raider Redeemer/ })
    .click()
  await expect(page.getByRole('button', { name: /Land Raider Redeemer Warlord/ })).toHaveCount(0)

  const loadout = page.locator('aside[aria-label="Loadout"]')
  await loadout.getByRole('button', { name: 'Select Tank Ace Character' }).click()
  await expect(page.getByRole('button', { name: 'Make Land Raider Redeemer Warlord' })).toBeVisible()
  await expect(page.locator('[data-unit="Land Raider Redeemer"]')).toContainText('250 pts')
})

test('the unit editor asks about weapons before the rest of the wargear', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1200 })
  await openBuilder(page)
  await add(page, 'Overlord')
  await page
    .locator('[data-unit="Overlord"]')
    .getByRole('button', { name: /^Overlord/ })
    .click()

  const loadout = page.locator('aside[aria-label="Loadout"]')
  const groups = loadout.locator('legend, .eyebrow').filter({ hasText: /^(Weapons|Wargear)$/ })
  await expect(groups.first()).toHaveText(/Weapons/i)
  await expect(groups.nth(1)).toHaveText(/Wargear/i)

  // The resurrection orb stays in the rules face used throughout the loadout.
  const prose = loadout.locator('[data-slot], div').filter({ hasText: 'this unit resurrects' }).last()
  await expect(prose).toBeVisible()
  await expect(prose).toHaveClass(/font-rules/)
  await loadout.screenshot({ path: 'test-results/loadout-reading-order.png' })
})

test('a character can be marked as the warlord from its unit editor', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 })
  await openBuilder(page)
  await add(page, 'Overlord')
  const rosterCard = page.locator('[data-unit="Overlord"]')
  const rosterButton = rosterCard.getByRole('button', { name: 'Overlord', exact: true })
  const restingBackground = await rosterButton.evaluate((element) => getComputedStyle(element).backgroundColor)
  await rosterCard.hover()
  await expect.poll(() => rosterButton.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe(restingBackground)
  await rosterButton.click()
  const warlord = page.getByRole('button', { name: 'Make Overlord Warlord' })
  await warlord.click()
  await expect(page.getByRole('button', { name: 'Remove Overlord Warlord' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByText(/\d+x Warlord/)).toHaveCount(0)
  await page.screenshot({ path: 'test-results/unit-editor-controls.png', fullPage: true })
  await page
    .locator('[data-unit="Overlord"]')
    .getByRole('button', { name: /^Overlord/ })
    .click()
  const loadout = page.locator('aside[aria-label="Loadout"]')
  const profile = loadout.locator('[data-slot="unit-profile"]')
  await expect(profile.getByText('Sv', { exact: true })).toBeVisible()
  await expect(profile.getByText('Invulnerable save', { exact: true })).toBeVisible()
  await expect(profile.getByText('2+', { exact: true })).toBeVisible()
  await expect(profile.getByText('4+', { exact: true })).toBeVisible()
  await shot(profile, 'test-results/invulnerable-save-row.png')
  await expect(loadout.getByText('Tachyon arrow', { exact: true })).toBeVisible()
  await expect(loadout.getByText("Overlord's blade", { exact: true })).toBeVisible()
  await expect(loadout.getByText('Voidscythe', { exact: true })).toBeVisible()
  const stats = await profile.boundingBox()
  const lastStat = await profile.locator(':scope > div').last().boundingBox()
  expect(stats).not.toBeNull()
  expect(lastStat).not.toBeNull()
  expect(Math.abs((lastStat?.x ?? 0) + (lastStat?.width ?? 0) - ((stats?.x ?? 0) + (stats?.width ?? 0)))).toBeLessThan(2)
})

test('an enhancement appears once and can be removed', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 })
  await openBuilder(page, 'Necrons', /Starshatter Arsenal/)
  await add(page, 'Overlord')
  await page.locator('[data-unit="Overlord"]').getByRole('button', { name: 'Overlord', exact: true }).click()

  const loadout = page.locator('aside[aria-label="Loadout"]')
  await waitForRosterSave(page, () => loadout.getByRole('button', { name: 'Select Demanding Leader' }).click())
  await expect(page.locator('[data-unit="Overlord"]').getByText('Demanding Leader', { exact: true })).toHaveCount(1)

  await waitForRosterSave(page, () => loadout.getByRole('button', { name: 'No enhancement' }).click())
  await expect(page.getByText('Your latest changes have not been saved.')).toBeHidden()
  await expect(page.locator('[data-unit="Overlord"]').getByText('Demanding Leader', { exact: true })).toHaveCount(0)
  await page.screenshot({ path: 'test-results/enhancement-removed.png', fullPage: true })
})

test('changing detachments clears enhancements unless another detachment is added', async ({ page }) => {
  await openBuilder(page, 'Necrons', /Cursed Legion/)
  await add(page, 'Skorpekh Lord')
  await page
    .getByRole('button', { name: /^Skorpekh Lord/ })
    .first()
    .click()
  const card = page.locator('[data-unit="Skorpekh Lord"]')
  const loadout = page.locator('aside[aria-label="Loadout"]')

  await waitForRosterSave(page, () => loadout.getByRole('button', { name: 'Select Mark of the Nekrosor' }).click())
  await expect(card).toContainText('Mark of the Nekrosor')

  await page.getByRole('button', { name: 'Roster actions' }).click()
  await page.getByRole('menuitem', { name: 'Edit roster setup' }).click()
  let setup = page.getByRole('dialog', { name: 'Edit roster setup' })
  await setup.getByRole('button', { name: 'Select Skyshroud Spearhead' }).click()
  await waitForRosterSave(page, () => setup.getByRole('button', { name: 'Save changes' }).click())
  await expect(card).toContainText('Mark of the Nekrosor')

  await page.getByRole('button', { name: 'Roster actions' }).click()
  await page.getByRole('menuitem', { name: 'Export GW text' }).click()
  const exported = page.getByRole('dialog', { name: 'Games Workshop text' })
  await expect(exported.locator('pre')).toContainText('Force Dispositions: Purge the Foe, Reconnaissance')
  await exported.screenshot({ path: 'test-results/multiple-dispositions-export.png' })
  await exported.getByRole('button', { name: 'Close' }).click()

  await page.getByRole('button', { name: 'Roster actions' }).click()
  await page.getByRole('menuitem', { name: 'Edit roster setup' }).click()
  setup = page.getByRole('dialog', { name: 'Edit roster setup' })
  await setup.getByRole('button', { name: 'Remove Cursed Legion' }).click()
  await waitForRosterSave(page, () => setup.getByRole('button', { name: 'Save changes' }).click())
  await expect(card).not.toContainText('Mark of the Nekrosor')

  await page.reload()
  await expect(page.locator('[data-unit="Skorpekh Lord"]')).not.toContainText('Mark of the Nekrosor')
  await page.screenshot({ path: 'test-results/enhancement-cleared-after-detachment-change.png', fullPage: true })
})

test('a smaller desktop moves the picker into a drawer without losing unit detail', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 800 })
  await openBuilder(page)

  const picker = page.getByRole('dialog', { name: 'Add units' })
  const loadout = page.locator('aside[aria-label="Loadout"]')
  await expect(picker).toBeVisible()

  await picker.getByLabel('Add a unit').fill('Deceiver')
  const name = picker.getByText("C'tan Shard of the Deceiver", { exact: true })
  await expect(name).toBeVisible()
  expect(await name.evaluate((element) => getComputedStyle(element).whiteSpace)).toBe('normal')

  await picker.getByRole('button', { name: "Add C'tan Shard of the Deceiver", exact: true }).click()
  await picker.getByRole('button', { name: 'Close' }).click()
  const card = page.locator('[data-unit="C\'tan Shard of the Deceiver"]')
  const cardName = await card.getByText("C'tan Shard of the Deceiver", { exact: true }).boundingBox()
  const configuredWargear = await card.getByText(/1x Cosmic insanity/).boundingBox()
  expect(cardName && configuredWargear && configuredWargear.y >= cardName.y + cardName.height).toBe(true)
  expect(
    await card.getByText("C'tan Shard of the Deceiver", { exact: true }).evaluate((element) => getComputedStyle(element).whiteSpace),
  ).toBe('normal')
  expect(await card.getByText(/1x Cosmic insanity/).evaluate((element) => getComputedStyle(element).whiteSpace)).toBe('normal')
  await page
    .locator('[data-unit="C\'tan Shard of the Deceiver"]')
    .getByRole('button', { name: /^C'tan Shard of the Deceiver/ })
    .click()
  await expect(loadout.locator('[data-slot="full-datasheet-link"]')).toBeVisible()
  await expect(loadout.getByRole('heading', { name: "C'tan Shard of the Deceiver" })).toBeVisible()
  await expect(loadout.getByText('330 pts')).toBeVisible()
  await expect(loadout.getByText('Monster', { exact: true })).toBeVisible()
  await expect(loadout.getByText('Invulnerable save', { exact: true })).toBeVisible()
  await expect(loadout.getByText('Grand Illusion', { exact: true })).toBeVisible()
  const fullDatasheet = loadout.getByRole('link', { name: 'Open full datasheet in a new tab' })
  await expect(fullDatasheet).toHaveAttribute('href', /\/factions\/necrons\/datasheets\//)
  await expect(fullDatasheet).toHaveAttribute('target', '_blank')
  await fullDatasheet.hover()
  await expect(page.getByRole('tooltip')).toHaveText('Open full datasheet in a new tab')
  const opened = page.waitForEvent('popup')
  await fullDatasheet.click()
  const fullDatasheetPage = await opened
  await expect(fullDatasheetPage).toHaveURL(/\/factions\/necrons\/datasheets\//)
  await fullDatasheetPage.close()

  await page.setViewportSize({ width: 1440, height: 900 })
  await expect(page.locator('aside[aria-label="Add units"]')).toBeVisible()
  await expect(loadout.getByText('Equipped ranged weapons', { exact: true })).toBeVisible()
  await page.screenshot({ path: 'test-results/builder-three-columns.png', fullPage: true })
})

test('attachment relationships stay inside the two-column unit pane', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 })
  await openBuilder(page, 'Space Marines', /Gladius Task Force/)

  const picker = page.getByRole('dialog', { name: 'Add units' })
  await picker.getByLabel('Add a unit').fill('Ancient')
  await picker.getByRole('button', { name: 'Add Ancient', exact: true }).click()
  await picker.getByRole('button', { name: 'Close' }).click()
  await page.locator('[data-unit="Ancient"]').getByRole('button', { name: 'Ancient', exact: true }).click()

  const loadout = page.locator('aside[aria-label="Loadout"]')
  await expect(loadout.getByRole('heading', { name: 'Attachments' })).toBeVisible()
  const widths = await loadout.locator('[data-slot="scroll-area-viewport"]').evaluate((element) => ({
    client: element.clientWidth,
    scroll: element.scrollWidth,
  }))
  expect(widths.scroll).toBe(widths.client)
})

test('the attachment menu stays inside the unopened three-column roster', async ({ page }) => {
  await page.setViewportSize({ width: 1512, height: 774 })
  await openBuilder(page, 'Space Marines', /Gladius Task Force/)
  for (const name of ['Ancient', 'Intercessor Squad', 'Assault Intercessor Squad', 'Hellblaster Squad']) await add(page, name)

  const ancient = page.locator('[data-unit="Ancient"]')
  const attachButton = ancient.getByRole('button', { name: 'Attach Ancient to unit' })
  await expect(attachButton).toBeVisible()
  const rosterWidths = await page.locator('[data-slot="roster-units"]').evaluate((element) => ({
    client: element.clientWidth,
    scroll: element.scrollWidth,
  }))
  expect(rosterWidths.scroll).toBe(rosterWidths.client)
  const unopenedWidths = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }))
  expect(unopenedWidths.scroll).toBe(unopenedWidths.client)

  await attachButton.click()
  const targets = page.getByRole('menu')
  await expect(targets.getByRole('menuitem', { name: 'Intercessor Squad', exact: true })).toBeVisible()
  await expect(targets.getByRole('menuitem', { name: 'Assault Intercessor Squad', exact: true })).toBeVisible()
  await expect(targets.getByRole('menuitem', { name: 'Hellblaster Squad', exact: true })).toBeVisible()
  await targets.getByRole('menuitem', { name: 'Intercessor Squad', exact: true }).click()
  await expect(ancient).toContainText('Supporting')
  await expect(ancient).toContainText('Intercessor Squad')
  const attachedWidths = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }))
  expect(attachedWidths.scroll).toBe(attachedWidths.client)
  await page.screenshot({ path: 'test-results/attachment-suggestions-three-columns.png', fullPage: true })
})

test('mobile roster sheets move directly between units, loadout and datasheet', async ({ page }) => {
  await openBuilder(page)
  await add(page, 'Immortals')
  await page.setViewportSize({ width: 390, height: 844 })

  await page.locator('[data-unit="Immortals"]').getByRole('button', { name: 'Immortals', exact: true }).click()
  const loadout = page.locator('aside[aria-label="Loadout"]')

  await expect(loadout.getByRole('heading', { name: 'Immortals' })).toBeVisible()
  await expect(loadout.getByText('Infantry', { exact: true })).toBeVisible()

  await loadout.getByRole('button', { name: 'Close' }).click()
  await page.getByRole('button', { name: 'Add units' }).click()
  const picker = page.getByRole('dialog', { name: 'Add units' })
  await picker.getByLabel('Add a unit').fill('Imotekh the Stormlord')
  await picker.getByRole('button', { name: 'View Imotekh the Stormlord datasheet' }).click()
  const datasheet = page.locator('aside[aria-label="Datasheet"]')
  await expect(datasheet.getByText('Character', { exact: true })).toBeVisible()
  await datasheet.getByRole('button', { name: 'Close' }).click()
  await page.getByRole('button', { name: 'Add units' }).click()
  await expect(picker.getByLabel('Add a unit')).toHaveValue('Imotekh the Stormlord')
  await shot(picker, 'test-results/mobile-roster-sheet-navigation.png')
})

test('making a new warlord removes the previous one', async ({ page }) => {
  await openBuilder(page)
  await add(page, 'Overlord')
  await add(page, 'Plasmancer')
  await page.locator('[data-unit="Overlord"]').getByRole('button', { name: 'Overlord', exact: true }).click()
  await page.getByRole('button', { name: 'Make Overlord Warlord' }).click()
  await page.locator('[data-unit="Plasmancer"]').getByRole('button', { name: 'Plasmancer', exact: true }).click()
  await page.getByRole('button', { name: 'Make Plasmancer Warlord' }).click()
  await expect(page.getByRole('button', { name: 'Remove Plasmancer Warlord' })).toHaveAttribute('aria-pressed', 'true')
  await page.locator('[data-unit="Overlord"]').getByRole('button', { name: 'Overlord', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Make Overlord Warlord' })).toHaveAttribute('aria-pressed', 'false')
  await expect(page.getByText(/\d+x Warlord/)).toHaveCount(0)
})

test('a squad the datasheet keeps identical is asked once, not counted', async ({ page }) => {
  // "All models in this unit can each have their gauss blaster replaced with 1 tesla
  // carbine" is one decision for the whole squad, and the catalogue says so by calling
  // a mixed squad an error. A count against each option invited exactly that error.
  await page.setViewportSize({ width: 1600, height: 900 })
  await openBuilder(page)
  await add(page, 'Immortals')
  await page.locator('[data-unit="Immortals"]').getByRole('button', { name: 'Immortals', exact: true }).click()

  for (let models = 6; models <= 10; models++) {
    await page.getByRole('button', { name: 'More models in Immortals' }).click()
    await expect(page.getByLabel('Immortals models')).toHaveText(String(models))
  }
  await expect(page.getByText('10x Gauss blaster')).toBeVisible()

  const loadout = page.locator('aside[aria-label="Loadout"]')
  await expect(loadout.getByText('Wargear options')).toBeVisible()
  await expect(loadout.getByText('Weapons').first()).toBeVisible()
  await expect(loadout.getByText('BS').first()).toBeVisible()

  // One question, not ten: no count against either gun, and picking one arms the squad.
  await expect(loadout.getByRole('button', { name: /^(More|Fewer) (Gauss blaster|Tesla carbine)$/ })).toHaveCount(0)
  await loadout.getByRole('button', { name: 'Select Tesla carbine' }).click()

  await expect(page.getByText('10x Tesla carbine')).toBeVisible()
  await expect(page.getByText('10x Gauss blaster')).toBeHidden()
  await expect(page.getByText('must be equipped identically')).toHaveCount(0)
  await expect(page.getByText('Within the points limit')).toBeAttached()
  await page.screenshot({ path: 'test-results/loadout.png', fullPage: true })
})

test('a squad-wide choice has the same count on its roster card and loadout', async ({ page }) => {
  await openBuilder(page, 'Dark Angels', /Inner Circle Task Force/)
  await add(page, 'Vanguard Veteran Squad with Jump Packs')

  const card = page.locator('[data-unit="Vanguard Veteran Squad with Jump Packs"]')
  await expect(card).toContainText('4x Storm Shield')
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  const rosterWidths = await page.locator('[data-slot="roster-units"]').evaluate((element) => ({
    client: element.clientWidth,
    scroll: element.scrollWidth,
  }))
  expect(rosterWidths.scroll).toBe(rosterWidths.client)
  await page.screenshot({ path: 'test-results/vanguard-veteran-shield-count.png', fullPage: true })
  await card.getByRole('button', { name: 'Vanguard Veteran Squad with Jump Packs', exact: true }).click()

  const loadout = page.locator('aside[aria-label="Loadout"]')
  const loadoutWidths = await loadout.locator('[data-slot="scroll-area-viewport"]').evaluate((element) => ({
    client: element.clientWidth,
    scroll: element.scrollWidth,
  }))
  expect(loadoutWidths.scroll).toBe(loadoutWidths.client)
  const masterCrafted = loadout.getByRole('button', { name: 'Select Master-crafted Power Weapon' })
  await masterCrafted.first().click()
  const sergeant = loadout.locator('section').filter({ hasText: 'Vanguard Veteran Sergeant with Jump Pack' })
  await sergeant.getByRole('button', { name: 'Select Master-crafted Power Weapon' }).click()
  await expect(loadout.getByLabel('Master-crafted Power Weapon count')).toHaveText(['4', '1'])
  await expect(card).toContainText('5x Master-crafted Power Weapon')

  await loadout.getByRole('button', { name: 'Close', exact: true }).click()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  await shot(card, 'test-results/vanguard-veteran-wargear-count.png')
})

/**
 * The catalogue files a Necron Warrior once per gun it can hold, which is bookkeeping
 * rather than two kinds of model. Drawn as written, the panel gave each of them a card
 * of its own and then asked for the same gun again as a wargear option underneath.
 */
test('a squad the catalogue files one loadout per weapon is one card', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 })
  await openBuilder(page)
  await add(page, 'Necron Warriors')
  await page.locator('[data-unit="Necron Warriors"]').getByRole('button', { name: 'Necron Warriors', exact: true }).click()

  const loadout = page.locator('aside[aria-label="Loadout"]')
  await expect(loadout.getByLabel('Warrior models')).toHaveText('10')
  await expect(loadout.getByText('Wargear options', { exact: true })).toBeHidden()

  // Both guns are on the one card, and the squad divides itself between them.
  await loadout.getByRole('button', { name: 'More Gauss reaper' }).click()
  await expect(loadout.getByLabel('Gauss reaper count')).toHaveText('1')
  await expect(loadout.getByLabel('Gauss flayer count')).toHaveText('9')
  await expect(page.getByText('9x Gauss flayer')).toBeVisible()
  await expect(page.getByText('Within the points limit')).toBeAttached()
  await page.screenshot({ path: 'test-results/one-card-per-model-kind.png', fullPage: true })
})

/**
 * The same model can be filed under two groups — the gun every Hearthkyn carries in
 * one, the heavy weapon one of them may take in another — which is still one kind of
 * warrior, and one card holding every weapon it may end up with.
 */
test('a kind of model filed under two groups is still one card', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 })
  await openBuilder(page, 'Leagues of Votann', /Hearthband/)
  await add(page, 'Hearthkyn Warriors')
  await page.locator('[data-unit="Hearthkyn Warriors"]').getByRole('button', { name: 'Hearthkyn Warriors', exact: true }).click()

  const loadout = page.locator('aside[aria-label="Loadout"]')
  const warriors = loadout.locator('section').filter({ has: page.getByLabel('Hearthkyn Warrior models') })
  await expect(warriors.getByLabel('Hearthkyn Warrior models')).toHaveText('9')
  await expect(loadout.getByText('Wargear options', { exact: true })).toBeHidden()
  // The gun each warrior carries and the heavy weapon one of them may take instead.
  await expect(warriors.getByLabel('Autoch-pattern bolter count')).toHaveText('9')
  await expect(warriors.getByLabel('Magna-rail rifle count')).toBeVisible()

  // The body for the ion blaster comes from a squadmate, not from thin air.
  await warriors.getByRole('button', { name: 'More Ion blaster' }).click()
  await expect(warriors.getByLabel('Ion blaster count')).toHaveText('1')
  await expect(warriors.getByLabel('Autoch-pattern bolter count')).toHaveText('8')
  await expect(warriors.getByLabel('Hearthkyn Warrior models')).toHaveText('9')
  await expect(page.getByText('Within the points limit')).toBeAttached()
  await page.screenshot({ path: 'test-results/one-card-across-groups.png', fullPage: true })
})

/**
 * The heavy weapon is filed in a group of its own, empty until a player asks for one,
 * and a request could not reach a group that was not in the list yet. Pressing for a
 * magna-rail rifle did nothing at all.
 */
test('a squad can take the heavy weapon its datasheet offers', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 })
  await openBuilder(page, 'Leagues of Votann', /Hearthband/)
  await add(page, 'Hearthkyn Warriors')
  await page.locator('[data-unit="Hearthkyn Warriors"]').getByRole('button', { name: 'Hearthkyn Warriors', exact: true }).click()

  const loadout = page.locator('aside[aria-label="Loadout"]')
  const warriors = loadout.locator('section').filter({ has: page.getByLabel('Hearthkyn Warrior models') })
  await warriors.getByRole('button', { name: 'More Magna-rail rifle' }).click()
  await expect(warriors.getByLabel('Magna-rail rifle count')).toHaveText('1')

  // The warrior carrying it is one of the ten, not an eleventh.
  await expect(warriors.getByLabel('Autoch-pattern bolter count')).toHaveText('8')
  await expect(warriors.getByLabel('Hearthkyn Warrior models')).toHaveText('9')
  await expect(page.getByText('1x Magna-rail rifle')).toBeVisible()
  await expect(page.getByText('Within the points limit')).toBeAttached()
  await page.screenshot({ path: 'test-results/heavy-weapon-taken.png', fullPage: true })

  // And putting it down gives the warrior his gun back.
  await warriors.getByRole('button', { name: 'Fewer Magna-rail rifle' }).click()
  await expect(warriors.getByLabel('Magna-rail rifle count')).toHaveText('0')
  await expect(warriors.getByLabel('Hearthkyn Warrior models')).toHaveText('9')
})

test('a composite heavy weapon keeps the model armed and can be put back', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 })
  await openBuilder(page, 'Dark Angels', /Unforgiven Task Force/)
  await add(page, 'Deathwing Terminator Squad')
  await page
    .locator('[data-unit="Deathwing Terminator Squad"]')
    .getByRole('button', { name: /^Deathwing Terminator Squad/ })
    .click()

  const loadout = page.locator('aside[aria-label="Loadout"]')
  const terminators = loadout.locator('section').filter({ has: page.getByLabel('Deathwing Terminator models') })
  const cyclone = 'Cyclone Missile Launcher & Storm Bolter'

  await expect(terminators.getByLabel('Power Fist count')).toHaveText('4')
  await terminators.getByRole('button', { name: `More ${cyclone}` }).click()
  await expect(terminators.getByLabel(`${cyclone} count`)).toHaveText('1')
  await expect(terminators.getByLabel('Power Fist count')).toHaveText('4')
  await expect(page.locator('[data-unit="Deathwing Terminator Squad"]').getByText('4x Power Fist')).toBeVisible()
  await expect(terminators.getByRole('heading', { name: /^➤?\s*Cyclone missile launcher.*frag$/i })).toBeVisible()
  await expect(terminators.getByRole('heading', { name: /^➤?\s*Cyclone missile launcher.*krak$/i })).toBeVisible()
  await expect(terminators.getByRole('heading', { name: /^5× Storm Bolter$/i })).toHaveCount(0)

  await terminators.getByRole('button', { name: 'More Chainfist' }).click()
  await expect(terminators.getByLabel('Chainfist count')).toHaveText('1')
  await expect(terminators.getByLabel(`${cyclone} count`)).toHaveText('1')
  await expect(terminators.getByLabel('Power Fist count')).toHaveText('3')
  await terminators.getByRole('button', { name: 'Fewer Chainfist' }).click()
  await expect(terminators.getByLabel('Chainfist count')).toHaveText('0')
  await expect(terminators.getByLabel('Power Fist count')).toHaveText('4')

  await terminators.getByRole('button', { name: `Fewer ${cyclone}` }).click()
  await expect(terminators.getByLabel(`${cyclone} count`)).toHaveText('0')
  await expect(terminators.getByLabel('Storm Bolter count', { exact: true })).toHaveText('4')

  await terminators.getByRole('button', { name: `More ${cyclone}` }).click()
  await terminators.getByRole('button', { name: 'More Storm Bolter' }).click()
  await expect(terminators.getByLabel(`${cyclone} count`)).toHaveText('0')
  await expect(terminators.getByLabel('Storm Bolter count', { exact: true })).toHaveText('4')
})

test('a composite character loadout shows its selected melee weapon', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 })
  await openBuilder(page, 'Space Marines', /Gladius Task Force/)
  await add(page, 'Captain')
  await page
    .locator('[data-unit="Captain"]')
    .getByRole('button', { name: /^Captain/ })
    .click()

  const loadout = page.locator('aside[aria-label="Loadout"]')
  const starting = loadout.locator('article').filter({ has: page.getByRole('button', { name: /^Select Bolt Pistol,/ }) })
  await expect(starting.getByRole('heading', { name: 'Close combat weapon', exact: true })).toBeVisible()

  await loadout.getByRole('button', { name: 'Select Power fist' }).click()
  await expect(starting.getByRole('heading', { name: 'Power fist', exact: true })).toBeVisible()
  await expect(starting.getByRole('heading', { name: 'Close combat weapon', exact: true })).toHaveCount(0)
})

/**
 * Six wraiths, each a pairing of claws or coils with a gun the player cannot break
 * apart, so each keeps a card of its own — and the card is then where the squad says
 * how many of that pairing it has, rather than repeating all six underneath.
 */
test('a loadout that pairs two weapons is counted on its own card', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 })
  await openBuilder(page)
  await add(page, 'Canoptek Wraiths')
  await page.locator('[data-unit="Canoptek Wraiths"]').getByRole('button', { name: 'Canoptek Wraiths', exact: true }).click()

  const loadout = page.locator('aside[aria-label="Loadout"]')
  await expect(loadout.getByText('Wargear options', { exact: true })).toBeHidden()
  await expect(loadout.getByLabel('Wraith w/ claws count')).toHaveText('3')

  await loadout.getByRole('button', { name: 'More Wraith w/ claws and beamer' }).click()
  await expect(loadout.getByLabel('Wraith w/ claws and beamer count')).toHaveText('1')
  await expect(loadout.getByLabel('Wraith w/ claws count')).toHaveText('2')
  await expect(page.getByText('1x Transdimensional beamer')).toBeVisible()
  await expect(page.getByText('Within the points limit')).toBeAttached()
  await page.screenshot({ path: 'test-results/paired-loadout-cards.png', fullPage: true })
})

test('fixed duplicate weapons show their quantity with the profile', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 })
  await openBuilder(page)
  await add(page, 'Doomsday Ark')
  await page
    .locator('[data-unit="Doomsday Ark"]')
    .getByRole('button', { name: /^Doomsday Ark/ })
    .click()

  const loadout = page.locator('aside[aria-label="Loadout"]')
  await expect(loadout.getByRole('heading', { name: '2× Gauss flayer array' })).toBeVisible()
  await expect(loadout.getByText('Wargear options', { exact: true })).toBeHidden()
})

/**
 * Astra Militarum own no datasheets: every one of them, and their detachments, are
 * reached by a link into a library. So a book written that way was offered as no
 * faction at all, and the ones that were offered were missing whatever they borrow.
 */
test('a book that keeps its datasheets in a library can still be built from', async ({ page }) => {
  await openBuilder(page, 'Astra Militarum', /Combined Arms/)
  await add(page, 'Cadian Shock Troops')
  await expect(page.locator('[data-unit="Cadian Shock Troops"]')).toBeVisible()

  // And what it borrows from another book is there beside its own.
  await page.getByLabel('Add a unit').fill('Callidus Assassin')
  await page.getByRole('button', { name: 'Agents of the Imperium 1' }).click()
  await page.getByRole('button', { name: 'Add Callidus Assassin', exact: true }).click()
  await expect(page.locator('[data-unit="Callidus Assassin"]')).toBeVisible()
  await expect(page.getByText('Within the points limit')).toBeAttached()
})

test('Legends are never offered', async ({ page }) => {
  await openBuilder(page, 'Dark Angels', /Unforgiven Task Force/)
  await page.getByLabel('Add a unit').fill('Land Speeder')
  await expect(page.getByRole('button', { name: 'Add Land Speeder', exact: true })).toBeVisible()
  const legend = page.getByRole('button', { name: 'Add Land Speeder Typhoon [Legends]', exact: true })
  await expect(legend).toBeHidden()
  await expect(page.getByRole('button', { name: 'Legends' })).toHaveCount(0)

  await page.getByLabel('Add a unit').fill('Sentry Gun')
  await expect(page.getByRole('button', { name: 'Add Sentry Gun', exact: true })).toHaveCount(0)
})

test('Crucible variants are never offered', async ({ page }) => {
  await openBuilder(page, 'Grey Knights', /Warpbane Task Force/)
  await page.getByLabel('Add a unit').fill('Crucible')
  await expect(page.getByRole('button', { name: /\[Crucible\]/ })).toHaveCount(0)
})

test('a chapter reaches the whole Codex range, not just its own datasheets', async ({ page }) => {
  // Dark Angels state twenty-seven datasheets of their own and field two hundred
  // and forty-nine, the rest imported from the Space Marines book.
  await openBuilder(page, 'Dark Angels', /Unforgiven Task Force/)
  await add(page, 'Intercessor Squad')
  await expect(page.locator('[data-unit="Intercessor Squad"]')).toBeVisible()
})

test('a grenade launcher leaves every Intercessor carrying a bolt rifle', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 })
  await openBuilder(page, 'Space Marines', /Gladius Task Force/)
  await add(page, 'Intercessor Squad')
  await page
    .locator('[data-unit="Intercessor Squad"]')
    .getByRole('button', { name: /^Intercessor Squad/ })
    .click()

  const loadout = page.locator('aside[aria-label="Loadout"]')
  await loadout.getByRole('button', { name: 'Select Bolt Rifle w/ Grenade Launcher' }).click()
  const equipped = loadout.locator('section').filter({ hasText: 'Equipped ranged weapons' })
  await expect(equipped.getByText('5× Bolt Rifle', { exact: true })).toBeVisible()
  await expect(equipped.getByText('5× Bolt pistol', { exact: true })).toBeVisible()
  await expect(loadout.getByText('➤ Astartes grenade launcher - krak', { exact: true })).toHaveCount(1)
  await shot(loadout, 'test-results/intercessor-grenade-launcher.png')
})

test('a selected multi-weapon option is not repeated in the equipped summary', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 })
  await openBuilder(page, 'Space Marines', /Gladius Task Force/)
  await add(page, 'Impulsor')
  await page
    .locator('[data-unit="Impulsor"]')
    .getByRole('button', { name: /^Impulsor/ })
    .click()

  const loadout = page.locator('aside[aria-label="Loadout"]')
  await expect(loadout.getByText('2 Storm Bolters', { exact: true })).toBeVisible()
  const equipped = loadout.locator('section').filter({ hasText: 'Equipped ranged weapons' })
  await expect(equipped.getByText('2× Storm bolter', { exact: true })).toHaveCount(0)
})

/**
 * A Plague Marine's meltagun is filed as a model of its own, apart from the marines
 * it is drawn from, so the panel drew it on a card with no squadmate to take a body
 * from and left the control disabled. The squad it joins is where the body comes from.
 */
test('a specialist filed apart from its squad can still be armed', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 })
  await openBuilder(page, 'Death Guard', /Champions of Contagion/)
  await add(page, 'Plague Marines')
  await page
    .locator('[data-unit="Plague Marines"]')
    .getByRole('button', { name: /^Plague Marines/ })
    .first()
    .click()

  const loadout = page.locator('aside[aria-label="Loadout"]')
  await loadout.getByRole('button', { name: 'More Meltagun' }).click()
  await expect(loadout.getByLabel('Meltagun count')).toHaveText('1')

  // The marine carrying it is one of the five, so the squad is the size it was and
  // costs what it did: a boltgun marine gave up his place rather than a sixth joining.
  await expect(page.getByText('1x Meltagun')).toBeVisible()
  await expect(page.getByText('4x Boltgun')).toBeVisible()
  await expect(page.getByLabel('Plague Marines models')).toHaveText('5')
  await expect(page.locator('[data-unit="Plague Marines"]')).toContainText('90 pts')
  await expect(page.getByText('Within the points limit')).toBeAttached()
  await page.screenshot({ path: 'test-results/specialist-filed-apart.png', fullPage: true })
})

test('Plague Marine cards and exports omit replaced default wargear', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 })
  await openBuilder(page, 'Death Guard', /Champions of Contagion/)
  await add(page, 'Plague Marines')
  const card = page.locator('[data-unit="Plague Marines"]')
  await card.getByRole('button', { name: /^Plague Marines/ }).click()

  const loadout = page.locator('aside[aria-label="Loadout"]')
  const champion = loadout.locator('section').filter({ hasText: 'Plague Champion' })
  await waitForRosterSave(page, () => champion.getByRole('button', { name: 'More Power fist' }).click())
  await waitForRosterSave(page, () => champion.getByRole('button', { name: 'More Plasma gun' }).click())

  const heavy = loadout.locator('section').filter({ hasText: 'Plague Marine w/ heavy plague weapon' })
  await waitForRosterSave(page, () => heavy.getByRole('button', { name: 'More Plague Marine w/ heavy plague weapon' }).click())
  await waitForRosterSave(page, () => heavy.getByRole('button', { name: 'More Plague Marine w/ heavy plague weapon' }).click())
  const spewer = loadout.locator('section').filter({ hasText: 'Plague Marine w/ plague spewer' })
  await waitForRosterSave(page, () => spewer.getByRole('button', { name: 'More Plague Marine w/ plague spewer' }).click())
  await waitForRosterSave(page, () => loadout.getByRole('button', { name: 'More Plasma gun' }).last().click())

  await expect(card).toContainText('4x Plague knives')
  await expect(card).not.toContainText('Boltgun')
  await shot(card, 'test-results/plague-marines-replaced-wargear.png')

  await page.getByRole('button', { name: 'Roster actions' }).click()
  await page.getByRole('menuitem', { name: 'Export GW text' }).click()
  const exported = page.getByRole('dialog', { name: 'Games Workshop text' }).locator('pre')
  await expect(exported).toContainText('4x Plague knives')
  await expect(exported).not.toContainText('Boltgun')
  await shot(exported, 'test-results/plague-marines-replaced-wargear-export.png')
})

test('Death Guard champions expose their legal wargear', async ({ page }) => {
  await page.setViewportSize({ width: 720, height: 1200 })
  await openBuilder(page, 'Death Guard', /Champions of Contagion/)
  await add(page, 'Deathshroud Terminators')
  await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(720)
  expect(await page.locator('[data-slot="roster-units"]').evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
  await page
    .locator('[data-unit="Deathshroud Terminators"]')
    .getByRole('button', { name: /^Deathshroud Terminators/ })
    .click()

  const loadout = page.locator('aside[aria-label="Loadout"]')
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(720)
  expect(await loadout.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
  const deathshroudChampion = loadout.locator('section').filter({ hasText: 'Deathshroud Champion' })
  const additionalGauntlet = deathshroudChampion.getByRole('button', { name: 'More Plaguespurt gauntlet' }).locator('..')
  await expect(additionalGauntlet.getByLabel('Plaguespurt gauntlet count')).toHaveText('0')
  await expect(deathshroudChampion.getByRole('button', { name: 'More Icon of Despair (Aura)' })).toHaveCount(0)
  const icon = loadout.getByRole('button', { name: 'Select Icon of Despair' })
  await expect(icon).toBeEnabled()
  await expect(icon).toHaveAttribute('aria-pressed', 'false')
  await waitForRosterSave(page, () => additionalGauntlet.getByRole('button', { name: 'More Plaguespurt gauntlet' }).click())
  await expect(additionalGauntlet.getByLabel('Plaguespurt gauntlet count')).toHaveText('1')
  await waitForRosterSave(page, () => icon.click())
  await expect(icon).toHaveAttribute('aria-pressed', 'true')
  await shot(deathshroudChampion, 'test-results/deathshroud-champion-wargear.png')
  await page.screenshot({ path: 'test-results/deathshroud-wargear-once.png', fullPage: true })

  await loadout.getByRole('button', { name: 'Close' }).click()
  await page.getByRole('button', { name: 'Add units' }).click()
  await add(page, 'Plague Marines')
  await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click()
  await page
    .locator('[data-unit="Plague Marines"]')
    .getByRole('button', { name: /^Plague Marines/ })
    .first()
    .click()

  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(720)
  expect(await loadout.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
  const plagueChampion = loadout.locator('section').filter({ hasText: 'Plague Champion' })
  await expect(plagueChampion.getByRole('button', { name: 'More Power fist' })).toBeEnabled()
  await waitForRosterSave(page, () => plagueChampion.getByRole('button', { name: 'More Power fist' }).click())
  await expect(plagueChampion.getByLabel('Power fist count')).toHaveText('1')
  await expect(plagueChampion.getByLabel('Plague knives count')).toHaveText('0')
  await shot(plagueChampion, 'test-results/plague-champion-power-fist.png')
})

test('removing one piece does not choose another piece of the same model as its replacement', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 })
  await openBuilder(page, 'Black Templars', /Companions of Vehemence/)
  await add(page, 'Crusader Squad')
  await page
    .locator('[data-unit="Crusader Squad"]')
    .getByRole('button', { name: /^Crusader Squad/ })
    .click()

  const loadout = page.locator('aside[aria-label="Loadout"]')
  await expect(loadout.getByLabel('Bolt Rifle count')).toHaveText('5')
  await loadout.getByRole('button', { name: 'Fewer Bolt Rifle' }).click()
  await expect(loadout.getByLabel('Bolt Rifle count')).toHaveText('4')
  await expect(page.getByLabel('Crusader Squad models')).toHaveText('10')
})
