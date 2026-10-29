import { expect, test } from './test'
import {
  attachRoster,
  showOnlyPublishedDistances,
  befriend,
  chooseBattlefield,
  createBattle,
  createRoster,
  recordFirstTurn,
  setupStep,
  signUp,
  uniqueName,
  makeWarlord,
  expectNoPageOverflow,
  addUnit,
  PHONE,
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
  await addUnit(alice, 'Immortals')
  const incursionRoster = await createRoster(alice, {
    faction: 'Necrons',
    detachment: /Awakened Dynasty/,
    name: 'Alice Incursion army',
    size: /Incursion/,
  })
  await befriend(alice, bob)
  const url = await createBattle(alice, { opponent: bobName })
  await bob.goto(url)
  const initialResponse = await alice.request.get(url)
  expect(await initialResponse.text()).not.toContain(aliceRoster)
  await alice.reload()

  for (const name of ['Mission', 'Battlefield', 'Defender', 'Secondaries', 'Reserves', 'Deploy', 'First turn', 'Pre-battle rules']) {
    await expect(alice.getByRole('region', { name, exact: true })).toHaveCSS('opacity', '0.4')
  }
  await expect(alice.getByText('Determined by your rosters')).toBeVisible()
  await expect(alice.locator('[data-setup-bar]')).toContainText('Your army')
  // Setup is one page: nothing walks the table through its sections.
  await expect(alice.getByRole('button', { name: 'Next', exact: true })).toHaveCount(0)
  await expect(alice.getByRole('region', { name: 'Armies' }).getByRole('button', { name: 'Choose roster' })).toBeVisible()
  await alice.getByRole('button', { name: 'Change battle size and mission pack' }).click()
  await expect(alice.getByRole('group', { name: 'Mission pack' }).getByRole('button')).toHaveCount(1)
  await expect(alice.getByRole('button', { name: 'Reset setup' })).toHaveCount(0)
  await expect(alice.getByRole('button', { name: 'Delete battle' })).toHaveCount(0)
  await alice.setViewportSize(PHONE)
  await expectNoPageOverflow(alice)
  await alice.screenshot({ path: test.info().outputPath('setup-combined-phone.png'), fullPage: true })
  await alice.setViewportSize({ width: 1440, height: 900 })

  await alice.getByRole('button', { name: 'Choose roster' }).click()
  const rosterChooser = alice.getByRole('dialog', { name: 'Choose your roster' })
  await expect(rosterChooser.getByText(aliceRoster, { exact: true })).toBeVisible()
  await expect(rosterChooser.getByText(incursionRoster, { exact: true })).toBeVisible()
  await alice.keyboard.press('Escape')
  await expect(rosterChooser).toBeHidden()
  await attachRoster(alice, aliceRoster)
  await expect(bob.getByText(aliceRoster, { exact: true }).first()).toBeVisible()
  await expect(alice.locator('#setup-armies')).toHaveAttribute('data-complete', 'false')
  await expect(alice.getByText('Determined by your rosters')).toBeVisible()
  await attachRoster(bob, bobRoster)
  await expect(alice.getByText('Strike Force · 2,000 points', { exact: true })).toBeVisible()
  await expect(bob.getByText('Strike Force · 2,000 points', { exact: true })).toBeVisible()
  await expect(alice.locator('#setup-armies')).toHaveAttribute('data-complete', 'true')
  await expect(alice.getByRole('region', { name: 'Defender', exact: true })).toHaveCSS('opacity', '1')
  for (const name of ['Deploy', 'Pre-battle rules']) {
    const section = alice.getByRole('region', { name, exact: true })
    await expect(section.locator('article')).toHaveCount(2)
    await expect(section.getByRole('button', { name: /^Show units/ })).toHaveCount(0)
  }

  await attachRoster(alice, incursionRoster)
  await expect(bob.getByText(incursionRoster, { exact: true }).first()).toBeVisible()
  await expect(alice.getByText('Choose matching roster formats for each side. Allies split the points evenly.')).toBeVisible()
  await expect(bob.getByText('Choose matching roster formats for each side. Allies split the points evenly.')).toBeVisible()
  await expect(alice.getByRole('button', { name: 'Start battle', exact: true })).toBeDisabled()
  await expect(alice.locator('[data-setup-bar]')).toContainText('Battle size')
  await expect(alice.getByText(bobRoster, { exact: true }).first()).toBeVisible()
  await expect(alice.getByText('0 units · 0 of 1,000 points', { exact: true })).toBeVisible()
  await expect(alice.getByText('0 units · 0 of 2,000 points', { exact: true })).toBeVisible()
  await alice.screenshot({ path: test.info().outputPath('setup-mismatched-desktop.png'), fullPage: true })
  await alice.setViewportSize(PHONE)
  await alice.screenshot({ path: test.info().outputPath('setup-mismatched-phone.png'), fullPage: true })
  await alice.setViewportSize({ width: 1440, height: 900 })
  await attachRoster(alice, aliceRoster)
  await expect(bob.getByText('Strike Force · 2,000 points', { exact: true })).toBeVisible()

  await alice.getByRole('button', { name: 'Change roster' }).click()
  const rosterChooserAgain = alice.getByRole('dialog', { name: 'Choose your roster' })
  await expect(rosterChooserAgain).toBeVisible()
  await expect(rosterChooserAgain.getByText('Necrons', { exact: true }).first()).toBeVisible()
  await expect(rosterChooserAgain.getByText('Awakened Dynasty', { exact: true }).first()).toBeVisible()
  await alice.screenshot({ path: test.info().outputPath('setup-roster-dialog.png'), fullPage: true })
  await alice.setViewportSize(PHONE)
  await expectNoPageOverflow(alice)
  await alice.screenshot({ path: test.info().outputPath('setup-roster-dialog-phone.png'), fullPage: true })
  await alice.setViewportSize({ width: 1440, height: 900 })
  await alice.keyboard.press('Escape')

  await chooseBattlefield(alice)
  await expect(alice.getByRole('region', { name: 'Deploy', exact: true })).toHaveCSS('opacity', '0.4')
  await expect(bob.getByRole('button', { name: /^Selected layout / })).toBeVisible()
  // The board itself is what opens the board, rather than a button beside it.
  await alice
    .getByRole('button', { name: /^Enlarge terrain layout / })
    .first()
    .click()
  const normalLayout = alice.getByRole('dialog')
  await expect(normalLayout.getByRole('img')).toBeVisible()
  await expect(normalLayout.getByText('Placement order', { exact: false })).toBeVisible()
  await showOnlyPublishedDistances(normalLayout)
  await expect(normalLayout.getByText('Placement distance · nearest ⅛″')).toBeVisible()
  await expect(normalLayout.locator('line[marker-end]')).toHaveCount(42)
  await alice.screenshot({ path: test.info().outputPath('setup-battlefield-dialog.png'), fullPage: true })
  await alice.setViewportSize(PHONE)
  await expectNoPageOverflow(alice)
  await alice.screenshot({ path: test.info().outputPath('setup-battlefield-dialog-phone.png'), fullPage: true })
  await alice.setViewportSize({ width: 1440, height: 900 })
  await alice.keyboard.press('Escape')

  await setupStep(bob, 'Defender')
  const defenderChoice = bob.getByRole('group', { name: 'Defender' })
  const defender = defenderChoice.getByRole('button', { name: new RegExp(aliceName) })
  const aliceDefender = alice.getByRole('group', { name: 'Defender' }).getByRole('button', { name: new RegExp(aliceName) })
  await Promise.all([defender.click(), aliceDefender.click()])
  await expect(alice.getByText('Your opponent got there first. Try that again.')).toBeHidden()
  await expect(bob.getByText('Your opponent got there first. Try that again.')).toBeHidden()
  await expect(alice.getByRole('region', { name: 'Deploy', exact: true })).toHaveCSS('opacity', '1')
  await expect(defender).toContainText('Defender · deploys first')
  await expect(defenderChoice.getByRole('button', { name: new RegExp(bobName) })).toContainText('Attacker · deploys second')
  await bob.screenshot({ path: test.info().outputPath('setup-defender.png'), fullPage: true })
  await bob.setViewportSize(PHONE)
  await expectNoPageOverflow(bob)
  await bob.screenshot({ path: test.info().outputPath('setup-defender-phone.png'), fullPage: true })
  await bob.setViewportSize({ width: 1440, height: 900 })
  await bob.close()
  await setupStep(alice, 'Secondaries')
  // One device settles both sides' derived cards, so an absent opponent cannot block setup.
  await expect(alice.locator('[data-setup-bar]')).not.toContainText('Mission cards')
  // Both sides are drawn, and either can be changed from this device.
  const secondaries = alice.getByRole('region', { name: 'Secondaries' })
  await expect(secondaries.getByText(aliceName, { exact: true })).toHaveCount(1)
  await expect(secondaries.getByText(bobName, { exact: true })).toHaveCount(1)
  await expect(secondaries.getByRole('group', { name: 'Secondary play' })).toHaveCount(2)
  await expect(secondaries.getByRole('button', { name: /^Fixed/ })).toHaveCount(2)
  await expect(secondaries.getByRole('button', { name: /^Tactical/ })).toHaveCount(2)
  await expect(secondaries.getByRole('button', { name: /^Change secondaries for / })).toHaveCount(0)
  await alice.evaluate(() => window.scrollTo(0, 0))
  await alice.screenshot({ path: test.info().outputPath('setup-armies.png'), fullPage: true })
  await alice.setViewportSize(PHONE)
  await alice.screenshot({ path: test.info().outputPath('setup-armies-phone.png'), fullPage: true })

  await alice.setViewportSize({ width: 1440, height: 900 })
  const reserves = alice.getByRole('region', { name: 'Reserves' })
  await reserves.scrollIntoViewIfNeeded()

  await expect(reserves.getByText(/\d+\/1000 reserve points/)).toHaveCount(2)
  await expect(reserves.getByRole('button', { name: /^Change reserves for / })).toHaveCount(0)
  const aliceArmy = reserves.locator('article').filter({ hasText: aliceRoster })
  await expect(aliceArmy.getByText('0/1000 reserve points')).toBeVisible()
  await aliceArmy.getByRole('button', { name: 'Start Immortals in Strategic reserves', exact: true }).click()
  await expect(aliceArmy.getByText(/[1-9]\d*\/1000 reserve points/)).toBeVisible()
  await expectNoPageOverflow(alice)
  await alice.screenshot({ path: test.info().outputPath('setup-reserves.png'), fullPage: true })
  await alice.setViewportSize(PHONE)
  await expectNoPageOverflow(alice)
  await alice.screenshot({ path: test.info().outputPath('setup-reserves-phone.png'), fullPage: true })
  await expect(alice.locator('[data-setup-bar]').getByRole('button', { name: 'Start battle', exact: true })).toBeDisabled()
  await expect(alice.getByRole('region', { name: 'Pre-battle rules', exact: true })).toHaveCSS('opacity', '0.4')
  await recordFirstTurn(alice)
  await expect(alice.getByRole('region', { name: 'Pre-battle rules', exact: true })).toHaveCSS('opacity', '1')
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
    await addUnit(bob, unit)
  }
  await bob.locator('[data-unit="Lord of Virulence"]').getByRole('button', { name: 'Lord of Virulence', exact: true }).click()
  await makeWarlord(bob, 'Lord of Virulence')
  await signUp(alice, aliceName)
  const aliceRoster = await createRoster(alice, {
    faction: 'Necrons',
    detachment: /Awakened Dynasty/,
    name: 'Alice KOTC army',
    size: /King of the Colosseum/,
  })
  for (const unit of ['Immortals', 'Overlord']) {
    await addUnit(alice, unit)
  }
  await alice.locator('[data-unit="Overlord"]').getByRole('button', { name: 'Overlord', exact: true }).click()
  await makeWarlord(alice, 'Overlord')
  await befriend(alice, bob)
  const url = await createBattle(alice, { opponent: bobName })
  await bob.goto(url)

  await attachRoster(alice, aliceRoster)
  await attachRoster(bob, bobRoster)
  await expect(alice.getByText(bobRoster, { exact: true }).first()).toBeVisible()
  await expect(alice.getByText('King of the Colosseum · 600 points', { exact: true })).toBeVisible()
  await setupStep(alice, 'Battlefield')
  await expect(alice.locator('#setup-battlefield')).toHaveAttribute('data-complete', 'true')
  await expect(alice.getByRole('button', { name: /Select layout|Select random/ })).toHaveCount(0)
  const card = alice.getByRole('button', { name: 'Enlarge Colosseum battlefield' }).locator('xpath=..')
  const grid = card.locator('xpath=..')
  const cardBox = await card.boundingBox()
  const gridBox = await grid.boundingBox()
  expect(cardBox && gridBox && Math.abs(cardBox.x + cardBox.width / 2 - gridBox.x - gridBox.width / 2)).toBeLessThan(2)
  await alice.screenshot({ path: test.info().outputPath('setup-colosseum-battlefield.png'), fullPage: true })
  await alice.getByRole('button', { name: 'Enlarge Colosseum battlefield' }).click()
  await expect(alice.getByRole('dialog').getByRole('img')).toBeVisible()
  await showOnlyPublishedDistances(alice.getByRole('dialog'))
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
  await alice
    .getByRole('dialog')
    .locator('[data-slot="dialog-body"]')
    .evaluate((body) => {
      body.scrollTop = 0
    })
  await alice.screenshot({ path: test.info().outputPath('setup-colosseum-measurements.png'), fullPage: true })
  await alice.setViewportSize(PHONE)
  await expectNoPageOverflow(alice)
  await alice.screenshot({ path: test.info().outputPath('setup-colosseum-measurements-phone.png'), fullPage: true })
  await alice.keyboard.press('Escape')
  await alice.screenshot({ path: test.info().outputPath('setup-colosseum-battlefield-phone.png'), fullPage: true })
  await alice.setViewportSize({ width: 1440, height: 900 })
  await setupStep(bob, 'Battlefield')
  await expect(bob.locator('#setup-battlefield')).toHaveAttribute('data-complete', 'true')
  await expect(bob.getByRole('button', { name: /Select layout|Select random/ })).toHaveCount(0)
  await setupStep(alice, 'Secondaries')
  await expect(alice.getByRole('region', { name: 'Secondaries' }).getByText(aliceName, { exact: true })).toHaveCount(1)
  await expect(alice.getByRole('region', { name: 'Secondaries' }).getByText(bobName, { exact: true })).toHaveCount(1)
  await expect(alice.locator('[data-setup-bar]')).not.toContainText('Mission cards')
  await expect(bob.locator('[data-setup-bar]')).not.toContainText('Mission cards')
  await expect(alice.getByRole('region', { name: 'Secondaries' }).getByRole('button', { name: /^Tactical/ })).toHaveCount(2)
  await expect(alice.getByRole('region', { name: 'Secondaries' }).getByRole('button', { name: /^Fixed/ })).toHaveCount(0)
  await expect(alice.getByText('Your opponent got there first. Try that again.')).toBeHidden()
  await expect(bob.getByText('Your opponent got there first. Try that again.')).toBeHidden()
  await alice.screenshot({ path: test.info().outputPath('setup-mandatory-secondaries.png'), fullPage: true })
})
