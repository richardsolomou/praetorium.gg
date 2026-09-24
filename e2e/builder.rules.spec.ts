import { expect, test } from '@playwright/test'
import { createRoster, signUp, waitForRosterSave } from './account'
import { shot, expectNoHorizontalOverflow, openBuilder, add, attach } from './builder.harness'

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
  await expect(unit.getByRole('button', { name: 'Feel No Pain 5+', exact: true })).toBeVisible()
  await expect(unit.getByRole('button', { name: 'Deadly Demise D6', exact: true })).toBeVisible()
  await shot(unit, 'test-results/pantheon-datasheet-abilities.png')
  const matrix = unit.getByRole('heading', { name: 'Singularity Matrix' }).locator('xpath=ancestor::article')
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
  await upgrades.getByLabel('Set alert for Deepening Madness').click()
  const reminder = page.getByRole('dialog', { name: 'Deepening Madness' })
  await expect(reminder).toBeVisible()
  await reminder.getByRole('button', { name: 'Cancel' }).click()
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
  await expect(page.getByText('Could not check every rule')).toHaveCount(0)
  await page.screenshot({ path: 'test-results/shared-deepening-madness.png', fullPage: true })

  await page.goto('/factions/necrons/reference/detachments/skyshroud-spearhead')
  const unitUpgrades = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Unit upgrades' }) })
  await expect(unitUpgrades).toContainText('Deepening Madness')
  const enhancements = page.locator('section').filter({ has: page.getByText('Enhancements', { exact: true }) })
  await expect(enhancements).not.toContainText('Deepening Madness')
  await page.screenshot({ path: 'test-results/skyshroud-unit-upgrades.png', fullPage: true })
})

