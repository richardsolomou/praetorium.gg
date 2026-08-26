import { expect, test, type Locator } from '@playwright/test'
import postgres from 'postgres'
import {
  advance,
  advanceButton,
  attachRoster,
  befriend,
  createBattle,
  createRoster,
  desktopContext,
  PRACTICE_OPPONENT,
  setupBattle,
  setupStep,
  signUp,
  startBattle,
  takeTheTurn,
  uniqueName,
  waitForRosterSave,
} from './account'
import { postgresPort } from './stackEnv'

test('a running battle restores mission prompts when its tactical prep is missing', async ({ page }) => {
  await signUp(page, uniqueName('Repair'))
  const roster = await createRoster(page, { faction: 'Necrons', detachment: /Awakened Dynasty/, name: 'Repair roster' })
  await createBattle(page, { practice: true })
  await attachRoster(page, roster)
  await attachRoster(page, roster, { forPlayer: PRACTICE_OPPONENT })
  await startBattle(page)

  const token = new URL(page.url()).pathname.split('/').at(-1)!
  const database = postgres(`postgres://praetorium:praetorium@127.0.0.1:${postgresPort}/praetorium`, { max: 1 })
  await database`
    delete from commands
    using battles
    where commands.battle_id = battles.id
      and battles.token = ${token}
      and commands.body::jsonb->>'kind' in ('set-prep', 'draw-secondaries')
  `
  await database.end()
  await page.reload()

  const draw = page.getByRole('dialog', { name: 'Your secondary missions' })
  await expect(draw).toBeVisible()
  await draw.getByRole('button', { name: 'Draw at random' }).click()
  await expect(draw.locator('[data-drawn]')).toHaveCount(2)
  await page.screenshot({ path: 'test-results/repaired-secondary-draw.png', fullPage: true })
  await draw.getByRole('button', { name: 'Take the turn' }).click()
  for (const phase of ['command', 'movement', 'shooting', 'charge', 'fight']) {
    await page.getByRole('button', { name: `End the ${phase} phase` }).click()
  }
  await page.getByRole('button', { name: 'Pass the turn' }).click()
  await expect(page.getByRole('dialog', { name: /^Scoring end of turn points/ })).toContainText('Primary mission')
  await page.screenshot({ path: 'test-results/repaired-primary-scoring.png', fullPage: true })
})

