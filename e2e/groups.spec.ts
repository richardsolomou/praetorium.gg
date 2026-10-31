import { expect, test, type Locator, type Page } from './test'
import { befriend, createBattle, retryUntilVisible, setupStep, signInAsPreview, signUp, uniqueName, sealableRoster, PHONE } from './account'
import { productSql, lastPathSegment, battleIdFor, seatsBySide, appendCommand } from './storage'
import type { Command } from '../src/core/battle'
import { expectNoHorizontalOverflow } from './builder.harness'

test.setTimeout(120_000)

/** Founds a group from the groups page and returns its address once its page shows. */
async function createGroup(page: Page, name: string) {
  await page.goto('/groups')
  const create = page.getByRole('dialog', { name: 'New group' })
  await retryUntilVisible(create, () => page.getByRole('button', { name: 'New group', exact: true }).click({ timeout: 1_000 }))
  await create.getByLabel('Name').fill(name)
  await create.getByRole('button', { name: 'Create group' }).click()
  await expect(page.getByRole('heading', { name })).toBeVisible()
  return page.url()
}

/** Joins a group from its page until the member list names the player. */
async function joinGroup(page: Page, groupUrl: string, name: string) {
  await page.goto(groupUrl)
  await retryUntilVisible(page.locator('[data-person]').filter({ hasText: name }), () =>
    page.getByRole('button', { name: 'Join group' }).click({ timeout: 1_000 }),
  )
}

const expectGroupBattle = (battleId: string) =>
  expect.poll(async () => (await productSql`SELECT group_id FROM group_battles WHERE battle_id = ${battleId}`).length).toBe(1)

test('group members choose their group at battle setup', async ({ browser }, testInfo) => {
  const ownerContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const memberContext = await browser.newContext()
  const owner = await ownerContext.newPage()
  const member = await memberContext.newPage()
  const ownerName = uniqueName('Group owner')
  const memberName = uniqueName('Group member')
  await signUp(owner, ownerName)
  await signUp(member, memberName)
  await befriend(owner, member)

  const groupName = uniqueName('Thursday group')
  const groupUrl = await createGroup(owner, groupName)

  await joinGroup(member, groupUrl, memberName)

  const battleUrl = await createBattle(owner, { opponent: memberName })
  // A battle opens with its format already settled, folded to its answer, so the group is chosen from the opened step.
  await setupStep(owner, 'Format')
  const group = owner.getByRole('group', { name: 'Group', exact: true })
  await expect(group.getByRole('button', { name: new RegExp(groupName) })).toBeVisible()
  await group.getByRole('button', { name: new RegExp(groupName) }).click()
  await expect(group.getByRole('button', { name: new RegExp(groupName) })).toHaveAttribute('aria-pressed', 'true')
  await group.scrollIntoViewIfNeeded()
  await owner.screenshot({ path: testInfo.outputPath('group-setup.png') })

  const battleId = await battleIdFor(lastPathSegment(battleUrl))
  await expectGroupBattle(battleId)

  // Settle the battle in its log: the table is what is under test, not the game.
  const [first, second] = await seatsBySide(battleId)
  for (const [by, command] of [
    [first, { kind: 'attach-roster', roster: { name: 'Owner army', text: '10 Intercessors' } }],
    [second, { kind: 'attach-roster', roster: { name: 'Member army', text: '10 Plague Marines' } }],
    [first, { kind: 'begin-battle', firstPlayerId: first }],
    [second, { kind: 'end-battle', reason: 'conceded', concededBy: second }],
  ] as [string, Command][])
    await appendCommand(battleId, by, command)

  await owner.goto(`${groupUrl}?tab=leaderboard`)
  const table = owner.locator('[data-standings]')
  // The winner leads the table, and both members are on it.
  await expect(table.locator('tbody tr')).toHaveCount(2)
  await expect(table.locator('tbody tr').first()).toContainText(ownerName)
  await owner.screenshot({ path: testInfo.outputPath('group-page.png'), fullPage: true })

  await ownerContext.close()
  await memberContext.close()
})

