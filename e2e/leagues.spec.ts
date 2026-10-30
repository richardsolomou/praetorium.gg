import { recordEvents } from './telemetry.harness'
import { expect, test, type Locator, type Page } from './test'
import { z } from 'zod'
import {
  confirmRosterSetup,
  befriend,
  createRoster,
  uniqueName,
  signUp,
  waitForRosterSave,
  makeWarlord,
  sealableRoster,
  expectNoPageOverflow,
  addUnit,
  openRosterSetup,
  chooseOption,
  PHONE,
  uploadAvatar,
  setupStep,
} from './account'
import {
  productOperator,
  productSql,
  userIdFor,
  withAuthSql,
  userIdNamed,
  lastPathSegment,
  battleIdFor,
  seatsBySide,
  appendCommand,
  battleCommands,
} from './storage'
import { holdCombatCalculations } from './combat'
import type { Command } from '../src/core/battle'
import { expectNoHorizontalOverflow } from './builder.harness'

test.setTimeout(180_000)

test('players can decline and publish their original league roster across devices', async ({ browser }, testInfo) => {
  const ownerContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  })
  const opponentContext = await browser.newContext()
  const owner = await ownerContext.newPage()
  const opponent = await opponentContext.newPage()
  const ownerName = uniqueName('Roster publisher')
  const opponentName = uniqueName('League friend')
  await signUp(owner, ownerName)
  await signUp(opponent, opponentName)
  const armyName = uniqueName('The revealed army')
  await sealableRoster(owner, armyName)
  const savedUrl = owner.url()
  const savedId = lastPathSegment(savedUrl)
  const product = await productOperator()
  const saved = (await product.roster(savedId))!
  await product.setRosterVisibility(savedId, saved.userId, 'private', Date.now())
  await sealableRoster(opponent, 'Already public league army')
  await owner.goto('/tournaments')
  const create = await openLeagueCreation(owner)
  await create.getByLabel('Name').fill(uniqueName('League roster sharing'))
  await create.getByRole('button', { name: /^Anyone who joins/ }).click()
  await submitLeagueCreation(owner, create)
  let leagueUrl = owner.url()
  await join(owner)
  await sealOwnRoster(owner, armyName)
  await opponent.goto(leagueUrl)
  await join(opponent)
  await sealOwnRoster(opponent, 'Already public league army')
  await expect(owner.locator('[data-league-sharing]')).toHaveCount(0)
  await revealEvent(opponent)
  await expect(opponent.getByRole('region', { name: 'Roster sharing', exact: true })).toHaveCount(0)
  await owner.reload()
  const sharing = owner.getByRole('region', { name: 'Roster sharing', exact: true })
  await expect(sharing.getByRole('heading', { name: 'Share your sealed roster?' })).toBeVisible()
  await expect(sharing.getByRole('button')).toHaveText(['Make public', 'No thanks'])
  expect((await sharing.boundingBox())!.y).toBeLessThan((await owner.locator('[data-league-armies]').boundingBox())!.y)
  await sharing.scrollIntoViewIfNeeded()
  await owner.screenshot({ path: testInfo.outputPath('league-sharing-desktop.png') })
  await owner.setViewportSize(PHONE)
  await sharing.evaluate((element) => element.scrollIntoView({ block: 'center' }))
  await expectWithinPage(owner, sharing)
  await owner.screenshot({ path: testInfo.outputPath('league-sharing-phone.png') })
  await sharing.getByRole('button', { name: 'No thanks', exact: true }).click()
  await expect(sharing).toHaveCount(0)
  await owner.reload()
  await expect(leagueHeader(owner)).toContainText('Rosters revealed')
  await expect(sharing).toHaveCount(0)

  const secondDevice = await browser.newContext({ storageState: await ownerContext.storageState() })
  const elsewhere = await secondDevice.newPage()
  await elsewhere.goto(leagueUrl)
  await expect(leagueHeader(elsewhere)).toContainText('Rosters revealed')
  await expect(elsewhere.getByRole('region', { name: 'Roster sharing', exact: true })).toHaveCount(0)
  await elsewhere.close()

  await owner.setViewportSize({ width: 1440, height: 1000 })
  await owner.goto('/tournaments')
  const second = await openLeagueCreation(owner, { ownerPlays: true })
  await second.getByLabel('Name').fill(uniqueName('Second roster sharing'))
  await second.getByRole('button', { name: /^Anyone who joins/ }).click()
  await submitLeagueCreation(owner, second)
  leagueUrl = owner.url()
  await sealOwnRoster(owner, armyName)
  await opponent.goto(leagueUrl)
  await join(opponent)
  await sealOwnRoster(opponent, 'Already public league army')
  await owner.reload()
  await revealEvent(owner)
  await expect(sharing.getByRole('heading', { name: 'Share your sealed roster?' })).toBeVisible()

  // Publication changes the saved roster’s visibility without replacing its edits.
  await owner.setViewportSize({ width: 1440, height: 1000 })
  await owner.goto(savedUrl)
  await addUnit(owner, 'Immortals')
  await owner.goto(leagueUrl)
  await expect(sharing).toContainText('including changes since sealing and future edits')
  await sharing.getByRole('button', { name: 'Make public', exact: true }).click()
  await expect(sharing).toHaveCount(0)
  const leagueToken = lastPathSegment(leagueUrl)
  const { event } = (await product.leagueByToken(leagueToken))!
  const publication = await product.leagueRosterSharing(leagueToken, event.token, saved.userId)
  const sharedId = publication!.roster.id
  expect(sharedId).toBe(savedId)
  expect((await product.roster(savedId))?.visibility).toBe('public')
  const visitor = await (await browser.newContext()).newPage()
  await visitor.goto(new URL(`/rosters/${sharedId}`, leagueUrl).href)
  await expect(visitor.locator('[data-unit="Skorpekh Lord"]')).toBeVisible()
  await expect(visitor.locator('[data-unit="Immortals"]')).toBeVisible()
  await visitor.goto('/rosters?view=public')
  await owner.setViewportSize({ width: 1440, height: 1000 })
  await owner.locator('[data-entry-status]').scrollIntoViewIfNeeded()
  await owner.screenshot({ path: testInfo.outputPath('league-sharing-after-publication.png') })
  await owner.reload()
  await expect(sharing).toHaveCount(0)
  await visitor.reload()
  await expect(visitor.locator(`[data-discovered-roster="${armyName}"]`)).toBeVisible()
  await visitor.locator(`[data-discovered-roster="${armyName}"]`).scrollIntoViewIfNeeded()
  await visitor.screenshot({ path: testInfo.outputPath('league-sharing-discovery.png') })
  await owner.goto('/rosters')
  await expect(owner.locator(`[data-roster="${armyName}"]`)).toHaveCount(1)
  for (const name of [
    'league-sharing-desktop.png',
    'league-sharing-phone.png',
    'league-sharing-after-publication.png',
    'league-sharing-discovery.png',
  ])
    await testInfo.attach(name, { path: testInfo.outputPath(name), contentType: 'image/png' })
  await Promise.all([ownerContext.close(), opponentContext.close(), secondDevice.close(), visitor.context().close()])
})

test('revealed rosters compare every unit using frozen loadouts and preserve league state', async ({ browser }) => {
  const ownerContext = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const opponentContext = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const owner = await ownerContext.newPage()
  const opponent = await opponentContext.newPage()
  const ownerName = uniqueName('Comparison owner')
  const opponentName = uniqueName('Comparison opponent')
  await signUp(owner, ownerName)
  await signUp(opponent, opponentName)
  await sealableRoster(owner, 'Comparison defenders', { extraUnit: 'Immortals' })
  const savedUrl = owner.url()
  await sealableRoster(opponent, 'Comparison attackers', { extraUnit: 'Lokhust Destroyers' })
  await owner.goto('/tournaments')
  const create = await openLeagueCreation(owner)
  await create.getByLabel('Name').fill(uniqueName('Comparison league'))
  await create.getByRole('button', { name: /^Anyone who joins/ }).click()
  await submitLeagueCreation(owner, create)
  const leagueUrl = owner.url()
  await join(owner)
  await sealOwnRoster(owner, 'Comparison defenders')
  await opponent.goto(leagueUrl)
  await join(opponent)
  await sealOwnRoster(opponent, 'Comparison attackers')
  await owner.reload()
  await expect(owner.getByRole('button', { name: `Simulate against ${opponentName}`, exact: true })).toHaveCount(0)
  // Everyone sees the same readiness, and anyone playing may open the lists, not only the organizer.
  await opponent.reload()
  await expect(opponent.locator('[data-league-readiness]').getByRole('heading', { name: 'Everyone has sealed' })).toBeVisible()
  await expect(opponent.locator(`[data-person="${ownerName}"]`).getByText('Roster sealed', { exact: true })).toBeVisible()
  await revealEvent(opponent)
  await owner.reload()
  await expect(owner.locator('[data-league-armies]')).toContainText(`Revealed by ${opponentName}`)
  await owner.goto(savedUrl)
  await addUnit(owner, 'Skorpekh Destroyers')
  await owner.goto(leagueUrl)
  // Once revealed, each list is a card that opens in full or sets the reader's own list against it.
  const card = owner.locator(`[data-army="${opponentName}"]`)
  await expect(card).toContainText('Comparison attackers')
  await expect(viewRoster(card, opponentName)).toBeVisible()
  await expect(owner.locator(`[data-army="${ownerName}"]`).getByRole('button', { name: /^Simulate against/ })).toHaveCount(0)
  const plan = card.getByRole('button', { name: `Simulate against ${opponentName}`, exact: true })
  await plan.click()
  const dialog = owner.getByRole('dialog', { name: 'Combat simulator', exact: true })
  await expect(dialog.getByRole('combobox', { name: 'Attacking roster', exact: true })).toContainText(ownerName)
  await expect(dialog.getByRole('combobox', { name: 'Defending roster', exact: true })).toContainText(opponentName)
  const refreshSavedRoster = async (name: string) => {
    await owner.evaluate(() => {
      const table = document.querySelector('[role="dialog"] table')!
      const state = { removed: false }
      ;(window as Window & { comparisonRefreshProbe?: typeof state }).comparisonRefreshProbe = state
      new MutationObserver(() => {
        if (!table.isConnected) state.removed = true
      }).observe(document.body, { childList: true, subtree: true })
    })
    const editor = await ownerContext.newPage()
    await editor.goto(savedUrl)
    await waitForRosterSave(editor, () => editor.getByLabel('List name').fill(name), name)
    await editor.close()
    await owner.bringToFront()
    expect(
      await owner.evaluate(() => (window as Window & { comparisonRefreshProbe?: { removed: boolean } }).comparisonRefreshProbe?.removed),
    ).toBe(false)
  }
  const gate = await holdCombatCalculations(owner)
  await dialog.getByRole('button', { name: 'Run all matchups' }).click()
  await gate.waitForStart()
  await refreshSavedRoster('Updated saved roster during simulation')
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(dialog).toContainText('Cancelled')
  await gate.release()
  await dialog.getByRole('button', { name: 'Run again' }).click()
  await expect(dialog).toContainText('4 / 4 matchups · Complete')
  const table = dialog.getByRole('table')
  await expect(table.getByRole('cell')).toHaveCount(4)
  await expect(table).not.toContainText('Skorpekh Destroyers')
  await expect(table.getByRole('columnheader').nth(2)).toContainText('Lokhust Destroyers')
  await expect(dialog.getByRole('tab', { name: 'Shooting + melee' })).toHaveAttribute('aria-selected', 'true')
  await expect(dialog.getByRole('combobox', { name: 'Highlight matchups', exact: true })).toContainText('Best attackers per target')
  await owner.setViewportSize(PHONE)
  await expectNoPageOverflow(owner)
  await dialog.getByRole('button', { name: 'Close', exact: true }).click()
  const cachedGate = await holdCombatCalculations(owner)
  await plan.click()
  await expect(dialog).toContainText('4 / 4 matchups · Complete')
  await refreshSavedRoster('Updated saved roster after cache restoration')
  await expect(dialog).toContainText('4 / 4 matchups · Complete')
  expect(await owner.evaluate(() => window.PraetoriumCombatGate?.pending.length)).toBe(0)
  await cachedGate.release()
  await dialog.getByRole('button', { name: 'Close', exact: true }).click()
  await owner.reload()
  await expect(leagueHeader(owner)).toContainText('Rosters revealed')
  await expect(owner.locator(`[data-army="${ownerName}"]`)).toContainText('sealed')
  await owner.goto(savedUrl)
  await expect(owner.locator('[data-unit="Skorpekh Destroyers"]')).toBeVisible()
  await ownerContext.close()
  await opponentContext.close()
})

type TournamentEvent = { id: string; token: string; ownerId: string }

async function tournamentEvent(tournamentToken: string): Promise<TournamentEvent> {
  const [tournament] = await productSql<{
    owner_id: string
    event_id: string
  }>`SELECT owner_id, event_id FROM tournaments WHERE token = ${tournamentToken}`
  if (!tournament) throw new Error('The test tournament is missing.')
  const [event] = await productSql<{ token: string }>`SELECT token FROM sealed_events WHERE id = ${tournament.event_id}`
  if (!event) throw new Error('The test tournament event is missing.')
  return { id: tournament.event_id, token: event.token, ownerId: tournament.owner_id }
}