test('a tactical hand pays out when the card says', async ({ browser }) => {
  const alice = await (await browser.newContext(desktopContext)).newPage()
  const bob = await (await browser.newContext(desktopContext)).newPage()
  const aliceName = uniqueName('Alice')
  const bobName = uniqueName('Bob')

  await signUp(bob, bobName)
  const bobRoster = await createRoster(bob, { faction: 'Necrons', detachment: /Awakened Dynasty/, name: 'Necrons' })
  await signUp(alice, aliceName)
  await alice.goto('/profile')
  await alice.getByLabel('Choose profile picture').setInputFiles({
    name: 'avatar.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQAQMAAAAlPW0iAAAAA1BMVEX/W1e1okn/AAAADElEQVQI12NgIA0AAAAwAAHHqoWOAAAAAElFTkSuQmCC',
      'base64',
    ),
  })
  await alice.getByRole('button', { name: 'Save profile' }).click()
  await expect(alice.getByText('Profile saved.')).toBeVisible()
  const aliceRoster = await createRoster(alice, { faction: 'Death Guard', detachment: /Shamblerot Vectorium/, name: 'Death Guard' })
  await alice.getByLabel('Add a unit').fill('Lord of Virulence')
  await waitForRosterSave(alice, () => alice.getByRole('button', { name: 'Add Lord of Virulence', exact: true }).first().click())
  await setupBattle(alice, bob, { opponent: bobName, hostRoster: aliceRoster, guestRoster: bobRoster })

  const hand = alice.locator('[data-panel="player"]').filter({ hasText: 'Death Guard' }).locator('[data-secondary]')
  await expect(hand).toHaveCount(2)
  await expect(alice.getByRole('button', { name: 'Select secret mission' })).toHaveCount(0)
  // The same two cards on the other device: a hand is public once it is drawn.
  const drawn = await hand.evaluateAll((cards) => cards.map((card) => card.getAttribute('data-secondary')))
  for (const key of drawn) await expect(bob.locator(`[data-secondary="${key}"]`)).toBeVisible()

  // The side panel is the way out of a battle to whoever is playing it and to what
  // they brought. It is written there once: with both panels on screen at this width
  // the scoreboard is left to the score.
  const scoreboard = alice.getByRole('region', { name: 'Battle scoreboard' })
  const ownPanel = alice.locator('[data-panel="player"]').filter({ hasText: 'Death Guard' })
  const playerLink = ownPanel.getByRole('link', { name: aliceName })
  await expect(playerLink).toHaveAttribute('href', /^\/users\/[^/?]+$/)
  await expect(playerLink.locator('img')).toHaveAttribute('src', /\/avatars\/[0-9a-f]+\.webp$/)
  await playerLink.hover()
  await expect(playerLink).toHaveCSS('text-decoration-line', 'none')
  await expect(playerLink.getByText(aliceName, { exact: true })).toHaveCSS('text-decoration-line', 'underline')
  await expect(playerLink.locator('[aria-hidden="true"]')).toHaveCSS('text-decoration-line', 'none')
  await expect(scoreboard.getByRole('link', { name: aliceRoster, exact: true })).toHaveCount(0)
  await expect(scoreboard.getByRole('link', { name: aliceName })).toBeHidden()
  await expect(ownPanel.getByRole('link', { name: aliceRoster, exact: true })).toHaveAttribute('href', /^\/rosters\/[^/?]+\?battle=/)
  const faction = ownPanel.getByRole('link', { name: 'Death Guard faction' })
  await expect(faction).toHaveAttribute('href', '/factions/death-guard')
  await expect(faction.locator('[data-faction-mark="death-guard"]')).toBeVisible()
  const detachment = ownPanel.getByRole('link', { name: 'Shamblerot Vectorium' })
  await expect(detachment).toHaveAttribute('href', '/factions/death-guard/detachments/shamblerot-vectorium')
  const roster = ownPanel.getByRole('link', { name: aliceRoster, exact: true })
  const factionColour = await faction.evaluate((link) => getComputedStyle(link).color)
  await expect(detachment).toHaveCSS('color', factionColour)
  await expect(roster).toHaveCSS('color', factionColour)
  // The list is named after what it is, whether the width puts them on one line or two.
  const rosterPosition = await roster.boundingBox()
  const detachmentPosition = await detachment.boundingBox()
  expect(rosterPosition && detachmentPosition).toBeTruthy()
  const reads = (later: typeof rosterPosition, earlier: typeof detachmentPosition) =>
    !later || !earlier ? false : later.y > earlier.y || (later.y === earlier.y && later.x > earlier.x)
  expect(reads(rosterPosition, detachmentPosition)).toBe(true)
  const panel = alice.locator('[data-panel="player"]').filter({ hasText: 'Death Guard' })
  const opponentPanel = bob.locator('[data-panel="player"]').filter({ hasText: 'Death Guard' })
  await expect(panel.locator('[data-stat="cp"]')).toHaveText('1')
  const opponentUse = opponentPanel.locator('button[aria-label^="Use "]:not([disabled])').first()
  await expect(opponentUse).toBeVisible()
  const stratagem = (await opponentUse.getAttribute('aria-label'))?.replace(/^Use /, '') ?? ''
  await opponentUse.click()
  await expect(opponentPanel.locator('[data-stat="cp"]')).toHaveText('0')
  await expect(panel.locator('[data-stat="cp"]')).toHaveText('0')
  await opponentPanel.getByRole('button', { name: `About ${stratagem}` }).click()
  await expect(bob.getByRole('dialog', { name: stratagem })).toContainText('used 1x this battle')
  await bob.keyboard.press('Escape')
  await expect(alice.getByText(`${bobName} uses ${aliceName}’s ${stratagem} for 1 CP`)).toBeVisible()

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
  const bobScoring = bob.getByRole('dialog', { name: /^Scoring end of turn points/ })
  await expect(scoring).toBeVisible()
  await expect(bobScoring).toBeVisible()
  // Whichever cards the matchup dealt, a flat payout is a yes or no rather than
  // something that can be pressed twice for double the points.
  const answer = scoring.getByRole('button', { name: /plus \d+$/ }).first()
  const scored = Number((await answer.innerText()).replace(/[^0-9]/g, ''))
  await answer.click()
  await expect(scoring).toContainText(`Scoring ${scored} VP`)
  await answer.click()
  await expect(scoring).toContainText('Scoring 0 VP')
  await answer.click()

  // Hold Bob's first submission so Alice deterministically wins this race.
  const answerName = await answer.getAttribute('aria-label')
  await bobScoring.getByRole('button', { name: answerName ?? '', exact: true }).click()
  let releaseBob = () => {}
  let sawBobSubmit = () => {}
  const held = new Promise<void>((resolve) => {
    releaseBob = resolve
  })
  const submitted = new Promise<void>((resolve) => {
    sawBobSubmit = resolve
  })
  let holding = true
  await bob.route('**/*', async (route) => {
    if (holding && route.request().method() === 'POST') {
      holding = false
      sawBobSubmit()
      await held
    }
    await route.continue()
  })
  const bobConfirmation = bobScoring.getByRole('button', { name: 'Pass the turn' }).click()
  await submitted
  try {
    await scoring.getByRole('button', { name: 'Pass the turn' }).click()
    const discard = alice.getByRole('dialog', { name: 'Discard tactical secondaries?' })
    const bobDiscard = bob.getByRole('dialog', { name: 'Discard tactical secondaries?' })
    await expect(discard).toBeVisible()
    await expect(bobDiscard).toBeVisible()
    await discard.locator('button[aria-pressed]').first().click()
    await discard.getByRole('button', { name: 'Discard 1 and gain 1 CP' }).click()
    await expect(alice.getByRole('heading', { name: 'command phase' })).toBeVisible()
    await expect(alice.getByText(/discards .+ and gains 1 CP/)).toBeVisible()
  } finally {
    releaseBob()
  }
  await bobConfirmation
  await bob.unroute('**/*')
  await expect(bob.getByRole('dialog', { name: 'Your secondary missions' })).toBeVisible()
  await expect(alice.getByRole('dialog', { name: `${bobName}’s secondary missions` })).toBeVisible()
  await takeTheTurn(alice)
  await expect(alice.getByText(new RegExp(`${aliceName} draws .+ for ${bobName}`)).first()).toBeVisible()
  await expect(alice.getByText(new RegExp(`${bobName} marks `))).toHaveCount(0)
  await expect(panel.locator('[data-stat="vp"]')).toHaveText(String(scored))
  await expect(panel.locator('[data-stat="cp"]')).toHaveText('1')
  // Nothing is ticked to finish a card: no control for it exists.
  await expect(alice.getByText('take it out of the hand')).toHaveCount(0)
  await expect(bob.locator('[data-panel="player"]').filter({ hasText: 'Death Guard' }).locator('[data-stat="vp"]')).toHaveText(
    String(scored),
  )

  await expect(alice.getByText(/The battlefield is /)).toBeVisible()
  await expect(alice.getByText(/draws /).first()).toBeVisible()
  await alice.screenshot({ path: 'test-results/battle.png', fullPage: true })
  // The same panel on a phone, reached the same way. Only one panel is on screen at
  // a time there, so the scoreboard names the players again.
  await alice.setViewportSize({ width: 390, height: 844 })
  await expect(faction).toBeVisible()
  await expect(detachment).toBeVisible()
  await expect(ownPanel.getByRole('link', { name: aliceRoster, exact: true })).toBeVisible()
  await expect(scoreboard.getByRole('link', { name: aliceName })).toBeVisible()
  await alice.screenshot({ path: 'test-results/battle-phone.png', fullPage: true })
  await playerLink.click()
  await expect(alice).toHaveURL(/\/users\/[^/?]+$/)
  await expect(alice.getByRole('heading', { name: aliceName })).toBeVisible()
})

