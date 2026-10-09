import { expect, test, type Locator, type Page } from '@playwright/test'
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
import { productSql } from './storage'

test('Cleanse and Centre Ground prompt for scoring on the first turn', async ({ page, browser }) => {
  const opponent = await (await browser.newContext(desktopContext)).newPage()
  const opponentName = uniqueName('Scoring opponent')
  await signUp(opponent, opponentName)
  const opponentRoster = await createRoster(opponent, {
    faction: 'Necrons',
    detachment: /Awakened Dynasty/,
    name: 'Scoring opponent roster',
  })
  await signUp(page, uniqueName('Standard secondaries'))
  const roster = await createRoster(page, { faction: 'Necrons', detachment: /Awakened Dynasty/, name: 'Standard scoring roster' })
  await setupBattle(page, opponent, {
    opponent: opponentName,
    hostRoster: roster,
    guestRoster: opponentRoster,
    openingSecondaries: ['Cleanse', 'Centre Ground'],
  })

  const ongoing = page.locator('[data-panel="player"][data-side="0"]')
  await expect(ongoing.locator('[data-secondary]')).toHaveCount(2)
  await expect(ongoing.locator('[data-secondary] [aria-label="Victory points by battle round"]')).toHaveCount(0)
  for (const width of [900, 1100, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    const missions = await ongoing.locator('[data-missions]').boundingBox()
    const stratagems = await ongoing.locator('[data-stratagems]').boundingBox()
    expect(missions && stratagems).toBeTruthy()
    if (width === 1100) {
      expect(stratagems!.y).toBeGreaterThan(missions!.y + missions!.height)
    } else {
      expect(stratagems!.x).toBeGreaterThan(missions!.x + missions!.width)
      expect(Math.abs(stratagems!.y - missions!.y)).toBeLessThan(1)
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0)
    await ongoing.screenshot({ path: `test-results/ongoing-missions-${width}.png` })
  }
  await ongoing.screenshot({ path: 'test-results/ongoing-missions-desktop.png' })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.evaluate(() => window.scrollTo(0, 0))
  await ongoing.screenshot({ path: 'test-results/ongoing-missions-phone.png' })
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0)
  await page.setViewportSize({ width: 1440, height: 900 })

  for (let step = 0; step < 5; step += 1) await advance(page)
  await page.getByRole('button', { name: 'Pass the turn' }).click()
  const scoring = page.getByRole('dialog', { name: /^Scoring end of turn points/ })
  await expect(scoring.getByRole('button', { name: 'Cleanse plus 2', exact: true })).toBeVisible()
  await expect(scoring.getByRole('button', { name: 'Centre Ground plus 3', exact: true })).toBeVisible()
  await page.reload()
  await scoring.getByRole('button', { name: 'Cleanse plus 2', exact: true }).click()
  await scoring.getByRole('button', { name: 'Centre Ground plus 3', exact: true }).click()
  await expect(scoring.locator('output')).toContainText('Scoring 5 VP')
  await page.screenshot({ path: 'test-results/standard-secondary-scoring-desktop.png' })
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(scoring).toBeVisible()
  await page.screenshot({ path: 'test-results/standard-secondary-scoring-phone.png' })
  await scoring.getByRole('button', { name: 'Cleanse plus 2', exact: true }).scrollIntoViewIfNeeded()
  await page.screenshot({ path: 'test-results/standard-secondary-scoring-phone-bottom.png' })
  await scoring.getByRole('button', { name: 'Pass the turn', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'command phase' })).toBeVisible()
  await page.reload()
  await expect(page.locator('[data-panel="player"][data-side="0"] [data-stat="secondary"]')).toHaveText('5')
  await page
    .getByRole('dialog', { name: /secondary missions$/ })
    .getByRole('button', { name: 'Minimize dialog' })
    .click()
  const side = page.locator('[data-panel="player"][data-side="0"]')
  await side.getByRole('button', { name: 'Show 2 resolved missions', exact: true }).click()
  const cleanse = side.locator('[data-secondary]').filter({ has: page.getByRole('button', { name: 'Read Cleanse', exact: true }) })
  const centre = side.locator('[data-secondary]').filter({ has: page.getByRole('button', { name: 'Read Centre Ground', exact: true }) })
  await expect(cleanse.getByRole('listitem', { name: 'Round 1: 2 VP', exact: true })).toBeVisible()
  await expect(centre.getByRole('listitem', { name: 'Round 1: 3 VP', exact: true })).toHaveText('R1')
  await expect(cleanse.getByRole('listitem', { name: 'Round 2: not played', exact: true })).toHaveCount(0)
  await expect(side.locator('[data-missions] .chip')).toHaveCount(0)
  await expect(side.locator('[data-missions]').getByText(/^(tactical|fixed)$/i)).toHaveCount(0)
  await page.evaluate(() => window.scrollTo(0, 0))
  await side.screenshot({ path: 'test-results/mission-scorecards-phone.png' })
  await page.setViewportSize({ width: 1440, height: 900 })
  await side.screenshot({ path: 'test-results/mission-scorecards-desktop.png' })
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0)
  await side.getByRole('button', { name: 'View remaining secondary missions (16)' }).click()
  const remaining = page.getByRole('dialog', { name: 'Remaining secondary missions', exact: true })
  await expect(remaining.getByRole('button', { name: 'Read Cleanse', exact: true })).toHaveCount(0)
  await remaining.getByRole('button', { name: 'Read Beacon', exact: true }).click()
  const beacon = page.getByRole('dialog', { name: 'Beacon', exact: true })
  await expect(beacon).toBeVisible()
  await beacon.getByRole('button', { name: 'Close', exact: true }).click()
  await remaining.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(remaining).toBeHidden()
})