/** The card a fixture list chose and every card its detachments offered. */
type FixtureCards = { disposition: string; dispositions: string[] }

function snapshot(userId: string, limit: number, warlord: boolean, name: string, unitName: string, cards?: FixtureCards) {
  return JSON.stringify({
    name,
    text: `${limit.toLocaleString()} points`,
    built: {
      catalogueId: 'test-catalogue',
      revision: 'test-revision',
      limit,
      detachment: null,
      disposition: cards?.disposition ?? null,
      ...(cards ? { dispositions: cards.dispositions } : {}),
      units: [
        {
          key: `${userId}-unit`,
          name: unitName,
          points: 80,
          models: 1,
          group: 'character',
          warlord,
          warlordEligible: true,
        },
      ],
    },
  })
}

function option<T>(value: [number, T | []]): T | null {
  return value[0] === 0 ? (value[1] as T) : null
}

async function submitFixtureRoster(
  leagueToken: string,
  event: TournamentEvent,
  userId: string,
  limit: number,
  warlord: boolean,
  name: string,
  unitName = 'Test unit',
  cards?: FixtureCards,
) {
  const product = await productOperator()
  const now = Date.now()
  const rosterId = `${event.id}-${userId}-fixture`
  const saved = await product.saveRoster({
    id: rosterId,
    userId,
    name,
    catalogueId: 'test-catalogue',
    detachmentId: null,
    disposition: null,
    limit,
    picks: '[]',
    prep: null,
    tags: '[]',
    waivedRules: '[]',
    visibility: 'private',
    source: 'editable',
    now,
  })
  if (!saved) throw new Error('The league fixture roster was refused.')
  const result = await product.leagueCommand(
    {
      op: 'submit',
      token: leagueToken,
      eventToken: event.token,
      ownerId: event.ownerId,
      userId,
      rosterId,
      rosterName: name,
      rosterLimit: limit,
      rosterUpdatedAt: now,
      snapshot: snapshot(userId, limit, warlord, name, unitName, cards),
      now,
    },
    z.object({ outcome: z.string() }),
  )
  return result.outcome
}

/** Asks the server to reveal the current event directly, past the console's disabled button. */
async function revealThroughServer(leagueToken: string) {
  const event = await tournamentEvent(leagueToken)
  const product = await productOperator()
  const result = await product.leagueCommand(
    { op: 'reveal', token: leagueToken, ownerId: event.ownerId, eventToken: event.token, now: Date.now() },
    z.object({ outcome: z.string() }),
  )
  return result.outcome
}

async function sealEventRosters(leagueToken: string) {
  const event = await tournamentEvent(leagueToken)
  const entries = await productSql<{
    user_id: string
  }>`SELECT user_id FROM league_event_entries WHERE event_id = ${event.id} AND status = 'accepted'`
  if (entries.length !== 2) throw new Error('The league test entrants are missing.')
  for (const entry of entries) {
    if ((await submitFixtureRoster(leagueToken, event, entry.user_id, 2_000, true, 'Sealed roster')) !== 'sealed') {
      throw new Error('The league fixture roster was not sealed.')
    }
  }
}

async function createTournamentWithoutFormat(ownerName: string, leagueName: string) {
  const ownerId = await userIdNamed(ownerName)
  const token = crypto.randomUUID()
  const product = await productOperator()
  await product.leagueCommand(
    {
      op: 'create',
      id: crypto.randomUUID(),
      token,
      eventId: crypto.randomUUID(),
      eventToken: crypto.randomUUID(),
      ownerId,
      name: leagueName,
      description: '',
      visibility: 'public',
      admission: 'automatic',
      playerLimit: null,
      format: null,
      rosterLimit: null,
      now: Date.now(),
    },
    z.null(),
  )
  return token
}

async function seedRosters(playerName: string, values: { name: string; limit: number }[]) {
  const playerId = await userIdNamed(playerName)
  const now = Date.now()
  const product = await productOperator()
  for (const [index, value] of values.entries()) {
    const id = `${playerId}-${value.limit}-${index}`
    await product.saveRoster({
      id,
      userId: playerId,
      name: value.name,
      catalogueId: 'test-catalogue',
      detachmentId: null,
      disposition: null,
      limit: value.limit,
      picks: '[]',
      prep: null,
      tags: '[]',
      waivedRules: '[]',
      visibility: 'private',
      source: 'editable',
      now: now + index,
    })
  }
}

async function givePlayersTheSameName(existingName: string, playerName: string) {
  return withAuthSql((database) => {
    const existing = database.prepare('SELECT id FROM user WHERE name = ? LIMIT 1').get(existingName) as { id: string } | undefined
    const player = database.prepare('SELECT id FROM user WHERE name = ? LIMIT 1').get(playerName) as { id: string } | undefined
    if (!existing || !player) throw new Error('The duplicate-name test players are missing.')
    database.prepare('UPDATE user SET name = ? WHERE id = ?').run(existingName, player.id)
    return {
      existingLabel: `${existingName} · ${existing.id.slice(0, 8)}`,
      playerLabel: `${existingName} · ${player.id.slice(0, 8)}`,
    }
  })
}

/** The cards each 2v1 fixture list brings: the allies chose different ones, and only the first ally's detachment offers Priority Assets. */
const TEAM_EVENT_CARDS: FixtureCards[] = [
  { disposition: 'take-and-hold', dispositions: ['take-and-hold', 'priority-assets'] },
  { disposition: 'purge-the-foe', dispositions: ['purge-the-foe'] },
]

async function sealTeamEventRosters(leagueToken: string) {
  const event = await tournamentEvent(leagueToken)
  const entries = await productSql<{
    user_id: string
    required_limit: [number, number | []]
  }>`SELECT user_id, required_limit FROM league_event_entries WHERE event_id = ${event.id} AND status = 'accepted'`
  if (entries.length !== 3 || entries.some((entry) => option(entry.required_limit) === null)) {
    throw new Error('The team league assignments are incomplete.')
  }
  let allies = 0
  for (const entry of entries) {
    const limit = option(entry.required_limit)!
    const name = `${limit.toLocaleString()}-point roster`
    const cards = limit < 2_000 ? TEAM_EVENT_CARDS[allies++ % 2] : { disposition: 'take-and-hold', dispositions: ['take-and-hold'] }
    const outcome = await submitFixtureRoster(leagueToken, event, entry.user_id, limit, true, name, undefined, cards)
    if (outcome !== 'sealed') throw new Error(`The team league fixture roster returned ${outcome} for ${entry.user_id}.`)
  }
}

async function sealDoublesEventRosters(leagueToken: string, invalidWarlords = false) {
  const event = await tournamentEvent(leagueToken)
  const entries = await productSql<{
    user_id: string
    team_id: [number, string | []]
  }>`SELECT user_id, team_id FROM league_event_entries WHERE event_id = ${event.id} AND status = 'accepted'`
  if (entries.length !== 4 || entries.some((entry) => option(entry.team_id) === null)) throw new Error('The doubles teams are incomplete.')
  const seen = new Set<string>()
  for (const entry of entries) {
    const teamId = option(entry.team_id)!
    const first = !seen.has(teamId)
    seen.add(teamId)
    // Every doubles list names its own Warlord; the pair chooses whose leads it.
    const outcome = await submitFixtureRoster(
      leagueToken,
      event,
      entry.user_id,
      1_000,
      true,
      '1,000-point doubles roster',
      'Test character',
      TEAM_EVENT_CARDS[first ? 0 : 1],
    )
    if (outcome !== 'sealed') {
      throw new Error(`The doubles league fixture roster returned ${outcome}.`)
    }
  }
  if (invalidWarlords) {
    const outcome = await submitFixtureRoster(
      leagueToken,
      event,
      entries[0].user_id,
      1_000,
      false,
      '1,000-point doubles roster',
      'Test character',
    )
    if (outcome !== 'invalid-warlords') throw new Error(`A doubles list without a Warlord was sealed: ${outcome}.`)
  }
}

/** Waits for the event page, which the previous page stays in front of until the league loads. */
test('a Swiss tournament pairs its rounds and ranks the tables by match points', async ({ browser }, testInfo) => {
  const ownerContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const opponentContext = await browser.newContext()
  const owner = await ownerContext.newPage()
  const opponent = await opponentContext.newPage()
  const ownerName = uniqueName('Swiss organizer')
  await signUp(owner, ownerName)
  await signUp(opponent, uniqueName('Swiss opponent'))
  await sealableRoster(owner, 'Swiss army')
  await sealableRoster(opponent, 'Swiss opponent army')
  await owner.goto('/tournaments')
  const create = await openLeagueCreation(owner)
  await create.getByLabel('Name').fill(uniqueName('Swiss open'))
  await create.getByRole('button', { name: /^Swiss rounds/ }).click()
  await submitLeagueCreation(owner, create)
  const url = owner.url()
  await join(owner)
  await sealOwnRoster(owner, 'Swiss army')
  await opponent.goto(url)
  await join(opponent)
  await sealOwnRoster(opponent, 'Swiss opponent army')
  await revealEvent(owner)

  const rounds = owner.locator('[data-league-rounds]')
  await rounds.getByRole('button', { name: 'Pair round 1' }).click()
  await expect(rounds.locator('[data-table="1"]')).toBeVisible()
  await rounds.locator('[data-table="1"]').getByRole('button', { name: 'Start battle' }).click()
  await owner.waitForURL(/\/battles\/[^/]+$/)

  // Settle the table in its log: the rounds are under test, not the game.
  const battlePath = new URL(owner.url()).pathname
  const battleId = await battleIdFor(lastPathSegment(owner.url()))
  const [first, second] = await seatsBySide(battleId)
  await owner.goto(url)
  await expect(owner.locator('[data-entry-status]').getByRole('link', { name: 'Resume battle' })).toHaveAttribute('href', battlePath)
  for (const [by, command] of [
    [first, { kind: 'begin-battle', firstPlayerId: first }],
    [second, { kind: 'end-battle', reason: 'conceded', concededBy: second }],
  ] as [string, Command][])
    await appendCommand(battleId, by, command)

  await owner.reload()
  await expect(owner.locator('[data-league-results] tbody tr').first()).toContainText(ownerName)
  await rounds.getByRole('button', { name: 'Pair round 2' }).click()
  await expect(rounds.getByText('Round 2 of 3')).toBeVisible()
  await expect(rounds.locator('[data-table="1"]').first()).toContainText('Rematch')
  await expect(rounds.getByText('Results from earlier rounds are locked once the next round is paired.')).toBeVisible()
  await owner.screenshot({ path: testInfo.outputPath('swiss-rounds.png'), fullPage: true })
  await opponent.goto(url)
  await expect(opponent.locator('[data-league-rounds]').getByText('Results locked')).toBeVisible()
  await expect(opponent.locator('[data-league-rounds]').getByRole('button', { name: /^Reopen table/ })).toHaveCount(0)

  // Rounds list latest first, so round 1's table is the last one.
  const lockedTable = rounds.locator('[data-table="1"]').last()
  await lockedTable.getByRole('button', { name: 'Reopen table 1' }).click()
  const reopen = owner.getByRole('alertdialog', { name: 'Reopen table 1?' })
  await owner.screenshot({ path: testInfo.outputPath('swiss-reopen.png') })
  await reopen.getByRole('button', { name: 'Reopen result' }).click()
  await expect(reopen).toBeHidden()
  await expect(lockedTable).toContainText('Playing')
  await ownerContext.close()
  await opponentContext.close()
})

async function eventLoaded(page: Page) {
  await expect(page.locator('[data-entry-status]')).toBeVisible()
}

/** Joining a duel opens the chooser by itself, so a press on the status card can land under it; each try is short and retried. */
async function openRosterChooser(page: Page) {
  const chooser = page.getByRole('dialog', { name: 'Seal a roster' })
  const choose = page.getByRole('button', { name: /^(?:Choose a roster|Swap roster)$/ })
  await expect(async () => {
    if (!(await chooser.isVisible())) await choose.click({ timeout: 1_000 })
    await expect(chooser).toBeVisible({ timeout: 1_000 })
  }).toPass({ timeout: 15_000 })
}

async function chooseRosterToSeal(page: Page, rosterName: string) {
  const chooser = page.getByRole('dialog', { name: 'Seal a roster' })
  await chooser.locator(`[data-roster="${rosterName}"]`).click()
  await chooser.getByRole('button', { name: `Seal ${rosterName}` }).click()
}

async function sealOwnRoster(page: Page, rosterName: string) {
  await eventLoaded(page)
  await openRosterChooser(page)
  await chooseRosterToSeal(page, rosterName)
  await expect(page.getByRole('dialog', { name: 'Seal a roster' })).toBeHidden()
}

