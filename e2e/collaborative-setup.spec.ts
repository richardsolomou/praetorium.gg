import { expect, test } from '@playwright/test'
import {
  attachRoster,
  befriend,
  chooseBattlefield,
  createBattle,
  createRoster,
  setupStep,
  signUp,
  uniqueName,
  waitForRosterSave,
} from './account'

test('battle setup stays shared and does not wait for the other device', async ({ browser }) => {
  const alice = await (await browser.newContext()).newPage()
  const bob = await (await browser.newContext()).newPage()
  const aliceName = uniqueName('Alice')
  const bobName = uniqueName('Bob')

  await signUp(bob, bobName)
  const bobRoster = await createRoster(bob, { faction: 'Death Guard', detachment: /Shamblerot Vectorium/, name: 'Bob army' })
  await signUp(alice, aliceName)
  const aliceRoster = await createRoster(alice, { faction: 'Necrons', detachment: /Awakened Dynasty/, name: 'Alice army' })
  await alice.getByLabel('Add a unit').fill('Immortals')
  await waitForRosterSave(alice, () => alice.getByRole('button', { name: 'Add Immortals', exact: true }).first().click())
  await befriend(alice, bob)
  const url = await createBattle(alice, { opponent: bobName })
  await bob.goto(url)
  const initialResponse = await alice.request.get(url)
  expect(await initialResponse.text()).not.toContain(aliceRoster)
  await alice.reload()

  await expect(alice.getByRole('combobox', { name: 'Battle size' })).toContainText('Strike Force')
  await expect(alice.locator('nav[aria-label="Setup sections"] button[data-step="Format"]')).toHaveCount(0)
  await expect(alice.locator('nav[aria-label="Setup sections"] button[data-step="Armies"]')).toHaveCount(0)
  await expect(alice.getByRole('region', { name: 'Setup' }).getByRole('button', { name: 'Choose roster' })).toBeVisible()
  await expect(alice.getByRole('group', { name: 'Mission pack' }).getByRole('button')).toHaveCount(1)
  await expect(alice.getByRole('button', { name: 'Reset setup' })).toHaveCount(0)
  await expect(alice.getByRole('button', { name: 'Delete battle' })).toHaveCount(0)
  await alice.setViewportSize({ width: 390, height: 844 })
  expect(await alice.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  await alice.screenshot({ path: 'test-results/setup-combined-phone.png', fullPage: true })
  await alice.setViewportSize({ width: 1440, height: 900 })

  const size = alice.getByRole('combobox', { name: 'Battle size' })
  await size.click()
  await alice.getByRole('option', { name: /Incursion/ }).click()
  await expect(size).toContainText('Incursion')
  await alice.getByRole('button', { name: 'Choose roster' }).click()
  const rosterChooser = alice.getByRole('dialog', { name: 'Choose your roster' })
  await expect(rosterChooser.getByText('None of your 1 saved rosters is built for 1000 points.')).toBeVisible()
  await alice.keyboard.press('Escape')
  await size.click()
  await alice.getByRole('option', { name: /Strike Force/ }).click()
  await expect(size).toContainText('Strike Force')

  await attachRoster(alice, aliceRoster)
  await expect(bob.getByText(aliceRoster, { exact: true }).first()).toBeVisible()
  await size.click()
  await alice.getByRole('option', { name: /Incursion/ }).click()
  await expect(alice.getByRole('button', { name: `Choose roster for ${aliceName}` })).toBeVisible()
  await expect(bob.getByText(aliceRoster, { exact: true })).toHaveCount(0)
  await size.click()
  await alice.getByRole('option', { name: /Strike Force/ }).click()
  await attachRoster(alice, aliceRoster)
  await attachRoster(bob, bobRoster)
  await expect(alice.getByText(bobRoster, { exact: true }).first()).toBeVisible()

  await alice.getByRole('button', { name: 'Change roster' }).click()
  const rosterChooserAgain = alice.getByRole('dialog', { name: 'Choose your roster' })
  await expect(rosterChooserAgain).toBeVisible()
  await expect(rosterChooserAgain.getByText('Necrons', { exact: true })).toBeVisible()
  await expect(rosterChooserAgain.getByText('Awakened Dynasty', { exact: true })).toBeVisible()
  await alice.screenshot({ path: 'test-results/setup-roster-dialog.png', fullPage: true })
  await alice.setViewportSize({ width: 390, height: 844 })
  expect(await alice.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  await alice.screenshot({ path: 'test-results/setup-roster-dialog-phone.png', fullPage: true })
  await alice.setViewportSize({ width: 1440, height: 900 })
  await alice.keyboard.press('Escape')

  await chooseBattlefield(alice)
  await expect(bob.getByRole('button', { name: /^Selected layout / })).toBeVisible()
  // The board itself is what opens the board, rather than a button beside it.
  await alice
    .getByRole('button', { name: /^Enlarge terrain layout / })
    .first()
    .click()
  const normalLayout = alice.getByRole('dialog')
  await expect(normalLayout.getByRole('img')).toBeVisible()
  await expect(normalLayout.getByText('Placement distance · nearest ⅛″')).toBeVisible()
  await expect(normalLayout.locator('line[marker-end]')).toHaveCount(42)
  await alice.screenshot({ path: 'test-results/setup-battlefield-dialog.png', fullPage: true })
  await alice.setViewportSize({ width: 390, height: 844 })
  expect(await alice.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  await alice.screenshot({ path: 'test-results/setup-battlefield-dialog-phone.png', fullPage: true })
  await alice.setViewportSize({ width: 1440, height: 900 })
  await alice.keyboard.press('Escape')

  await setupStep(bob, 'Defender')
  const defenderChoice = bob.getByRole('group', { name: 'Defender' })
  const defender = defenderChoice.getByRole('button', { name: new RegExp(aliceName) })
  const aliceDefender = alice.getByRole('group', { name: 'Defender' }).getByRole('button', { name: new RegExp(aliceName) })
  await Promise.all([defender.click(), aliceDefender.click()])
  await expect(alice.getByText('Your opponent got there first. Try that again.')).toBeHidden()
  await expect(bob.getByText('Your opponent got there first. Try that again.')).toBeHidden()
  await expect(defender).toContainText('Defender · deploys first')
  await expect(defenderChoice.getByRole('button', { name: new RegExp(bobName) })).toContainText('Attacker · deploys second')
  await bob.screenshot({ path: 'test-results/setup-defender.png', fullPage: true })
  await bob.setViewportSize({ width: 390, height: 844 })
  expect(await bob.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  await bob.screenshot({ path: 'test-results/setup-defender-phone.png', fullPage: true })
  await bob.setViewportSize({ width: 1440, height: 900 })
  await bob.close()
  await setupStep(alice, 'Secondaries')
  // One device settles both sides' derived cards, so an absent opponent cannot block setup.
  await expect(alice.getByRole('button', { name: 'Next', exact: true })).toBeEnabled()
  // Both sides are drawn, so each name appears on the table strip and again on its own column.
  await expect(alice.getByRole('main').getByText(aliceName, { exact: true })).toHaveCount(2)
  await expect(alice.getByRole('main').getByText(bobName, { exact: true })).toHaveCount(2)
  await alice.evaluate(() => window.scrollTo(0, 0))
  await alice.screenshot({ path: 'test-results/setup-armies.png', fullPage: true })
  await alice.setViewportSize({ width: 390, height: 844 })
  await alice.screenshot({ path: 'test-results/setup-armies-phone.png', fullPage: true })

  await alice.setViewportSize({ width: 1440, height: 900 })
  await setupStep(alice, 'Reserves')
  await expect(alice.getByText(/\d+\/1000 reserve points/)).toHaveCount(2)
  const aliceArmy = alice.locator('article').filter({ hasText: aliceRoster })
  await expect(aliceArmy.getByText('0/1000 reserve points')).toBeVisible()
  await aliceArmy.getByRole('button', { name: 'Start Immortals in Strategic reserves', exact: true }).click()
  await expect(aliceArmy.getByText(/[1-9]\d*\/1000 reserve points/)).toBeVisible()
  expect(await alice.evaluate(() => document.documentElement.scrollWidth)).toBe(1440)
  await alice.screenshot({ path: 'test-results/setup-reserves.png', fullPage: true })
  await alice.setViewportSize({ width: 390, height: 844 })
  expect(await alice.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  await alice.screenshot({ path: 'test-results/setup-reserves-phone.png', fullPage: true })
})

test('both devices settle mandatory tactical cards without racing', async ({ browser }) => {
  const alice = await (await browser.newContext()).newPage()
  const bob = await (await browser.newContext()).newPage()
  const aliceName = uniqueName('Alice')
  const bobName = uniqueName('Bob')

  await signUp(bob, bobName)
  const bobRoster = await createRoster(bob, {
    faction: 'Death Guard',
    detachment: /Shamblerot Vectorium/,
    name: 'Bob KOTC army',
    size: /King of the Colosseum/,
  })
  for (const unit of ['Plague Marines', 'Lord of Virulence']) {
    await bob.getByLabel('Add a unit').fill(unit)
    await waitForRosterSave(bob, () =>
      bob
        .getByRole('button', { name: `Add ${unit}`, exact: true })
        .first()
        .click(),
    )
  }
  await bob.locator('[data-unit="Lord of Virulence"]').getByRole('button', { name: 'Lord of Virulence', exact: true }).click()
  await waitForRosterSave(bob, () => bob.getByRole('button', { name: 'Make Lord of Virulence Warlord' }).click())
  await signUp(alice, aliceName)
  const aliceRoster = await createRoster(alice, {
    faction: 'Necrons',
    detachment: /Awakened Dynasty/,
    name: 'Alice KOTC army',
    size: /King of the Colosseum/,
  })
  for (const unit of ['Immortals', 'Overlord']) {
    await alice.getByLabel('Add a unit').fill(unit)
    await waitForRosterSave(alice, () =>
      alice
        .getByRole('button', { name: `Add ${unit}`, exact: true })
        .first()
        .click(),
    )
  }
  await alice.locator('[data-unit="Overlord"]').getByRole('button', { name: 'Overlord', exact: true }).click()
  await waitForRosterSave(alice, () => alice.getByRole('button', { name: 'Make Overlord Warlord' }).click())
  await befriend(alice, bob)
  const url = await createBattle(alice, { opponent: bobName })
  await bob.goto(url)

  const size = alice.getByRole('combobox', { name: 'Battle size' })
  await size.click()
  await alice.getByRole('option', { name: /King of the Colosseum/ }).click()
  await expect(size).toContainText('King of the Colosseum')
  await attachRoster(alice, aliceRoster)
  await attachRoster(bob, bobRoster)
  await expect(alice.getByText(bobRoster, { exact: true }).first()).toBeVisible()
  await setupStep(alice, 'Battlefield')
  await expect(alice.locator('nav[aria-label="Setup sections"] button[data-step="Battlefield"]')).toHaveAttribute('data-complete', 'true')
  await expect(alice.getByRole('button', { name: 'Next', exact: true })).toBeEnabled()
  await expect(alice.getByRole('button', { name: /Select layout|Select random/ })).toHaveCount(0)
  const card = alice.getByRole('button', { name: 'Enlarge Colosseum battlefield' }).locator('xpath=..')
  const grid = card.locator('xpath=..')
  const cardBox = await card.boundingBox()
  const gridBox = await grid.boundingBox()
  expect(cardBox && gridBox && Math.abs(cardBox.x + cardBox.width / 2 - gridBox.x - gridBox.width / 2)).toBeLessThan(2)
  await alice.screenshot({ path: 'test-results/setup-colosseum-battlefield.png', fullPage: true })
  await alice.getByRole('button', { name: 'Enlarge Colosseum battlefield' }).click()
  await expect(alice.getByRole('dialog').getByRole('img')).toBeVisible()
  await expect(alice.getByRole('dialog').getByText('Deployment depth')).toBeVisible()
  await expect(alice.getByRole('dialog').locator('line[marker-end]')).toHaveCount(28)
  await expect(alice.getByRole('dialog').getByText('≈ Approximate placement · nearest ⅛″')).toBeVisible()
  await expect(alice.getByRole('dialog').locator('svg text').filter({ hasText: /^≈/ })).toHaveCount(26)
  await expect(alice.getByRole('dialog').getByText('Measure to the marked wall corners', { exact: false })).toBeVisible()
  await expect(
    alice
      .getByRole('dialog')
      .locator('svg text')
      .filter({ hasText: /^8″$/ }),
  ).toHaveCount(2)
  await alice.getByRole('dialog').evaluate((dialog) => {
    dialog.scrollTop = 0
  })
  await alice.screenshot({ path: 'test-results/setup-colosseum-measurements.png', fullPage: true })
  await alice.setViewportSize({ width: 390, height: 844 })
  expect(await alice.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  await alice.screenshot({ path: 'test-results/setup-colosseum-measurements-phone.png', fullPage: true })
  await alice.keyboard.press('Escape')
  await alice.screenshot({ path: 'test-results/setup-colosseum-battlefield-phone.png', fullPage: true })
  await alice.setViewportSize({ width: 1440, height: 900 })
  await setupStep(bob, 'Battlefield')
  await expect(bob.getByRole('button', { name: 'Next', exact: true })).toBeEnabled()
  await expect(bob.getByRole('button', { name: /Select layout|Select random/ })).toHaveCount(0)
  await setupStep(alice, 'Secondaries')
  await expect(alice.getByRole('main').getByText(aliceName, { exact: true })).toHaveCount(2)
  await expect(alice.getByRole('main').getByText(bobName, { exact: true })).toHaveCount(2)
  await expect(alice.getByRole('button', { name: 'Next', exact: true })).toBeEnabled()
  await expect(bob.getByRole('button', { name: 'Next', exact: true })).toBeEnabled()
  await expect(alice.getByText('Your opponent got there first. Try that again.')).toBeHidden()
  await expect(bob.getByText('Your opponent got there first. Try that again.')).toBeHidden()
  await alice.screenshot({ path: 'test-results/setup-mandatory-secondaries.png', fullPage: true })
})
