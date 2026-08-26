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

test('battle setup stays in step and shows both players their shared choices', async ({ browser }) => {
  const alice = await (await browser.newContext()).newPage()
  const bob = await (await browser.newContext()).newPage()
  const aliceName = uniqueName('Alice')
  const bobName = uniqueName('Bob')

  await signUp(bob, bobName)
  const bobRoster = await createRoster(bob, { faction: 'Death Guard', detachment: /Shamblerot Vectorium/, name: 'Bob army' })
  await signUp(alice, aliceName)
  const aliceRoster = await createRoster(alice, { faction: 'Necrons', detachment: /Awakened Dynasty/, name: 'Alice army' })
  await befriend(alice, bob)
  const url = await createBattle(alice, { opponent: bobName })
  await bob.goto(url)
  const initialResponse = await alice.reload()
  if (!initialResponse) throw new Error('The battle page did not return a document response.')
  expect(await initialResponse.text()).not.toContain(aliceRoster)

  await expect(alice.getByRole('combobox', { name: 'Battle size' })).toContainText('Strike Force')
  await expect(alice.getByRole('button', { name: 'Reset setup' })).toHaveCount(0)
  await expect(alice.getByRole('button', { name: 'Delete battle' })).toHaveCount(0)

  await attachRoster(alice, aliceRoster)
  await expect(bob.getByText(aliceRoster, { exact: true }).first()).toBeVisible()
  await attachRoster(bob, bobRoster)
  await expect(alice.getByText(bobRoster, { exact: true }).first()).toBeVisible()

  await alice.getByRole('button', { name: 'Change roster' }).click()
  const rosterChooser = alice.getByRole('dialog', { name: 'Choose your roster' })
  await expect(rosterChooser).toBeVisible()
  await expect(rosterChooser.getByText('Necrons', { exact: true })).toBeVisible()
  await expect(rosterChooser.getByText('Awakened Dynasty', { exact: true })).toBeVisible()
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
  await expect(alice.getByRole('dialog').getByRole('img')).toBeVisible()
  await alice.screenshot({ path: 'test-results/setup-battlefield-dialog.png', fullPage: true })
  await alice.keyboard.press('Escape')

  await setupStep(bob, 'Defender')
  const defenderChoice = bob.getByRole('group', { name: 'Defender' })
  const defender = defenderChoice.getByRole('button', { name: new RegExp(aliceName) })
  await defender.click()
  await expect(defender).toContainText('Defender · deploys first')
  await expect(defenderChoice.getByRole('button', { name: new RegExp(bobName) })).toContainText('Attacker · deploys second')
  await bob.screenshot({ path: 'test-results/setup-defender.png', fullPage: true })
  await bob.setViewportSize({ width: 390, height: 844 })
  expect(await bob.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  await bob.screenshot({ path: 'test-results/setup-defender-phone.png', fullPage: true })
  await bob.setViewportSize({ width: 1440, height: 900 })
  await setupStep(bob, 'Secondaries')
  // The rail is the shared place in setup, so Bob moving it moves Alice's screen too.
  await expect(alice.getByRole('navigation', { name: 'Setup sections' }).getByRole('button', { name: /Secondaries/ })).toHaveAttribute(
    'aria-current',
    'step',
  )
  // Both sides are drawn, so each name appears on the table strip and again on its own column.
  await expect(alice.getByRole('main').getByText(aliceName, { exact: true })).toHaveCount(2)
  await expect(alice.getByRole('main').getByText(bobName, { exact: true })).toHaveCount(2)
  await alice.evaluate(() => window.scrollTo(0, 0))
  await alice.screenshot({ path: 'test-results/setup-armies.png', fullPage: true })
  await alice.setViewportSize({ width: 390, height: 844 })
  await alice.screenshot({ path: 'test-results/setup-armies-phone.png', fullPage: true })
})

test('one device settles mandatory tactical cards for both sides', async ({ browser }) => {
  const alice = await (await browser.newContext()).newPage()
  const bob = await (await browser.newContext()).newPage()
  const aliceName = uniqueName('Alice')
  const bobName = uniqueName('Bob')

  await signUp(bob, bobName)
  const bobRoster = await createRoster(bob, {
    faction: 'Death Guard',
    detachment: /Shamblerot Vectorium/,
    name: 'Bob KOTC army',
    size: /King of the Colosseum \(500\)/,
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
    size: /King of the Colosseum \(500\)/,
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
  await alice.getByRole('option', { name: /King of the Colosseum \(500\)/ }).click()
  await expect(size).toContainText('King of the Colosseum (500)')
  await attachRoster(alice, aliceRoster)
  await attachRoster(bob, bobRoster)
  await expect(alice.getByText(bobRoster, { exact: true }).first()).toBeVisible()
  await bob.close()

  await chooseBattlefield(alice)
  await setupStep(alice, 'Secondaries')
  await expect(alice.getByRole('main').getByText(aliceName, { exact: true })).toHaveCount(2)
  await expect(alice.getByRole('main').getByText(bobName, { exact: true })).toHaveCount(2)
  await expect(alice.getByRole('button', { name: 'Next', exact: true })).toBeEnabled()
  await alice.screenshot({ path: 'test-results/setup-mandatory-secondaries.png', fullPage: true })
})
