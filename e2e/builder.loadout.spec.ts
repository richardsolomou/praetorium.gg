import { expect, test, type Page } from './test'
import {
  confirmRosterSetup,
  createRoster,
  retryUntilVisible,
  signUp,
  waitForRosterSave,
  expectNoPageOverflow,
  addUnit,
  chooseRosterAction,
  openRosterSetup,
  chooseOption,
  PHONE,
} from './account'
import { expectWorkSynced } from './storage'
import {
  expectInsideHorizontalBounds,
  expectNoHorizontalOverflow,
  expectNotAttachable,
  openBuilder,
  add,
  arrangeByRole,
  attach,
} from './builder.harness'

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
  await expect(total).toHaveText(/^\d+\/2000$/)
  const startingPoints = Number((await total.innerText()).split('/')[0])
  // The stepper lives with the rest of the selected unit's configuration.
  await page.getByRole('button', { name: 'More models in Immortals' }).click()
  await expect(page.getByLabel('Immortals models')).toHaveText('6')
  await expect.poll(async () => Number((await total.innerText()).split('/')[0])).toBeGreaterThan(startingPoints)
  await expect(page.locator('html')).not.toHaveAttribute('data-datasheet-reloaded', 'true')
  // And the wargear lines follow the models carrying it.
  await expect(page.getByText('6x Gauss blaster')).toBeVisible()
  await expect(loadout.getByRole('heading', { name: 'Tools of Dominion' })).toHaveCount(0)
})

test('a squad jumps straight to a chosen size', async ({ page }) => {
  await openBuilder(page)
  await add(page, 'Immortals')
  await page.locator('[data-unit="Immortals"]').click({ position: { x: 4, y: 4 } })
  const total = page.locator('[data-stat="points"]')
  await expect(total).toHaveText(/^\d+\/2000$/)
  const startingPoints = Number((await total.innerText()).split('/')[0])

  await chooseOption(page, 'Immortals models', '10')
  await expect(page.getByLabel('Immortals models')).toHaveText('10')
  await expect(page.getByRole('button', { name: 'More models in Immortals' })).toBeDisabled()
  await expect.poll(async () => Number((await total.innerText()).split('/')[0])).toBeGreaterThan(startingPoints)

  await page.getByRole('combobox', { name: 'Immortals models' }).press('Enter')
  await page.getByRole('option', { name: '7', exact: true }).press('Enter')
  await expect(page.getByLabel('Immortals models')).toHaveText('7')
})

test('loadout controls keep their shape while resized constraints load', async ({ page }) => {
  await openBuilder(page)
  await add(page, 'Immortals')
  await page.locator('[data-unit="Immortals"]').getByRole('button', { name: 'Immortals', exact: true }).click()
  await expect(page.locator('[data-roster-builder]')).toHaveAttribute('data-saving', 'false')

  const loadout = page.locator('aside[aria-label="Loadout"]')
  const tesla = loadout.getByRole('button', { name: 'Select Tesla carbine' })
  await expect(tesla).toBeEnabled()

  const { promise: pricingHeld, resolve: releasePricing } = Promise.withResolvers<void>()
  const { promise: started, resolve: pricingStarted } = Promise.withResolvers<void>()
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

  releasePricing()
  await expect(tesla).toBeEnabled()
})