test('native battle controls leave the application tabs reachable', async ({ page }) => {
  await signUp(page, uniqueName('Native controls'))
  const roster = await createRoster(page, { faction: 'Necrons', detachment: /Awakened Dynasty/, name: 'Native battle roster' })
  await createBattle(page, { practice: true })
  await attachRoster(page, roster)
  await attachRoster(page, roster, { forPlayer: PRACTICE_OPPONENT })
  await startBattle(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.evaluate(() => {
    document.documentElement.dataset.nativeApp = 'true'
  })

  const turnControl = page.locator('[data-turn-control]')
  const applicationTabs = page.getByRole('navigation', { name: 'Application sections' })
  await expect(turnControl).toBeVisible()
  await expect(applicationTabs).toBeVisible()
  const controlBox = await turnControl.boundingBox()
  const tabsBox = await applicationTabs.boundingBox()
  expect(controlBox && tabsBox).toBeTruthy()
  expect(controlBox!.y + controlBox!.height).toBeLessThanOrEqual(tabsBox!.y)
  await page.screenshot({ path: 'test-results/native-battle-controls-phone.png', fullPage: true })

  const battleUrl = page.url()
  for (let step = 0; step < 5; step += 1) await advance(page)
  await page.getByRole('button', { name: 'Pass the turn' }).click()
  const scoring = page.getByRole('dialog', { name: /^Scoring end of turn points/ })
  await expect(scoring).toBeVisible()
  const scoringBox = await scoring.boundingBox()
  expect(scoringBox).toBeTruthy()
  expect(scoringBox!.y + scoringBox!.height).toBeLessThanOrEqual(tabsBox!.y)
  await page.screenshot({ path: 'test-results/native-scoring-prompt-phone.png' })

  const cpGain = page
    .locator('[data-panel="player"] button')
    .filter({ hasText: /\+1 CP|CP gain used/ })
    .first()
  const cpGainBefore = await cpGain.boundingBox()
  expect(cpGainBefore).toBeTruthy()
  await scoring.getByRole('button', { name: 'Minimize dialog' }).click()
  await expect(scoring).toBeHidden()
  await expect(page.locator('[data-minimized-battle-prompt]')).toContainText('Finish this prompt to continue')
  await expect(cpGain).toBeDisabled()
  const cpGainAfter = await cpGain.boundingBox()
  expect(cpGainAfter).toBeTruthy()
  expect(cpGainAfter!.x).toBe(cpGainBefore!.x)
  expect(cpGainAfter!.y).toBe(cpGainBefore!.y)
  const stickyHeader = page.locator('[data-battle-sticky-header]')
  const sidePanel = page.locator('[data-panel="player"]').first()
  const tabs = stickyHeader.getByRole('tablist')
  const headerBox = await stickyHeader.boundingBox()
  const panelBox = await sidePanel.boundingBox()
  expect(headerBox && panelBox).toBeTruthy()
  expect(panelBox!.y - (headerBox!.y + headerBox!.height)).toBeLessThan(24)
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await expect.poll(async () => (await tabs.boundingBox())?.y).toBeGreaterThanOrEqual(0)
  await expect(advanceButton(page)).toBeDisabled()

  await page.getByRole('button', { name: 'Open Native battle roster' }).click()
  const army = page.getByRole('dialog', { name: 'Native battle roster' })
  await expect(army).toBeVisible()
  await army.getByRole('button', { name: 'Minimize dialog' }).click()
  await expect(page.locator('[data-minimized-battle-prompt]')).toHaveCount(2)
  await expect(advanceButton(page)).toBeDisabled()
  await page.getByRole('button', { name: 'Return to army' }).click()
  await expect(army).toBeVisible()
  await army.getByRole('button', { name: 'Close' }).click()
  await page.getByRole('button', { name: 'Return to prompt' }).click()
  await expect(scoring).toBeVisible()

  await applicationTabs.getByRole('link', { name: 'Rosters' }).click()
  await expect(page).toHaveURL(/\/rosters/)
  await applicationTabs.getByRole('link', { name: 'Battles' }).click()
  await expect(page).toHaveURL(battleUrl)
  await expect(scoring).toBeVisible()
})

test('a running battle restores mission prompts when its tactical prep is missing', async ({ page }) => {
  await signUp(page, uniqueName('Repair'))
  const roster = await createRoster(page, { faction: 'Necrons', detachment: /Awakened Dynasty/, name: 'Repair roster' })
  await createBattle(page, { practice: true })
  await attachRoster(page, roster)
  await attachRoster(page, roster, { forPlayer: PRACTICE_OPPONENT })
  await startBattle(page)

  const token = new URL(page.url()).pathname.split('/').at(-1)!
  const [battle] = await productSql<{ id: string }>`SELECT id FROM battles WHERE token = ${token}`
  if (!battle) throw new Error('Battle is missing')
  const commands = await productSql<{ key: string; body: string }>`SELECT key, body FROM commands WHERE battle_id = ${battle.id}`
  for (const command of commands) {
    if (['set-prep', 'draw-secondaries'].includes((JSON.parse(command.body) as { kind: string }).kind)) {
      await productSql`DELETE FROM commands WHERE key = ${command.key}`
    }
  }
  await page.reload()

  const draw = page.getByRole('dialog', { name: 'Your secondary missions' })
  await expect(draw).toBeVisible()
  await draw.getByRole('button', { name: 'Draw at random' }).click()
  await expect(draw.locator('[data-drawn]')).toHaveCount(2)
  await page.screenshot({ path: 'test-results/repaired-secondary-draw.png', fullPage: true })
  await takeTheTurn(page)
  for (let step = 0; step < 5; step += 1) await advance(page)
  await page.getByRole('button', { name: 'Pass the turn' }).click()
  await expect(page.getByRole('dialog', { name: /^Scoring end of turn points/ })).toContainText('Primary mission')
  await page.screenshot({ path: 'test-results/repaired-primary-scoring.png', fullPage: true })
})

test('the final opponent-turn settlement completes before the battle ends', async ({ page }) => {
  await signUp(page, uniqueName('Final round'))
  const roster = await createRoster(page, { faction: 'Necrons', detachment: /Awakened Dynasty/, name: 'Final round roster' })
  await createBattle(page, { practice: true })
  await attachRoster(page, roster)
  await attachRoster(page, roster, { forPlayer: PRACTICE_OPPONENT })
  await startBattle(page)

  const token = new URL(page.url()).pathname.split('/').at(-1)!
  const [battle] = await productSql<{ id: string }>`SELECT id FROM battles WHERE token = ${token}`
  if (!battle) throw new Error('Battle did not start')
  const commands = await productSql<{ seq: number; body: string }>`SELECT seq, body FROM commands WHERE battle_id = ${battle.id}`
  const started = commands.find((command) => (JSON.parse(command.body) as { kind: string }).kind === 'begin-battle')
  if (!started) throw new Error('Battle did not start')
  const firstPlayerId = (JSON.parse(started.body) as { firstPlayerId: string }).firstPlayerId
  const [opponent] = await productSql<{
    user_id: string
  }>`SELECT user_id FROM battle_users WHERE battle_id = ${battle.id} AND user_id <> ${firstPlayerId}`
  if (!opponent) throw new Error('Battle seats are incomplete')
  let seq = Math.max(...commands.map((command) => command.seq))
  const append = async (by: string, body: object) => {
    seq += 1
    await productSql`INSERT INTO commands (key, battle_id, seq, user_id, at, body) VALUES (${JSON.stringify([battle.id, seq])}, ${battle.id}, ${seq}, ${by}, ${Date.now() + seq}, ${JSON.stringify(body)})`
  }
  await append(firstPlayerId, {
    kind: 'select-secret',
    secondary: {
      key: 'final-secret',
      name: 'Final Vigil',
      awards: [
        {
          vp: 5,
          per: null,
          mode: null,
          max: null,
          group: null,
          cumulative: false,
          criteria: 'Hold the objective.',
          trigger: { timing: 'end-of-turn', phase: null, playerTurn: 'opponent-turn', roundMin: null, roundMax: null },
        },
      ],
    },
  })
  const passPhases = async (playerId: string, count: number) => {
    for (let phase = 0; phase < count; phase += 1) await append(playerId, { kind: 'advance' })
  }
  for (let round = 1; round < 5; round += 1) {
    await passPhases(firstPlayerId, 6)
    await passPhases(opponent.user_id, 6)
  }
  await passPhases(firstPlayerId, 6)
  await passPhases(opponent.user_id, 5)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.reload()

  const scoreboard = page.locator('[data-scoreboard]')
  await expect(scoreboard.locator('h1')).toContainText('end phase')
  await expect(scoreboard).toContainText('Round 5 of 5')
  const activeHeight = (await scoreboard.boundingBox())?.height
  await page.getByRole('button', { name: 'Pass the turn' }).click()
  const activeScoring = page.getByRole('dialog', { name: /^Scoring end of turn points/ })
  const handoff = page.getByRole('dialog', { name: /Secret Mission action/ })
  await expect(activeScoring.or(handoff).first()).toBeVisible()
  if (await activeScoring.isVisible()) await activeScoring.getByRole('button', { name: 'Pass the turn' }).click()
  const discard = page.getByRole('dialog', { name: 'Discard tactical secondaries?' })
  await expect(discard.or(handoff).first()).toBeVisible()
  if (await discard.isVisible()) await discard.getByRole('button', { name: 'Keep hand' }).click()

  await expect(handoff).toBeVisible()
  await expect(scoreboard).not.toContainText('Result')
  await handoff.getByRole('button', { name: 'Reveal and continue' }).click()
  const settlement = page.getByRole('dialog', { name: /^Scoring end of their turn points/ })
  await expect(settlement.locator('[data-due="final-secret"]')).toContainText('Final Vigil')
  await settlement.locator('[data-due="final-secret"]').getByRole('button', { name: 'plus 5' }).click()
  await page.screenshot({ path: 'test-results/final-round-settlement.png', fullPage: true })
  await settlement.getByRole('button', { name: 'Take the turn' }).click()
  await expect(scoreboard.locator('h1')).toContainText('wins')
  await expect(scoreboard).not.toContainText('Result')
  expect((await scoreboard.boundingBox())?.height).toBe(activeHeight)
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

  const spectator = await (await browser.newContext(desktopContext)).newPage()
  await spectator.goto(alice.url())
  const spectatorMission = spectator
    .locator('[data-secondary]')
    .getByRole('button', { name: /^Read / })
    .first()
  await expect(spectatorMission).toBeVisible()
  const missionName = (await spectatorMission.getAttribute('aria-label'))?.replace(/^Read /, '')
  await spectatorMission.click()
  await expect(spectator.getByRole('dialog', { name: missionName })).toBeVisible()
  await expect(spectator.getByText('Spectators can follow the score, armies, and event log without changing the battle.')).toHaveCount(0)

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
  await expect(ownPanel.getByRole('link', { name: aliceRoster, exact: true })).toHaveCount(0)
  await expect(ownPanel.getByRole('button', { name: `Open ${aliceRoster}`, exact: true })).toHaveText('Army')
  const faction = ownPanel.getByRole('link', { name: 'Death Guard faction' })
  await expect(faction).toHaveAttribute('href', '/factions/death-guard')
  await expect(faction.locator('[data-faction-mark="death-guard"]')).toBeVisible()
  const detachment = ownPanel.getByRole('link', { name: 'Shamblerot Vectorium' })
  await expect(detachment).toHaveAttribute('href', '/factions/death-guard/detachments/shamblerot-vectorium')
  const factionColour = await faction.evaluate((link) => getComputedStyle(link).color)
  await expect(detachment).toHaveCSS('color', factionColour)
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
    await advance(alice)
    await expect(alice.getByRole('heading', { name: new RegExp(`${phase} phase`) })).toHaveCount(0)
  }

  // Passing the turn is the moment an end-of-turn card pays, so that is when it is offered.
  await alice.getByRole('button', { name: 'Pass the turn' }).click()
  const scoring = alice.getByRole('dialog', { name: /^Scoring end of turn points/ })
  const bobScoring = bob.getByRole('dialog', { name: /^Scoring end of turn points/ })
  await expect(scoring).toBeVisible()
  await expect(bobScoring).toBeVisible()
  await expect(scoring.getByRole('button', { name: 'Undo latest action' })).toBeEnabled()
  await scoring.getByRole('button', { name: 'Minimize dialog' }).click()
  await expect(scoring).toBeHidden()
  await expect(alice.locator('[data-scoreboard]')).toBeVisible()
  await expect(alice.locator('[data-turn-control] button').first()).toBeDisabled()
  await expect(alice.locator('[data-turn-control] button').last()).toBeDisabled()
  await expect(alice.getByRole('button', { name: 'Battle options' })).toBeDisabled()
  await expect(panel.getByRole('button', { name: /\+1 CP|Additional CP already gained this round/ })).toBeDisabled()
  await expect(alice.getByText('Finish the open prompt to continue.')).toBeVisible()
  await expect(panel.locator('[data-stat="cp"]')).toHaveText('0')
  await panel
    .getByRole('button', { name: /^Open / })
    .first()
    .click()
  await expect(alice.locator('[data-army-roster] button[aria-label^="Mark "]').first()).toBeDisabled()
  await alice.keyboard.press('Escape')
  const readMission = panel.getByRole('button', { name: /^Read / }).first()
  const inspectedMissionName = (await readMission.getAttribute('aria-label'))?.replace(/^Read /, '') ?? ''
  await readMission.click()
  const missionDetails = alice.getByRole('dialog', { name: inspectedMissionName })
  await expect(missionDetails).toBeVisible()
  await missionDetails.getByRole('button', { name: 'Minimize dialog' }).click()
  await expect(alice.locator('[data-minimized-battle-prompt]')).toHaveCount(2)
  await expect(alice.locator('[data-turn-control] button').first()).toBeDisabled()
  await alice.getByRole('button', { name: 'Return to mission' }).click()
  await expect(missionDetails).toBeVisible()
  await alice.keyboard.press('Escape')
  await expect(alice.locator('[data-minimized-battle-prompt]')).toBeVisible()
  await alice.screenshot({ path: 'test-results/scoring-minimized.png' })
  await alice.getByRole('button', { name: 'Return to prompt' }).click()
  await expect(scoring).toBeVisible()
  // Whichever cards the matchup dealt, a flat payout is a yes or no rather than
  // something that can be pressed twice for double the points.
  const answer = scoring.getByRole('button', { name: /plus \d+$/ }).first()
  const scored = Number((await answer.innerText()).replace(/[^0-9]/g, ''))
  await answer.click()
  await expect(scoring).toContainText(`Scoring ${scored} VP`)
  await scoring.getByRole('button', { name: 'Minimize dialog' }).click()
  await alice.getByRole('button', { name: 'Return to prompt' }).click()
  await expect(scoring).toContainText(`Scoring ${scored} VP`)
  await answer.click()
  await expect(scoring).toContainText('Scoring 0 VP')
  await answer.click()
  await scoring.getByRole('button', { name: 'Undo latest action' }).click()
  await expect(scoring).toBeHidden()
  await advance(alice)
  await alice.getByRole('button', { name: 'Pass the turn' }).click()
  await expect(scoring).toContainText(`Scoring ${scored} VP`)
  await alice.screenshot({ path: 'test-results/scoring-undo-restored.png' })

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
    const discardedCard = await discard.locator('button[aria-pressed]').first().innerText()
    await discard.getByRole('button', { name: discardedCard, exact: true }).click()
    await discard.getByRole('button', { name: 'Discard 1 and gain 1 CP' }).click()
    const nextHand = alice.getByRole('dialog', { name: `${bobName}’s secondary missions` })
    await expect(nextHand).toBeVisible()
    await expect(alice.getByText(/discards .+ and gains 1 CP/)).toBeVisible()
    await nextHand.getByRole('button', { name: 'Select missions' }).click()
    const chosenMission = nextHand.locator('button[aria-label^="Select "]').first()
    const chosenMissionName = (await chosenMission.getAttribute('aria-label'))?.replace(/^Select /, '') ?? ''
    await chosenMission.click()

    await nextHand.getByRole('button', { name: 'Undo latest action' }).click()
    await expect(discard).toBeVisible()
    await alice.setViewportSize({ width: 390, height: 844 })
    expect(await alice.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
    expect(await discard.evaluate((dialog) => dialog.scrollWidth <= dialog.clientWidth)).toBe(true)
    await expect(discard.getByRole('button', { name: discardedCard, exact: true })).toHaveCount(0)
    await discard.getByRole('button', { name: 'Minimize dialog' }).click()
    await expect(discard).toBeHidden()
    await expect(alice.locator('[data-turn-control] button').first()).toBeDisabled()
    await alice.screenshot({ path: 'test-results/discard-minimized-phone.png' })
    await alice.getByRole('button', { name: 'Return to prompt' }).click()
    await expect(discard.getByRole('button', { name: discardedCard, exact: true })).toHaveCount(0)
    await discard.getByRole('button', { name: 'Undo latest action' }).click()
    await expect(discard.getByRole('button', { name: discardedCard, exact: true })).toBeVisible()
    await expect(discard.getByRole('button', { name: discardedCard, exact: true })).toHaveAttribute('aria-pressed', 'true')
    await alice.screenshot({ path: 'test-results/undo-discard-phone.png' })
    await discard.getByRole('button', { name: 'Discard 1 and gain 1 CP' }).click()
    await expect(nextHand).toBeVisible()
    await expect(nextHand.getByRole('button', { name: `Remove ${chosenMissionName}`, exact: true })).toBeVisible()
    await alice.screenshot({ path: 'test-results/secondary-undo-restored-phone.png' })
    await nextHand.getByRole('button', { name: 'Cancel selection' }).click()
    await alice.setViewportSize(desktopContext.viewport)
  } finally {
    releaseBob()
  }
  await bobConfirmation
  await bob.unroute('**/*')
  await expect(bob.getByRole('dialog', { name: 'Your secondary missions' })).toBeVisible()
  await expect(alice.getByRole('dialog', { name: `${bobName}’s secondary missions` })).toBeVisible()
  await expect(
    alice.getByRole('dialog', { name: `${bobName}’s secondary missions` }).getByRole('button', { name: 'Undo latest action' }),
  ).toBeEnabled()
  await takeTheTurn(alice)
  await expect(alice.getByText(new RegExp(`${aliceName} draws .+ for ${bobName}`)).first()).toBeVisible()
  await expect(alice.getByText(new RegExp(`${bobName} marks `))).toHaveCount(0)
  // Both armies arrive battle ready, so every score carries the bonus the battle paid at the start.
  await expect(panel.locator('[data-stat="vp"]')).toHaveText(String(scored + 10))
  await expect(panel.locator('[data-stat="cp"]')).toHaveText('2')
  // Nothing is ticked to finish a card: no control for it exists.
  await expect(alice.getByText('take it out of the hand')).toHaveCount(0)
  await expect(bob.locator('[data-panel="player"]').filter({ hasText: 'Death Guard' }).locator('[data-stat="vp"]')).toHaveText(
    String(scored + 10),
  )

  await expect(alice.getByText(/The battlefield is /)).toBeVisible()
  await expect(alice.getByText(/draws /).first()).toBeVisible()
  await alice.screenshot({ path: 'test-results/battle.png', fullPage: true })
  await alice.setViewportSize({ width: 1100, height: 900 })
  const stackedStratagemPosition = await ownPanel.locator('button[aria-label^="About "]').first().boundingBox()
  const stackedPrimaryPosition = await ownPanel.locator('[data-stat="primary"]').boundingBox()
  expect(stackedStratagemPosition && stackedPrimaryPosition).toBeTruthy()
  expect(stackedStratagemPosition!.y).toBeGreaterThan(stackedPrimaryPosition!.y)
  await alice.screenshot({ path: 'test-results/battle-stacked-desktop.png', fullPage: true })
  // The same panel on a phone, reached the same way. Only one panel is on screen at
  // a time there, so the scoreboard names the players again.
  await alice.setViewportSize({ width: 390, height: 844 })
  await expect(faction).toBeVisible()
  await expect(detachment).toBeVisible()
  await expect(ownPanel.getByRole('button', { name: `Open ${aliceRoster}`, exact: true })).toBeVisible()
  await expect(scoreboard.getByRole('link', { name: aliceName })).toBeVisible()
  const stratagemPosition = await ownPanel.locator('button[aria-label^="About "]').first().boundingBox()
  const primaryPosition = await ownPanel.locator('[data-stat="primary"]').boundingBox()
  expect(stratagemPosition && primaryPosition).toBeTruthy()
  expect(stratagemPosition!.y).toBeGreaterThan(primaryPosition!.y)
  const shownSecondaries = await ownPanel.locator('[data-secondary]').count()
  const resolvedToggle = ownPanel.getByRole('button', { name: /Show \d+ resolved missions?/ })
  const resolvedCount = Number((await resolvedToggle.innerText()).match(/\d+/)?.[0])
  await alice.screenshot({ path: 'test-results/battle-phone.png', fullPage: true })
  await resolvedToggle.click()
  await expect(ownPanel.getByRole('button', { name: 'Hide resolved missions' })).toBeVisible()
  await expect(ownPanel.locator('[data-secondary]')).toHaveCount(shownSecondaries + resolvedCount)
  await alice.screenshot({ path: 'test-results/battle-phone-resolved.png', fullPage: true })
  await playerLink.click()
  await expect(alice).toHaveURL(/\/users\/[^/?]+$/)
  await expect(alice.getByRole('heading', { name: aliceName })).toBeVisible()
})

