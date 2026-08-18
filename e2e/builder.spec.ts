import { expect, type Page, test } from '@playwright/test'
import { createRoster, signUp } from './account'

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

test('the unit picker stays within the roster faction', async ({ page }) => {
  await openBuilder(page)
  await expect(page.getByRole('combobox', { name: 'Force' })).toHaveCount(0)
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
  await page.getByRole('option', { name: /King of the Colosseum/ }).click()

  const awakened = dialog.getByRole('button', { name: 'Select Awakened Dynasty' })
  const cryptek = dialog.getByRole('button', { name: 'Select Cryptek Conclave' })
  await awakened.click()
  await cryptek.click()

  await expect(dialog.getByRole('button', { name: 'Select Awakened Dynasty' })).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Remove Cryptek Conclave' })).toBeVisible()

  await dialog.getByRole('button', { name: 'Create roster' }).click()
  await page.waitForURL(/\/rosters\/.+\/edit/)
  await page.getByLabel('Add a unit').fill('Chronomancer')
  const addChronomancer = page.getByRole('button', { name: 'Add Chronomancer', exact: true })
  await addChronomancer.click()
  await expect(page.getByText('1/1 in roster')).toBeVisible()
  await expect(addChronomancer).toBeDisabled()
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
  await option.screenshot({ path: 'test-results/nekrosor-enhancement.png' })
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
  await expect(madnessOption.locator('.font-rules')).toHaveCSS('font-family', /Source Sans 3/)
  await expect(madness).toHaveCSS('font-family', /Barlow Semi Condensed/)
  await madnessOption.screenshot({ path: 'test-results/deepening-madness-option.png' })
  await page.setViewportSize({ width: 390, height: 844 })
  await madnessOption.screenshot({ path: 'test-results/deepening-madness-option-phone.png' })
  await page.setViewportSize({ width: 1280, height: 720 })
  const optionBox = await madnessOption.boundingBox()
  await madnessOption.click({ position: { x: 20, y: (optionBox?.height ?? 20) - 10 } })
  await expect(madness).toHaveAttribute('aria-pressed', 'true')
  const card = page.locator('[data-unit="Lokhust Destroyers"]')
  await expect(card).toContainText('Upgrade')
  await expect(card).toContainText('Deepening Madness')
  await expect(card.getByText('1x Deepening Madness', { exact: true })).toHaveCount(0)
  await card.screenshot({ path: 'test-results/deepening-madness-upgrade.png' })

  await page.goto('/factions/necrons/reference/detachments/skyshroud-spearhead')
  const unitUpgrades = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Unit upgrades' }) })
  await expect(unitUpgrades).toContainText('Deepening Madness')
  const enhancements = page.locator('section').filter({ has: page.getByText('Enhancements', { exact: true }) })
  await expect(enhancements).not.toContainText('Deepening Madness')
  await page.screenshot({ path: 'test-results/skyshroud-unit-upgrades.png', fullPage: true })
})

test('wargear abilities are explained beside their choices', async ({ page }) => {
  await openBuilder(page)
  await add(page, 'Tomb Blades')
  await page
    .getByRole('button', { name: /^Tomb Blades/ })
    .first()
    .click()

  const loadout = page.locator('aside[aria-label="Loadout"]')
  for (const name of ['Shadowloom', 'Nebuloscope']) {
    const option = loadout.getByRole('button', { name: `Select ${name}` }).locator('..')
    await expect(option.locator('[data-slot="option-abilities"] p')).not.toHaveCount(0)
  }
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
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).fontSize)).toBe('19px')
  await page.screenshot({ path: 'test-results/unit-preview.png' })

  await add(page, 'Immortals')
  await page
    .getByRole('button', { name: /^Immortals/ })
    .first()
    .click()

  const loadout = page.locator('aside[aria-label="Loadout"]')
  const gauss = loadout.getByRole('listitem').filter({ hasText: 'Gauss blaster' })
  await expect(gauss.getByText('5', { exact: true }).first()).toBeVisible()
  await expect(page.getByRole('button', { name: /modified from 5 by Cursed Legion/ })).toHaveCount(0)
})

test('a supplement imports its shared detachment group', async ({ page }) => {
  await signUp(page, 'Richard')
  await createRoster(page, { faction: 'Black Templars', detachment: /Companions of Vehemence/ })
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
  const profile = page.locator('aside[aria-label="Datasheet"] [data-slot="unit-profile"]')
  await expect(profile).toBeVisible()
  await profile.evaluate((existing) => {
    new MutationObserver(() => {
      if (!document.contains(existing)) document.documentElement.dataset.profileRefreshed = 'true'
    }).observe(document.body, { childList: true, subtree: true })
  })

  const total = page.locator('[data-stat="points"]')
  await expect(total).toHaveText('125/2000')
  // The stepper lives with the rest of the selected unit's configuration.
  await page.getByRole('button', { name: 'More models in Immortals' }).click()
  await expect(page.getByLabel('Immortals models')).toHaveText('6')
  await expect(total).not.toHaveText('125/2000')
  await expect(page.locator('html')).not.toHaveAttribute('data-profile-refreshed', 'true')
  // And the wargear lines follow the models carrying it.
  await expect(page.getByText('6x Gauss blaster')).toBeVisible()
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
  // eslint-disable-next-line no-await-in-loop
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
  const pane = page.locator('aside[aria-label="Datasheet"]')
  const loadout = page.locator('aside[aria-label="Loadout"]')
  await expect(pane.getByText('InSv')).toBeVisible()
  await expect(pane.getByText('4+')).toBeVisible()
  await expect(loadout.getByText('Tachyon arrow', { exact: true })).toBeVisible()
  await expect(loadout.getByText("Overlord's blade", { exact: true })).toBeVisible()
  await expect(loadout.getByText('Voidscythe', { exact: true })).toBeVisible()
  const leader = pane.getByRole('button', { name: 'Leader', exact: true })
  await leader.hover()
  await expect(page.getByRole('tooltip')).toContainText('select one friendly bodyguard unit')
  const profile = pane.locator('[data-slot="unit-profile"]')
  const stats = await profile.boundingBox()
  const lastStat = await profile.locator(':scope > div').last().boundingBox()
  expect(stats).not.toBeNull()
  expect(lastStat).not.toBeNull()
  expect(Math.abs((lastStat?.x ?? 0) + (lastStat?.width ?? 0) - ((stats?.x ?? 0) + (stats?.width ?? 0)))).toBeLessThan(2)
})