test('members who are not friends start a group game from the group page', async ({ browser }) => {
  const ownerContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const memberContext = await browser.newContext()
  const owner = await ownerContext.newPage()
  const member = await memberContext.newPage()
  await signUp(owner, uniqueName('Group host'))
  const memberName = uniqueName('Group regular')
  await signUp(member, memberName)

  const groupName = uniqueName('Open night')
  const groupUrl = await createGroup(owner, groupName)
  await joinGroup(member, groupUrl, memberName)

  await owner.reload()
  await openNewGame(owner)
  await owner.getByRole('dialog', { name: 'New game', exact: true }).getByRole('button', { name: 'Start battle' }).click()
  await owner.waitForURL(/\/battles\/[^/]+$/)
  const battleId = await battleIdFor(lastPathSegment(owner.url()))
  await expectGroupBattle(battleId)
  await ownerContext.close()
  await memberContext.close()
})

test('a group seals lists for a game night and plays them from the group page', async ({ browser }, testInfo) => {
  test.setTimeout(180_000)
  const ownerContext = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: 'Asia/Nicosia' })
  const memberContext = await browser.newContext()
  const owner = await ownerContext.newPage()
  await owner.clock.install({ time: new Date() })
  const member = await memberContext.newPage()
  const memberName = uniqueName('Sealed regular')
  const ownerName = uniqueName('Sealed host')
  await signUp(owner, ownerName)
  await signUp(member, memberName)
  await sealableRoster(owner, 'Host army')
  await sealableRoster(member, 'Regular army')

  const groupName = uniqueName('Game night')
  const groupUrl = await createGroup(owner, groupName)
  await joinGroup(member, groupUrl, memberName)

  // The game is started, sealed, revealed and played without leaving the group page.
  await owner.reload()
  const dialog = await setUpHiddenListGame(owner)
  await dialog.getByRole('button', { name: 'Start hidden-list game' }).click()
  await expect(owner).toHaveURL(/\/groups\/[^/?]+\?game=/)
  const gameToken = new URL(owner.url()).searchParams.get('game')!
  const game = owner.locator('[data-hidden-list-game]')
  await sealFromGroup(owner, game, 'Host army')
  await member.goto(groupUrl)
  await sealFromGroup(member, member.locator('[data-hidden-list-game]'), 'Regular army')

  await owner.reload()
  await expect(game.getByRole('button', { name: /^Simulate against/ })).toHaveCount(0)
  await game.getByRole('button', { name: 'Reveal lists' }).click()
  await owner.getByRole('alertdialog', { name: 'Reveal every list?' }).getByRole('button', { name: 'Reveal lists' }).click()
  await expect(game).toContainText('Regular army')
  await game.getByRole('button', { name: `Simulate against ${memberName}`, exact: true }).click()
  const simulator = owner.getByRole('dialog', { name: 'Combat simulator', exact: true })
  await expect(simulator.getByRole('combobox', { name: 'Attacking roster', exact: true })).toContainText(ownerName)
  await expect(simulator.getByRole('combobox', { name: 'Defending roster', exact: true })).toContainText(memberName)
  await simulator.getByRole('button', { name: 'Run all matchups' }).click()
  await expect(simulator).toContainText('1 / 1 matchups · Complete')
  await simulator.getByRole('button', { name: 'Close', exact: true }).click()
  await owner.setViewportSize(PHONE)
  await game.scrollIntoViewIfNeeded()
  await expect(owner.getByRole('heading', { name: 'New game', exact: true })).toHaveCount(0)
  await expectNoHorizontalOverflow(game)
  await expect(game.getByRole('button', { name: `Simulate against ${memberName}`, exact: true })).toBeInViewport()
  await owner.screenshot({ path: testInfo.outputPath('group-up-next-mobile.png') })
  await owner.setViewportSize({ width: 1440, height: 1000 })
  await game.scrollIntoViewIfNeeded()
  await owner.screenshot({ path: testInfo.outputPath('group-up-next-desktop.png') })
  await game.getByRole('button', { name: `Play ${memberName}` }).click()
  await owner.waitForURL(/\/battles\/[^/]+$/)
  await expect(owner.getByText('Host army').first()).toBeVisible()
  const battlePath = new URL(owner.url()).pathname

  // Hidden-list games stay off the tournaments page, and their own address opens them on the group, even once played.
  const token = lastPathSegment(groupUrl)
  await owner.goto('/tournaments')
  await expect(owner.getByRole('heading', { name: 'Tournaments', exact: true })).toBeVisible()
  await expect(owner.locator(`[data-sealed-event="${gameToken}"]`)).toHaveCount(0)
  await owner.goto(`/tournaments/${gameToken}`)
  await expect(owner).toHaveURL(new RegExp(`/groups/${token}\\?game=${gameToken}`))
  await expect(owner.locator(`[data-hidden-list-game="${gameToken}"]`)).toContainText('Regular army')
  // A battle still being played shows once on the tab, inside its game under Up next, besides the card's way back to it.
  await expect(owner.getByRole('tabpanel').locator(`a[href="${battlePath}"]`)).toHaveCount(1)
  await expect(owner.locator('[data-group-next]').getByRole('link', { name: 'Resume battle' })).toHaveAttribute('href', battlePath)
  const midnight = await owner.evaluate(() => {
    const date = new Date()
    date.setHours(24, 0, 0, 0)
    return date.getTime()
  })
  await owner.clock.fastForward(midnight - (await owner.evaluate(() => Date.now())) + 1)
  await expect(game.getByText(/^Lists · /)).toBeVisible()
  // Its day is over but its battle isn't, so it stays under Up next rather than among the past games.
  await expect(
    owner.getByRole('heading', { name: 'Up next', exact: true }).locator('..').locator(`[data-hidden-list-game="${gameToken}"]`),
  ).toBeVisible()
  await expect(game.getByRole('button', { name: /^Play / })).toHaveCount(0)
  await expect(game.getByRole('button', { name: `Simulate against ${memberName}`, exact: true })).toBeVisible()
  await expect(game.locator(`a[href="${battlePath}"]`)).toBeVisible()
  await owner.screenshot({ path: testInfo.outputPath('group-game-after-midnight.png'), fullPage: true })
  await game.locator(`a[href="${battlePath}"]`).click()
  await expect(owner.getByText('Host army').first()).toBeVisible()
  await ownerContext.close()
  await memberContext.close()
})

