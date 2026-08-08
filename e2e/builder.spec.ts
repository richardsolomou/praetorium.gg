import { expect, type Page, test } from '@playwright/test'
import { signUp } from './account'

/**
 * The four things a player coming from another builder reaches for: squad size where
 * the roster is, the filters that narrow a book down to today's real options, and
 * characters standing with the units they lead.
 */
async function openBuilder(page: Page, faction = 'Necrons', detachment = /Awakened Dynasty/) {
  await signUp(page, 'Richard')

  await page.goto('/')
  await page.getByRole('button', { name: 'Open a battle' }).click()
  await expect(page.getByLabel('Send this link to your opponent')).toHaveValue(/\/b\//)
  await page.getByRole('button', { name: 'Build from the catalogue' }).click()
  await page.getByRole('combobox', { name: 'Faction' }).click()
  await page.getByRole('option', { name: faction, exact: true }).click()
  await page.getByRole('button', { name: 'Add detachment' }).click()
  await page.getByRole('menuitem', { name: detachment }).click()
}

async function add(page: Page, name: string) {
  await page.getByLabel('Add a unit').fill(name)
  await page
    .getByRole('button', { name: `Add ${name}`, exact: true })
    .first()
    .click()
}

test('a supplement imports its shared detachment group', async ({ page }) => {
  await signUp(page, 'Richard')

  await page.goto('/')
  await page.getByRole('button', { name: 'Open a battle' }).click()
  await expect(page.getByLabel('Send this link to your opponent')).toHaveValue(/\/b\//)
  await page.getByRole('button', { name: 'Build from the catalogue' }).click()
  await page.getByRole('combobox', { name: 'Faction' }).click()
  await page.getByRole('option', { name: 'Black Templars', exact: true }).click()
  await page.getByRole('button', { name: 'Add detachment' }).click()
  await page.getByRole('menuitem', { name: /Companions of Vehemence/ }).click()
  await add(page, 'Crusader Squad')
  await expect(page.locator('[data-unit="Crusader Squad"]')).toBeVisible()

  await page.getByRole('combobox', { name: 'Faction' }).click()
  await page.getByRole('option', { name: 'Imperial Fists', exact: true }).click()
  await page.getByRole('button', { name: 'Add detachment' }).click()
  await expect(page.getByRole('menuitem', { name: /Emperor's Shield/ })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: /Imperialis Fleet/ })).toHaveCount(0)
})

test('detachment combinations follow the 11th edition allowance', async ({ page }) => {
  await openBuilder(page)
  await add(page, 'Immortals')

  await page.getByRole('combobox', { name: 'Battle size' }).click()
  await page.getByRole('option', { name: /Incursion/ }).click()
  await expect(page.getByText('3 DP detachment')).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await page.getByRole('button', { name: 'Remove Awakened Dynasty' }).click()
  await page.getByRole('button', { name: 'Add detachment' }).click()
  await page.getByRole('menuitem', { name: /Cryptek Conclave/ }).click()
  await page.getByRole('button', { name: 'Add detachment' }).click()
  await page.getByRole('menuitem', { name: /Hand of the Dynasty/ }).click()
  await expect(page.getByRole('alert')).toContainText('This combination costs 3 DP')
  await expect(page.getByRole('button', { name: 'Invalid detachments' })).toBeDisabled()
  await expect(page.getByText(/Detachment: allows at most 1/)).toBeHidden()
  await page.screenshot({ path: 'test-results/detachment-points.png', fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  const firstDetachment = page.getByRole('button', { name: 'Remove Cryptek Conclave' })
  await expect(firstDetachment).toBeVisible()
  await expect(page.getByRole('alert')).toBeVisible()
  const bounds = await firstDetachment.boundingBox()
  expect(bounds && bounds.x + bounds.width).toBeLessThanOrEqual(390)
  const steps = await page.getByRole('navigation', { name: 'Battle setup steps' }).getByRole('button').all()
  const stepBounds = await Promise.all(steps.map((step) => step.boundingBox()))
  for (let index = 0; index < stepBounds.length - 1; index += 1) {
    const current = stepBounds[index]
    const next = stepBounds[index + 1]
    expect(current && next && current.x + current.width <= next.x).toBe(true)
  }
  await page.screenshot({ path: 'test-results/detachment-points-phone.png', fullPage: true })
  await expect(page.getByRole('status')).toContainText('Saved automatically')

  await page.goto('/')
  await page.getByRole('button', { name: 'Open a battle' }).click()
  await page.getByRole('button', { name: 'Build from the catalogue' }).click()
  await page.getByRole('button', { name: 'Necrons — Cryptek Conclave', exact: true }).click()
  await expect(page.getByText('Cryptek Conclave', { exact: true })).toBeVisible()
  await expect(page.getByRole('alert')).toContainText('This combination costs 3 DP')
})

test('an allied force can be added from its own catalogue', async ({ page }) => {
  await openBuilder(page)
  await page.getByRole('combobox', { name: 'Force' }).click()
  await page.getByRole('option', { name: 'Death Guard', exact: true }).click()
  await add(page, 'Plague Marines')

  const allied = page.locator('[data-unit="Plague Marines"]')
  await expect(allied).toContainText('Allied force · Chaos - Death Guard')
  await expect(page.getByText('allied-force eligibility is not present in the synced catalogue data')).toBeVisible()
  await expect(page.getByRole('status')).toContainText('Saved automatically')
  await page.screenshot({ path: 'test-results/allied-force.png', fullPage: true })
})

test('a squad grows from the roster itself', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 })
  await openBuilder(page)
  await add(page, 'Immortals')

  await page
    .locator('[data-unit="Immortals"]')
    .getByRole('button', { name: /^Immortals/ })
    .click()
  const profile = page.locator('aside[aria-label="Datasheet"] [data-slot="unit-profile"]')
  await expect(profile).toBeVisible()
  await profile.evaluate((existing) => {
    new MutationObserver(() => {
      if (!document.contains(existing)) document.documentElement.dataset.profileRefreshed = 'true'
    }).observe(document.body, { childList: true, subtree: true })
  })

  const total = page.locator('[data-stat="points"]')
  await expect(total).toHaveText('70/2000')
  // No pane opened, no unit selected: the stepper is on the card.
  await page.getByRole('button', { name: 'More models in Immortals' }).click()
  await expect(page.getByLabel('Immortals models')).toHaveText('6')
  await expect(total).not.toHaveText('70/2000')
  await expect(page.locator('html')).not.toHaveAttribute('data-profile-refreshed', 'true')
  // And the wargear lines follow the models carrying it.
  await expect(page.getByText('6x Gauss blaster')).toBeVisible()
})

test('a unit duplicates with its configured model count', async ({ page }) => {
  await openBuilder(page)
  await add(page, 'Immortals')
  await page.getByRole('button', { name: 'More models in Immortals' }).click()
  await page.getByLabel('Unit actions for Immortals').click()
  await page.screenshot({ path: 'test-results/unit-actions.png', fullPage: true })
  await page.getByRole('menuitem', { name: 'Duplicate unit' }).click()

  await expect(page.locator('[data-unit="Immortals"]')).toHaveCount(2)
  await expect(page.getByLabel('Immortals models')).toHaveText(['6', '6'])
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
  await page.getByRole('combobox', { name: 'Battle size' }).click()
  await page.getByRole('option', { name: /Incursion/ }).click()
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

test('a character can be marked as the warlord from its card', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 })
  await openBuilder(page)
  await add(page, 'Overlord')
  const warlord = page.getByRole('button', { name: 'Make Overlord Warlord' })
  await warlord.click()
  await expect(page.getByRole('button', { name: 'Remove Overlord Warlord' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByText(/\d+x Warlord/)).toHaveCount(0)
  await page
    .locator('[data-unit="Overlord"]')
    .getByRole('button', { name: /^Overlord/ })
    .click()
  const pane = page.locator('aside[aria-label="Datasheet"]')
  const loadout = page.locator('aside[aria-label="Loadout"]')
  await expect(pane.getByText('InSv')).toBeVisible()
  await expect(pane.getByText('4+')).toBeVisible()
  await expect(loadout.getByText('Ranged weapons', { exact: true })).toBeVisible()
  await expect(loadout.getByText('Melee weapons', { exact: true })).toBeVisible()
  await expect(loadout.getByText('Tachyon arrow', { exact: true })).toBeVisible()
  await expect(loadout.getByText("Overlord's blade", { exact: true })).toBeVisible()
  await expect(loadout.getByText('Voidscythe', { exact: true })).toBeHidden()
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
  await page
    .locator('[data-unit="C\'tan Shard of the Deceiver"]')
    .getByRole('button', { name: /^C'tan Shard of the Deceiver/ })
    .click()
  const heading = await loadout.getByRole('heading', { name: "C'tan Shard of the Deceiver" }).boundingBox()
  const points = await loadout.getByText('330 pts').boundingBox()
  expect(heading && points && points.y >= heading.y + heading.height).toBe(true)

  await page.setViewportSize({ width: 1280, height: 800 })
  await expect(datasheet).toBeVisible()
  await expect(datasheet.getByText('Datasheet abilities')).toBeVisible()
  await expect(loadout.getByText('Ranged weapons', { exact: true })).toBeVisible()
  await expect(datasheet.getByText('Grand Illusion', { exact: true })).toBeVisible()
  const factionAbility = datasheet.getByRole('button', { name: 'Reanimation Protocols', exact: true })
  await factionAbility.hover()
  await expect(page.getByRole('tooltip')).toContainText('activates its Reanimation Protocols')
  await page.screenshot({ path: 'test-results/builder-four-columns.png', fullPage: true })
})

test('making a new warlord removes the previous one', async ({ page }) => {
  await openBuilder(page)
  await add(page, 'Overlord')
  await add(page, 'Plasmancer')
  await page.getByRole('button', { name: 'Make Overlord Warlord' }).click()
  await page.getByRole('button', { name: 'Make Plasmancer Warlord' }).click()
  await expect(page.getByRole('button', { name: 'Make Overlord Warlord' })).toHaveAttribute('aria-pressed', 'false')
  await expect(page.getByRole('button', { name: 'Remove Plasmancer Warlord' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByText(/\d+x Warlord/)).toHaveCount(0)
})

test('a squad divides its weapons between two options', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 })
  await openBuilder(page)
  await add(page, 'Immortals')

  // Ten bodies, so there are ten guns to divide.
  // eslint-disable-next-line no-await-in-loop
  for (let grown = 0; grown < 5; grown++) await page.getByRole('button', { name: 'More models in Immortals' }).click()
  await expect(page.getByText('10x Gauss blaster')).toBeVisible()

  await page
    .locator('[data-unit="Immortals"]')
    .getByRole('button', { name: /^Immortals/ })
    .click()
  const loadout = page.locator('aside[aria-label="Loadout"]')
  await expect(loadout.getByText('Wargear options')).toBeVisible()
  await expect(loadout.getByText('Weapons').first()).toBeVisible()
  await expect(loadout.getByText('BS').first()).toBeVisible()
  await expect(loadout.getByText('10/10')).toBeVisible()

  // The group is always full, so taking a carbine takes a blaster off a model.
  // eslint-disable-next-line no-await-in-loop
  for (let swapped = 0; swapped < 3; swapped++) await loadout.getByRole('button', { name: 'More Tesla carbine' }).click()
  await expect(page.getByLabel('Tesla carbine count')).toHaveText('3')
  await expect(page.getByLabel('Gauss blaster count')).toHaveText('7')

  // The card reads as the datasheet would print it, and the squad is still legal.
  await expect(page.getByText('7x Gauss blaster')).toBeVisible()
  await expect(page.getByText('3x Tesla carbine')).toBeVisible()
  await expect(page.getByText('Within the points limit')).toBeAttached()
  await page.screenshot({ path: 'test-results/loadout.png', fullPage: true })
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
})

test('a chapter reaches the whole Codex range, not just its own datasheets', async ({ page }) => {
  // Dark Angels state twenty-seven datasheets of their own and field two hundred
  // and forty-nine, the rest imported from the Space Marines book.
  await openBuilder(page, 'Dark Angels', /Unforgiven Task Force/)
  await add(page, 'Intercessor Squad')
  await expect(page.locator('[data-unit="Intercessor Squad"]')).toBeVisible()
})