test('paired secondary missions may be kept or put back as they are drawn', async ({ browser }) => {
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
  await prompt.getByRole('button', { name: 'Select Cleanse', exact: true }).click()
  await prompt.getByRole('button', { name: 'Minimize dialog' }).click()
  await expect(bob.locator('[data-turn-control] button').first()).toBeDisabled()
  await bob.getByRole('button', { name: 'Return to prompt' }).click()
  await expect(prompt.getByRole('button', { name: 'Remove Cleanse', exact: true })).toBeVisible()
  await prompt.getByRole('button', { name: 'Select Plunder', exact: true }).click()
  await bob.screenshot({ path: 'test-results/secondary-picker.png' })
  await prompt.getByRole('button', { name: 'Add selected missions' }).click()
  await expect(prompt.locator('[data-drawn]')).toHaveCount(2)
  await prompt.getByRole('button', { name: 'Minimize dialog' }).click()
  await expect(prompt).toBeHidden()
  await expect(bob.locator('[data-scoreboard]')).toBeVisible()
  await bob.getByRole('button', { name: 'Return to prompt' }).click()
  await expect(prompt.locator('[data-drawn]')).toHaveCount(2)
  await expect(prompt.getByText('You can put this back while its paired mission is active.')).toHaveCount(2)
  await expect(prompt.getByRole('button', { name: 'Take the turn' })).toBeEnabled()
  await bob.screenshot({ path: 'test-results/paired-secondary-choice.png' })
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
      const prep = alice.getByRole('group', { name: 'Secondary play' }).first().locator('..')
      await press(prep.getByRole('button', { name: 'Fixed' }))
      for (const card of ['Assassination', 'Engage on All Fronts']) {
        await press(prep.getByRole('button', { name: new RegExp(`^(Select|Remove) ${card}$`, 'i') }))
      }
    },
  })

  for (let phase = 0; phase < 5; phase += 1) await advance(alice)
  await advanceButton(alice).click()
  const scoring = alice.getByRole('dialog', { name: /^Scoring end of turn points/ })
  // What the round still allows is stated while the player is choosing, not only once
  // a cap has already eaten something.
  await expect(scoring).toContainText(/Secondary missions 0\/15 this round/)
  const fronts = scoring.locator('[data-due]').filter({ hasText: /Engage on All Fronts/i })
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
  await expect(owed.getByRole('button', { name: 'Undo latest action' })).toBeEnabled()
  await expect(refereeing).toContainText(aliceName)
  await expect(owed.locator('[data-due]').filter({ hasText: 'Assassination' })).toContainText(
    'For each enemy CHARACTER model destroyed this turn.',
  )
  // The allowance belongs to the round the ended turn was in, which the battle has
  // already moved out of, so it still reads as untouched rather than as the new round's.
  await expect(owed).toContainText(/Secondary missions 0\/15 this round/)
  await refereeing.getByRole('button', { name: 'Take the turn' }).click()
  await expect(owed).toBeHidden()
})