test('a group plays a solo-vs-pair hidden-list game, its players taking their own sides', async ({ browser }) => {
  test.setTimeout(240_000)
  const contexts = await Promise.all([0, 1, 2].map(() => browser.newContext({ viewport: { width: 1440, height: 1000 } })))
  const [solo, ally, partner] = (await Promise.all(contexts.map((context) => context.newPage()))) as [Page, Page, Page]
  await signUp(solo, uniqueName('Solo host'))
  await signUp(ally, uniqueName('First ally'))
  await signUp(partner, uniqueName('Second ally'))
  await sealableRoster(solo, 'Solo army')
  await sealableRoster(ally, 'First allied army', { size: /Incursion/ })
  await sealableRoster(partner, 'Second allied army', { size: /Incursion/ })

  const groupUrl = await createGroup(solo, uniqueName('Team night'))
  for (const player of [ally, partner]) {
    await player.goto(groupUrl)
    await retryUntilVisible(player.getByRole('button', { name: 'Copy invite link' }), () =>
      player.getByRole('button', { name: 'Join group' }).click({ timeout: 1_000 }),
    )
  }

  await solo.reload()
  const dialog = await setUpHiddenListGame(solo)
  await dialog.getByRole('button', { name: /^Solo vs pair/ }).click()
  await dialog.getByRole('button', { name: 'Start hidden-list game' }).click()
  await expect(solo).toHaveURL(/\?game=/)
  const gameUrl = solo.url()
  const game = (page: Page) => page.locator('[data-hidden-list-game]')

  // Everyone, the host too, enters by taking a seat; a full side offers none.
  await expect(game(solo).getByRole('button', { name: 'Seal your list' })).toHaveCount(0)
  await game(solo).getByRole('button', { name: 'Join Solo' }).click()
  await expect(game(solo).locator('[data-side="Solo"]')).toContainText('You')
  for (const player of [ally, partner]) {
    await player.goto(gameUrl)
    await expect(game(player).getByRole('button', { name: 'Join Solo' })).toHaveCount(0)
    await game(player).getByRole('button', { name: 'Join Pair' }).click()
    await expect(game(player).locator('[data-side="Pair"]')).toContainText('You')
  }
  await sealFromGroup(solo, game(solo), 'Solo army')
  await sealFromGroup(ally, game(ally), 'First allied army')
  await sealFromGroup(partner, game(partner), 'Second allied army')

  // Each allied list names a Warlord, so the pair picks whose leads before the lists open.
  await partner.reload()
  const warlord = game(partner).locator('[data-team-warlord]').getByRole('button').first()
  await warlord.click()
  await expect(warlord).toHaveAttribute('aria-pressed', 'true')
  const disposition = game(partner).locator('[data-team-disposition]').getByRole('button')
  if (await disposition.count()) await disposition.first().click()

  await solo.reload()
  await game(solo).getByRole('button', { name: 'Reveal lists' }).click()
  await solo.getByRole('alertdialog', { name: 'Reveal every list?' }).getByRole('button', { name: 'Reveal lists' }).click()
  await expect(game(solo)).toContainText('Second allied army')
  await game(solo).getByRole('button', { name: 'Start battle' }).click()
  await solo.waitForURL(/\/battles\/[^/]+$/)
  await expect(solo.getByText('Solo army').first()).toBeVisible()
  await Promise.all(contexts.map((context) => context.close()))
})

