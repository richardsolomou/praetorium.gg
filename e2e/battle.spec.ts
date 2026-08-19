import { expect, test } from '@playwright/test'
import {
  attachRoster,
  befriend,
  createBattle,
  createRoster,
  setupBattle,
  setupStep,
  signUp,
  startBattle,
  takeTheTurn,
  uniqueName,
  waitForRosterSave,
} from './account'

test('a tactical hand is dealt rather than chosen, and pays out when the card says', async ({ browser }) => {
  const alice = await (await browser.newContext()).newPage()
  const bob = await (await browser.newContext()).newPage()
  const aliceName = uniqueName('Alice')
  const bobName = uniqueName('Bob')

  await signUp(bob, bobName)
  const bobRoster = await createRoster(bob, { faction: 'Necrons', detachment: /Awakened Dynasty/, name: 'Necrons' })
  await signUp(alice, aliceName)
  const aliceRoster = await createRoster(alice, { faction: 'Death Guard', detachment: /Shamblerot Vectorium/, name: 'Death Guard' })
  await alice.getByLabel('Add a unit').fill('Lord of Virulence')
  await waitForRosterSave(alice, () => alice.getByRole('button', { name: 'Add Lord of Virulence', exact: true }).first().click())
  await setupBattle(alice, bob, { opponent: bobName, hostRoster: aliceRoster, guestRoster: bobRoster })

  // Two cards off the deck, and no way to say which two.
  const hand = alice.locator('[data-panel="player"]').filter({ hasText: 'Death Guard' }).locator('[data-secondary]')
  await expect(hand).toHaveCount(2)
  await expect(alice.getByRole('button', { name: 'Choose a card' })).toHaveCount(0)
  await expect(alice.getByRole('button', { name: 'Draw at random' })).toHaveCount(0)
  await expect(alice.getByRole('button', { name: 'Select secret mission' })).toHaveCount(0)
  // The same two cards on the other device: a hand is public once it is drawn.
  const drawn = await hand.evaluateAll((cards) => cards.map((card) => card.getAttribute('data-secondary')))
  for (const key of drawn) await expect(bob.locator(`[data-secondary="${key}"]`)).toBeVisible()

  // The scoreboard is the way out of a battle: to whoever is playing it, and to the
  // list they brought, which a seated opponent reads through the battle token.
  const scoreboard = alice.getByRole('region', { name: 'Battle scoreboard' })
  await expect(scoreboard.getByRole('link', { name: aliceName })).toHaveAttribute('href', /^\/players\/[^/?]+$/)
  await expect(scoreboard.getByRole('link', { name: aliceRoster })).toHaveAttribute('href', /^\/rosters\/[^/?]+\?battle=/)

  const panel = alice.locator('[data-panel="player"]').filter({ hasText: 'Death Guard' })
  await expect(panel.locator('[data-stat="cp"]')).toHaveText('1')
  await expect(bob.locator('[data-panel="player"]').filter({ hasText: 'Death Guard' }).getByRole('button', { name: /^Use / })).toHaveCount(
    0,
  )

  // Nothing is scoreable mid-turn, and a mission cannot be completed early either:
  // both arrive with the moment the card names.
  await expect(alice.getByRole('button', { name: /plus \d/ })).toHaveCount(0)
  await expect(alice.getByRole('button', { name: 'Achieve' })).toHaveCount(0)
  for (const phase of ['command', 'movement', 'shooting', 'charge', 'fight']) {
    await alice.getByRole('button', { name: `End the ${phase} phase` }).click()
    await expect(alice.getByRole('heading', { name: new RegExp(`${phase} phase`) })).toHaveCount(0)
  }

  // Passing the turn is the moment an end-of-turn card pays, so that is when it is offered.
  await alice.getByRole('button', { name: 'Pass the turn' }).click()
  const scoring = alice.getByRole('dialog', { name: /^Scoring end of turn points/ })
  await expect(scoring).toBeVisible()
  // Whichever cards the matchup dealt, a flat payout is a yes or no rather than
  // something that can be pressed twice for double the points.
  const answer = scoring.getByRole('button', { name: /plus \d+$/ }).first()
  const scored = Number((await answer.innerText()).replace(/[^0-9]/g, ''))
  await answer.click()
  await expect(scoring).toContainText(`Scoring ${scored} VP`)
  await answer.click()
  await expect(scoring).toContainText('Scoring 0 VP')
  await answer.click()
  await scoring.getByRole('button', { name: 'Pass the turn' }).click()
  await expect(panel.locator('[data-stat="vp"]')).toHaveText(String(scored))
  // Nothing is ticked to finish a card: no control for it exists.
  await expect(alice.getByText('take it out of the hand')).toHaveCount(0)
  await expect(bob.locator('[data-panel="player"]').filter({ hasText: 'Death Guard' }).locator('[data-stat="vp"]')).toHaveText(
    String(scored),
  )

  await expect(alice.getByText(new RegExp(`${aliceName} brought Death Guard`))).toBeVisible()
  await expect(alice.getByText(/The battlefield is /)).toBeVisible()
  await expect(alice.getByText(/draws /).first()).toBeVisible()
  await alice.screenshot({ path: 'test-results/battle.png', fullPage: true })
})

test('a card the rules let you put back is offered back as it is drawn', async ({ browser }) => {
  const alice = await (await browser.newContext()).newPage()
  const bob = await (await browser.newContext()).newPage()
  const aliceName = uniqueName('Alice')
  const bobName = uniqueName('Bob')

  await signUp(bob, bobName)
  const bobRoster = await createRoster(bob, { faction: 'Necrons', detachment: /Awakened Dynasty/, name: 'Necrons' })
  await signUp(alice, aliceName)
  const aliceRoster = await createRoster(alice, { faction: 'Death Guard', detachment: /Shamblerot Vectorium/, name: 'Death Guard' })
  await befriend(alice, bob)
  const url = await createBattle(alice, { opponent: bobName })
  await bob.goto(url)
  await attachRoster(alice, aliceRoster)
  await setupStep(bob, 'Armies')
  await attachRoster(bob, bobRoster)
  // The battlefield follows from both dispositions, so the host has to have seen both armies.
  await expect(alice.getByText(bobRoster, { exact: true }).first()).toBeVisible()
  // Bob takes the first turn, so his is the hand dealt as the battle opens.
  await startBattle(alice, bobName)

  const prompt = bob.getByRole('dialog', { name: 'Your secondary missions' })
  await expect(prompt).toBeVisible()
  await expect(prompt.locator('[data-drawn]')).toHaveCount(2)
  // Whatever was dealt, the deck itself is never on offer.
  await expect(prompt.getByRole('button', { name: 'Choose a card' })).toHaveCount(0)
  // A card that may go back says why, and putting it back deals another.
  const returnable = prompt.getByRole('button', { name: 'Put back and draw another' })
  if (
    await returnable
      .first()
      .isVisible()
      .catch(() => false)
  ) {
    const before = await prompt.locator('[data-drawn]').evaluateAll((cards) => cards.map((card) => card.getAttribute('data-drawn')))
    await returnable.first().click()
    await expect
      .poll(() => prompt.locator('[data-drawn]').evaluateAll((c) => c.map((d) => d.getAttribute('data-drawn'))))
      .not.toEqual(before)
  }
  await takeTheTurn(bob)
  await expect(prompt).toBeHidden()
})