test('a card the rules let you put back is offered back as it is drawn', async ({ browser }) => {
  const alice = await (await browser.newContext(desktopContext)).newPage()
  const bob = await (await browser.newContext(desktopContext)).newPage()
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
  await startBattle(alice, bobName, false)

  const prompt = bob.getByRole('dialog', { name: 'Your secondary missions' })
  await expect(prompt).toBeVisible()
  await expect(alice.getByRole('dialog', { name: `${bobName}’s secondary missions` })).toBeVisible()
  await prompt.getByRole('button', { name: 'Select missions' }).click()
  await prompt
    .getByRole('button', { name: /^Select / })
    .first()
    .click()
  await prompt
    .getByRole('button', { name: /^Select / })
    .first()
    .click()
  await bob.screenshot({ path: 'test-results/secondary-picker.png' })
  await prompt.getByRole('button', { name: 'Add selected missions' }).click()
  await expect(prompt.locator('[data-drawn]')).toHaveCount(2)
  const firstCard = prompt.locator('[data-drawn]').first()
  const readCard = firstCard.getByRole('button', { name: /^Read / })
  const cardName = (await readCard.getAttribute('aria-label'))?.replace(/^Read /, '') ?? ''
  await readCard.click()
  const reference = bob.getByRole('dialog', { name: cardName })
  await expect(reference).toBeVisible()
  await bob.mouse.click(8, 400)
  await expect(reference).toBeHidden()
  await expect(prompt).toBeVisible()
  // A card that may go back says why, and putting it back deals another.
  const returnable = prompt.getByRole('button', { name: 'Put back and draw another' })
  const returned = await returnable
    .first()
    .isVisible()
    .catch(() => false)
  if (returned) {
    const before = await prompt.locator('[data-drawn]').evaluateAll((cards) => cards.map((card) => card.getAttribute('data-drawn')))
    await returnable.first().click()
    await prompt.getByRole('button', { name: 'Draw at random' }).click()
    await expect
      .poll(() => prompt.locator('[data-drawn]').evaluateAll((c) => c.map((d) => d.getAttribute('data-drawn'))))
      .not.toEqual(before)
  }
  const undoDraw = prompt.getByRole('button', { name: 'Undo latest action' })
  const confirmation = bob.getByRole('alertdialog', { name: 'Undo mission draw?' })
  await undoDraw.click()
  await expect(confirmation).toBeVisible()
  await confirmation.getByRole('button', { name: 'Keep missions' }).click()
  await expect(confirmation).toBeHidden()
  await expect(prompt.locator('[data-drawn]')).toHaveCount(2)

  const confirmUndo = async () => {
    await undoDraw.click()
    await expect(confirmation).toBeVisible()
    await confirmation.getByRole('button', { name: 'Undo draw' }).click()
  }
  await bob.setViewportSize({ width: 390, height: 844 })
  await confirmUndo()
  await expect(prompt.locator('[data-drawn]')).toHaveCount(returned ? 1 : 0)
  await expect(prompt.getByRole('button', { name: 'Select missions' })).toBeVisible()
  if (returned) {
    await undoDraw.click()
    await expect(prompt.locator('[data-drawn]')).toHaveCount(2)
    await confirmUndo()
  }
  await expect(prompt.locator('[data-drawn]')).toHaveCount(0)
  await prompt.getByRole('button', { name: 'Select missions' }).click()
  await prompt
    .getByRole('button', { name: /^Select / })
    .first()
    .click()
  await prompt
    .getByRole('button', { name: /^Select / })
    .first()
    .click()
  await bob.screenshot({ path: 'test-results/secondary-picker-phone.png' })
  await prompt.getByRole('button', { name: 'Add selected missions' }).click()
  await expect(prompt.locator('[data-drawn]')).toHaveCount(2)
  // The hand is not something to dismiss: it is the one chance to see what was dealt.
  await bob.mouse.click(8, 400)
  await expect(prompt).toBeVisible()
  await bob.keyboard.press('Escape')
  await expect(prompt).toBeVisible()
  await expect(prompt.getByRole('button', { name: 'Close' })).toHaveCount(0)

  await takeTheTurn(bob)
  await expect(prompt).toBeHidden()
  await bob.getByRole('button', { name: 'Undo latest action' }).click()
  await expect(confirmation).toBeVisible()
  await confirmation.getByRole('button', { name: 'Undo draw' }).click()
  await expect(prompt).toBeVisible()
  await expect(prompt.locator('[data-drawn]')).toHaveCount(0)
  await expect(prompt.getByRole('button', { name: 'Select missions' })).toBeVisible()
})