test('a unit duplicates with its configured model count', async ({ page }) => {
  await openBuilder(page)
  await addUnit(page, 'Immortals')
  await page.locator('[data-unit="Immortals"]').getByRole('button', { name: 'Immortals', exact: true }).click()
  await page.getByRole('button', { name: 'More models in Immortals' }).click()
  await page.locator('[data-unit="Immortals"]').click({ button: 'right' })
  await expect(page.getByRole('menu').filter({ visible: true })).not.toContainText(/collection/i)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('menu')).toBeHidden()
  await page.getByLabel('Unit actions for Immortals').click()
  await expect(page.getByRole('menu').filter({ visible: true })).not.toContainText(/collection/i)
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

  // Owned: nothing is, until something is said to be, and the filter says where to say it.
  const ownedFilter = page.getByRole('button', { name: 'Owned', exact: true })
  await expect(ownedFilter).toHaveAttribute('aria-disabled', 'true')
  await ownedFilter.hover()
  await expect(page.getByRole('tooltip')).toContainText('Collection page')
  await page.keyboard.press('Escape')

  await page.getByLabel('Add a unit').fill('Lychguard')
  const lychguard = page.getByRole('button', { name: 'Add Lychguard', exact: true }).first()
  await expect(lychguard).toBeVisible()
  await page.getByRole('button', { name: /Lychguard to favourite datasheets/ }).click()
  await expect(page.getByRole('button', { name: /Lychguard from favourite datasheets/ })).toHaveAttribute('aria-pressed', 'true')
  const serverContext = await browser.newContext({ javaScriptEnabled: false, storageState: await page.context().storageState() })
  const serverPage = await serverContext.newPage()
  await serverPage.goto('/factions/necrons/datasheets')
  await expect(serverPage.getByLabel('Loading favourite status for Lychguard')).toBeVisible()
  await serverContext.close()
  // A favourite is not a claim to own the models.
  await expect(ownedFilter).toHaveAttribute('aria-disabled', 'true')

  // Unit limit: three Lychguard is as many as the data allows.
  // One at a time on purpose: each click re-prices the list, and the next click's
  // effect is only meaningful once the previous one has landed.
  for (let taken = 0; taken < 3; taken++) await waitForRosterSave(page, () => lychguard.click())
  await expect(page.getByText('3/3 in roster')).toBeVisible()
  await expect(lychguard).toBeDisabled()
  await page.getByRole('button', { name: 'View Lychguard datasheet' }).click()
  await expect(page.getByRole('button', { name: 'Add to list' })).toBeDisabled()
  await page.locator('[data-unit="Lychguard"]').first().getByLabel('Unit actions for Lychguard').click()
  await expect(page.getByRole('menuitem', { name: 'Duplicate unit' })).toBeDisabled()
  await page.keyboard.press('Escape')
  const rosterUrl = page.url()
  await page.goto('/collection')
  const datasheetSearch = page.getByPlaceholder('Search datasheets…')
  await retryUntilVisible(datasheetSearch, () =>
    page.getByRole('combobox', { name: 'Add a datasheet to your collection', exact: true }).click(),
  )
  await datasheetSearch.fill('Lychguard Necrons')
  await page.getByRole('option', { name: /^Lychguard, Necrons/ }).click()
  await expect(page.locator('[data-unit="Lychguard"]')).toBeVisible()
  await expectWorkSynced(page)
  await page.goto(rosterUrl)
  await page.getByLabel('Add a unit').fill('Lychguard')
  await expect(ownedFilter).not.toHaveAttribute('aria-disabled')
  await ownedFilter.click()
  await expect(lychguard).toBeVisible()
  await ownedFilter.click()
  await page.locator('[data-unit="Lychguard"]').first().getByLabel('Unit actions for Lychguard').click()
  await expect(page.getByRole('menu').filter({ visible: true })).not.toContainText(/collection/i)
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Unit limit' }).click()
  await expect(lychguard).toBeHidden()

  // Points fit hides what will not go in the room that is left, and only that.
  await page.getByRole('button', { name: 'Unit limit' }).click()
  const playAt = async (size: RegExp) => {
    const setup = await openRosterSetup(page)
    await setup.getByRole('combobox', { name: 'Battle size' }).click()
    await page.getByRole('option', { name: size }).click()
    await setup.getByRole('group', { name: 'Force disposition' }).getByRole('button', { name: 'Take and Hold' }).click()
    await confirmRosterSetup(setup)
  }
  await playAt(/^Incursion/)
  await expect(page.getByText('3/2 in roster')).toBeVisible()
  await expect(page.getByText('Roster is not legal')).toBeAttached()
  await expect(lychguard).toBeDisabled()
  await playAt(/King of the Colosseum/)
  await expect(page.getByText('3/1 in roster')).toBeVisible()
  await expect(page.getByText('Lychguard: allows at most 1 of this datasheet, has 3')).toBeVisible()
  await expect(lychguard).toBeDisabled()
  await playAt(/^Incursion/)

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

  await page.getByLabel('Add a unit').fill('Monolith')
  await page.getByRole('button', { name: 'Add Monolith', exact: true }).click()
  await page.getByLabel('Add a unit').fill('Immortals')
  await page.getByRole('button', { name: 'Add Immortals', exact: true }).click()

  await page.getByLabel('Add a unit').fill('Deceiver')
  const ctan = page.getByRole('button', { name: "Add C'tan Shard of the Deceiver", exact: true })
  await expect(ctan).toBeVisible()
  await page.getByRole('button', { name: 'Points fit' }).click()
  // The C'tan will not fit in the room that is left; Immortals still will.
  await expect(ctan).toBeHidden()
  await page.getByLabel('Add a unit').fill('Immortals')
  await expect(page.getByRole('button', { name: 'Add Immortals', exact: true })).toBeVisible()
})

test('a character joins the unit it leads, and both cards say so', async ({ page }) => {
  await arrangeByRole(page)
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
  await expectNotAttachable(page.locator('[data-unit="Chronomancer"]'), 'Chronomancer', 'Immortals')

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

test('a leader detaches from its unit through its own menus', async ({ page }) => {
  await openBuilder(page)
  await add(page, 'Overlord')
  await add(page, 'Plasmancer')
  await add(page, 'Immortals')
  await attach(page, 'Overlord', 'Immortals')
  await attach(page, 'Plasmancer', 'Immortals')
  const block = page.getByRole('region', { name: 'Immortals', exact: true })
  // The unit the others joined has nothing to detach from.
  await block.getByRole('button', { name: 'Unit actions for Immortals' }).click()
  await expect(page.getByRole('menuitem', { name: 'Delete unit' })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: 'Detach from unit' })).toHaveCount(0)
  await page.keyboard.press('Escape')

  await block.getByRole('button', { name: 'Unit actions for Overlord' }).click()
  await page.getByRole('menuitem', { name: 'Detach from unit' }).click()
  await expect(block.locator('[data-unit="Overlord"]')).toHaveCount(0)

  await block.locator('[data-unit="Plasmancer"]').click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Detach from unit' }).click()
  await expect(block).toBeHidden()
})

