import { expect, test } from '@playwright/test'
import { waitForRosterSave } from './account'
import { shot, expectNoHorizontalOverflow, openBuilder, add, attach } from './builder.harness'

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

test('loadout controls keep their shape while resized constraints load', async ({ page }) => {
  await openBuilder(page)
  await add(page, 'Immortals')
  await page.locator('[data-unit="Immortals"]').getByRole('button', { name: 'Immortals', exact: true }).click()
  await expect(page.locator('[data-roster-builder]')).toHaveAttribute('data-saving', 'false')

  const loadout = page.locator('aside[aria-label="Loadout"]')
  const tesla = loadout.getByRole('button', { name: 'Select Tesla carbine' })
  await expect(tesla).toBeEnabled()

  let releasePricing: () => void = () => undefined
  const pricingHeld = new Promise<void>((resolve) => {
    releasePricing = resolve
  })
  let pricingStarted: () => void = () => undefined
  const started = new Promise<void>((resolve) => {
    pricingStarted = resolve
  })
  await page.route('**/_serverFn/**', async (route) => {
    if (route.request().method() === 'POST') {
      pricingStarted()
      await pricingHeld
    }
    await route.continue()
  })

  await loadout.getByRole('button', { name: 'More models in Immortals' }).click()
  await started
  await expect(loadout.getByLabel('Immortals models')).toHaveText('6')
  await expect(tesla).toBeDisabled()
  await expect(tesla).toHaveCount(1)
  await shot(loadout, 'test-results/loadout-controls-pending-resize.png')

  releasePricing()
  await expect(tesla).toBeEnabled()
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

test('the filters narrow the book to what is worth taking', async ({ browser, page }) => {
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
  const serverContext = await browser.newContext({ javaScriptEnabled: false, storageState: await page.context().storageState() })
  const serverPage = await serverContext.newPage()
  await serverPage.goto('/factions/necrons/datasheets')
  await expect(serverPage.getByLabel('Loading collection status for Lychguard')).toBeVisible()
  await serverPage.screenshot({ path: 'test-results/collection-loading-state.png', fullPage: true })
  await serverContext.close()
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

  // The battle size's own restrictions are switched off from the picker's own menu,
  // over the book they act on.
  const restriction = () => page.getByRole('menuitemcheckbox', { name: /Detachment points/ })
  await page.getByRole('button', { name: 'Format restrictions' }).click()
  await expect(restriction()).toHaveAttribute('aria-checked', 'true')
  await waitForRosterSave(page, () => restriction().click())
  await page.keyboard.press('Escape')
  await expect(page.getByRole('region', { name: 'Format restrictions switched off' })).toContainText('Detachment points')
  await page.getByRole('button', { name: 'Format restrictions' }).click()
  await expect(restriction()).toHaveAttribute('aria-checked', 'false')
  await waitForRosterSave(page, () => restriction().click())
  await page.keyboard.press('Escape')
  await expect(page.getByRole('region', { name: 'Format restrictions switched off' })).toHaveCount(0)

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

  // Three cards on the shelves, one unit on the table: the header counts what the
  // list brings, the same way the library and the battle count it.
  await expect(page.locator('header').getByText('1 unit', { exact: true })).toBeVisible()

  await add(page, 'Chronomancer')
  await expect(page.locator('header').getByText('2 units', { exact: true })).toBeVisible()
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
  await expect(page.locator('[data-unit="Land Raider Redeemer"]')).toContainText('260 pts')
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
  await page.screenshot({ path: 'test-results/overlord-loadout-settled.png', fullPage: true })
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

  await loadout.getByRole('button', { name: 'Back to roster' }).click()
  await page.getByRole('button', { name: 'Add units' }).click()
  const picker = page.getByRole('dialog', { name: 'Add units' })
  await picker.getByLabel('Add a unit').fill('Imotekh the Stormlord')
  await picker.getByRole('button', { name: 'View Imotekh the Stormlord datasheet' }).click()
  const datasheet = page.locator('aside[aria-label="Datasheet"]')
  await expect(datasheet.getByText('Character', { exact: true })).toBeVisible()
  await datasheet.getByRole('button', { name: 'Back to units' }).click()
  await expect(picker).toBeVisible()
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

  await loadout.getByRole('button', { name: 'Back to roster' }).click()
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

  await expect(terminators.getByLabel('Storm Bolter and Power Fist count', { exact: true })).toHaveText('4')
  await waitForRosterSave(page, () => terminators.getByRole('button', { name: `More ${cyclone}` }).click())
  await expect(terminators.getByLabel(`${cyclone} count`)).toHaveText('1')
  await expect(terminators.getByLabel('Power Fist count', { exact: true })).toHaveText('1')
  await expect(page.locator('[data-unit="Deathwing Terminator Squad"]').getByText('4x Power Fist')).toBeVisible()
  const firingProfiles = terminators.getByRole('region', { name: 'cyclone missile launcher profiles', exact: true })
  await expect(firingProfiles.getByRole('heading', { name: 'Frag', exact: true })).toBeVisible()
  await expect(firingProfiles.getByRole('heading', { name: 'Krak', exact: true })).toBeVisible()
  await expect(terminators.getByRole('heading', { name: /^5× Storm Bolter$/i })).toHaveCount(0)

  await waitForRosterSave(page, () => terminators.getByRole('button', { name: 'More Chainfist', exact: true }).click())
  await expect(terminators.getByLabel('Chainfist count', { exact: true })).toHaveText('1')
  await expect(terminators.getByLabel(`${cyclone} count`)).toHaveText('1')
  await expect(terminators.getByLabel('Power Fist count', { exact: true })).toHaveText('0')
  await expect(page.locator('[data-unit="Deathwing Terminator Squad"]').getByText('3x Power Fist')).toBeVisible()
  await waitForRosterSave(page, () => terminators.getByRole('button', { name: 'Fewer Chainfist', exact: true }).click())
  await expect(terminators.getByLabel('Chainfist count', { exact: true })).toHaveText('0')
  await expect(terminators.getByLabel('Power Fist count', { exact: true })).toHaveText('1')
  await expect(page.locator('[data-unit="Deathwing Terminator Squad"]').getByText('4x Power Fist')).toBeVisible()

  await waitForRosterSave(page, () => terminators.getByRole('button', { name: `Fewer ${cyclone}` }).click())
  await expect(terminators.getByLabel(`${cyclone} count`)).toHaveText('0')
  await expect(terminators.getByLabel('Storm Bolter and Power Fist count', { exact: true })).toHaveText('4')

  await waitForRosterSave(page, () => terminators.getByRole('button', { name: `More ${cyclone}` }).click())
  await waitForRosterSave(page, () => terminators.getByRole('button', { name: 'More Storm Bolter and Power Fist', exact: true }).click())
  await expect(terminators.getByLabel(`${cyclone} count`)).toHaveText('0')
  await expect(terminators.getByLabel('Storm Bolter and Power Fist count', { exact: true })).toHaveText('4')
  await page.reload()
  await page
    .locator('[data-unit="Deathwing Terminator Squad"]')
    .getByRole('button', { name: /^Deathwing Terminator Squad/ })
    .click()
  await expect(terminators.getByLabel(`${cyclone} count`)).toHaveText('0')
  await expect(terminators.getByLabel('Storm Bolter and Power Fist count', { exact: true })).toHaveText('4')
  await page.screenshot({ path: 'test-results/deathwing-restored-loadout.png', fullPage: true })
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

test('independent weapon choices are edited separately when the catalogue stores their combinations', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 })
  await openBuilder(page)
  await add(page, 'Canoptek Wraiths')
  await page.locator('[data-unit="Canoptek Wraiths"]').getByRole('button', { name: 'Canoptek Wraiths', exact: true }).click()

  const loadout = page.locator('aside[aria-label="Loadout"]')
  await expect(loadout.getByText('Wargear options', { exact: true })).toBeHidden()
  await expect(loadout.getByLabel('Wraith models')).toHaveText('3')
  await expect(loadout.getByLabel('Vicious claws count')).toHaveText('3')
  await expect(loadout.getByLabel('Whip coils count')).toHaveText('0')
  await expect(loadout.getByLabel('Transdimensional beamer count')).toHaveText('0')
  await expect(loadout.getByLabel('Particle caster count')).toHaveText('0')

  await waitForRosterSave(page, () => loadout.getByRole('button', { name: 'More Transdimensional beamer' }).click())
  await expect(loadout.getByLabel('Transdimensional beamer count')).toHaveText('1')
  await expect(loadout.getByLabel('Vicious claws count')).toHaveText('3')

  await waitForRosterSave(page, () => loadout.getByRole('button', { name: 'More Whip coils' }).click())
  await expect(loadout.getByLabel('Whip coils count')).toHaveText('1')
  await expect(loadout.getByLabel('Vicious claws count')).toHaveText('2')
  await expect(loadout.getByLabel('Transdimensional beamer count')).toHaveText('1')

  await waitForRosterSave(page, () => loadout.getByRole('button', { name: 'More Particle caster' }).click())
  await expect(loadout.getByLabel('Particle caster count')).toHaveText('1')
  await expect(loadout.getByLabel('Transdimensional beamer count')).toHaveText('1')
  await expect(loadout.getByLabel('Vicious claws count')).toHaveText('2')
  await expect(loadout.getByLabel('Whip coils count')).toHaveText('1')
  await expect(page.getByText('1x Transdimensional beamer')).toBeVisible()
  await expect(page.getByText('1x Particle caster')).toBeVisible()
  await expect(page.getByText('Within the points limit')).toBeAttached()
  await expectNoHorizontalOverflow(page.locator('body'))
  await expectNoHorizontalOverflow(loadout)
  await page.screenshot({ path: 'test-results/independent-wraith-loadout.png', fullPage: true })

  await page.setViewportSize({ width: 390, height: 844 })
  await loadout.getByRole('button', { name: 'Back to roster' }).click()
  await expectNoHorizontalOverflow(page.locator('html'))
  await expectNoHorizontalOverflow(page.locator('[data-slot="roster-units"]'))
  await page.locator('[data-unit="Canoptek Wraiths"]').getByRole('button', { name: 'Canoptek Wraiths', exact: true }).click()
  await expectNoHorizontalOverflow(page.locator('html'))
  await expectNoHorizontalOverflow(loadout.locator('[data-slot="scroll-area-viewport"]'))
  await page.screenshot({ path: 'test-results/independent-wraith-loadout-mobile.png', fullPage: true })
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

  await page.getByLabel('Add a unit').fill('Leman Russ Commander')
  await page.getByRole('button', { name: 'View Leman Russ Commander datasheet' }).click()
  const orders = page.locator('aside[aria-label="Datasheet"]').getByRole('heading', { name: 'Orders', exact: true }).locator('..')
  await expect(orders).toContainText('This Officer can issue 2 Orders to Squadron units.')

  // And what it borrows from another book is there beside its own.
  await page.getByLabel('Add a unit').fill('Callidus Assassin')
  await page.getByRole('button', { name: 'Toggle Agents of the Imperium' }).click()
  await page.getByRole('button', { name: 'Add Callidus Assassin', exact: true }).click()
  await expect(page.locator('[data-unit="Callidus Assassin"]')).toBeVisible()
  await expect(page.getByText('Within the points limit')).toBeAttached()
})

test('Cadian Shock Troops can take their full special weapon allowance', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 })
  await openBuilder(page, 'Astra Militarum', /Combined Arms/)
  await add(page, 'Cadian Shock Troops')
  await page.locator('[data-unit="Cadian Shock Troops"]').getByRole('button', { name: 'Cadian Shock Troops', exact: true }).click()

  const loadout = page.locator('aside[aria-label="Loadout"]')
  await waitForRosterSave(page, () => loadout.getByRole('button', { name: 'More Meltagun' }).click())
  await waitForRosterSave(page, () => loadout.getByRole('button', { name: 'More Plasma gun' }).click())
  await expect(loadout.getByLabel('Meltagun count')).toHaveText('1')
  await expect(loadout.getByLabel('Plasma gun count')).toHaveText('1')

  await waitForRosterSave(page, () => page.getByRole('button', { name: 'More models in Cadian Shock Troops' }).click())
  await waitForRosterSave(page, () => loadout.getByRole('button', { name: 'More Meltagun' }).click())
  await waitForRosterSave(page, () => loadout.getByRole('button', { name: 'More Meltagun' }).click())
  await waitForRosterSave(page, () => loadout.getByRole('button', { name: 'More Plasma gun' }).click())
  await waitForRosterSave(page, () => loadout.getByRole('button', { name: 'More Plasma gun' }).click())
  await expect(loadout.getByLabel('Meltagun count')).toHaveText('2')
  await expect(loadout.getByLabel('Plasma gun count')).toHaveText('2')
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
  await expect(
    loadout
      .getByRole('region', { name: 'astartes grenade launcher profiles', exact: true })
      .getByRole('heading', { name: 'Krak', exact: true }),
  ).toHaveCount(1)
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