test('a detachment rule marks the weapon abilities it grants', async ({ page }) => {
  await openBuilder(page, 'Necrons', /Starshatter Arsenal/)
  await add(page, 'Doomsday Ark')
  await page.locator('[data-unit="Doomsday Ark"]').getByRole('button', { name: 'Doomsday Ark', exact: true }).click()

  const loadout = page.locator('aside[aria-label="Loadout"]')
  const assault = loadout.getByRole('button', { name: 'Assault', exact: true }).first()
  await expect(assault).toHaveClass(/text-info/)
  await assault.hover()
  await expect(page.getByRole('tooltip')).toContainText('Added by Relentless Onslaught')
  await page.mouse.move(0, 0)
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(assault).toBeVisible()
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

for (const width of [390, 1600]) {
  test(`weapon swaps keep fixed profiles stable while saving at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await openBuilder(page)
    await add(page, 'Tomb Blades')
    if (width < 1000) await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click()
    await page.locator('[data-unit="Tomb Blades"]').getByRole('button', { name: 'Tomb Blades', exact: true }).click()
    const loadout = page.locator('aside[aria-label="Loadout"]')
    await expect(loadout.getByRole('heading', { name: 'Equipped melee weapons 3', exact: true })).toBeVisible()
    await expect(loadout.getByRole('heading', { name: /Equipped ranged weapons/ })).toHaveCount(0)
    await loadout.evaluate((pane) => {
      const frames: string[][] = []
      Object.assign(window, { weaponSummaryFrames: frames })
      new MutationObserver(() => {
        frames.push(
          [...pane.querySelectorAll('h2')].map((heading) => heading.textContent ?? '').filter((text) => text.startsWith('Equipped ')),
        )
      }).observe(pane, { childList: true, subtree: true, characterData: true })
    })
    await page.route('**/_serverFn/**', async (route) => {
      const response = await route.fetch()
      await new Promise((resolve) => setTimeout(resolve, 500))
      await route.fulfill({ response })
    })
    await waitForRosterSave(page, async () => {
      await loadout.getByRole('button', { name: 'More Particle beamer', exact: true }).click()
      await loadout.getByRole('button', { name: 'More Particle beamer', exact: true }).click()
      await expect(loadout.getByLabel('Particle beamer count', { exact: true })).toHaveText('2')
    })
    await page.screenshot({ path: `test-results/tomb-blades-weapon-swap-${width}.png`, animations: 'disabled' })
    await waitForRosterSave(page, async () => {
      await loadout.getByRole('button', { name: 'Fewer Particle beamer', exact: true }).click()
      await loadout.getByRole('button', { name: 'Fewer Particle beamer', exact: true }).click()
    })
    await expect(loadout.getByLabel('Particle beamer count', { exact: true })).toHaveText('0')
    await expectNoHorizontalOverflow(loadout)
    const frames = await page.evaluate(() => (window as unknown as { weaponSummaryFrames: string[][] }).weaponSummaryFrames)
    expect(frames.length).toBeGreaterThan(0)
    expect(frames.every((headings) => headings.length === 1 && headings[0]?.startsWith('Equipped melee weapons'))).toBe(true)
  })
}

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

  // Both presses land before the next price returns and fold against the list.
  await loadout.getByRole('button', { name: 'More Particle beamer' }).click()
  await loadout.getByRole('button', { name: 'More Particle beamer' }).click()
  await expect(loadout.getByLabel('Particle beamer count')).toHaveText('2')
  await expect(loadout.getByLabel('Twin gauss blaster count')).toHaveText('1')
  await expect(loadout.getByLabel('Twin tesla carbine count')).toHaveText('0')

  await expect(loadout.getByLabel('Shieldvanes count')).toHaveText('0')
  for (const count of ['1', '2', '3']) {
    await loadout.getByRole('button', { name: 'More Shieldvanes' }).click()
    await expect(loadout.getByLabel('Shieldvanes count')).toHaveText(count)
  }
  await expect(page.getByRole('button', { name: /M 8", modified from 12"/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Sv 3\+, modified from 4\+/ })).toBeVisible()
  await page.screenshot({ path: 'test-results/tomb-blades-shieldvanes.png', fullPage: true })
})

test('Canoptek Spyders keep their claws and independent wargear', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 })
  await openBuilder(page)
  await add(page, 'Canoptek Spyders')
  const card = page.locator('[data-unit="Canoptek Spyders"]')
  await card.getByRole('button', { name: 'Canoptek Spyders', exact: true }).click()

  const loadout = page.locator('aside[aria-label="Loadout"]')
  await expect(loadout.getByLabel('Canoptek Spyders models')).toHaveText('1')
  await loadout.getByRole('button', { name: 'More Fabricator claw array' }).click()
  await expect(loadout.getByLabel('Fabricator claw array count')).toHaveText('1')
  await expect(page.locator('[data-roster-builder]')).toHaveAttribute('data-saving', 'false')
  await expect(card).toContainText('1x Automaton claws')
  await expect(card).toContainText('1x Fabricator claw array')

  await loadout.getByRole('button', { name: 'More Two particle beamers' }).click()
  await expect(loadout.getByLabel('Two particle beamers count')).toHaveText('1')
  await expect(page.locator('[data-roster-builder]')).toHaveAttribute('data-saving', 'false')
  await expect(loadout.getByLabel('Canoptek Spyders models')).toHaveText('1')
  await expect(card).toContainText('2x Particle beamer')
  await shot(loadout, 'test-results/canoptek-spyder-wargear.png')

  await loadout.getByRole('button', { name: 'Fewer Two particle beamers' }).click()
  await expect(loadout.getByLabel('Two particle beamers count')).toHaveText('0')
  await expect(page.locator('[data-roster-builder]')).toHaveAttribute('data-saving', 'false')
  await expect(card).toContainText('1x Automaton claws')
  await expect(card).toContainText('1x Fabricator claw array')
  await expect(card).not.toContainText('Particle beamer')

  await loadout.getByRole('button', { name: 'More models in Canoptek Spyders' }).click()
  await expect(loadout.getByLabel('Canoptek Spyders models')).toHaveText('2')
  await expect(loadout.getByRole('button', { name: 'More models in Canoptek Spyders' })).toBeDisabled()

  await page.setViewportSize({ width: 390, height: 844 })
  await expect(loadout).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  expect(await loadout.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
  await shot(loadout, 'test-results/canoptek-spyder-wargear-phone.png')
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