async function revealEvent(owner: Page) {
  await eventLoaded(owner)
  await owner.locator('[data-entry-status]').getByRole('button', { name: 'Reveal all rosters' }).click()
  await owner.getByRole('alertdialog', { name: 'Reveal every roster?' }).getByRole('button', { name: 'Reveal all rosters' }).click()
  await expect(leagueHeader(owner)).toContainText('Rosters revealed')
}

/** The link to a player's roster, on a revealed list's card or an ally's row. */
function viewRoster(scope: Page | Locator, name: string) {
  return scope.getByRole('link', { name: `View ${name}’s roster` })
}

/** Joins the open event as a player, pressing again while hydration swallows the press. */
async function join(page: Page) {
  await eventLoaded(page)
  const button = page.getByRole('button', { name: /^(?:Join tournament|Join as a player)$/ })
  await expect(async () => {
    if (!(await button.isVisible())) return
    await button.click({ timeout: 2_000 })
    await expect(button).toBeHidden({ timeout: 3_000 })
  }).toPass({ timeout: 20_000 })
}

async function expectWithinPage(page: Page, ...elements: Locator[]) {
  const documentWidth = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }))
  const overflow = await page.locator('body *').evaluateAll((nodes) =>
    nodes
      .map((node) => {
        const element = node as HTMLElement
        const bounds = element.getBoundingClientRect()
        return { className: element.className, left: bounds.left, right: bounds.right, scrollWidth: element.scrollWidth }
      })
      .filter((element) => element.left < 0 || element.right > document.documentElement.clientWidth)
      .slice(0, 12),
  )
  expect(documentWidth.scrollWidth, JSON.stringify(overflow)).toBe(documentWidth.clientWidth)
  for (const element of elements) {
    const visibleOverflow = await element.evaluate((node) => {
      const container = node.getBoundingClientRect()
      return [...node.querySelectorAll('*')]
        .map((child) => {
          const bounds = child.getBoundingClientRect()
          return { className: child.className, height: bounds.height, left: bounds.left, right: bounds.right, width: bounds.width }
        })
        .filter((child) => child.height > 1 && child.width > 1 && (child.left < container.left || child.right > container.right))
        .slice(0, 12)
    })
    expect(visibleOverflow).toEqual([])
  }
}

/** The page header reads left to right as label, avatar, then the organizer's name. */
async function expectOrganizerAvatar(row: Locator, ownerName: string) {
  const avatar = row.locator('img').first()
  await expect(avatar).toHaveAttribute('src', /\/avatars\/[0-9a-f]+\.jpg$/)
  const [label, image, name] = await Promise.all([
    row.getByText('Organized by', { exact: true }).boundingBox(),
    avatar.boundingBox(),
    row.getByText(ownerName, { exact: true }).boundingBox(),
  ])
  expect(label!.x).toBeLessThan(image!.x)
  expect(image!.x).toBeLessThan(name!.x)
}

async function submitLeagueCreation(page: Page, dialog: Locator) {
  await dialog.getByRole('button', { name: 'Create tournament' }).click()
  await expect(page).toHaveURL(/\/tournaments\/[^/?]+/)
  await eventLoaded(page)
}

/** Opens the new-league form; the organizer stays out of the event unless a test asks them to play, so joining stays explicit. */
async function openLeagueCreation(page: Page, { ownerPlays = false } = {}) {
  const dialog = page.getByRole('dialog', { name: 'New tournament' })
  await expect(async () => {
    await page.getByRole('button', { name: 'New tournament' }).click()
    await expect(dialog).toBeVisible({ timeout: 1_000 })
  }).toPass({ timeout: 10_000 })
  const plays = dialog.getByRole('switch', { name: /I’m playing too/ })
  if ((await plays.isChecked()) !== ownerPlays) await plays.click()
  // Details, places, listing and admission fold under More options; tests that set them need it open.
  await dialog.getByText('More options', { exact: true }).click()
  await expect(dialog.getByLabel('Player limit')).toBeVisible()
  return dialog
}

async function openEventSettings(page: Page) {
  await eventLoaded(page)
  const settings = page.getByRole('dialog', { name: 'Edit tournament' })
  // A press before hydration does nothing, so retry it until the dialog answers.
  await expect(async () => {
    if (!(await settings.isVisible())) await page.getByRole('button', { name: 'Edit tournament' }).click()
    await expect(settings.getByLabel('Name')).toBeVisible({ timeout: 2_000 })
  }).toPass({ timeout: 20_000 })
  return settings
}

function leagueHeader(page: Page) {
  return page.locator('main header')
}

test('an event seals Legends only once its organizer allows them', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await signUp(page, uniqueName('Organizer'))
  const rosterName = uniqueName('Legends list')
  await sealableRoster(page, rosterName)
  await page.getByRole('button', { name: 'Legends', exact: true }).click()
  await page.getByLabel('Add a unit').fill('Tesseract Ark')
  await waitForRosterSave(page, () => page.getByRole('button', { name: 'Add Tesseract Ark [Legends]', exact: true }).click())
  await page.goto('/tournaments')
  const create = await openLeagueCreation(page, { ownerPlays: true })
  await create.getByLabel('Name').fill(uniqueName('Tuesday league'))
  await expect(create.getByRole('button', { name: 'House rules' })).toHaveAccessibleDescription('Matched play')
  await create.screenshot({ path: testInfo.outputPath('league-allowances.png') })
  await submitLeagueCreation(page, create)
  await expect(leagueHeader(page)).toContainText('Matched play')

  const chooser = page.getByRole('dialog', { name: 'Seal a roster' })
  await openRosterChooser(page)
  await chooseRosterToSeal(page, rosterName)
  await expect(chooser).toContainText('This event doesn’t allow Legends datasheets, such as Tesseract Ark.')
  await page.keyboard.press('Escape')
  await expect(chooser).toBeHidden()

  const settings = await openEventSettings(page)
  await settings.getByRole('button', { name: 'House rules' }).click()
  await page.getByRole('menuitemcheckbox', { name: /^Legends/ }).click()
  await page.keyboard.press('Escape')
  await expect(settings.getByRole('button', { name: 'House rules' })).toHaveAccessibleDescription('Legends allowed')
  await settings.getByRole('button', { name: 'Save changes' }).click()
  await expect(settings).toBeHidden()
  await expect(leagueHeader(page)).toContainText('Legends allowed')
  await sealOwnRoster(page, rosterName)
})

test('an admin the owner chooses runs the league but cannot delete it', async ({ browser }) => {
  const [ownerContext, adminContext] = await Promise.all([browser.newContext(), browser.newContext()])
  const [owner, admin] = await Promise.all([ownerContext.newPage(), adminContext.newPage()])
  const ownerName = uniqueName('AdminOwner')
  const adminName = uniqueName('LeagueAdmin')
  await signUp(owner, ownerName)
  await signUp(admin, adminName)
  await befriend(owner, admin)
  await owner.goto('/tournaments')
  const create = await openLeagueCreation(owner)
  await create.getByLabel('Name').fill(uniqueName('Shared league'))
  await submitLeagueCreation(owner, create)

  const settings = await openEventSettings(owner)
  await settings.getByLabel('Admins').click()
  await owner.getByRole('option', { name: adminName }).click()
  await expect(settings.getByRole('button', { name: `Remove ${adminName} as an admin` })).toBeVisible()
  await expectWithinPage(owner, settings)
  await settings.getByRole('button', { name: 'Save changes' }).click()
  await expect(settings).toBeHidden()
  await expect(owner.locator('main header').getByRole('link', { name: adminName })).toBeVisible()

  await admin.goto(owner.url())
  await eventLoaded(admin)
  await expect(admin.getByRole('button', { name: 'Edit tournament' })).toBeVisible()
  await expect(admin.getByRole('button', { name: /^More for / })).toHaveCount(0)
  const adminSettings = await openEventSettings(admin)
  await expect(adminSettings.getByLabel('Admins')).toHaveCount(0)

  await Promise.all([ownerContext.close(), adminContext.close()])
})

test('a full league keeps its lists sealed until someone reveals them', async ({ browser }) => {
  const [ownerContext, opponentContext] = await Promise.all([browser.newContext(), browser.newContext()])
  const [owner, opponent] = await Promise.all([ownerContext.newPage(), opponentContext.newPage()])
  const ownerName = uniqueName('FullOwner')
  const opponentName = uniqueName('FullOpponent')
  await signUp(owner, ownerName)
  await signUp(opponent, opponentName)
  await sealableRoster(owner, 'Full owner list')
  await sealableRoster(opponent, 'Full opponent list')
  await owner.goto('/tournaments')
  const create = await openLeagueCreation(owner, { ownerPlays: true })
  await create.getByLabel('Name').fill(uniqueName('Full league'))
  await create.getByLabel('Player limit').fill('2')
  await submitLeagueCreation(owner, create)
  await sealOwnRoster(owner, 'Full owner list')
  await expect(owner.getByRole('heading', { name: 'Your roster is sealed' })).toBeVisible()

  // A duel asks nothing of the organizer before a list, so joining opens the chooser.
  await opponent.goto(owner.url())
  await join(opponent)
  await expect(opponent.getByRole('dialog', { name: 'Seal a roster' })).toBeVisible()
  await chooseRosterToSeal(opponent, 'Full opponent list')

  // Filling the last place does not open the lists; someone playing still chooses to.
  await expect(opponent.getByRole('heading', { name: 'Your roster is sealed' })).toBeVisible()
  await expect(leagueHeader(opponent)).not.toContainText('Rosters revealed')
  await owner.reload()
  await expect(owner.locator('[data-entry-status]').getByRole('button', { name: 'Reveal all rosters' })).toBeEnabled()

  await Promise.all([ownerContext.close(), opponentContext.close()])
})

test('a league names its next step, which moves on once a player joins', async ({ browser }) => {
  const ownerContext = await browser.newContext()
  const playerContext = await browser.newContext()
  const owner = await ownerContext.newPage()
  const player = await playerContext.newPage()
  await signUp(owner, uniqueName('Next step organizer'))
  await signUp(player, uniqueName('Next step player'))
  await owner.goto('/tournaments')
  const create = await openLeagueCreation(owner)
  await create.getByLabel('Name').fill(uniqueName('Next step league'))
  await create.getByRole('button', { name: /^Anyone who joins/ }).click()
  await submitLeagueCreation(owner, create)
  const nextStep = owner.locator('[data-league-next-step]')
  await expect(nextStep).toHaveText('Next: Copy the invite link and send it to your group.')

  await player.goto(owner.url())
  await join(player)
  await owner.reload()
  await expect(nextStep).toHaveText('Next: Players seal their rosters. Nobody sees another list, you included, until the reveal.')
  await ownerContext.close()
  await playerContext.close()
})