for (const width of [390, 1600]) {
  test(`Plague Marine variants share a model card at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await openBuilder(page, 'Death Guard', /Champions of Contagion/)
    await add(page, 'Plague Marines')
    if (width < 1000) await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click()
    await expectNoHorizontalOverflow(page.locator('html'))
    await expectNoHorizontalOverflow(page.locator('[data-slot="roster-units"]'))
    const card = page.locator('[data-unit="Plague Marines"]')
    await card.getByRole('button', { name: /^Plague Marines/ }).click()
    const loadout = page.locator('aside[aria-label="Loadout"]')
    await expect(loadout.getByLabel('Plague Champion models', { exact: true })).toHaveText('1')
    await expect(loadout.getByLabel('Plague Marine models', { exact: true })).toHaveText('4')
    await waitForRosterSave(page, () => loadout.getByRole('button', { name: 'More Boltgun and Icon of Despair', exact: true }).click())
    await waitForRosterSave(page, () => loadout.getByRole('button', { name: 'More Meltagun', exact: true }).click())
    await expect(card).toContainText('4x Boltgun')
    await expect(card).toContainText('1x Icon of Despair')
    await expect(card).toContainText('1x Meltagun')
    await expect(loadout.getByLabel('Plague Marine models', { exact: true })).toHaveText('4')
    await expectNoHorizontalOverflow(page.locator('html'))
    await expectNoHorizontalOverflow(loadout)
    await page.screenshot({ path: `test-results/plague-marines-compact-${width}.png`, fullPage: true })
    await page.reload()
    if (width >= 1000) await card.getByRole('button', { name: /^Plague Marines/ }).click()
    await expect(card).toContainText('1x Icon of Despair')
    await expect(card).toContainText('1x Meltagun')
    await expect(loadout.getByLabel('Plague Marine models', { exact: true })).toHaveText('4')
    await waitForRosterSave(page, () => loadout.getByRole('button', { name: 'Fewer Meltagun', exact: true }).click())
    await waitForRosterSave(page, () => loadout.getByRole('button', { name: 'Fewer Boltgun and Icon of Despair', exact: true }).click())
    await expect(card).toContainText('5x Boltgun')
    await expect(card).not.toContainText('Icon of Despair')
    await expect(card).not.toContainText('Meltagun')
  })

  test(`Ork loadout variants share compact model cards at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await openBuilder(page, 'Orks', /War Horde/)
    await add(page, 'Nobz')
    await add(page, 'Boyz')
    if (width < 1000) await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click()
    await expectNoHorizontalOverflow(page.locator('html'))
    await expectNoHorizontalOverflow(page.locator('[data-slot="roster-units"]'))

    const card = page.locator('[data-unit="Nobz"]')
    await card.getByRole('button', { name: /^Nobz/ }).click()
    const loadout = page.locator('aside[aria-label="Loadout"]')
    await expect(loadout.getByLabel('Nob models', { exact: true })).toHaveText('5')
    await expect(loadout.getByRole('button', { name: / details$/ })).toHaveCount(0)
    await expect(loadout.getByRole('region', { name: 'kombi-rokkit profiles', exact: true })).toContainText('2 profiles')
    await page.screenshot({ path: `test-results/nobz-box-spacing-${width}.png`, animations: 'disabled' })
    const datasheetHref = await loadout.getByRole('link', { name: 'Open full datasheet in a new tab' }).getAttribute('href')
    await loadout.getByRole('button', { name: 'Waaagh!', exact: true }).click()
    await expect(page.getByRole('tooltip')).toContainText('riled up')
    await expect(
      page
        .getByRole('tooltip')
        .locator('strong')
        .filter({ hasText: /^ORKS$/ }),
    ).toBeVisible()
    await expect(page.getByRole('tooltip').getByRole('listitem').first()).toContainText('Re-roll')
    await expect(page.getByRole('tooltip').getByRole('listitem')).toHaveCount(5)
    await page.screenshot({ path: `test-results/waaagh-tooltip-${width}.png` })
    await page.keyboard.press('Escape')

    await loadout.getByRole('button', { name: 'LETHAL HITS: non-MONSTER/VEHICLE', exact: true }).first().click()
    await expect(page.getByRole('tooltip')).toContainText('Lethal Hits')
    await page.screenshot({ path: `test-results/conditional-keyword-${width}.png` })
    await page.keyboard.press('Escape')
    await expect(page.getByRole('tooltip')).toBeHidden()
    await loadout.getByRole('button', { name: 'LETHAL HITS: non-MONSTER/VEHICLE', exact: true }).first().press('Enter')
    await expect(page.getByRole('tooltip')).toContainText('Lethal Hits')
    await page.keyboard.press('Escape')

    const pair = 'Big Skorcha and Kustom Choppa'
    const profiles = loadout.getByRole('listitem').filter({ has: page.getByRole('button', { name: `More ${pair}`, exact: true }) })
    await expect(profiles).toBeVisible()
    await expect(profiles).toContainText('Range')
    await expect(profiles.locator('[data-equipped]')).toHaveAttribute('data-equipped', 'false')
    const unselectedHeading = await profiles.locator('[data-equipped]').boundingBox()
    await expect(profiles).toHaveCSS('border-left-width', '5px')
    await expect(
      loadout.getByText(
        'For every 5 models in this unit, 1 model can have their Kustom Krumpa and Kustom Shoota replaced with 1 Big Skorcha and 1 Kustom Choppa.',
        { exact: true },
      ),
    ).toHaveCount(1)
    await waitForRosterSave(page, () => loadout.getByRole('button', { name: `More ${pair}`, exact: true }).click())
    await expect(profiles.locator('[data-equipped]')).toHaveAttribute('data-equipped', 'true')
    await expect(profiles).toHaveCSS('border-left-color', 'rgb(137, 184, 157)')
    const selectedHeading = await profiles.locator('[data-equipped]').boundingBox()
    expect(selectedHeading?.x).toBe(unselectedHeading?.x)
    expect(selectedHeading?.width).toBe(unselectedHeading?.width)
    await expect(card).toContainText('1x Big Skorcha')
    await expect(card).toContainText('1x Kustom Choppa')
    await expect(card).toContainText('4x Kustom Shoota')
    await expect(loadout.getByLabel('Nob models', { exact: true })).toHaveText('5')
    await expectNoHorizontalOverflow(page.locator('html'))
    await expectNoHorizontalOverflow(loadout)
    await page.screenshot({ path: `test-results/nobz-compact-${width}.png`, fullPage: true })
    await page.reload()
    if (width >= 1000) await card.getByRole('button', { name: /^Nobz/ }).click()
    await expect(loadout.getByLabel('Nob models', { exact: true })).toHaveText('5')
    await expect(loadout.getByLabel(`${pair} count`, { exact: true })).toHaveText('1')
    await waitForRosterSave(page, () => loadout.getByRole('button', { name: `Fewer ${pair}`, exact: true }).click())
    await expect(profiles.locator('[data-equipped]')).toHaveAttribute('data-equipped', 'false')
    await expect(card).toContainText('5x Kustom Shoota')
    await expect(card).not.toContainText('Big Skorcha')
    if (width < 1000) await loadout.getByRole('button', { name: 'Back to roster' }).click()

    const boyz = page.locator('[data-unit="Boyz"]')
    await boyz.getByRole('button', { name: /^Boyz/ }).click()
    await expect(loadout.getByLabel('Boy models', { exact: true })).toHaveText('9')
    await expect(loadout.getByLabel('Nob models', { exact: true })).toHaveText('1')
    await expect(loadout.locator('[data-equipped]').nth(0)).toContainText('Slugga')
    await expect(loadout.locator('[data-equipped]').nth(1)).toContainText('Shoota')
    await expect(loadout.locator('[data-equipped]').nth(2)).toContainText('Choppa')
    await page.screenshot({ path: `test-results/boyz-default-wargear-${width}.png`, animations: 'disabled' })
    await expect(loadout.getByText('Kustom Choppa and Kombi-skorcha', { exact: true })).toHaveCount(0)
    await waitForRosterSave(page, () => loadout.getByRole('button', { name: 'More Rokkit Launcha', exact: true }).click())
    await expect(boyz).toContainText('1x Rokkit Launcha')
    await expect(boyz).toContainText('8x Shoota')
    await expectNoHorizontalOverflow(page.locator('html'))
    await expectNoHorizontalOverflow(loadout)
    await page.screenshot({ path: `test-results/boyz-compact-${width}.png`, fullPage: true })
    await waitForRosterSave(page, () => loadout.getByRole('button', { name: 'Fewer Rokkit Launcha', exact: true }).click())
    await expect(boyz).toContainText('9x Shoota')
    const weaponHeadings = loadout.locator('[data-equipped] > span:first-child')
    const originalHeadings = await weaponHeadings.allTextContents()
    await expect(loadout.getByRole('button', { name: 'More Kustom Choppa', exact: true })).toBeDisabled()
    await expect(loadout.getByRole('button', { name: 'More Kombi-skorcha', exact: true })).toBeDisabled()
    await waitForRosterSave(page, () => loadout.getByRole('button', { name: 'More Kustom Shoota', exact: true }).click())
    await expect(loadout.getByRole('button', { name: 'More Kustom Shoota', exact: true })).toBeDisabled()
    await expect(loadout.getByLabel('Kombi-skorcha count', { exact: true })).toHaveText('0')
    await expect(loadout.getByLabel('Nob models', { exact: true })).toHaveText('1')
    await expect(weaponHeadings).toHaveText(originalHeadings)
    await waitForRosterSave(page, () => loadout.getByRole('button', { name: 'More Kombi-skorcha', exact: true }).click())
    await expect(weaponHeadings).toHaveText(originalHeadings)
    await expect(loadout.getByRole('button', { name: 'Fewer Kustom Choppa', exact: true })).toBeDisabled()
    await expect(loadout.getByRole('button', { name: 'Fewer Kombi-skorcha', exact: true })).toBeDisabled()
    await waitForRosterSave(page, () => loadout.getByRole('button', { name: 'More Power Klaw', exact: true }).click())
    await expect(boyz).toContainText('1x Power Klaw')
    await expect(loadout.getByRole('button', { name: 'More Power Klaw', exact: true })).toBeDisabled()
    await expect(loadout.getByLabel('Kustom Choppa count', { exact: true })).toHaveText('0')
    await waitForRosterSave(page, () => loadout.getByRole('button', { name: 'Fewer Power Klaw', exact: true }).click())
    await expect(boyz).toContainText('1x Kustom Choppa')
    await waitForRosterSave(page, () => loadout.getByRole('button', { name: 'More Kustom Shoota', exact: true }).click())
    await waitForRosterSave(page, () => loadout.getByRole('button', { name: 'Fewer Kustom Shoota', exact: true }).click())
    await expect(boyz).toContainText('1x Kombi-skorcha')
    await page.reload()
    if (width >= 1000) await boyz.getByRole('button', { name: /^Boyz/ }).click()
    await expect(loadout.getByLabel('Kombi-skorcha count', { exact: true })).toHaveText('1')
    await expect(loadout.getByRole('button', { name: 'More Kombi-skorcha', exact: true })).toBeDisabled()
    await loadout.getByLabel('Kombi-skorcha count', { exact: true }).scrollIntoViewIfNeeded()
    await page.screenshot({ path: `test-results/boyz-nob-restored-${width}.png`, animations: 'disabled' })
    await waitForRosterSave(page, () => loadout.getByRole('button', { name: 'More Big Choppa', exact: true }).click())
    await expect(boyz).toContainText('1x Big Choppa')
    await expect(loadout.getByRole('button', { name: 'More Big Choppa', exact: true })).toBeDisabled()
    await expect(loadout.getByText('Kustom Choppa and Kombi-skorcha', { exact: true })).toHaveCount(0)
    await expect(loadout.getByLabel('Kustom Choppa count', { exact: true })).toHaveText('0')
    await expect(loadout.getByLabel('Kombi-skorcha count', { exact: true })).toHaveText('0')
    await loadout.getByLabel('Nob models', { exact: true }).scrollIntoViewIfNeeded()
    await page.screenshot({ path: `test-results/boyz-nob-separate-weapons-${width}.png`, animations: 'disabled' })
    await page.reload()
    if (width >= 1000) await boyz.getByRole('button', { name: /^Boyz/ }).click()
    await waitForRosterSave(page, () => loadout.getByRole('button', { name: 'More Kustom Choppa', exact: true }).click())
    await expect(loadout.getByLabel('Kombi-skorcha count', { exact: true })).toHaveText('1')
    await waitForRosterSave(page, () => loadout.getByRole('button', { name: 'More Big Choppa', exact: true }).click())
    await waitForRosterSave(page, () => loadout.getByRole('button', { name: 'More Kombi-skorcha', exact: true }).click())
    await expect(boyz).toContainText('1x Kustom Choppa')
    await expect(boyz).not.toContainText('Big Choppa')
    await expect(loadout.getByRole('button', { name: 'Fewer Kustom Choppa', exact: true })).toBeDisabled()
    await expect(loadout.getByRole('button', { name: 'Fewer Kombi-skorcha', exact: true })).toBeDisabled()
    if (width < 1000) await loadout.getByRole('button', { name: 'Back to roster' }).click()
    await page.getByRole('button', { name: 'View', exact: true }).click()
    if (width < 1000) await boyz.getByRole('button', { name: /^Boyz/ }).click()
    await expect(loadout.getByLabel('Kustom Choppa count', { exact: true })).toHaveText('1')
    await expect(loadout.getByLabel('Kombi-skorcha count', { exact: true })).toHaveText('1')
    await expect(loadout.getByRole('button', { name: 'Fewer Kustom Choppa', exact: true })).toHaveCount(0)
    await page.screenshot({ path: `test-results/boyz-nob-required-view-${width}.png`, animations: 'disabled' })
    await page.goto(datasheetHref!)
    const firingProfiles = page.getByRole('rowgroup', { name: 'kombi-rokkit profiles', exact: true })
    await expect(firingProfiles).toContainText('2 profiles')
    await firingProfiles.scrollIntoViewIfNeeded()
    await expectNoHorizontalOverflow(page.locator('html'))
    await page.screenshot({ path: `test-results/weapon-profile-group-${width}.png` })
  })
}

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

  const heavy = loadout.locator('section').filter({ has: page.getByLabel('Plague Marine models', { exact: true }) })
  await waitForRosterSave(page, () => heavy.getByRole('button', { name: 'More Heavy plague weapon' }).click())
  await waitForRosterSave(page, () => heavy.getByRole('button', { name: 'More Heavy plague weapon' }).click())
  const spewer = heavy
  await waitForRosterSave(page, () => spewer.getByRole('button', { name: 'More Plague spewer' }).click())
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
  const deathshroud = page.locator('[data-unit="Deathshroud Terminators"]')
  await expect(loadout.getByLabel('Deathshroud Terminator Champion models')).toHaveText('1')
  await expect(loadout.getByLabel('Deathshroud Terminator models')).toHaveText('2')
  await expect(loadout.getByLabel('Plaguespurt gauntlet count').first()).toHaveText('1')
  await expect(loadout.getByLabel('Plaguespurt gauntlet count').last()).toHaveText('2')
  await expect(loadout.getByRole('button', { name: 'Fewer Plaguespurt gauntlet' })).toBeDisabled()
  const icon = loadout.getByRole('button', { name: 'Select Icon of Despair' })
  await expect(icon).toBeEnabled()
  await expect(loadout.getByLabel('Icon of Despair count', { exact: true })).toHaveText('0')
  await expect(loadout.getByRole('button', { name: /More Icon of Despair/ })).toHaveCount(0)

  let releasePricing: () => void = () => undefined
  const pricingHeld = new Promise<void>((resolve) => {
    releasePricing = resolve
  })
  let holdPricing = true
  await page.route('**/_serverFn/**', async (route) => {
    if (holdPricing && route.request().method() === 'POST') await pricingHeld
    await route.continue()
  })
  const gauntletCount = loadout.getByLabel('Plaguespurt gauntlet count').first()
  const addGauntlet = loadout.getByRole('button', { name: 'More Plaguespurt gauntlet' })
  const removeGauntlet = loadout.getByRole('button', { name: 'Fewer Plaguespurt gauntlet' })
  await addGauntlet.click()
  await expect(gauntletCount).toHaveText('2', { timeout: 250 })
  await expect(removeGauntlet).toBeEnabled()
  await removeGauntlet.click()
  await expect(gauntletCount).toHaveText('1', { timeout: 250 })
  await expect(addGauntlet).toBeEnabled()
  await addGauntlet.click()
  await expect(gauntletCount).toHaveText('2', { timeout: 250 })
  await icon.click()
  await expect(loadout.getByRole('button', { name: 'Remove Icon of Despair' })).toBeEnabled()
  await shot(
    loadout.locator('section').filter({ hasText: 'Deathshroud Terminator Champion' }),
    'test-results/deathshroud-wargear-pending.png',
  )
  holdPricing = false
  releasePricing()
  await expect(loadout.getByLabel('Icon of Despair count', { exact: true })).toHaveText('1')
  await expect(loadout.getByRole('button', { name: /^(Select|Remove) Icon of Despair$/ })).toHaveCount(1)
  await expect(gauntletCount).toHaveText('2')
  await expect(addGauntlet).toBeDisabled()
  await expect(deathshroud).toContainText('4x Plaguespurt gauntlet')
  await expect(deathshroud).toContainText('3x Manreaper')
  await page.screenshot({ path: 'test-results/deathshroud-wargear-once.png', fullPage: true })

  await loadout.getByRole('button', { name: 'Back to roster' }).click()
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
  const plagueMarinesDatasheet = loadout.getByRole('link', { name: 'Open full datasheet in a new tab' })
  await expect(plagueMarinesDatasheet).toHaveAttribute('href', '/factions/death-guard/datasheets/plague-marines')
  await page.screenshot({ path: 'test-results/plague-marines-datasheet-link.png', fullPage: true })
  const [openedPlagueMarines] = await Promise.all([page.waitForEvent('popup'), plagueMarinesDatasheet.click()])
  await expect(openedPlagueMarines).toHaveURL(/\/factions\/death-guard\/datasheets\/plague-marines/)
  await openedPlagueMarines.close()
  const plagueChampion = loadout.locator('section').filter({ hasText: 'Plague Champion' })
  await expect(plagueChampion.getByRole('button', { name: 'More Power fist' })).toBeEnabled()
  await waitForRosterSave(page, () => plagueChampion.getByRole('button', { name: 'More Power fist' }).click())
  await expect(plagueChampion.getByLabel('Power fist count')).toHaveText('1')
  await expect(plagueChampion.getByLabel('Plague knives count')).toHaveText('0')
  await shot(plagueChampion, 'test-results/plague-champion-power-fist.png')
})

test('removing one loadout does not choose another piece of the same model as its replacement', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 })
  await openBuilder(page, 'Black Templars', /Companions of Vehemence/)
  await add(page, 'Crusader Squad')
  await page
    .locator('[data-unit="Crusader Squad"]')
    .getByRole('button', { name: /^Crusader Squad/ })
    .click()

  const loadout = page.locator('aside[aria-label="Loadout"]')
  await expect(loadout.getByLabel('Close combat weapon and Bolt Rifle count', { exact: true })).toHaveText('5')
  await loadout.getByRole('button', { name: 'Fewer Close combat weapon and Bolt Rifle', exact: true }).click()
  await expect(loadout.getByLabel('Close combat weapon and Bolt Rifle count', { exact: true })).toHaveText('4')
  await expect(page.getByLabel('Crusader Squad models')).toHaveText('10')
})