test('a card names its own condition, and what their turn owed is asked as the turn comes back', async ({ browser }) => {
  const alice = await (await browser.newContext(desktopContext)).newPage()
  const bob = await (await browser.newContext(desktopContext)).newPage()
  const bobName = uniqueName('Bob')

  await signUp(bob, bobName)
  const bobRoster = await createRoster(bob, { faction: 'Necrons', detachment: /Awakened Dynasty/, name: 'Necrons' })
  const aliceName = uniqueName('Alice')
  await signUp(alice, aliceName)
  const aliceRoster = await createRoster(alice, { faction: 'Death Guard', detachment: /Shamblerot Vectorium/, name: 'Death Guard' })
  await setupBattle(alice, bob, {
    opponent: bobName,
    hostRoster: aliceRoster,
    guestRoster: bobRoster,
    // Fixed play, so the two cards under test are certain: Engage on All Fronts pays in
    // tiers the source describes only in prose, and Assassination pays on either player's
    // turn. Both are cards the pack marks as fixed — nothing else may be taken as one.
    beforeStart: async () => {
      // Located rather than named: 'Fixed' is also in the rail chip's own line once the
      // mode flips, and a card names two controls — the one that reads it and the one
      // that takes it. Only the one that takes it is pressed here.
      const press = async (button: Locator) => {
        await expect(async () => {
          if ((await button.getAttribute('aria-pressed')) === 'true') return
          await button.click({ timeout: 1_000 })
          await expect(button).toHaveAttribute('aria-pressed', 'true', { timeout: 1_000 })
        }).toPass({ timeout: 10_000 })
      }
      await press(alice.getByRole('group', { name: 'Secondary play' }).getByRole('button', { name: 'Fixed' }))
      for (const card of ['Assassination', 'Engage on All Fronts']) {
        await press(alice.getByRole('button', { name: new RegExp(`^(Select|Remove) ${card}$`) }))
      }
    },
  })

  for (let phase = 0; phase < 5; phase += 1) await advance(alice)
  await advanceButton(alice).click()
  const scoring = alice.getByRole('dialog', { name: /^Scoring end of turn points/ })
  // What the round still allows is stated while the player is choosing, not only once
  // a cap has already eaten something.
  await expect(scoring).toContainText(/Secondary missions 0\/15 this round/)
  const fronts = scoring.locator('[data-due="engage-on-all-fronts"]')
  // Two tiers of one thing rather than two payouts, each asking in the mission pack's own words.
  await expect(fronts).toContainText('or')
  await expect(fronts).toContainText('presence in three table quarters')
  await expect(fronts).toContainText('presence in four table quarters')
  // The keywords the pack marks up are drawn as keywords rather than printed with their asterisks.
  await expect(fronts.getByText('presence').first()).toBeVisible()
  await expect(fronts).not.toContainText('**')
  await scoring.getByRole('button', { name: 'Pass the turn' }).click()
  await expect(bob.getByRole('dialog', { name: 'Your secondary missions' })).toBeVisible()

  // Assassination pays at the end of either turn, and the opponent's is a turn Alice
  // cannot press anything through, so it is settled as the turn comes back.
  for (let phase = 0; phase < 6; phase += 1) await advance(bob)
  const owed = alice.getByRole('dialog', { name: /^Scoring end of their turn points/ })
  const refereeing = bob.getByRole('dialog', { name: /^Scoring end of their turn points/ })
  await expect(owed).toBeVisible()
  await expect(refereeing).toBeVisible()
  await expect(refereeing).toContainText(aliceName)
  await expect(owed.locator('[data-due="assassination"]')).toContainText('For each enemy CHARACTER model destroyed this turn.')
  // The allowance belongs to the round the ended turn was in, which the battle has
  // already moved out of, so it still reads as untouched rather than as the new round's.
  await expect(owed).toContainText(/Secondary missions 0\/15 this round/)
  await refereeing.getByRole('button', { name: 'Take the turn' }).click()
  await expect(owed).toBeHidden()
})