test('a new league starts with its first event and can seal a roster', async ({ page }) => {
  const ownerName = uniqueName('LeagueOwner')
  const leagueName = uniqueName('Home League')

  await signUp(page, ownerName)
  const rosterName = await createRoster(page, {
    faction: 'Black Templars',
    detachment: /Marshal's Household/,
    name: 'Templar roster',
  })
  await addUnit(page, 'Captain')
  // The Captain becomes the Warlord on its own; the refused seal below needs a list without one.
  await page.locator('[data-unit="Captain"]').getByRole('button', { name: 'Captain', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Remove Captain Warlord' })).toHaveAttribute('aria-pressed', 'true')
  await waitForRosterSave(page, () => page.getByRole('button', { name: 'Remove Captain Warlord' }).click())
  await page.goto('/tournaments')
  const create = await openLeagueCreation(page, { ownerPlays: true })
  await create.getByLabel('Name').fill(leagueName)
  await expect(create.getByText('One-off', { exact: true })).toHaveCount(0)
  await expect(create.getByText('Recurring', { exact: true })).toHaveCount(0)
  await create.getByRole('button', { name: /^Anyone who joins/ }).click()
  await submitLeagueCreation(page, create)
  // An organizer who plays is entered by creating the event, so the first thing they can do is seal a list.
  await expect(page.getByRole('button', { name: 'Choose a roster' })).toBeVisible()
  await expectNoPageOverflow(page)
  const initialResponse = await page.request.get(page.url())
  expect(await initialResponse.text()).not.toContain(rosterName)
  await page.reload()

  await expect(page.getByRole('heading', { name: 'Seal your 2,000-point roster' })).toBeVisible()
  await page.getByRole('button', { name: 'Choose a roster' }).click()
  const chooser = page.getByRole('dialog', { name: 'Seal a roster' })
  const roster = chooser.locator(`[data-roster="${rosterName}"]`)
  await expect(roster.getByText('Black Templars', { exact: true })).toBeVisible()
  await expect(roster.getByText("Marshal's Household", { exact: true })).toBeVisible()
  await expect(chooser.getByRole('button', { name: 'Choose a roster to seal' })).toBeDisabled()
  await roster.click()
  await expect(roster).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('alert')).toHaveCount(0)
  await chooser.getByRole('button', { name: `Seal ${rosterName}` }).click()
  await expect(page.getByRole('alert')).toHaveText('fix roster errors before using it: Army: needs a Warlord')
  await expect(chooser.getByRole('link', { name: `Edit ${rosterName}` })).toHaveAttribute('href', /^\/rosters\/[^/]+$/)
  await page.setViewportSize(PHONE)
  await expectNoPageOverflow(page)
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.keyboard.press('Escape')

  await expect(page.locator(`[data-person="${ownerName}"]`)).toBeVisible()

  await page.setViewportSize(PHONE)
  await expectNoPageOverflow(page)
})

for (const { rules, status } of [
  { rules: undefined, status: 'current' },
  { rules: 'MFM 1.4 · Archived', status: 'archived' },
]) {
  test(`seals ${status} rules rosters in a league and preserves the selected catalogue`, async ({ page }) => {
    const ownerName = uniqueName('Version owner')
    const { email } = await signUp(page, ownerName)
    const rosterName = `${status} league roster`
    if (status === 'archived') {
      const userId = await userIdFor(email)
      const id = crypto.randomUUID()
      await (
        await productOperator()
      ).saveRoster({
        id,
        userId,
        name: rosterName,
        catalogueId: '470a-6daa-9014-12df',
        detachmentId: JSON.stringify(['9d23-833a-17cb-2d7d']),
        disposition: 'priority-assets',
        limit: 2000,
        picks: '[]',
        prep: null,
        tags: '[]',
        waivedRules: '[]',
        visibility: 'private',
        source: 'editable',
        now: Date.now(),
      })
      await page.goto(`/rosters/${id}`)
    } else {
      await createRoster(page, { faction: 'Adeptus Custodes', detachment: /Aquilan Shield/, name: rosterName, rules })
    }
    const unit = status === 'archived' ? 'Captain' : 'Blade Champion'
    await page.getByLabel('Add a unit').fill(unit)
    await page
      .getByRole('button', { name: `Add ${unit}`, exact: true })
      .first()
      .click()
    await page.locator(`[data-unit="${unit}"]`).getByRole('button', { name: unit, exact: true }).click()
    await makeWarlord(page, unit)
    const operator = await productOperator()
    const saved = (await operator.roster(lastPathSegment(page.url())))!
    await page.goto('/tournaments')
    const create = await openLeagueCreation(page)
    await create.getByLabel('Name').fill(uniqueName('Rules league'))
    await create.getByRole('button', { name: /^Anyone who joins/ }).click()
    await submitLeagueCreation(page, create)
    await join(page)
    await sealOwnRoster(page, rosterName)
    await page.reload()
    const entry = page.locator(`[data-person="${ownerName}"]`)
    await expect(entry.getByText('Roster sealed', { exact: true })).toBeVisible()
    const leagueToken = lastPathSegment(page.url())
    const sealed = await operator.leagueRosters(leagueToken, saved.userId)
    expect(JSON.parse(sealed!.entry.rosterSnapshot!).built.catalogueId).toBe(saved.catalogueId)
    await revealEvent(page)
    await viewRoster(page, ownerName).click()
    await expect(page).toHaveURL(/\/rosters\/[^?]+\?league=/)
    if (status === 'current') await expect(page.locator('main header [data-rules-version]')).toHaveCount(0)
    await expect(page.locator(`[data-unit="${unit}"]`)).toBeVisible()
    await page.reload()
    await expect(page.locator(`[data-unit="${unit}"]`)).toBeVisible()
    if (status === 'current') await expect(page.locator('main header [data-rules-version]')).toHaveCount(0)
  })
}

test('only a changed roster in an open league event offers replacement', async ({ page }) => {
  await signUp(page, uniqueName('RosterOwner'))
  await sealableRoster(page, 'Original league list')
  const rosterUrl = page.url()
  await page.goto('/tournaments')
  const create = await openLeagueCreation(page)
  await create.getByLabel('Name').fill(uniqueName('Replacement league'))
  await create.getByRole('button', { name: /^Anyone who joins/ }).click()
  await submitLeagueCreation(page, create)
  await join(page)
  await sealOwnRoster(page, 'Original league list')

  const leagueToken = lastPathSegment(page.url())
  await page.goto(`/tournaments/${leagueToken}`)
  await expect(page.getByRole('heading', { name: 'Your roster is sealed' })).toBeVisible()
  const settings = await openEventSettings(page)
  await settings.getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.goto('/robots.txt')
  // The tournament reopens below from the saved app snapshot alone, so wait until the snapshot holds it.
  await expect
    .poll(() =>
      page.evaluate(
        (token) =>
          new Promise<boolean>((resolve, reject) => {
            const opened = indexedDB.open('praetorium-app', 1)
            opened.onerror = () => reject(opened.error)
            opened.onsuccess = () => {
              const database = opened.result
              const request = database.transaction('state').objectStore('state').get('snapshot')
              request.onsuccess = () => {
                database.close()
                const queries: { key: unknown[]; data?: { entries?: unknown } }[] = request.result?.snapshot?.queries ?? []
                resolve(
                  queries.some(
                    (query) => query.key[0] === 'league' && query.key[1] === token && query.key[2] === 'current' && query.data?.entries,
                  ),
                )
              }
              request.onerror = () => {
                database.close()
                reject(request.error)
              }
            }
          }),
        leagueToken,
      ),
    )
    .toBe(true)
  await page.route('**/_serverFn/**', (route) => (route.request().method() === 'GET' ? route.abort('failed') : route.continue()))
  await page.goto('/')
  await page.locator('[data-web-app-chrome]').getByRole('button', { name: 'Events', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Tournaments', exact: true }).click()
  await page.locator(`[data-league="${leagueToken}"]`).getByRole('link').click()
  await expect(page.getByRole('heading', { name: 'Your roster is sealed' })).toBeVisible()
  const restoredSettings = await openEventSettings(page)
  await restoredSettings.getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.unrouteAll({ behavior: 'wait' })

  const editorResponse = await page.request.get(rosterUrl)
  expect(await editorResponse.text()).not.toContain('Sealed roster out of date')
  await page.goto(rosterUrl)
  await expect(page.getByLabel('List name')).toHaveValue('Original league list')
  await expect(page.getByRole('button', { name: 'Sealed roster out of date' })).toHaveCount(0)
  await page.setViewportSize(PHONE)
  await waitForRosterSave(page, () => page.getByLabel('List name').fill('Updated league list'), 'Updated league list')
  const footer = page.locator('footer')
  const update = footer.getByRole('button', { name: 'Sealed roster out of date' })
  await expect(update).toBeVisible()
  await waitForRosterSave(page, () => page.getByLabel('List name').fill('Original league list'), 'Original league list')
  await expect(update).toHaveCount(0)
  await waitForRosterSave(page, () => page.getByLabel('List name').fill('Updated league list'), 'Updated league list')
  await expect(update).toBeVisible()
  await expectNoPageOverflow(page)
  const footerHeight = (await footer.boundingBox())?.height
  await update.click()
  await expect(page.getByText('Your changes are not in the sealed roster yet.')).toBeVisible()
  expect((await footer.boundingBox())?.height).toBe(footerHeight)
  await page.getByRole('link', { name: 'Replace sealed roster' }).click()
  const chooser = page.getByRole('dialog', { name: 'Seal a roster' })
  await expect(chooser).toBeVisible()
  await chooseRosterToSeal(page, 'Updated league list')
  await expect(chooser).toBeHidden()
  await expect(page.getByRole('heading', { name: 'Your roster is sealed' })).toBeVisible()
  await page.goto(rosterUrl)
  await expect(page.getByRole('button', { name: 'Sealed roster out of date' })).toHaveCount(0)
})

test('the organizer unseals a revealed roster so its entrant can seal a corrected one', async ({ browser }) => {
  const ownerContext = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const entrantContext = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const owner = await ownerContext.newPage()
  const entrant = await entrantContext.newPage()
  const ownerName = uniqueName('UnsealOwner')
  const entrantName = uniqueName('UnsealEntrant')

  await signUp(owner, ownerName)
  await signUp(entrant, entrantName)
  await sealableRoster(owner, 'Organizer list')
  const organizerRosterUrl = owner.url()
  await sealableRoster(entrant, 'Mistaken list')
  await sealableRoster(entrant, 'Corrected list', { extraUnit: 'Lokhust Destroyers' })
  await owner.goto('/tournaments')
  const create = await openLeagueCreation(owner)
  await create.getByLabel('Name').fill(uniqueName('Unseal League'))
  await create.getByRole('button', { name: /^Anyone who joins/ }).click()
  await submitLeagueCreation(owner, create)
  const leagueUrl = new URL(owner.url())
  leagueUrl.search = ''
  await join(owner)
  await sealOwnRoster(owner, 'Organizer list')
  await entrant.goto(leagueUrl.toString())
  await join(entrant)
  await sealOwnRoster(entrant, 'Mistaken list')
  await owner.reload()
  await revealEvent(owner)
  await owner.goto(organizerRosterUrl)
  await waitForRosterSave(owner, () => owner.getByLabel('List name').fill('Organizer list revised'), 'Organizer list revised')
  await expect(owner.getByRole('button', { name: 'Sealed roster out of date' })).toHaveCount(0)
  await owner.goto(leagueUrl.toString())
  // Revealed players show with their lists, which carry the organizer's unseal control; the entrant list is gone.
  const entrantCard = owner.locator(`[data-army="${entrantName}"]`)
  await expect(entrantCard).toContainText('sealed')
  await expect(owner.locator(`[data-person="${entrantName}"]`)).toHaveCount(0)
  await owner.setViewportSize(PHONE)
  await expectWithinPage(owner)
  await owner.setViewportSize({ width: 1440, height: 900 })

  const unseal = entrantCard.getByRole('button', { name: `Unseal ${entrantName}’s roster`, exact: true })
  await expect(unseal).toHaveText('')
  await unseal.hover()
  await expect(owner.getByRole('tooltip')).toHaveText('Unseal roster')
  await expect(entrantCard.getByRole('button').first()).toHaveAccessibleName(`Unseal ${entrantName}’s roster`)
  await unseal.click()
  const confirm = owner.getByRole('alertdialog', { name: `Unseal ${entrantName}’s roster?` })
  await expectWithinPage(owner, confirm)
  await confirm.getByRole('button', { name: 'Unseal roster' }).click()

  await expect(entrantCard.getByText(/^No roster yet/)).toBeVisible()
  await expect(viewRoster(owner, entrantName)).toHaveCount(0)

  await entrant.reload()
  await expect(entrant.getByText('The organizer unsealed your roster.')).toBeVisible()
  await expect(entrant.getByRole('button', { name: 'Start 1 vs 1 battle' })).toHaveCount(0)
  await expect(entrant.getByRole('button', { name: /^(?:Unseal|More for) / })).toHaveCount(0)
  await expectWithinPage(entrant)

  await sealOwnRoster(entrant, 'Corrected list')
  await expect(entrant.getByRole('button', { name: 'Start 1 vs 1 battle' })).toBeVisible()
  // After the reveal an entrant reads their own sealed copy like anyone else's.
  await expect(viewRoster(entrant, entrantName)).toBeVisible()
  await owner.reload()
  await expect(entrantCard).toContainText('Corrected list')
  await viewRoster(owner, entrantName).click()
  await expect(owner.locator('[data-unit="Lokhust Destroyers"]')).toBeVisible()
  await ownerContext.close()
  await entrantContext.close()
})

test('an eligible casual matchup is directed through its league event', async ({ browser }) => {
  const ownerContext = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const entrantContext = await browser.newContext()
  const owner = await ownerContext.newPage()
  const entrant = await entrantContext.newPage()
  const ownerName = uniqueName('LeagueOwner')
  const entrantName = uniqueName('LeagueEntrant')
  const leagueName = uniqueName('Guarded League')

  await signUp(owner, ownerName)
  await signUp(entrant, entrantName)
  await befriend(owner, entrant)
  const leagueToken = await createTournamentWithoutFormat(ownerName, leagueName)
  const leagueUrl = new URL(`/tournaments/${leagueToken}`, owner.url())
  await owner.goto(leagueUrl.toString())

  await join(owner)
  await entrant.goto(leagueUrl.toString())
  await join(entrant)
  await sealEventRosters(leagueToken)
  await owner.reload()
  await revealEvent(owner)
  await owner.reload()
  await eventLoaded(owner)
  await expect(owner.getByRole('button', { name: 'Start 1 vs 1 battle' })).toBeVisible()
  await expectWithinPage(owner)

  await owner.goto('/battles')
  await owner.getByRole('button', { name: 'New battle' }).waitFor()
  const events = await recordEvents(owner)
  await owner.getByRole('button', { name: 'New battle' }).click()
  const casual = owner.getByRole('dialog', { name: 'Start a battle' })
  await chooseOption(owner, 'Opponent', entrantName)
  await casual.getByRole('button', { name: 'Start battle' }).click()
  const warning = owner.getByRole('dialog', { name: 'You are both in a tournament' })
  await expect(warning.getByRole('button', { name: 'Play it casually' })).toBeVisible()
  await expectWithinPage(owner, warning)
  await owner.setViewportSize(PHONE)
  await expectWithinPage(owner, warning)
  await warning.getByRole('button', { name: new RegExp(leagueName) }).click()

  const leagueChooser = owner.getByRole('dialog', { name: 'Start 1 vs 1 battle' })
  await expect(leagueChooser).toBeVisible()
  await expect(leagueChooser.getByRole('combobox', { name: 'Opponent' })).toContainText(entrantName)
  await leagueChooser.getByRole('button', { name: 'Start battle' }).click()
  await expect(owner).toHaveURL(/\/battles\/[^/?]+$/)
  expect(events.filter((event) => event.properties.source === 'league')).toEqual([
    { name: 'battle_creation_started', properties: { source: 'league' } },
    { name: 'battle_creation_submitted', properties: { format: '1v1', source: 'league' } },
  ])
  await owner.goto(leagueUrl.toString())
  await eventLoaded(owner)
  await expect(owner.locator('[data-battle-shelf="Battles"]')).toContainText(entrantName)

  await ownerContext.close()
  await entrantContext.close()
})

test('a revealed roster keeps its selected upgrades and reference metadata', async ({ browser }) => {
  const ownerContext = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const owner = await ownerContext.newPage()
  const ownerName = uniqueName('RosterOwner')
  const rosterName = 'Revealed Necrons'

  await signUp(owner, ownerName)
  await createRoster(owner, { faction: 'Necrons', detachment: /Cursed Legion/, name: rosterName })
  await owner.getByLabel('Add a unit').fill('Skorpekh Lord')
  await owner.getByRole('button', { name: 'Add Skorpekh Lord', exact: true }).first().click()
  await owner.locator('[data-unit="Skorpekh Lord"]').getByRole('button', { name: 'Skorpekh Lord', exact: true }).click()
  await waitForRosterSave(owner, () => owner.getByRole('button', { name: 'Select Mark of the Nekrosor' }).click())
  await makeWarlord(owner, 'Skorpekh Lord')

  const setup = await openRosterSetup(owner)
  await setup.getByRole('button', { name: 'Select Skyshroud Spearhead' }).click()
  await waitForRosterSave(owner, () => confirmRosterSetup(setup))

  await owner.getByLabel('Add a unit').fill('Lokhust Destroyers')
  await owner.getByRole('button', { name: 'Add Lokhust Destroyers', exact: true }).first().click()
  await owner.locator('[data-unit="Lokhust Destroyers"]').getByRole('button', { name: 'Lokhust Destroyers', exact: true }).click()
  await waitForRosterSave(owner, () => owner.getByRole('button', { name: 'Select Deepening Madness' }).click())

  await owner.goto('/tournaments')
  const create = await openLeagueCreation(owner)
  await create.getByLabel('Name').fill(uniqueName('Roster reveal'))
  await create.getByRole('button', { name: /^Anyone who joins/ }).click()
  await submitLeagueCreation(owner, create)
  await join(owner)
  await sealOwnRoster(owner, rosterName)
  await expect(owner.getByRole('heading', { name: 'Your roster is sealed' })).toBeVisible()
  await revealEvent(owner)

  await viewRoster(owner, ownerName).click()
  await expect(owner).toHaveURL(/\/rosters\//)
  const guestContext = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const guest = await guestContext.newPage()
  await guest.goto(owner.url())

  const header = guest.locator('[data-roster-builder] > header')
  await expect(header.getByText('Strike Force', { exact: true })).toBeVisible()
  await expect(header.getByRole('link', { name: 'Strike Force' })).toHaveCount(0)
  await expect(header.getByRole('link', { name: /Cursed Legion · \d DP/ })).toHaveAttribute(
    'href',
    '/factions/necrons/rules/mfm-1-6/detachments/cursed-legion',
  )
  await expect(header.getByRole('link', { name: 'Purge the Foe', exact: true })).toHaveAttribute(
    'href',
    '/force-dispositions/purge-the-foe',
  )

  await guest.locator('[data-unit="Skorpekh Lord"]').getByRole('button', { name: 'Skorpekh Lord', exact: true }).click()
  const unit = guest.locator('aside[aria-label="Loadout"]')
  await expect(unit.getByText('Mark of the Nekrosor', { exact: true })).toBeVisible()
  await guest.locator('[data-unit="Lokhust Destroyers"]').getByRole('button', { name: 'Lokhust Destroyers', exact: true }).click()
  await expect(unit.getByText('Deepening Madness', { exact: true })).toBeVisible()
  await expectNoPageOverflow(guest)

  const rosterUrl = guest.url()
  const lokhustButton = guest.locator('[data-unit="Lokhust Destroyers"]').getByRole('button', {
    name: 'Lokhust Destroyers',
    exact: true,
  })
  await guest.setViewportSize(PHONE)
  const rosterUnits = guest.locator('[data-slot="roster-units"]')
  await expectNoPageOverflow(guest)
  await expectNoHorizontalOverflow(rosterUnits)
  await expect(unit).toHaveCSS('position', 'fixed')
  await expect(unit.getByText('Deepening Madness', { exact: true })).toBeVisible()
  await expectNoPageOverflow(guest)
  await expectNoHorizontalOverflow(unit)

  await guest.goBack()
  await expect(guest).toHaveURL(rosterUrl)
  await expect(unit).toBeHidden()
  await expect(lokhustButton).toBeFocused()

  await guest.goForward()
  await expect(unit).toBeVisible()
  await expect(unit.getByText('Deepening Madness', { exact: true })).toBeVisible()

  await guest.setViewportSize({ width: 1024, height: 768 })
  await expect(unit).toHaveCSS('position', 'static')
  await expect(guest).toHaveURL(rosterUrl)
  await expect(lokhustButton).toBeFocused()

  await guest.setViewportSize(PHONE)
  await expect(unit).toHaveCSS('position', 'fixed')
  await expect(unit.getByRole('button', { name: 'Back to roster' })).toBeFocused()
  await unit.getByRole('button', { name: 'Back to roster' }).click()
  await expect(guest).toHaveURL(rosterUrl)
  await expect(unit).toBeHidden()

  await guestContext.close()
  await ownerContext.close()
})

test('an organizer edits and deletes a league from its card actions', async ({ browser }) => {
  const ownerContext = await browser.newContext()
  const entrantContext = await browser.newContext()
  const owner = await ownerContext.newPage()
  const entrant = await entrantContext.newPage()
  const ownerName = uniqueName('LeagueOwner')
  const entrantName = uniqueName('LeagueEntrant')
  const leagueName = uniqueName('Editable League')
  const renamed = `${leagueName} Updated`

  await signUp(owner, ownerName)
  await signUp(entrant, entrantName)
  await uploadAvatar(owner)
  await owner.goto('/tournaments')
  const create = await openLeagueCreation(owner)
  await create.getByLabel('Name').fill(leagueName)
  await submitLeagueCreation(owner, create)
  const leagueUrl = new URL(owner.url())
  leagueUrl.search = ''
  const leagueToken = lastPathSegment(leagueUrl)
  let organizer = owner.locator('main header').getByText('Organized by', { exact: true }).locator('..')
  await expectOrganizerAvatar(organizer, ownerName)
  await owner.setViewportSize(PHONE)
  await expectOrganizerAvatar(organizer, ownerName)
  await expectWithinPage(owner, organizer)

  await owner.goto('/tournaments')
  await owner.setViewportSize({ width: 1440, height: 900 })
  let card = owner.locator(`[data-league="${leagueToken}"]`)
  // A card without a description names its organizer beside their avatar.
  await expect(card.locator('img').first()).toHaveAttribute('src', /\/avatars\/[0-9a-f]+\.jpg$/)
  await expect(card).toContainText(`Organized by ${ownerName}`)
  await expectWithinPage(owner, card)

  await owner.setViewportSize(PHONE)
  await expect(card).toContainText(`Organized by ${ownerName}`)
  await expectWithinPage(owner, card)
  await owner.getByRole('button', { name: `Actions for ${leagueName}` }).click()
  const dropdown = owner.getByRole('menu')
  await expect(dropdown.getByRole('menuitem', { name: 'View tournament' })).toBeVisible()
  await expectWithinPage(owner, card, dropdown)
  await owner.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: () => Promise.reject(new Error('clipboard unavailable')) },
    })
  })
  await dropdown.getByRole('menuitem', { name: 'Copy invite link' }).click()
  await expect(dropdown).toBeHidden()
  const copyError = owner.getByText('Could not share the invite. Try again.', { exact: true })
  await expect(copyError).toBeVisible()
  await expect(copyError).toHaveAttribute('aria-live', 'polite')
  await owner.getByRole('button', { name: `Actions for ${leagueName}` }).click()
  await owner.getByRole('menuitem', { name: 'Edit tournament' }).click()
  await expect(copyError).toBeHidden()
  let edit = owner.getByRole('dialog', { name: 'Edit tournament' })
  await edit.getByRole('button', { name: 'Cancel' }).click()
  await expect(edit).toBeHidden()

  await owner.reload()
  await card.click({ button: 'right', position: { x: 2, y: 2 } })
  const contextMenu = owner.getByRole('menu')
  await expect(contextMenu.getByRole('menuitem', { name: 'Edit tournament' })).toBeVisible()
  await expectWithinPage(owner, card, contextMenu)
  await owner.getByRole('menuitem', { name: 'Edit tournament' }).click()
  edit = owner.getByRole('dialog', { name: 'Edit tournament' })
  await expectWithinPage(owner, card, edit)
  await edit.getByLabel('Name').fill(renamed)
  await edit.getByLabel('Details').fill('Updated event details')
  await edit.getByLabel('Player limit').fill('4')
  await edit.getByRole('button', { name: /^Public/ }).click()
  await edit.getByRole('button', { name: /^Anyone who joins/ }).click()
  await edit.getByRole('button', { name: 'Save changes' }).click()
  await expect(owner.getByRole('heading', { name: renamed })).toBeVisible()
  card = owner.locator(`[data-league="${leagueToken}"]`)
  await expect(card.getByText('Updated event details', { exact: true })).toBeVisible()
  await expect(card.getByLabel('Public')).toBeVisible()
  await expect(card).toContainText('0 of 4 players')
  await expectWithinPage(owner, card)

  await owner.goto(leagueUrl.toString())
  await expect(owner.getByText('Updated event details', { exact: true })).toBeVisible()
  await expect(leagueHeader(owner)).toContainText('Public')
  await expect(leagueHeader(owner)).toContainText('Anyone can join')
  await expect(leagueHeader(owner)).toContainText('0 of 4 players')

  await entrant.goto(leagueUrl.toString())
  await join(entrant)
  await expect(leagueHeader(entrant)).toContainText('Anyone can join')
  await expect(leagueHeader(entrant)).toContainText('1 of 4 players')
  await expect(entrant.locator(`[data-person="${entrantName}"]`).getByText('No roster yet', { exact: true })).toBeVisible()
  await owner.goto(leagueUrl.toString())
  organizer = owner.locator('main header').getByText('Organized by', { exact: true }).locator('..')
  await expectOrganizerAvatar(organizer, ownerName)
  edit = await openEventSettings(owner)
  await edit.getByRole('button', { name: /^You approve/ }).click()
  await edit.getByRole('button', { name: 'Save changes' }).click()
  await expect(edit).toBeHidden()
  await expect(leagueHeader(owner)).toContainText('Approval required')

  const ownerMirror = await ownerContext.newPage()
  await ownerMirror.goto(leagueUrl.toString())
  await expect(ownerMirror.getByRole('heading', { name: renamed })).toBeVisible()
  await owner.getByRole('button', { name: `More for ${renamed}` }).click()
  await owner.getByRole('menuitem', { name: 'Delete tournament' }).click()
  const confirmation = owner.getByRole('alertdialog', { name: `Delete ${renamed}?` })
  await expect(confirmation.getByText('Battles already started from it stay where they are.', { exact: false })).toBeVisible()
  await expectWithinPage(owner, confirmation)
  await confirmation.getByRole('button', { name: 'Delete tournament' }).click()
  await expect(owner).toHaveURL(/\/tournaments\/?$/)
  await expect(owner.getByRole('heading', { name: renamed })).toHaveCount(0)
  await expect(ownerMirror).toHaveURL(/\/tournaments\/?$/, { timeout: 10_000 })
  await expect(ownerMirror.getByRole('heading', { name: renamed })).toHaveCount(0)

  await ownerContext.close()
  await entrantContext.close()
})