test('group team rows keep their actions inside the card at narrow widths', async ({ page }, testInfo) => {
  await signInAsPreview(page)
  const { promise: historyHeld, resolve: releaseHistory } = Promise.withResolvers<void>()
  const isHistory = (url: string) => {
    const decoded = decodeURIComponent(url)
    return decoded.includes('preview-group-game-doubles') && decoded.includes('"before"')
  }
  let historyStarted = false
  await page.route('**/_serverFn/**', async (route) => {
    if (isHistory(route.request().url())) {
      historyStarted = true
      await historyHeld
    }
    await route.continue()
  })
  await page.goto('/groups/preview-group')
  const game = page.locator('[data-hidden-list-game="preview-group-game-doubles"]')
  await expect.poll(() => historyStarted).toBe(true)
  // A played game's lists show while its history is still loading.
  const simulation = game.getByRole('button', { name: 'Simulate against Preview Opponent', exact: true })
  await expect(simulation).toBeVisible()
  const historyLoaded = page.waitForResponse((response) => isHistory(response.url()))
  releaseHistory()
  await historyLoaded
  await expect(game.locator('a[href="/battles/preview-group-game-battle-doubles"]')).toBeVisible()
  await expect(simulation).toBeVisible()
  for (const width of [240, 320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 })
    await game.scrollIntoViewIfNeeded()
    await expectNoHorizontalOverflow(game)
    await expect(game.getByRole('button', { name: /^Simulate against/ })).toHaveCount(3)
    for (const action of await game.getByRole('button', { name: /^Simulate against/ }).all()) {
      const bounds = await action.boundingBox()
      const card = await game.boundingBox()
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(card!.x + card!.width)
    }
  }
  await simulation.click()
  const simulator = page.getByRole('dialog', { name: 'Combat simulator', exact: true })
  await expect(simulator.getByRole('combobox', { name: 'Attacking roster', exact: true })).toContainText(
    'Team 1: Preview Player and Preview Ally',
  )
  await expect(simulator.getByRole('combobox', { name: 'Defending roster', exact: true })).toContainText(
    'Team 2: Preview Opponent and Preview Rival',
  )
  await simulator.getByRole('button', { name: 'Close', exact: true }).click()
  const past = page.locator('[data-hidden-list-game="preview-group-game-duel-past"]')
  await expect(past.getByRole('button', { name: 'Simulate against Preview Opponent', exact: true })).toBeVisible()
  await expect(past.getByRole('button', { name: /^Play / })).toHaveCount(0)
  await past.getByRole('button', { name: 'Simulate against Preview Opponent', exact: true }).click()
  await expect(simulator.getByRole('combobox', { name: 'Attacking roster', exact: true })).toContainText('Preview Player')
  await expect(simulator.getByRole('combobox', { name: 'Defending roster', exact: true })).toContainText('Preview Opponent')
  await simulator.getByRole('button', { name: 'Close', exact: true }).click()
  await page.setViewportSize(PHONE)
  await game.scrollIntoViewIfNeeded()
  await page.screenshot({ path: testInfo.outputPath('group-doubles-mobile.png') })
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.getByRole('heading', { name: 'Up next', exact: true }).scrollIntoViewIfNeeded()
  await page.screenshot({ path: testInfo.outputPath('group-activity-desktop.png') })
})