test('a smaller desktop keeps the picker, roster and loadout visible', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 800 })
  await openBuilder(page)

  const picker = page.locator('aside[aria-label="Add units"]')
  const loadout = page.locator('aside[aria-label="Loadout"]')
  const datasheet = page.locator('aside[aria-label="Datasheet"]')
  await expect(picker).toBeVisible()
  await expect(loadout).toBeVisible()
  await expect(datasheet).toBeHidden()

  await page.getByLabel('Add a unit').fill('Deceiver')
  const name = picker.getByText("C'tan Shard of the Deceiver", { exact: true })
  await expect(name).toBeVisible()
  expect(await name.evaluate((element) => getComputedStyle(element).whiteSpace)).toBe('normal')

  await page.getByRole('button', { name: "Add C'tan Shard of the Deceiver", exact: true }).click()
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
  const heading = await loadout.getByRole('heading', { name: "C'tan Shard of the Deceiver" }).boundingBox()
  const points = await loadout.getByText('330 pts').boundingBox()
  expect(heading && points && points.y >= heading.y + heading.height).toBe(true)

  await page.setViewportSize({ width: 1280, height: 800 })
  await expect(datasheet).toBeHidden()
  const roster = picker.locator('xpath=following-sibling::div[1]')
  const compactWidths = await Promise.all([picker, roster, loadout].map((column) => column.boundingBox()))
  for (const width of compactWidths) expect(width?.width).toBeCloseTo(compactWidths[0]?.width ?? 0, 0)

  await page.setViewportSize({ width: 1440, height: 900 })
  await expect(datasheet).toBeVisible()
  await expect(datasheet.getByText('Datasheet abilities')).toBeVisible()
  await expect(loadout.getByText('Equipped ranged weapons', { exact: true })).toBeVisible()
  await expect(datasheet.getByText('Grand Illusion', { exact: true })).toBeVisible()
  const widths = await Promise.all([picker, roster, loadout, datasheet].map((column) => column.boundingBox()))
  for (const width of widths) expect(width?.width).toBeCloseTo(widths[0]?.width ?? 0, 0)
  const editor = picker.locator('xpath=ancestor::div[contains(@class,"bg-sunken")][1]')
  const editorBounds = await editor.boundingBox()
  expect(editorBounds?.x).toBe(0)
  expect(editorBounds?.width).toBe(1440)
  const factionAbility = datasheet.getByRole('button', { name: 'Reanimation Protocols', exact: true })
  await factionAbility.hover()
  await expect(page.getByRole('tooltip')).toContainText('activates its Reanimation Protocols')
  await page.screenshot({ path: 'test-results/builder-four-columns.png', fullPage: true })
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

test('a squad divides its weapons between two options', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 })
  await openBuilder(page)
  await add(page, 'Immortals')
  await page.locator('[data-unit="Immortals"]').getByRole('button', { name: 'Immortals', exact: true }).click()

  // Ten bodies, so there are ten guns to divide.
  for (let models = 6; models <= 10; models++) {
    // eslint-disable-next-line no-await-in-loop
    await page.getByRole('button', { name: 'More models in Immortals' }).click()
    // eslint-disable-next-line no-await-in-loop
    await expect(page.getByLabel('Immortals models')).toHaveText(String(models))
  }
  await expect(page.getByText('10x Gauss blaster')).toBeVisible()

  const loadout = page.locator('aside[aria-label="Loadout"]')
  await expect(loadout.getByText('Wargear options')).toBeVisible()
  await expect(loadout.getByText('Weapons').first()).toBeVisible()
  await expect(loadout.getByText('BS').first()).toBeVisible()
  await expect(loadout.getByText('10/10')).toBeVisible()

  // The group is always full, so taking a carbine takes a blaster off a model.
  for (let swapped = 1; swapped <= 3; swapped++) {
    // eslint-disable-next-line no-await-in-loop
    await loadout.getByRole('button', { name: 'More Tesla carbine' }).click()
    // eslint-disable-next-line no-await-in-loop
    await expect(page.getByLabel('Tesla carbine count')).toHaveText(String(swapped))
  }
  await expect(page.getByLabel('Tesla carbine count')).toHaveText('3')
  await expect(page.getByLabel('Gauss blaster count')).toHaveText('7')

  // Removing a default weapon makes the inverse legal swap instead of being
  // silently refilled by the catalogue's mandatory group.
  await loadout.getByRole('button', { name: 'Fewer Gauss blaster' }).click()
  await expect(page.getByLabel('Tesla carbine count')).toHaveText('4')
  await expect(page.getByLabel('Gauss blaster count')).toHaveText('6')

  // The card reads as the datasheet would print it, and the squad is still legal.
  await expect(page.getByText('6x Gauss blaster')).toBeVisible()
  await expect(page.getByText('4x Tesla carbine')).toBeVisible()
  await expect(page.getByText('Within the points limit')).toBeAttached()
  await page.screenshot({ path: 'test-results/loadout.png', fullPage: true })
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
  await add(page, 'Callidus Assassin')
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