test('a tournament runs one event, and its old league address still finds it', async ({ browser }) => {
  const ownerContext = await browser.newContext()
  const entrantContext = await browser.newContext()
  const owner = await ownerContext.newPage()
  const entrant = await entrantContext.newPage()
  const ownerName = uniqueName('LeagueOwner')
  const entrantName = uniqueName('LeagueEntrant')
  const leagueName = uniqueName('Thursday League')

  await signUp(owner, ownerName)
  await signUp(entrant, entrantName)

  await owner.goto('/tournaments')
  const create = await openLeagueCreation(owner)
  await create.getByLabel('Name').fill(leagueName)
  await expect(create.getByText('One-off', { exact: true })).toHaveCount(0)
  await expect(create.getByText('Recurring', { exact: true })).toHaveCount(0)
  await create.getByRole('button', { name: /^Anyone who joins/ }).click()
  await submitLeagueCreation(owner, create)
  await expect(owner.getByRole('heading', { name: leagueName })).toBeVisible()
  await expect(owner.locator('main header').getByRole('link', { name: ownerName })).toHaveAttribute('href', /^\/users\/[^/?]+$/)
  await expect(leagueHeader(owner)).toContainText('Registration open')
  await expect(owner.getByRole('heading', { name: 'You are not playing' })).toBeVisible()
  await expect(owner.getByRole('heading', { name: 'Nobody is in yet' })).toBeVisible()
  await expect(owner.locator('[data-check="places"]')).toContainText('Accept at least one player.')
  const leagueUrl = new URL(owner.url())
  leagueUrl.search = ''
  const leagueToken = lastPathSegment(leagueUrl)

  await join(owner)
  await entrant.goto(leagueUrl.toString())
  await join(entrant)
  await sealEventRosters(leagueToken)

  await owner.reload()
  await expect(leagueHeader(owner)).toContainText('2 players')
  await expect(owner.locator(`[data-person="${entrantName}"]`).getByRole('link', { name: entrantName })).toHaveAttribute(
    'href',
    /^\/users\/[^/?]+$/,
  )
  await expect(owner.getByRole('heading', { name: 'Everyone has sealed' })).toBeVisible()
  await revealEvent(owner)
  await expect(owner.locator('main header').getByText('Tournament', { exact: true })).toBeVisible()
  await expect(owner.getByRole('button', { name: /^Start event/ })).toHaveCount(0)

  await owner.goto(`/leagues/${leagueToken}?choose=1`)
  await expect(owner).toHaveURL(new RegExp(`/tournaments/${leagueToken}\\?choose=`))

  await owner.setViewportSize(PHONE)
  await owner.goto(leagueUrl.toString())
  await expectNoPageOverflow(owner)

  await ownerContext.close()
  await entrantContext.close()
})