test("attached units are drawn together on their bodyguard's shelf by default", async ({ page }) => {
  await openBuilder(page)
  await add(page, 'Overlord')
  await add(page, 'Plasmancer')
  await add(page, 'Immortals')
  await attach(page, 'Overlord', 'Immortals')
  await attach(page, 'Plasmancer', 'Immortals')

  const toggleTogether = async (checked: boolean) => {
    await page.getByRole('button', { name: 'Roster actions' }).click()
    const item = page.getByRole('menuitemcheckbox', { name: 'Group attached units' })
    await expect(item).toHaveAttribute('aria-checked', String(!checked))
    await item.click()
    await expect(page.getByRole('menu')).toBeHidden()
  }
  // Drawn together until the player chooses role shelves.
  const characters = page.locator('[data-slot="roster-units"]').getByRole('heading', { name: 'Characters' })
  const block = page.getByRole('region', { name: 'Immortals', exact: true })
  const battleline = page.locator('[data-slot="roster-units"]').getByRole('heading', { name: 'Battleline' }).locator('..')
  // The attached unit is drawn on its bodyguard's shelf, the bodyguard's card first.
  await expect(block.locator('[data-unit]').first()).toHaveAttribute('data-unit', 'Immortals')
  await expect(block.locator('[data-unit]')).toHaveCount(3)
  await expect(characters).toBeHidden()
  // The unit is drawn together, so its cards name only the role each datasheet plays.
  await expect(block.locator('[data-unit="Overlord"]')).toContainText('Leader')
  await expect(block).not.toContainText('Leading')
  // The shelf counts the attached unit once and costs every datasheet in it.
  const cardPoints = await block.locator('[data-unit] .chip.text-info').allInnerTexts()
  const total = cardPoints.reduce((sum, text) => sum + Number.parseInt(text, 10), 0)
  await expect(battleline.locator('.readout')).toHaveText([`${total} pts`, '1'])

  await page.locator('[data-unit="Immortals"]').getByRole('button', { name: 'Immortals', exact: true }).click()
  await waitForRosterSave(
    page,
    () =>
      page
        .getByRole('region', { name: 'Custom name and note' })
        .getByRole('textbox', { name: 'Custom name', exact: true })
        .fill('Tomb Guard'),
    'Tomb Guard',
  )
  await expect(page.getByRole('region', { name: 'Tomb Guard' }).locator('[data-unit]')).toHaveCount(3)

  await toggleTogether(false)
  await expect(page.getByRole('region', { name: 'Tomb Guard' })).toBeHidden()
  await expect(characters).toBeVisible()

  // The arrangement is the player's, kept for every roster on the device and drawn by the
  // server, so a refresh never shows the other arrangement first.
  expect(await (await page.request.get(page.url())).text()).not.toContain('aria-label="Tomb Guard"')
  await page.reload()
  await expect(characters).toBeVisible()
  await toggleTogether(true)
  await expect(page.getByRole('region', { name: 'Tomb Guard' })).toBeVisible()
})

test('Murdermind lets a Chronomancer support Destroyer Cult units', async ({ page }) => {
  await arrangeByRole(page)
  await openBuilder(page, 'Necrons', /Cursed Legion/)
  await add(page, 'Chronomancer')
  await add(page, 'Lokhust Heavy Destroyers')
  const chronomancer = page.locator('[data-unit="Chronomancer"]')
  const attachButton = chronomancer.getByRole('button', { name: 'Attach Chronomancer to unit' })
  const destroyers = page.getByRole('menu').getByRole('menuitem', { name: 'Lokhust Heavy Destroyers', exact: true })
  await expectNotAttachable(chronomancer, 'Chronomancer', 'Lokhust Heavy Destroyers')

  await chronomancer.getByRole('button', { name: 'Chronomancer', exact: true }).click()
  await page.locator('aside[aria-label="Loadout"]').getByRole('button', { name: 'Select Murdermind' }).click()
  await attachButton.click()
  await expect(
    page.getByRole('menu').getByRole('menuitem', { name: 'Add new Lokhust Heavy Destroyers and attach', exact: true }),
  ).toBeEnabled()
  await destroyers.click()

  await expect(chronomancer).toContainText('Supporting')
  await expect(chronomancer).toContainText('Lokhust Heavy Destroyers')
})