test('a new hidden-list game replaces the previous one in another open tab', async ({ page }, testInfo) => {
  await signUp(page, uniqueName('Automatic game host'))
  const groupUrl = await createGroup(page, uniqueName('Automatic game nights'))
  const createGame = async (tab: Page) => {
    await (await setUpHiddenListGame(tab)).getByRole('button', { name: 'Start hidden-list game' }).click()
    await expect(tab).toHaveURL(/\?game=/)
    return new URL(tab.url()).searchParams.get('game')!
  }
  const previous = await createGame(page)
  const organizer = await page.context().newPage()
  await organizer.goto(groupUrl)
  const current = await createGame(organizer)
  // The page still names the previous game, so it follows it to the past games below.
  const past = page.getByRole('heading', { name: /^Past hidden-list games/ }).locator('..')
  await expect(past.locator(`[data-hidden-list-game="${previous}"]`)).toBeVisible()
  await expect(past.getByRole('button', { name: 'Seal your list', exact: true })).toHaveCount(0)
  const next = page.getByRole('heading', { name: 'Up next', exact: true }).locator('..')
  await expect(next.locator(`[data-hidden-list-game="${current}"]`)).toBeVisible()
  await organizer.close()
  await page.screenshot({ path: testInfo.outputPath('group-replaced-game.png'), fullPage: true })
})

test('a league fixture starts its battle from the group page and links to it', async ({ page }) => {
  await signInAsPreview(page)
  await page.goto('/groups/preview-group?tab=league', { waitUntil: 'networkidle' })
  await page.locator('[data-group-league]').getByRole('button', { name: 'Start battle', exact: true }).first().click()
  await page.waitForURL(/\/battles\/[^/]+$/)
  const token = lastPathSegment(page.url())
  await page.goto('/groups/preview-group?tab=league')
  await expect(page.locator(`[data-group-league] a[href="/battles/${token}"]`)).toHaveText('Setting up')
})

test('a group plays doubles with open lists from New game', async ({ page }) => {
  await signInAsPreview(page)
  await page.goto('/groups/preview-group', { waitUntil: 'networkidle' })
  const dialog = await openNewGame(page)
  await dialog.getByRole('button', { name: /^Doubles/ }).click()
  for (const [seat, name] of [
    ['Your ally', 'Preview Ally'],
    ['First opponent', 'Preview Opponent'],
    ['Second opponent', 'Preview Rival'],
  ]) {
    await dialog.getByRole('combobox', { name: seat }).click()
    await page.getByRole('option', { name, exact: true }).click()
  }
  await dialog.getByRole('button', { name: 'Start battle' }).click()
  await page.waitForURL(/\/battles\/[^/]+$/)
  const battleId = await battleIdFor(lastPathSegment(page.url()))
  await expectGroupBattle(battleId)
  expect(await productSql`SELECT user_id FROM battle_users WHERE battle_id = ${battleId}`).toHaveLength(4)
})

async function openNewGame(page: Page) {
  const dialog = page.getByRole('dialog', { name: 'New game', exact: true })
  await retryUntilVisible(dialog, () => page.getByRole('button', { name: 'New game', exact: true }).click({ timeout: 1_000 }))
  return dialog
}

/** Opens New game with lists hidden, which leads on to the game's setup. */
async function setUpHiddenListGame(page: Page) {
  const chooser = await openNewGame(page)
  await chooser.getByRole('switch', { name: 'Hide lists until everyone has sealed' }).click()
  await chooser.getByRole('button', { name: 'Set up game', exact: true }).click()
  return page.getByRole('dialog', { name: 'New hidden-list game' })
}

/** Seals a saved roster from the group page's hidden-list game card, which also enters its player. */
async function sealFromGroup(page: Page, game: Locator, rosterName: string) {
  const chooser = page.getByRole('dialog', { name: 'Seal a roster' })
  await retryUntilVisible(chooser, () => game.getByRole('button', { name: /^(Seal|Swap) your list$/ }).click({ timeout: 1_000 }))
  await chooser.locator(`[data-roster="${rosterName}"]`).click()
  await chooser.getByRole('button', { name: `Seal ${rosterName}` }).click()
  await expect(chooser).toBeHidden()
  await expect(game.getByRole('button', { name: 'Swap your list' })).toBeVisible()
}