test('an organizer adds friends to an event without waiting for them to ask', async ({ browser }) => {
  const names = ['AddingOwner', 'FirstFriend', 'SecondFriend', 'Stranger'].map(uniqueName)
  const contexts = await Promise.all(names.map(() => browser.newContext()))
  const [owner, first, second, stranger] = await Promise.all(contexts.map((context) => context.newPage()))
  for (const [index, page] of [owner, first, second, stranger].entries()) await signUp(page, names[index])
  await befriend(owner, first)
  await befriend(owner, second)

  await owner.goto('/tournaments')
  const create = await openLeagueCreation(owner, { ownerPlays: true })
  await create.getByLabel('Name').fill(uniqueName('Friends League'))
  await create.getByLabel('Player limit').fill('2')
  await submitLeagueCreation(owner, create)
  const leagueUrl = owner.url()
  const leagueToken = lastPathSegment(leagueUrl)

  // The organizer holds one of the two places, so only one friend can be picked.
  await owner.getByRole('button', { name: 'Add friends' }).click()
  const picker = owner.getByRole('dialog', { name: 'Add friends' })
  await expect(picker.getByText('1 place left.', { exact: false })).toBeVisible()
  await picker.getByRole('checkbox', { name: names[1] }).check()
  await expect(picker.getByRole('checkbox', { name: names[2] })).toBeDisabled()
  await expectWithinPage(owner, picker)
  await picker.getByRole('button', { name: 'Add 1 player' }).click()
  await expect(picker).toBeHidden()
  await expect(leagueHeader(owner)).toContainText('2 of 2 players')
  await expect(owner.locator('[data-onboarding="league-entrants"]').locator(`[data-person="${names[1]}"]`)).toBeVisible()

  // An added friend lands on the same page as anyone accepted, ready to seal.
  await first.goto(leagueUrl)
  await expect(first.getByRole('button', { name: 'Choose a roster' })).toBeVisible()

  // The server, not the picker, decides who may be added: a stranger is refused.
  const strangerId = await userIdNamed(names[3])
  const { ownerId } = await tournamentEvent(leagueToken)
  const product = await productOperator()
  const outcome = await product.leagueCommand(
    {
      op: 'add',
      token: leagueToken,
      ownerId,
      userIds: [strangerId],
      memberLimit: 128,
      now: Date.now(),
      eventToken: '',
    },
    z.string(),
  )
  expect(outcome).toBe('not-friends')

  await Promise.all(contexts.map((context) => context.close()))
})

test('an organizer answers requests, lets a turned-away player back in, and raises places for doubles', async ({ browser }) => {
  const names = ['RequestOwner', 'FirstRequest', 'SecondRequest', 'ThirdRequest'].map(uniqueName)
  const contexts = await Promise.all(names.map(() => browser.newContext()))
  const [owner, first, second, third] = await Promise.all(contexts.map((context) => context.newPage()))
  for (const [index, page] of [owner, first, second, third].entries()) await signUp(page, names[index])

  await owner.goto('/tournaments')
  const create = await openLeagueCreation(owner)
  await create.getByLabel('Name').fill(uniqueName('Request League'))
  await create.getByRole('button', { name: /^You approve/ }).click()
  await create.getByLabel('Player limit').fill('2')
  await submitLeagueCreation(owner, create)
  const leagueUrl = owner.url()
  for (const page of [first, second, third]) {
    await page.goto(leagueUrl)
    await join(page)
    await expect(page.getByRole('heading', { name: 'Waiting for approval' })).toBeVisible()
  }

  await owner.reload()
  const requests = owner.locator('section').filter({ has: owner.getByRole('heading', { name: /^Requests/ }) })
  await expect(requests.locator('[data-person]')).toHaveCount(3)
  await requests.getByRole('button', { name: `Turn away ${names[1]}` }).click()
  await owner.getByRole('alertdialog').getByRole('button', { name: 'Turn away' }).click()
  await expect(requests.locator('[data-person]')).toHaveCount(2)

  // A turned-away request stays with the organizer, who can still let that player in.
  const turnedAway = owner.locator('details').filter({ hasText: 'Turned away' })
  await turnedAway.locator('summary').click()
  await turnedAway.getByRole('button', { name: `Let ${names[1]} in` }).click()
  const entrants = owner.locator('[data-onboarding="league-entrants"]')
  await expect(entrants.locator(`[data-person="${names[1]}"]`)).toBeVisible()
  await expect(turnedAway).toHaveCount(0)

  // One place is left, so the bulk accept takes only the oldest request.
  await requests.getByRole('button', { name: 'Accept the first 1' }).click()
  await expect(entrants.locator(`[data-person="${names[2]}"]`)).toBeVisible()
  await expect(requests.locator(`[data-person="${names[3]}"]`)).toBeVisible()
  await expect(leagueHeader(owner)).toContainText('2 of 2 players')

  // Doubles needs four places, and choosing it raises the limit in the same save.
  const rules = await openEventSettings(owner)
  await rules.getByRole('button', { name: /^Doubles/ }).click()
  await expect(rules.getByLabel('Player limit')).toHaveValue('4')
  await expectWithinPage(owner, rules)
  await rules.getByRole('button', { name: 'Save changes' }).click()
  await expect(rules).toBeHidden()
  await expect(leagueHeader(owner)).toContainText('2 of 4 players')
  await expect(owner.locator('main header').getByText(/^Doubles ·/)).toBeVisible()

  // The only two players left to pair start picked.
  const unpaired = owner.locator('[data-group="unpaired"]')
  await expect(unpaired.getByRole('checkbox', { name: `Pick ${names[1]} for a team` })).toBeChecked()
  await expect(unpaired.getByRole('checkbox', { name: `Pick ${names[2]} for a team` })).toBeChecked()
  // Removing a picked player frees their pick, so the pairing picker never locks on a row it no longer shows.
  await unpaired.getByRole('checkbox', { name: `Pick ${names[2]} for a team` }).uncheck()
  await unpaired.getByRole('checkbox', { name: `Pick ${names[2]} for a team` }).check()
  await expect(unpaired.getByRole('button', { name: `Pair ${names[1]} and ${names[2]}` })).toBeEnabled()
  await unpaired.getByRole('button', { name: `Remove ${names[1]}`, exact: true }).click()
  await owner
    .getByRole('alertdialog', { name: `Remove ${names[1]}?` })
    .getByRole('button', { name: 'Remove entrant' })
    .click()
  await expect(unpaired.locator(`[data-person="${names[1]}"]`)).toHaveCount(0)
  await expect(unpaired.getByRole('button', { name: 'Pick two to pair' })).toBeDisabled()
  await requests.getByRole('button', { name: `Accept ${names[3]}` }).click()
  await unpaired.getByRole('checkbox', { name: `Pick ${names[3]} for a team` }).check()
  await expect(unpaired.getByRole('button', { name: `Pair ${names[2]} and ${names[3]}` })).toBeEnabled()

  await Promise.all(contexts.map((context) => context.close()))
})