test('a tank is armed but not crowned', async ({ page }) => {
  // The pintle mounts are optional extras on a tank that always has its guns; the
  // Warlord entry sits under an upgrade only a couple of detachments unlock, and was
  // offered to every vehicle in the game.
  await page.setViewportSize({ width: 1600, height: 900 })
  await openBuilder(page, 'Space Marines', /Gladius Task Force/)
  // The whole book is on the shelves, not the first page of it, and its Crucible variants never are.
  await expect(page.getByRole('button', { name: 'Add Sternguard Veteran Squad', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Add Vanguard Veteran Squad with Jump Packs', exact: true })).toBeVisible()
  await page.getByLabel('Add a unit').fill('Crucible')
  await expect(page.getByRole('button', { name: /\[Crucible\]/ })).toHaveCount(0)
  await add(page, 'Land Raider Redeemer')
  await page
    .locator('[data-unit="Land Raider Redeemer"]')
    .getByRole('button', { name: /^Land Raider Redeemer/ })
    .click()
  const loadout = page.locator('aside[aria-label="Loadout"]')
  await expect(loadout.getByRole('heading', { name: '2× Flamestorm Cannon', exact: true })).toBeVisible()
  for (const weapon of ['Hunter-killer missile', 'Multi-melta', 'Storm bolter']) {
    await expect(loadout.getByRole('button', { name: `More ${weapon}`, exact: true })).toBeEnabled()
    await expect(loadout.getByRole('button', { name: `Fewer ${weapon}`, exact: true })).toBeDisabled()
  }
  await expect(page.getByRole('button', { name: /Land Raider Redeemer Warlord/ })).toHaveCount(0)

  await add(page, 'Captain')
  await page
    .locator('[data-unit="Captain"]')
    .getByRole('button', { name: /^Captain/ })
    .click()
  await expect(page.getByRole('button', { name: 'Remove Captain Warlord' })).toBeVisible()
  const melee = loadout.getByRole('group', { name: 'Captain Melee Weapon' })
  await expect(melee.getByRole('button', { name: 'Select Power fist', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(melee.getByRole('button', { name: 'Select Master-crafted power weapon', exact: true })).toHaveAttribute(
    'aria-pressed',
    'false',
  )
})

test('the first character added is the warlord, which its unit editor can hand on', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 })
  await openBuilder(page)
  await add(page, 'Overlord')
  const rosterCard = page.locator('[data-unit="Overlord"]')
  const rosterButton = rosterCard.getByRole('button', { name: 'Overlord', exact: true })
  const restingBackground = await rosterButton.evaluate((element) => getComputedStyle(element).backgroundColor)
  await rosterCard.hover()
  await expect.poll(() => rosterButton.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe(restingBackground)
  await rosterButton.click()
  await expect(page.getByRole('button', { name: 'Remove Overlord Warlord' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByText(/\d+x Warlord/)).toHaveCount(0)
  await page
    .locator('[data-unit="Overlord"]')
    .getByRole('button', { name: /^Overlord/ })
    .click()
  const loadout = page.locator('aside[aria-label="Loadout"]')
  const groups = loadout.locator('legend, .eyebrow').filter({ hasText: /^(Weapons|Wargear)$/ })
  await expect(groups.first()).toHaveText(/Weapons/i)
  await expect(groups.nth(1)).toHaveText(/Wargear/i)
  // The resurrection orb stays in the rules face used throughout the loadout.
  await expect(loadout.locator('[data-slot], div').filter({ hasText: 'this unit resurrects' }).last()).toHaveClass(/font-rules/)
  const profile = loadout.locator('[data-slot="unit-profile"]')
  await expect(profile.getByText('Sv', { exact: true })).toBeVisible()
  await expect(profile.getByText('Invulnerable save', { exact: true })).toBeVisible()
  await expect(profile.getByText('2+', { exact: true })).toBeVisible()
  await expect(profile.getByText('4+', { exact: true })).toBeVisible()
  // Equipped weapons list every weapon the Overlord carries once, including those its wargear choices supply.
  const equipped = loadout.locator('section').filter({ has: page.getByRole('heading', { name: /^Equipped/ }) })
  for (const name of ['Tachyon arrow', "Overlord's blade"]) {
    const weapon = equipped.getByRole('heading', { name, exact: true })
    await expect(weapon).toHaveCount(1)
    await expect(weapon).toBeVisible()
  }
  await expect(loadout.getByText('Voidscythe', { exact: true })).toBeVisible()
  const stats = await profile.boundingBox()
  const lastStat = await profile.locator(':scope > div').last().boundingBox()
  expect(stats).not.toBeNull()
  expect(lastStat).not.toBeNull()
  expect(Math.abs((lastStat?.x ?? 0) + (lastStat?.width ?? 0) - ((stats?.x ?? 0) + (stats?.width ?? 0)))).toBeLessThan(2)

  // Making another character the warlord takes it from the first.
  await add(page, 'Plasmancer')
  await page.locator('[data-unit="Plasmancer"]').getByRole('button', { name: 'Plasmancer', exact: true }).click()
  await page.getByRole('button', { name: 'Make Plasmancer Warlord' }).click()
  await expect(page.getByRole('button', { name: 'Remove Plasmancer Warlord' })).toHaveAttribute('aria-pressed', 'true')
  await page.locator('[data-unit="Overlord"]').getByRole('button', { name: 'Overlord', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Make Overlord Warlord' })).toHaveAttribute('aria-pressed', 'false')
  await expect(page.getByText(/\d+x Warlord/)).toHaveCount(0)

  // Deleting the Warlord passes it to the character added first.
  await page.locator('[data-unit="Plasmancer"]').getByRole('button', { name: 'Unit actions for Plasmancer' }).click()
  await page.getByRole('menuitem', { name: 'Delete unit' }).click()
  await page.locator('[data-unit="Overlord"]').getByRole('button', { name: 'Overlord', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Remove Overlord Warlord' })).toHaveAttribute('aria-pressed', 'true')

  // A Warlord the player takes away stays away.
  await page.getByRole('button', { name: 'Remove Overlord Warlord' }).click()
  await expect(page.getByRole('button', { name: 'Make Overlord Warlord' })).toHaveAttribute('aria-pressed', 'false')
  await expect(page.locator('[data-roster-builder]')).toHaveAttribute('data-saving', 'false')
  await expect(page.getByRole('button', { name: 'Make Overlord Warlord' })).toHaveAttribute('aria-pressed', 'false')
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
  await expect
    .poll(async () => {
      const cardName = await card.getByText("C'tan Shard of the Deceiver", { exact: true }).boundingBox()
      const configuredWargear = await card.getByText(/1x Cosmic insanity/).boundingBox()
      return Boolean(cardName && configuredWargear && configuredWargear.y >= cardName.y + cardName.height)
    })
    .toBe(true)
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
  await expect(fullDatasheet).toHaveAttribute('href', /\/factions\/necrons\/rules\/mfm-1-6\/datasheets\//)
  await expect(fullDatasheet).toHaveAttribute('target', '_blank')
  await fullDatasheet.hover()
  await expect(page.getByRole('tooltip')).toHaveText('Open full datasheet in a new tab')
  const opened = page.waitForEvent('popup')
  await fullDatasheet.click()
  const fullDatasheetPage = await opened
  await expect(fullDatasheetPage).toHaveURL(/\/factions\/necrons\/rules\/mfm-1-6\/datasheets\//)
  await fullDatasheetPage.close()

  await page.setViewportSize({ width: 1440, height: 900 })
  await expect(page.locator('aside[aria-label="Add units"]')).toBeVisible()
  await expect(loadout.getByText('Equipped ranged weapons', { exact: true })).toBeVisible()
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
  await expectNoHorizontalOverflow(loadout.locator('[data-slot="scroll-area-viewport"]'))
})

test('the attachment menu stays inside the unopened three-column roster', async ({ page }) => {
  await arrangeByRole(page)
  await page.setViewportSize({ width: 1512, height: 774 })
  await openBuilder(page, 'Space Marines', /Gladius Task Force/)
  for (const name of ['Captain', 'Ancient', 'Intercessor Squad', 'Assault Intercessor Squad', 'Hellblaster Squad']) await add(page, name)

  await page.locator('[data-unit="Captain"]').getByRole('button', { name: 'Attach Captain to unit' }).click()
  await page.getByRole('menuitem', { name: 'Intercessor Squad', exact: true }).click()

  const ancient = page.locator('[data-unit="Ancient"]')
  const attachButton = ancient.getByRole('button', { name: 'Attach Ancient to unit' })
  await expect(attachButton).toBeVisible()
  await expectNoHorizontalOverflow(page.locator('[data-slot="roster-units"]'))
  await expectNoPageOverflow(page)

  await attachButton.click()
  const targets = page.getByRole('menu')
  await expect(targets.getByRole('menuitem', { name: 'Intercessor Squad', exact: true })).toBeVisible()
  await expect(targets.getByRole('menuitem', { name: 'Assault Intercessor Squad', exact: true })).toBeVisible()
  await expect(targets.getByRole('menuitem', { name: 'Hellblaster Squad', exact: true })).toBeVisible()
  await targets.getByRole('menuitem', { name: 'Intercessor Squad', exact: true }).click()
  await expect(ancient).toContainText('Supporting')
  await expect(ancient).toContainText('Intercessor Squad')
  await expectNoPageOverflow(page)
})

test('mobile roster sheets move directly between units, loadout and datasheet', async ({ page }) => {
  await openBuilder(page)
  await add(page, 'Immortals')
  await page.setViewportSize(PHONE)

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
})

test('a model-specific weapon has the same count on its roster card and loadout', async ({ page }) => {
  await openBuilder(page, 'Dark Angels', /Inner Circle Task Force/)
  await addUnit(page, 'Vanguard Veteran Squad with Jump Packs')

  const card = page.locator('[data-unit="Vanguard Veteran Squad with Jump Packs"]')
  await expect(card).toContainText('4x Master-crafted Power Weapon')
  await page.setViewportSize(PHONE)
  await expectNoPageOverflow(page)
  await expectNoHorizontalOverflow(page.locator('[data-slot="roster-units"]'))
  await card.getByRole('button', { name: 'Vanguard Veteran Squad with Jump Packs', exact: true }).click()

  const loadout = page.locator('aside[aria-label="Loadout"]')
  await expectNoHorizontalOverflow(loadout.locator('[data-slot="scroll-area-viewport"]'))
  await expect(loadout.getByLabel('Master-crafted Power Weapon count')).toHaveText('4')
  await waitForRosterSave(page, () =>
    loadout.getByRole('button', { name: 'More models in Vanguard Veteran Squad with Jump Packs' }).click(),
  )
  await expect(loadout.getByLabel('Master-crafted Power Weapon count')).toHaveText('5')
  await expect(card).toContainText('5x Master-crafted Power Weapon')

  await loadout.getByRole('button', { name: 'Back to roster' }).click()
  await expectNoPageOverflow(page)
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

  await warriors.getByRole('button', { name: 'More Magna-rail rifle' }).click()
  await expect(warriors.getByLabel('Magna-rail rifle count')).toHaveText('1')

  // The warrior carrying it is one of the ten, not an eleventh.
  await expect(warriors.getByLabel('Autoch-pattern bolter count')).toHaveText('8')
  await expect(warriors.getByLabel('Hearthkyn Warrior models')).toHaveText('9')
  await expect(page.getByText('1x Magna-rail rifle')).toBeVisible()
  await expect(page.getByText('Within the points limit')).toBeAttached()

  // And putting it down gives the warrior his gun back.
  await warriors.getByRole('button', { name: 'Fewer Magna-rail rifle' }).click()
  await expect(warriors.getByLabel('Magna-rail rifle count')).toHaveText('0')
  await expect(warriors.getByLabel('Hearthkyn Warrior models')).toHaveText('9')

  // The body for the ion blaster comes from a squadmate, not from thin air.
  await warriors.getByRole('button', { name: 'More Ion blaster' }).click()
  await expect(warriors.getByLabel('Ion blaster count')).toHaveText('1')
  await expect(warriors.getByLabel('Autoch-pattern bolter count')).toHaveText('8')
  await expect(warriors.getByLabel('Hearthkyn Warrior models')).toHaveText('9')
  await expect(page.getByText('Within the points limit')).toBeAttached()
})

test('a plague marine squad still puts a weapon down after taking a special weapon', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 })
  await openBuilder(page, 'Death Guard', /Champions of Contagion/)
  await add(page, 'Plague Marines')
  const card = page.locator('[data-unit="Plague Marines"]')
  await card.getByRole('button', { name: /^Plague Marines/ }).click()

  const loadout = page.locator('aside[aria-label="Loadout"]')
  const marines = loadout.locator('section').filter({ has: page.getByLabel('Plague Marine models', { exact: true }) })
  const press = (name: string) => waitForRosterSave(page, () => marines.getByRole('button', { name, exact: true }).click())
  const count = (name: string) => marines.getByLabel(`${name} count`, { exact: true })
  for (const name of ['More Bubotic weapons', 'More Bubotic weapons', 'More Heavy plague weapon', 'More Plague spewer']) await press(name)
  await expect(count('Boltgun')).toHaveText('0')

  // The meltagun marine takes a bubotic marine's place, and that is what the squad saves.
  await press('More Meltagun')
  await expect(count('Bubotic weapons')).toHaveText('1')
  await expect(marines.getByLabel('Plague Marine models', { exact: true })).toHaveText('4')

  await page.reload()
  await card.getByRole('button', { name: /^Plague Marines/ }).click()
  await press('Fewer Bubotic weapons')
  await expect(count('Bubotic weapons')).toHaveText('0')
  await expect(count('Boltgun')).toHaveText('1')
  await expect(count('Meltagun')).toHaveText('1')
})

test('a squad with chosen loadouts is priced at the size it shrinks to', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 })
  await openBuilder(page, 'Death Guard', /Champions of Contagion/)
  await add(page, 'Plague Marines')
  const card = page.locator('[data-unit="Plague Marines"]')
  await card.getByRole('button', { name: /^Plague Marines/ }).click()
  const loadout = page.locator('aside[aria-label="Loadout"]')
  const marines = loadout.locator('section').filter({ has: page.getByLabel('Plague Marine models', { exact: true }) })
  const total = page.locator('[data-stat="points"]')
  await expect(total).toHaveText(/^\d+\/2000$/)
  const fivePoints = await total.innerText()

  for (let model = 5; model < 10; model++)
    await waitForRosterSave(page, () => page.getByRole('button', { name: 'More models in Plague Marines' }).click())
  await expect(marines.getByLabel('Plague Marine models', { exact: true })).toHaveText('9')
  await waitForRosterSave(page, () => marines.getByRole('button', { name: 'More Plague spewer', exact: true }).click())
  for (let model = 10; model > 5; model--)
    await waitForRosterSave(page, () => page.getByRole('button', { name: 'Fewer models in Plague Marines' }).click())

  await expect(marines.getByLabel('Plague Marine models', { exact: true })).toHaveText('4')
  await expect(marines.getByLabel('Plague spewer count', { exact: true })).toHaveText('1')
  await expect(total).toHaveText(fivePoints)
})

test('a composite heavy weapon keeps the model armed and can be put back', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 })
  await openBuilder(page, 'Dark Angels', /Wrath of the Rock/)
  // Legends are never offered, even where the book still files them.
  await page.getByLabel('Add a unit').fill('Land Speeder')
  await expect(page.getByRole('button', { name: 'Add Land Speeder', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Add Land Speeder Typhoon [Legends]', exact: true })).toBeHidden()
  await page.getByLabel('Add a unit').fill('Sentry Gun')
  await expect(page.getByRole('button', { name: 'Add Sentry Gun', exact: true })).toHaveCount(0)
  await add(page, 'Deathwing Terminator Squad')
  const card = page.locator('[data-unit="Deathwing Terminator Squad"]')
  await card.getByRole('button', { name: /^Deathwing Terminator Squad/ }).click()

  const loadout = page.locator('aside[aria-label="Loadout"]')
  const heavy = 'Deathwing Terminator w/ Heavy Weapon'
  const cyclone = 'Cyclone Missile Launcher & Storm Bolter'
  await waitForRosterSave(page, () => loadout.getByRole('button', { name: `More ${heavy}`, exact: true }).click())
  await expect(loadout.getByLabel(`${heavy} count`, { exact: true })).toHaveText('1')
  // The cyclone costs points, so a new heavy weapon starts on a free one.
  await expect(loadout.getByLabel(`${cyclone} count`, { exact: true })).toHaveText('0')
  await waitForRosterSave(page, () => loadout.getByRole('button', { name: `More ${cyclone}`, exact: true }).click())
  await expect(loadout.getByLabel(`${cyclone} count`, { exact: true })).toHaveText('1')
  await expect(loadout.getByRole('button', { name: `Fewer ${cyclone}`, exact: true })).toBeDisabled()
  const firingProfiles = loadout.getByRole('region', { name: 'cyclone missile launcher profiles', exact: true }).first()
  await expect(firingProfiles.getByRole('heading', { name: 'Frag', exact: true })).toBeVisible()
  await expect(firingProfiles.getByRole('heading', { name: 'Krak', exact: true })).toBeVisible()

  await waitForRosterSave(page, () => loadout.getByRole('button', { name: 'More Plasma cannon', exact: true }).click())
  await expect(loadout.getByLabel('Plasma cannon count', { exact: true })).toHaveText('1')
  await expect(loadout.getByLabel(`${cyclone} count`, { exact: true })).toHaveText('0')
  await waitForRosterSave(page, () => loadout.getByRole('button', { name: `More ${cyclone}`, exact: true }).click())
  await expect(loadout.getByLabel(`${cyclone} count`, { exact: true })).toHaveText('1')
  await expect(loadout.getByLabel('Plasma cannon count', { exact: true })).toHaveText('0')

  await page.reload()
  await card.getByRole('button', { name: /^Deathwing Terminator Squad/ }).click()
  await expect(loadout.getByLabel(`${heavy} count`, { exact: true })).toHaveText('1')
  await expect(loadout.getByLabel(`${cyclone} count`, { exact: true })).toHaveText('1')
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

  await page.setViewportSize(PHONE)
  await loadout.getByRole('button', { name: 'Back to roster' }).click()
  await expectNoPageOverflow(page)
  await expectNoHorizontalOverflow(page.locator('[data-slot="roster-units"]'))
  await page.locator('[data-unit="Canoptek Wraiths"]').getByRole('button', { name: 'Canoptek Wraiths', exact: true }).click()
  await expectNoPageOverflow(page)
  await expectNoHorizontalOverflow(loadout.locator('[data-slot="scroll-area-viewport"]'))
})

/**
 * Astra Militarum own no datasheets: every one of them, and their detachments, are
 * reached by a link into a library, and the book offers whatever it borrows beside its own.
 */
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
  // The 20-model composition keeps the weapons chosen at 10 models.
  await expect(loadout.getByLabel('Meltagun count')).toHaveText('1')
  await expect(loadout.getByLabel('Plasma gun count')).toHaveText('1')
  await waitForRosterSave(page, () => loadout.getByRole('button', { name: 'More Meltagun' }).click())
  await waitForRosterSave(page, () => loadout.getByRole('button', { name: 'More Plasma gun' }).click())
  await expect(loadout.getByLabel('Meltagun count')).toHaveText('2')
  await expect(loadout.getByLabel('Plasma gun count')).toHaveText('2')

  // The book keeps its datasheets in a library, and what it borrows from another book is there beside its own.
  await page.getByLabel('Add a unit').fill('Leman Russ Commander')
  await page.getByRole('button', { name: 'View Leman Russ Commander datasheet' }).click()
  const orders = page.locator('aside[aria-label="Datasheet"]').getByRole('heading', { name: 'Orders', exact: true }).locator('..')
  await expect(orders).toContainText('This Officer can issue 2 Orders to Squadron units.')
  await page.getByLabel('Add a unit').fill('Callidus Assassin')
  await page.getByRole('button', { name: 'Toggle Agents of the Imperium' }).click()
  await page.getByRole('button', { name: 'Add Callidus Assassin', exact: true }).click()
  await expect(page.locator('[data-unit="Callidus Assassin"]')).toBeVisible()
  await expect(page.getByText('Within the points limit')).toBeAttached()
})

test('Tempestus Scions keep their special weapons when specialists take their places', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 })
  await openBuilder(page, 'Astra Militarum', /Combined Arms/)
  await add(page, 'Militarum Tempestus Command Squad')
  const card = page.locator('[data-unit="Militarum Tempestus Command Squad"]')
  await card.getByRole('button', { name: 'Militarum Tempestus Command Squad', exact: true }).click()

  const loadout = page.locator('aside[aria-label="Loadout"]')
  await waitForRosterSave(page, () => loadout.getByRole('button', { name: 'More Plasma gun' }).click())
  await waitForRosterSave(page, () => loadout.getByRole('button', { name: 'More Meltagun' }).click())
  await waitForRosterSave(page, () => loadout.getByRole('button', { name: 'More Tempestus Scion w/ Medi-pack' }).click())
  await waitForRosterSave(page, () => loadout.getByRole('button', { name: 'More Regimental standard and Hot-shot lasgun' }).click())

  // The two Scions left beside the medic and standard bearer hold the plasma gun and meltagun.
  await expect(card).toContainText('1x Regimental standard')
  await expect(card).toContainText('1x Plasma gun')
  await expect(card).toContainText('1x Meltagun')
  await expect(page.getByText('Within the points limit')).toBeAttached()
})

test('a long unit name wraps inside the loadout pane on a small phone', async ({ page }) => {
  await openBuilder(page, 'Astra Militarum', /Combined Arms/)
  await add(page, 'Militarum Tempestus Command Squad')
  await page.setViewportSize({ width: 375, height: 667 })
  await page
    .locator('[data-unit="Militarum Tempestus Command Squad"]')
    .getByRole('button', { name: 'Militarum Tempestus Command Squad', exact: true })
    .click()

  const loadout = page.locator('aside[aria-label="Loadout"]')
  const name = loadout.getByRole('heading', { name: 'Militarum Tempestus Command Squad' })
  await expect(name).toBeVisible()
  await expectInsideHorizontalBounds(loadout, name)
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
  await waitForRosterSave(page, () =>
    loadout.getByRole('group', { name: 'Impulsor Sponsons' }).getByRole('button', { name: 'Select Storm Bolters', exact: true }).click(),
  )
  const equipped = loadout.locator('section').filter({ hasText: 'Equipped ranged weapons' })
  await expect(equipped.getByText('2× Storm bolter', { exact: true })).toHaveCount(0)
})

async function plagueMarineVariants(page: Page, width: number) {
  await page.setViewportSize({ width, height: 900 })
  await createRoster(page, { faction: 'Death Guard', detachment: /Champions of Contagion/ })
  await add(page, 'Plague Marines')
  if (width < 1000) await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click()
  await expectNoPageOverflow(page)
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
  await expectNoPageOverflow(page)
  await expectNoHorizontalOverflow(loadout)
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
}

async function orkLoadoutVariants(page: Page, width: number, opensInView: boolean) {
  await page.setViewportSize({ width, height: 900 })
  await createRoster(page, { faction: 'Orks', detachment: /War Horde/ })
  await add(page, 'Nobz')
  await add(page, 'Boyz')
  if (width < 1000) await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click()
  const mode = page.getByRole('group', { name: 'Roster mode' })
  await expect(mode.getByRole('button', { name: 'View', exact: true })).toHaveAttribute('aria-pressed', String(opensInView))
  if (opensInView) await mode.getByRole('button', { name: 'Build', exact: true }).click()
  await expectNoPageOverflow(page)
  await expectNoHorizontalOverflow(page.locator('[data-slot="roster-units"]'))

  const card = page.locator('[data-unit="Nobz"]')
  await card.getByRole('button', { name: /^Nobz/ }).click()
  const loadout = page.locator('aside[aria-label="Loadout"]')
  await expect(loadout.getByLabel('Nob models', { exact: true })).toHaveText('5')
  await expect(loadout.getByRole('button', { name: / details$/ })).toHaveCount(0)
  await expect(loadout.getByRole('region', { name: 'kombi-rokkit profiles', exact: true })).toContainText('2 profiles')
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
  await page.keyboard.press('Escape')

  await loadout.getByRole('button', { name: 'LETHAL HITS: non-MONSTER/VEHICLE', exact: true }).first().click()
  await expect(page.getByRole('tooltip')).toContainText(/automatically wound/i)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('tooltip')).toBeHidden()
  await loadout.getByRole('button', { name: 'LETHAL HITS: non-MONSTER/VEHICLE', exact: true }).first().press('Enter')
  await expect(page.getByRole('tooltip')).toContainText(/automatically wound/i)
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
  await expect(profiles).toHaveCSS('border-left-color', 'rgb(155, 208, 169)')
  const selectedHeading = await profiles.locator('[data-equipped]').boundingBox()
  expect(selectedHeading?.x).toBe(unselectedHeading?.x)
  expect(selectedHeading?.width).toBe(unselectedHeading?.width)
  await expect(card).toContainText('1x Big Skorcha')
  await expect(card).toContainText('1x Kustom Choppa')
  await expect(card).toContainText('4x Kustom Shoota')
  await expect(loadout.getByLabel('Nob models', { exact: true })).toHaveText('5')
  await expectNoPageOverflow(page)
  await expectNoHorizontalOverflow(loadout)
  await page.reload()
  await expect(card).toBeVisible()
  await expect(page.locator('[data-slot="skeleton"]')).toHaveCount(0)
  if (width >= 1000 || !(await loadout.getByRole('button', { name: 'Back to roster' }).isVisible())) {
    await card.getByRole('button', { name: /^Nobz/ }).click()
  }
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
  await expect(loadout.getByText('Kustom Choppa and Kombi-skorcha', { exact: true })).toHaveCount(0)
  await waitForRosterSave(page, () => loadout.getByRole('button', { name: 'More Rokkit Launcha', exact: true }).click())
  await expect(boyz).toContainText('1x Rokkit Launcha')
  await expect(boyz).toContainText('8x Shoota')
  await expectNoPageOverflow(page)
  await expectNoHorizontalOverflow(loadout)
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
  await waitForRosterSave(page, () => loadout.getByRole('button', { name: 'More Big Choppa', exact: true }).click())
  await expect(boyz).toContainText('1x Big Choppa')
  await expect(loadout.getByRole('button', { name: 'More Big Choppa', exact: true })).toBeDisabled()
  await expect(loadout.getByText('Kustom Choppa and Kombi-skorcha', { exact: true })).toHaveCount(0)
  await expect(loadout.getByLabel('Kustom Choppa count', { exact: true })).toHaveText('0')
  await expect(loadout.getByLabel('Kombi-skorcha count', { exact: true })).toHaveText('0')
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
  await page.goto(datasheetHref!)
  const firingProfiles = page.getByRole('rowgroup', { name: 'kombi-rokkit profiles', exact: true })
  await expect(firingProfiles).toContainText('2 profiles')
  await firingProfiles.evaluate((element) => element.scrollIntoView({ block: 'center' }))
  await expectNoPageOverflow(page)
}