test('a fixed secret mission is handed off before its scoring prompt', async ({ browser }) => {
  const alice = await (await browser.newContext(desktopContext)).newPage()
  const bob = await (await browser.newContext(desktopContext)).newPage()
  const aliceName = uniqueName('Alice')
  const bobName = uniqueName('Bob')

  await signUp(bob, bobName)
  const bobRoster = await createRoster(bob, { faction: 'Necrons', detachment: /Awakened Dynasty/, name: 'Necrons' })
  await signUp(alice, aliceName)
  const aliceRoster = await createRoster(alice, { faction: 'Death Guard', detachment: /Shamblerot Vectorium/, name: 'Death Guard' })
  await setupBattle(alice, bob, {
    opponent: bobName,
    hostRoster: aliceRoster,
    guestRoster: bobRoster,
    beforeStart: async () => {
      // Any player at the table can choose either side's secondaries.
      const chooseFixed = async (page: Page, side: number) => {
        await setupStep(page, 'Secondaries')
        const prep = page.getByRole('group', { name: 'Secondary play' }).nth(side).locator('..')
        const fixed = prep.getByRole('button', { name: 'Fixed' })
        const press = async (button: Locator) => {
          await expect(async () => {
            await expect(button).toBeEnabled({ timeout: 1_000 })
            if ((await button.getAttribute('aria-pressed')) === 'true') return
            await button.click({ timeout: 1_000 })
            await expect(button).toBeEnabled({ timeout: 3_000 })
            await expect(button).toHaveAttribute('aria-pressed', 'true', { timeout: 1_000 })
          }).toPass({ timeout: 10_000 })
        }
        await press(fixed)
        await press(prep.getByRole('button', { name: /^(Select|Remove) Engage on All Fronts$/i }))
        await press(prep.getByRole('button', { name: /^(Select|Remove) Bring It Down$/ }))
        await expect(prep).toHaveAttribute('data-secondary-deck-ready', 'true')
      }
      await chooseFixed(alice, 0)
      await chooseFixed(alice, 1)
      await alice.reload()
      await setupStep(alice, 'Secondaries')
      // Fixed choices remain editable after reloading.
      const hands = alice.getByRole('region', { name: 'Secondaries' }).locator('[data-secondary-deck-ready="true"]')
      await expect(hands).toHaveCount(2)
      for (const side of [0, 1]) {
        await expect(hands.nth(side).getByRole('button', { name: /^Fixed/ })).toHaveAttribute('aria-pressed', 'true')
        await expect(hands.nth(side)).toContainText(/Engage on All Fronts/i)
        await expect(hands.nth(side)).toContainText(/Bring It Down/i)
      }
      await alice.screenshot({ path: 'test-results/opponent-secondary-setup.png', fullPage: true })
    },
  })

  for (let phase = 0; phase < 6; phase += 1) await advance(alice)
  const openingOwed = alice.getByRole('dialog', { name: /^Scoring end of their turn points/ })
  await expect(openingOwed).toBeVisible()
  await openingOwed.getByRole('button', { name: 'Take the turn' }).click()
  await expect(openingOwed).toBeHidden()
  await expect(bob.getByRole('heading', { name: 'command phase' })).toBeVisible()

  const alicePanel = alice.locator('[data-panel="player"]').filter({ hasText: aliceName })
  await alicePanel.getByRole('button', { name: 'Select secret mission' }).click()
  await alice.getByRole('dialog', { name: 'Select a secret mission' }).getByRole('button', { name: 'Assassination' }).click()
  await expect(alicePanel.locator('[data-secondary]').filter({ hasText: 'Assassination' })).toContainText('secret')
  const bobPanel = bob.locator('[data-panel="player"]').filter({ hasText: bobName })
  await expect(bob.locator('[data-panel="player"]').filter({ hasText: aliceName }).locator('[data-secondary="secret"]')).toContainText(
    'Secret mission',
  )
  await bobPanel.getByRole('button', { name: 'Select secret mission' }).click()
  await bob.getByRole('dialog', { name: 'Select a secret mission' }).getByRole('button', { name: 'Beacon' }).click()
  await expect(bobPanel.locator('[data-secondary]').filter({ hasText: 'Beacon' })).toContainText('secret')

  for (let phase = 0; phase < 5; phase += 1) await advance(bob)
  await bob.getByRole('button', { name: 'Pass the turn' }).click()
  const bobAction = bob.getByRole('dialog', { name: `Secret Mission action · ${bobName}` })
  const sharedBobAction = alice.getByRole('dialog', { name: `Secret Mission action · ${bobName}` })
  await expect(bobAction).toBeVisible()
  await expect(sharedBobAction).toBeVisible()
  await expect(bobAction.getByRole('button', { name: 'Undo latest action' })).toBeEnabled()
  await expect(bob.getByRole('dialog', { name: /^Scoring / })).toHaveCount(0)
  await bobAction.getByRole('button', { name: 'Minimize dialog' }).click()
  await expect(bob.locator('[data-turn-control] button').first()).toBeDisabled()
  await expect(bob.getByRole('button', { name: 'Battle options' })).toBeDisabled()
  await bob.getByRole('button', { name: 'Return to prompt' }).click()
  await expect(bobAction).toBeVisible()
  await bobAction.getByRole('button', { name: 'Back' }).click()
  await expect(bobAction).toBeHidden()
  await expect(bob.getByRole('button', { name: 'Pass the turn' })).toBeVisible()

  await bob.getByRole('button', { name: 'Pass the turn' }).click()
  await expect(bobAction).toBeVisible()
  await bobAction.getByRole('button', { name: 'Reveal and continue' }).click()
  const bobScoring = bob.getByRole('dialog', { name: /^Scoring end of turn points/ })
  await expect(bobScoring).toBeVisible()
  await bobScoring.getByRole('button', { name: 'Pass the turn' }).click()

  const aliceAction = alice.getByRole('dialog', { name: `Secret Mission action · ${aliceName}` })
  const sharedAliceAction = bob.getByRole('dialog', { name: `Secret Mission action · ${aliceName}` })
  await expect(aliceAction).toBeVisible()
  await expect(sharedAliceAction).toContainText(`Hand this device to ${aliceName}`)
  await expect(sharedAliceAction.getByRole('button', { name: 'Back' })).toHaveCount(0)
  await expect(sharedAliceAction.getByRole('button', { name: 'Close' })).toHaveCount(0)
  await expect(bob.getByText('Assassination', { exact: true })).toHaveCount(0)
  await expect(bob.getByRole('dialog', { name: /^Scoring / })).toHaveCount(0)

  await sharedAliceAction.getByRole('button', { name: 'Reveal and continue' }).click()
  const owed = bob.getByRole('dialog', { name: /^Scoring end of their turn points/ })
  await expect(owed).toBeVisible()
  await expect(owed.locator('[data-due]').filter({ hasText: 'Assassination' })).toBeVisible()
  await owed.getByRole('button', { name: 'Take the turn' }).click()
  await expect(owed).toBeHidden()
  await expect(alice.getByRole('dialog')).toHaveCount(0)
})