test('a 2v1 event assigns entrant sizes, filters rosters, and prepares a battle', async ({ browser }) => {
  const ownerContext = await browser.newContext()
  const alliedContext = await browser.newContext()
  const secondAlliedContext = await browser.newContext()
  const owner = await ownerContext.newPage()
  const allied = await alliedContext.newPage()
  const secondAllied = await secondAlliedContext.newPage()
  const ownerName = uniqueName('SoloEntrant')
  const alliedName = uniqueName('AlliedEntrant')
  const secondAlliedAccountName = uniqueName('SecondAlliedEntrant')
  const leagueName = uniqueName('Team League')

  await signUp(owner, ownerName)
  await signUp(allied, alliedName)
  await signUp(secondAllied, secondAlliedAccountName)
  const alliedRoster = 'Allied 1,000 roster'
  // A team event takes lists at its battle size or smaller, so only a bigger one is filtered out.
  const wrongRoster = 'Onslaught 3,000 roster'
  await seedRosters(alliedName, [
    { name: alliedRoster, limit: 1_000 },
    { name: wrongRoster, limit: 3_000 },
  ])

  await owner.goto('/tournaments')
  const create = await openLeagueCreation(owner)
  await create.getByLabel('Name').fill(leagueName)
  await create.getByRole('button', { name: /^Anyone who joins/ }).click()
  await owner.setViewportSize(PHONE)
  await expectWithinPage(owner, create)
  await submitLeagueCreation(owner, create)
  const rules = await openEventSettings(owner)
  await rules.getByRole('button', { name: /^Solo vs pair/ }).click()
  await expect(rules.getByText('Points', { exact: true })).toBeVisible()
  await expectWithinPage(owner, rules)
  await rules.getByRole('button', { name: 'Save changes' }).click()
  await expect(rules).toBeHidden()
  const leagueUrl = owner.url()
  const leagueToken = lastPathSegment(leagueUrl)

  await join(owner)
  await allied.goto(leagueUrl)
  await join(allied)
  await secondAllied.goto(leagueUrl)
  await join(secondAllied)
  const { existingLabel: alliedLabel, playerLabel: secondAlliedLabel } = await givePlayersTheSameName(alliedName, secondAlliedAccountName)
  await owner.reload()
  await eventLoaded(owner)
  // The organizer who plays is sized on the same page like anyone else, and the card says so rather than waiting on "the organizer".
  await expect(owner.getByRole('heading', { name: 'Waiting for your size' })).toBeVisible()
  await expect(owner.getByText('Give yourself a solo or allied size below.')).toBeVisible()
  await expect(owner.locator('[data-check="sizes"]')).toContainText('a size.')
  const ownerAssignment = owner.getByRole('button', { name: `Assign ${ownerName} a solo roster` })
  await ownerAssignment.click()
  await expect(ownerAssignment).toHaveAttribute('aria-pressed', 'true')
  const alliedAssignment = owner.getByRole('button', { name: `Assign ${alliedLabel} a solo roster` })
  await alliedAssignment.click()
  await expect(alliedAssignment).toHaveAttribute('aria-pressed', 'true')
  const secondAlliedAssignment = owner.getByRole('button', { name: `Assign ${secondAlliedLabel} an allied roster` })
  await secondAlliedAssignment.click()
  await expect(secondAlliedAssignment).toHaveAttribute('aria-pressed', 'true')
  await sealTeamEventRosters(leagueToken)
  await owner.reload()
  await expect(owner.getByRole('button', { name: 'Reveal all rosters' })).toHaveCount(0)
  await expect(owner.locator('[data-check="sizes"]')).toContainText('Make two players allied.')
  // Every list is sealed and readable, so only the server's own checklist stands between this event and a reveal.
  expect(await revealThroughServer(leagueToken)).toBe('not-ready')
  const assignmentRows = owner.locator('[data-person]')
  await expectWithinPage(owner, ...(await assignmentRows.all()))

  await owner.getByRole('button', { name: `Assign ${alliedLabel} an allied roster` }).click()
  const reassignment = owner.getByRole('alertdialog', { name: `Change ${alliedLabel}’s roster size?` })
  await expectWithinPage(owner, reassignment)
  await reassignment.getByRole('button', { name: 'Change size' }).click()
  await expect
    .poll(async () => {
      const event = await tournamentEvent(leagueToken)
      const entries = await productSql<{
        required_limit: [number, number | []]
      }>`SELECT required_limit FROM league_event_entries WHERE event_id = ${event.id} AND status = 'accepted'`
      return entries.map((entry) => option(entry.required_limit)).toSorted((left, right) => (left ?? 0) - (right ?? 0))
    })
    .toEqual([1_000, 1_000, 2_000])
  await owner.reload()
  await expect(owner.locator('[data-check="teams"]')).toContainText('with another ally.')
  // The organizer pairs the allies, and a pair plays together in every battle of the event.
  const alliedPool = owner.locator('[data-group="allied"]')
  await expect(alliedPool.getByRole('checkbox', { name: `Pick ${alliedLabel} for a pair` })).toBeChecked()
  await expect(alliedPool.getByRole('checkbox', { name: `Pick ${secondAlliedLabel} for a pair` })).toBeChecked()
  await owner.setViewportSize(PHONE)
  await expectWithinPage(owner, alliedPool)
  await owner.setViewportSize({ width: 1440, height: 900 })
  await alliedPool.getByRole('button', { name: /^Pair / }).click()
  await expect(owner.locator('[data-group="pair-1"]')).toContainText(secondAlliedLabel)
  await expectWithinPage(owner, ...(await owner.locator('[data-person]').all()))
  await sealTeamEventRosters(leagueToken)
  await owner.reload()
  // The allies' lists chose different cards, so the pair owes its one Force Disposition before anything opens.
  await expect(owner.getByRole('button', { name: 'Reveal all rosters' })).toHaveCount(0)
  await expect(owner.getByText('need to choose their team’s Force Disposition')).toBeVisible()
  expect(await revealThroughServer(leagueToken)).toBe('not-ready')

  await allied.setViewportSize(PHONE)
  await allied.reload()
  const alliedSide = allied.locator('[data-group="pair-1"]')
  const ownEntrantRow = alliedSide.locator(`[data-person="${alliedName}"]`).filter({ hasText: alliedLabel })
  await expect(ownEntrantRow).toBeVisible()
  await expect(alliedSide.getByRole('heading', { name: 'Allied pair 1' })).toBeVisible()
  // The pair chooses from every card either list's detachments offer, not only the two the lists chose.
  const teamCard = allied.locator('[data-team-disposition]')
  // The status card leads with the card the pair still owes, not with a list that is already sealed.
  await expect(allied.getByRole('heading', { name: 'Choose your team’s Force Disposition' })).toBeVisible()
  await expect(teamCard.getByRole('button')).toHaveCount(3)
  const priorityAssets = teamCard.getByRole('button', { name: 'Priority Assets' })
  await priorityAssets.click()
  await expect(priorityAssets).toHaveAttribute('aria-pressed', 'true')
  await expect(alliedSide).toContainText('plays Priority Assets')
  // Each allied list names its own Warlord, so the pair also chooses whose leads it.
  await expect(allied.getByRole('heading', { name: 'Choose your team’s Warlord' })).toBeVisible()
  const partnerWarlord = allied.locator('[data-team-warlord]').getByRole('button', { name: `${secondAlliedLabel}’s Warlord` })
  await partnerWarlord.click()
  await expect(partnerWarlord).toHaveAttribute('aria-pressed', 'true')
  await expect(allied.getByRole('heading', { name: 'Your roster is sealed' })).toBeVisible()
  await expectWithinPage(allied, teamCard)
  // A 2v1 seats the allied rosters together and never against each other, so each ally reads the other's
  // before reveal, while the solo roster they will both face stays sealed.
  const secondAlliedRow = alliedSide.locator(`[data-person="${alliedName}"]`).filter({ hasText: secondAlliedLabel })
  await expect(viewRoster(secondAlliedRow, secondAlliedLabel)).toBeVisible()
  await expect(viewRoster(ownEntrantRow, alliedLabel)).toBeVisible()
  await expect(allied.locator(`[data-person="${ownerName}"]`).getByRole('button', { name: /^View / })).toHaveCount(0)
  await expect(allied.getByText(`Only ${secondAlliedLabel} can see it before the reveal.`)).toBeVisible()
  await expectWithinPage(allied, ...(await allied.locator('[data-person]').all()))
  await viewRoster(secondAlliedRow, secondAlliedLabel).click()
  await expect(allied.locator('[data-unit="Test unit"]')).toBeVisible()
  await allied.goBack()
  await viewRoster(ownEntrantRow, alliedLabel).click()
  await expect(allied.locator('[data-unit="Test unit"]')).toBeVisible()
  await allied.goBack()

  await allied.getByRole('button', { name: 'Swap roster' }).click()
  const chooser = allied.getByRole('dialog', { name: 'Seal a roster' })
  await expect(chooser.locator(`[data-roster="${alliedRoster}"]`)).toBeVisible()
  await expect(chooser.locator(`[data-roster="${wrongRoster}"]`)).toHaveCount(0)
  await expectWithinPage(allied, chooser)
  await allied.keyboard.press('Escape')

  await owner.reload()
  await expect(owner.locator('[data-entry-status]').getByRole('button', { name: 'Reveal all rosters' })).toBeEnabled()
  await revealEvent(owner)
  await expect(owner.locator('[data-group="pair-1"]')).toContainText('plays Priority Assets')
  // Once the lists are out the pair's card is fixed, and a replacement list has to leave it on offer.
  const revealedEvent = await tournamentEvent(leagueToken)
  const sealedEntries = await productSql<{
    user_id: string
    roster_snapshot: [number, string | []]
  }>`SELECT user_id, roster_snapshot FROM league_event_entries WHERE event_id = ${revealedEvent.id} AND status = 'accepted'`
  const holder = sealedEntries.find((entry) => option(entry.roster_snapshot)?.includes('priority-assets'))!
  const operator = await productOperator()
  const command = (input: Record<string, unknown>) =>
    operator.leagueCommand({ token: leagueToken, eventToken: revealedEvent.token, now: Date.now(), ...input }, z.unknown())
  expect(await command({ op: 'set-team-disposition', ownerId: holder.user_id, disposition: 'take-and-hold' })).toEqual({
    outcome: 'closed',
  })
  expect(await command({ op: 'unseal', ownerId: revealedEvent.ownerId, userId: holder.user_id })).toBe('unsealed')
  const reseal = (cards: FixtureCards) =>
    submitFixtureRoster(leagueToken, revealedEvent, holder.user_id, 1_000, true, '1,000-point roster', undefined, cards)
  expect(await reseal({ disposition: 'take-and-hold', dispositions: ['take-and-hold'] })).toBe('disposition-dropped')
  expect(await reseal(TEAM_EVENT_CARDS[0])).toBe('sealed')
  // A revealed event no longer holds the limit to its shape, so it can drop below what a 2v1 needs.
  const edit = await openEventSettings(owner)
  await expect(edit.getByLabel('Player limit')).toHaveAttribute('min', '2')
  await edit.getByLabel('Player limit').fill('2')
  await edit.getByRole('button', { name: 'Save changes' }).click()
  await expect(edit).toBeHidden()
  await eventLoaded(owner)
  await owner.getByRole('button', { name: 'Start 2 vs 1 battle' }).click()
  const battleChooser = owner.getByRole('dialog', { name: 'Start 2 vs 1 battle' })
  await expectWithinPage(owner, battleChooser)
  // The only allied pair in the event is the one possible table, so it is already seated.
  await expect(battleChooser.getByLabel('First opponent')).toContainText(alliedLabel)
  await expect(battleChooser.getByLabel('Second opponent')).toContainText(secondAlliedLabel)
  await expect(battleChooser.getByRole('button', { name: 'Start battle' })).toBeEnabled()
  await battleChooser.getByRole('button', { name: 'Start battle' }).click()
  await expect(owner).toHaveURL(/\/battles\/[^/?]+$/)
  // Sealed lists arrive attached, so the step has already folded to its answer.
  await setupStep(owner, 'Armies')
  const ownerSetup = owner.getByRole('region', { name: 'Armies' })
  await expect(ownerSetup.locator('[data-players]').filter({ hasText: alliedName }).getByText(alliedName, { exact: true })).toHaveCount(2)
  await expect(ownerSetup.locator('[data-players]').filter({ hasText: ownerName })).toHaveCount(1)
  // The pair shows the one card it plays, not the two its lists chose.
  await expect(ownerSetup.locator('p', { hasText: 'Side plays' })).toContainText('Priority Assets')
  await expect(ownerSetup.getByText('Purge the Foe', { exact: true })).toHaveCount(0)
  const battleUrl = owner.url()
  const battlePath = new URL(battleUrl).pathname

  const spectatorContext = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const spectator = await spectatorContext.newPage()
  await spectator.goto(leagueUrl)
  const eventBattle = spectator.locator('a[href^="/battles/"]').first()
  await expect(eventBattle).toContainText(ownerName)
  await eventBattle.click()
  await expect(spectator.getByText('Battle setup', { exact: true })).toBeVisible()
  await expect(spectator.getByRole('button', { name: 'Open 2,000-point roster' })).toBeVisible()
  await expect(spectator.getByRole('button', { name: 'Open 1,000-point roster' })).toHaveCount(2)
  await expect(spectator.getByRole('button', { name: 'Begin battle' })).toHaveCount(0)
  const spectatorPlayer = spectator.getByRole('link', { name: ownerName, exact: true })
  await expect(spectatorPlayer).toHaveAttribute('href', /^\/users\/[^/?]+$/)
  await expect(spectator.getByRole('link', { name: '2,000-point roster', exact: true })).toHaveCount(0)
  await expectWithinPage(spectator)
  await spectatorPlayer.click()
  await expect(spectator.getByRole('heading', { name: ownerName })).toBeVisible()
  await spectator.goBack()
  await expect(spectator.getByText('Battle setup', { exact: true })).toBeVisible()
  await spectator.getByRole('button', { name: 'Open 2,000-point roster' }).click()
  const spectatorRoster = spectator.locator('[data-army-roster]')
  await expect(spectatorRoster.locator('[data-unit="Test unit"]')).toBeVisible()
  await expect(spectatorRoster.getByRole('button', { name: /Mark .* destroyed/ })).toHaveCount(0)
  await expectWithinPage(spectator, spectatorRoster)
  await spectator.keyboard.press('Escape')
  await expect(spectatorRoster).toBeHidden()
  await spectator.setViewportSize(PHONE)
  await expectWithinPage(spectator)
  await spectator.getByRole('button', { name: 'Open 2,000-point roster' }).click()
  await expectWithinPage(spectator, spectatorRoster)
  await spectator.keyboard.press('Escape')
  await expect(spectatorRoster).toBeHidden()

  await allied.reload()
  await allied.getByRole('button', { name: 'Start 2 vs 1 battle' }).click()
  const alliedBattleChooser = allied.getByRole('dialog', { name: 'Start 2 vs 1 battle' })
  await expectWithinPage(allied, alliedBattleChooser)
  await expect(alliedBattleChooser.getByLabel('Your ally')).toContainText(secondAlliedLabel)
  await expect(alliedBattleChooser.getByLabel('Opponent')).toContainText(ownerName)
  await alliedBattleChooser.getByRole('button', { name: 'Start battle' }).click()
  await expect(allied).toHaveURL(/\/battles\/[^/?]+$/)
  // Sealed lists arrive attached, so the step has already folded to its answer.
  await setupStep(allied, 'Armies')
  const alliedSetup = allied.getByRole('region', { name: 'Armies' })
  await expect(alliedSetup.locator('[data-players]').filter({ hasText: alliedName }).getByText(alliedName, { exact: true })).toHaveCount(2)
  await expect(alliedSetup.locator('[data-players]').filter({ hasText: ownerName })).toHaveCount(1)

  const previewPath = `/api/previews${battlePath}`
  const publicPreview = await spectator.request.get(previewPath)
  expect(publicPreview.status()).toBe(200)
  expect(publicPreview.headers()['cache-control']).toBe('no-store')
  const ownerId = await userIdNamed(ownerName)
  const product = await productOperator()
  const battleId = await battleIdFor(lastPathSegment(battleUrl))
  // The pair's sealed card is written into the battle, so setup never asks it again.
  expect((await battleCommands(battleId)).find(({ body }) => body.kind === 'lock-league-rosters')?.body).toMatchObject({
    dispositions: [{ side: 1, disposition: 'priority-assets' }],
  })
  const [eventLink] = await productSql<{
    event_id: string
  }>`SELECT event_id FROM league_event_battles WHERE battle_id = ${battleId}`
  const [eventIdentity] = await productSql<{ token: string }>`SELECT token FROM sealed_events WHERE id = ${eventLink.event_id}`
  const feed = (viewerId?: string) =>
    product.battleFeed({ scope: 'league', leagueToken, eventToken: eventIdentity.token, limit: 1, viewerId })
  expect((await feed()).battles).toHaveLength(1)
  await owner.setViewportSize({ width: 1440, height: 900 })
  await owner.goto(battleUrl)
  await expect(owner.getByRole('region', { name: 'Armies' })).toBeVisible()
  await allied.goto(leagueUrl)
  await expect(allied.locator(`a[href="${battlePath}"]`)).toBeVisible()
  expect((await feed(ownerId)).battles).toHaveLength(1)

  await ownerContext.close()
  await alliedContext.close()
  await secondAlliedContext.close()
  await spectatorContext.close()
})