test('Plague Marine variants share a model card', async ({ page }) => {
  test.setTimeout(240_000)
  await signUp(page, 'Richard')
  for (const width of [1600, 390]) await plagueMarineVariants(page, width)
})

test('Ork loadout variants share compact model cards', async ({ page }) => {
  test.setTimeout(240_000)
  await signUp(page, 'Richard')
  // The first pass ends in View, which the reader's next roster keeps.
  await orkLoadoutVariants(page, 1600, false)
  await orkLoadoutVariants(page, 390, true)
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

  const heavy = loadout.locator('section').filter({ has: page.getByLabel('Plague Marine models', { exact: true }) })
  await waitForRosterSave(page, () => heavy.getByRole('button', { name: 'More Heavy plague weapon' }).click())
  await waitForRosterSave(page, () => heavy.getByRole('button', { name: 'More Heavy plague weapon' }).click())
  await waitForRosterSave(page, () => heavy.getByRole('button', { name: 'More Plague spewer' }).click())
  await waitForRosterSave(page, () => loadout.getByRole('button', { name: 'More Plasma gun' }).last().click())

  await expect(card).toContainText('4x Plague knives')
  await expect(card).not.toContainText('Boltgun')

  await chooseRosterAction(page, 'Export text')
  const exported = page.getByRole('dialog', { name: 'Export roster' }).locator('pre')
  await expect(exported).toContainText('4x Plague knives')
  await expect(exported).not.toContainText('Boltgun')
})