test('a doubles event pairs teams, filters half-size rosters, and starts a four-seat battle', async ({ browser, page: owner }) => {
  const names = ['Doubles owner', 'Doubles teammate', 'Doubles opponent', 'Doubles opponent teammate'].map(uniqueName)
  const contexts = []
  const pages = [owner]
  await signUp(owner, names[0])
  for (let index = 1; index < 4; index++) {
    const context = await browser.newContext()
    contexts.push(context)
    const participant = await context.newPage()
    pages.push(participant)
    await signUp(participant, names[index])
  }
  const [, teammate] = pages
  await seedRosters(names[1], [
    { name: 'Eligible doubles roster', limit: 1_000 },
    { name: 'Wrong doubles roster', limit: 3_000 },
  ])

  await owner.goto('/tournaments')
  const create = await openLeagueCreation(owner)
  await create.getByLabel('Name').fill(uniqueName('Doubles League'))
  // The format is chosen with everything else, and a doubles limit has to seat two full teams.
  await create.getByRole('button', { name: /^Doubles/ }).click()
  await create.getByLabel('Player limit').fill('3')
  await expect(create.getByRole('button', { name: 'Create tournament' })).toBeDisabled()
  await create.getByLabel('Player limit').fill('4')
  await expect(create.getByRole('button', { name: 'Create tournament' })).toBeEnabled()
  await create.getByLabel('Player limit').fill('6')
  await create.getByRole('button', { name: /^Anyone who joins/ }).click()
  await owner.setViewportSize(PHONE)
  await expectWithinPage(owner, create)
  await submitLeagueCreation(owner, create)
  await expect(owner.locator('main header').getByText(/^Doubles ·/)).toBeVisible()
  const leagueUrl = owner.url()
  const leagueToken = lastPathSegment(leagueUrl)

  await join(owner)
  for (const page of pages.slice(1)) {
    await page.goto(leagueUrl)
    await join(page)
  }
  await owner.reload()
  await eventLoaded(owner)
  const unpaired = owner.locator('[data-group="unpaired"]')
  const pair = async (captain: string, partner: string) => {
    await unpaired.getByRole('checkbox', { name: `Pick ${captain} for a team` }).check()
    await unpaired.getByRole('checkbox', { name: `Pick ${partner} for a team` }).check()
    await unpaired.getByRole('button', { name: `Pair ${captain} and ${partner}` }).click()
    await expect(unpaired.locator(`[data-person="${captain}"]`)).toHaveCount(0)
  }
  await expect(unpaired.getByRole('button', { name: 'Pick two to pair' })).toBeDisabled()
  await expect(owner.locator('[data-check="teams"]')).toContainText('Pair ')
  await pair(names[0], names[1])
  await pair(names[2], names[3])
  await expect(unpaired).toHaveCount(0)
  const team = (index: number) => owner.locator(`[data-group="team-${index}"]`)
  await owner.reload()
  await expect(team(1).locator('[data-person]')).toHaveText([new RegExp(names[0]), new RegExp(names[1])])
  await expect(team(2).locator('[data-person]')).toHaveText([new RegExp(names[2]), new RegExp(names[3])])
  // A step the organizer has finished leaves the panel.
  await expect(owner.locator('[data-check="teams"]')).toHaveCount(0)
  await owner.setViewportSize(PHONE)
  await expectWithinPage(owner, ...(await owner.locator('[data-person]').all()))

  await teammate.setViewportSize(PHONE)
  await teammate.reload()
  await teammate.getByRole('button', { name: 'Choose a roster' }).click()
  const rosterChooser = teammate.getByRole('dialog', { name: 'Seal a roster' })
  await expect(rosterChooser.locator('[data-roster="Eligible doubles roster"]')).toBeVisible()
  await expect(rosterChooser.locator('[data-roster="Wrong doubles roster"]')).toHaveCount(0)
  await expectWithinPage(teammate, rosterChooser)
  await teammate.keyboard.press('Escape')

  await sealDoublesEventRosters(leagueToken, true)
  await teammate.reload()
  // Each team settles its one Force Disposition before the reveal, from every card either list offers.
  const teamCard = teammate.locator('[data-team-disposition]')
  await expect(teamCard.getByRole('button')).toHaveCount(3)
  await teamCard.getByRole('button', { name: 'Priority Assets' }).click()
  await expect(teamCard.getByRole('button', { name: 'Priority Assets' })).toHaveAttribute('aria-pressed', 'true')
  await expect(teammate.locator('[data-group="team-1"]')).toContainText('plays Priority Assets')
  await expectWithinPage(teammate, teamCard)
  await expect(teammate.locator('[data-team-warlord]').getByRole('button')).toHaveCount(2)
  const opponent = pages[2]
  await opponent.setViewportSize({ width: 1440, height: 900 })
  await opponent.reload()
  await opponent.locator('[data-team-disposition]').getByRole('button', { name: 'Purge the Foe' }).click()
  await expect(opponent.locator('[data-team-disposition]').getByRole('button', { name: 'Purge the Foe' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  // Every doubles list names its own Warlord, so each team also chooses whose leads it.
  for (const player of [teammate, opponent]) {
    const leader = player.locator('[data-team-warlord]').getByRole('button').first()
    await leader.click()
    await expect(leader).toHaveAttribute('aria-pressed', 'true')
  }

  // The organizer's teams carry unpairing and each member's removal together at both widths.
  await owner.reload()
  await expect(owner.getByRole('button', { name: `Remove ${names[0]}`, exact: true })).toBeVisible()
  await expectWithinPage(owner, ...(await owner.locator('[data-person]').all()))
  await owner.setViewportSize({ width: 1440, height: 900 })
  await team(1)
    .getByRole('button', { name: `Unpair ${names[0]} and ${names[1]}` })
    .click()
  const clearRosters = owner.getByRole('alertdialog', { name: 'Clear sealed doubles rosters?' })
  for (const name of names.slice(0, 2)) await expect(clearRosters).toContainText(name)
  await owner.setViewportSize({ width: 1440, height: 900 })
  await expectWithinPage(
    owner,
    clearRosters.locator('[data-slot="alert-dialog-header"]'),
    clearRosters.locator('[data-slot="alert-dialog-footer"]'),
  )
  await owner.setViewportSize(PHONE)
  await expectWithinPage(
    owner,
    clearRosters.locator('[data-slot="alert-dialog-header"]'),
    clearRosters.locator('[data-slot="alert-dialog-footer"]'),
  )
  await clearRosters.getByRole('button', { name: 'Keep current teams' }).click()
  await expect(team(1).locator('[data-person]')).toHaveCount(2)

  await owner.getByRole('button', { name: `Remove ${names[0]}`, exact: true }).click()
  const removeEntrant = owner.getByRole('alertdialog', { name: `Remove ${names[0]}?` })
  await expect(removeEntrant).toContainText(`This also unpairs ${names[1]} and clears both their sealed rosters.`)
  await owner.setViewportSize({ width: 1440, height: 900 })
  await expectWithinPage(
    owner,
    removeEntrant.locator('[data-slot="alert-dialog-header"]'),
    removeEntrant.locator('[data-slot="alert-dialog-footer"]'),
  )
  await owner.setViewportSize(PHONE)
  await expectWithinPage(
    owner,
    removeEntrant.locator('[data-slot="alert-dialog-header"]'),
    removeEntrant.locator('[data-slot="alert-dialog-footer"]'),
  )
  const { promise: removalReleased, resolve: releaseRemoval } = Promise.withResolvers<void>()
  await owner.route('**/*', async (route) => {
    if (route.request().method() === 'POST') {
      await removalReleased
      await route.abort('failed')
      return
    }
    await route.continue()
  })
  await removeEntrant.getByRole('button', { name: 'Remove entrant' }).click()
  await expect(removeEntrant).toHaveAttribute('aria-busy', 'true')
  await expect(removeEntrant.getByRole('button', { name: 'Keep entrant' })).toBeDisabled()
  await expect(removeEntrant.getByRole('button', { name: 'Removing…' })).toBeDisabled()
  releaseRemoval()
  await expect(removeEntrant).toBeHidden()
  await expect(owner.getByText('1 change waiting to sync', { exact: true })).toBeVisible()
  await owner.getByRole('button', { name: 'Details', exact: true }).click()
  const savedChanges = owner.getByRole('dialog', { name: 'Saved changes', exact: true })
  await savedChanges.getByRole('button', { name: 'Discard all saved changes' }).click()
  await owner
    .getByRole('alertdialog', { name: 'Discard saved changes?' })
    .getByRole('button', { name: 'Discard changes', exact: true })
    .click()
  await expect(savedChanges).toBeHidden()
  await owner.unrouteAll({ behavior: 'wait' })
  await expect(team(1).locator('[data-person]')).toHaveCount(2)

  // Two of the six places are still open, so the panel says everyone in has sealed.
  await expect(owner.getByRole('heading', { name: 'Everyone in has sealed' })).toBeVisible()
  await owner.locator('[data-entry-status]').getByRole('button', { name: 'Reveal all rosters' }).click()
  const reveal = owner.getByRole('alertdialog', { name: 'Reveal every roster?' })
  const { promise: revealReleased, resolve: releaseReveal } = Promise.withResolvers<void>()
  await owner.route('**/*', async (route) => {
    if (route.request().method() === 'POST') await revealReleased
    await route.continue()
  })
  await reveal.getByRole('button', { name: 'Reveal all rosters' }).click()
  await expect(reveal).toHaveAttribute('aria-busy', 'true')
  await expect(reveal.getByRole('button', { name: 'Keep them sealed' })).toBeDisabled()
  await expect(reveal.getByRole('button', { name: 'Revealing…' })).toBeDisabled()
  releaseReveal()
  await expect(reveal).toBeHidden()
  await owner.unrouteAll({ behavior: 'wait' })
  await eventLoaded(owner)
  await expect(team(1)).toContainText('plays Priority Assets')
  await expect(team(2)).toContainText('plays Purge the Foe')
  await owner.getByRole('button', { name: 'Start 2 vs 2 battle' }).click()
  const battleChooser = owner.getByRole('dialog', { name: 'Start 2 vs 2 battle' })
  await expect(battleChooser.getByLabel('Opposing team')).toContainText(`${names[2]} & ${names[3]}`)
  await expectWithinPage(owner, battleChooser)
  await battleChooser.getByRole('button', { name: 'Start battle' }).click()
  await expect(owner).toHaveURL(/\/battles\/[^/?]+$/)
  // Sealed lists arrive attached, so the step has already folded to its answer.
  await setupStep(owner, 'Armies')
  const sides = owner.getByRole('region', { name: 'Armies' }).locator('[data-players]')
  await expect(sides).toHaveCount(2)
  await expect(sides.nth(0)).toContainText(names[0])
  await expect(sides.nth(0)).toContainText(names[1])
  const doublesSetup = owner.getByRole('region', { name: 'Armies' })
  await expect(doublesSetup.locator('p', { hasText: 'Side plays' })).toHaveText([/Priority Assets/, /Purge the Foe/])
  await expect(doublesSetup.getByText('Take and Hold', { exact: true })).toHaveCount(0)
  await expect(sides.nth(1)).toContainText(names[2])
  await expect(sides.nth(1)).toContainText(names[3])
  await expectWithinPage(owner)

  await Promise.all(contexts.map((context) => context.close()))
})

test('the sample tournament walks every stage without writing anything', async ({ page }) => {
  const writes: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('/_serverFn/') && request.method() !== 'GET') writes.push(request.url())
  })
  await page.goto('/tournaments')
  await page.getByRole('link', { name: 'See a sample' }).first().click()
  await expect(page.getByRole('heading', { name: '4 of 5 rosters sealed' })).toBeVisible()
  await expect(page.getByText('that includes the organizer')).toBeVisible()
  for (const stage of ['Reveal', 'Rounds', 'Standings']) await page.getByRole('link', { name: `Next: ${stage}` }).click()
  await expect(page.getByText('Every round is played. The results below are final.')).toBeVisible()
  await expect(page.locator('[data-league-rounds]').getByText('Bye')).toHaveCount(3)
  // Made-up players and battles have no pages to open.
  await expect(page.locator('main a[href^="/users/"], main a[href^="/battles/"], main a[href^="/rosters/"]')).toHaveCount(0)
  await page.getByRole('link', { name: 'Back to the start' }).click()
  await expect(page.getByRole('heading', { name: '4 of 5 rosters sealed' })).toBeVisible()
  // A stage name that isn't one, from an old or mistyped link, opens the start.
  await page.goto('/tournaments/sample?stage=final')
  await expect(page.getByRole('heading', { name: '4 of 5 rosters sealed' })).toBeVisible()
  expect(writes).toEqual([])
})