test('Death Guard champions expose their legal wargear', async ({ page }) => {
  await page.setViewportSize({ width: 720, height: 1200 })
  await openBuilder(page, 'Death Guard', /Champions of Contagion/)
  await add(page, 'Deathshroud Terminators')
  await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click()
  await expectNoPageOverflow(page)
  await expectNoHorizontalOverflow(page.locator('[data-slot="roster-units"]'))
  await page
    .locator('[data-unit="Deathshroud Terminators"]')
    .getByRole('button', { name: /^Deathshroud Terminators/ })
    .click()

  const loadout = page.locator('aside[aria-label="Loadout"]')
  await expectNoPageOverflow(page)
  await expectNoHorizontalOverflow(loadout)
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

  const { promise: pricingHeld, resolve: releasePricing } = Promise.withResolvers<void>()
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
  holdPricing = false
  releasePricing()
  await expect(loadout.getByLabel('Icon of Despair count', { exact: true })).toHaveText('1')
  await expect(loadout.getByRole('button', { name: /^(Select|Remove) Icon of Despair$/ })).toHaveCount(1)
  await expect(gauntletCount).toHaveText('2')
  await expect(addGauntlet).toBeDisabled()
  await expect(deathshroud).toContainText('4x Plaguespurt gauntlet')
  await expect(deathshroud).toContainText('3x Manreaper')

  await loadout.getByRole('button', { name: 'Back to roster' }).click()
  await page.getByRole('button', { name: 'Add units' }).click()
  await add(page, 'Plague Marines')
  await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click()
  await page
    .locator('[data-unit="Plague Marines"]')
    .getByRole('button', { name: /^Plague Marines/ })
    .first()
    .click()

  await expectNoPageOverflow(page)
  await expectNoHorizontalOverflow(loadout)
  const plagueMarinesDatasheet = loadout.getByRole('link', { name: 'Open full datasheet in a new tab' })
  await expect(plagueMarinesDatasheet).toHaveAttribute('href', '/factions/death-guard/rules/mfm-1-6/datasheets/plague-marines')
  const [openedPlagueMarines] = await Promise.all([page.waitForEvent('popup'), plagueMarinesDatasheet.click()])
  await expect(openedPlagueMarines).toHaveURL(/\/factions\/death-guard\/rules\/mfm-1-6\/datasheets\/plague-marines/)
  await openedPlagueMarines.close()
  const plagueChampion = loadout.locator('section').filter({ hasText: 'Plague Champion' })
  await expect(plagueChampion.getByRole('button', { name: 'More Power fist' })).toBeEnabled()
  await waitForRosterSave(page, () => plagueChampion.getByRole('button', { name: 'More Power fist' }).click())
  await expect(plagueChampion.getByLabel('Power fist count')).toHaveText('1')
  await expect(plagueChampion.getByLabel('Plague knives count')).toHaveText('0')
})

test('removing one loadout does not choose another piece of the same model as its replacement', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 })
  await openBuilder(page, 'Black Templars', /Marshal's Household/)
  // Black Templars take generic Codex units under their current faction rule; the chapter and Codex
  // Gladiator Lancer entries have separate ids and both meet it.
  await page.getByLabel('Add a unit').fill('Librarian')
  await expect(page.getByRole('button', { name: 'Add Librarian', exact: true })).toHaveCount(1)
  await page.getByLabel('Add a unit').fill('Gladiator Lancer')
  await expect(page.getByRole('button', { name: 'Add Gladiator Lancer', exact: true })).toHaveCount(2)
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
