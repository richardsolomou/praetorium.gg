import { expect, test, type Locator, type Page } from './test'
import { befriend, createBattle, retryUntilVisible, signInAsPreview, signUp, uniqueName, sealableRoster, PHONE } from './account'
import { productSql, lastPathSegment, battleIdFor, seatsBySide, appendCommand } from './storage'
import type { Command } from '../src/core/battle'
import { expectNoHorizontalOverflow } from './builder.harness'

test.setTimeout(120_000)

/** Founds a club from the clubs page and returns its address once its page shows. */
async function createClub(page: Page, name: string) {
  await page.goto('/clubs')
  const create = page.getByRole('dialog', { name: 'New club' })
  await retryUntilVisible(create, () => page.getByRole('button', { name: 'New club', exact: true }).click({ timeout: 1_000 }))
  await create.getByLabel('Name').fill(name)
  await create.getByRole('button', { name: 'Create club' }).click()
  await expect(page.getByRole('heading', { name })).toBeVisible()
  return page.url()
}

/** Joins a club from its page until the member list names the player. */
async function joinClub(page: Page, clubUrl: string, name: string) {
  await page.goto(clubUrl)
  await retryUntilVisible(page.locator('[data-person]').filter({ hasText: name }), () =>
    page.getByRole('button', { name: 'Join club' }).click({ timeout: 1_000 }),
  )
}

const expectClubBattle = (battleId: string) =>
  expect.poll(async () => (await productSql`SELECT club_id FROM club_battles WHERE battle_id = ${battleId}`).length).toBe(1)

test('club members choose their club at battle setup', async ({ browser }, testInfo) => {
  const ownerContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const memberContext = await browser.newContext()
  const owner = await ownerContext.newPage()
  const member = await memberContext.newPage()
  const ownerName = uniqueName('Club owner')
  const memberName = uniqueName('Club member')
  await signUp(owner, ownerName)
  await signUp(member, memberName)
  await befriend(owner, member)

  const clubName = uniqueName('Thursday club')
  const clubUrl = await createClub(owner, clubName)

  await joinClub(member, clubUrl, memberName)

  const battleUrl = await createBattle(owner, { opponent: memberName })
  const club = owner.getByRole('group', { name: 'Club', exact: true })
  await expect(club.getByRole('button', { name: new RegExp(clubName) })).toBeVisible()
  await club.getByRole('button', { name: new RegExp(clubName) }).click()
  await expect(club.getByRole('button', { name: new RegExp(clubName) })).toHaveAttribute('aria-pressed', 'true')
  await club.scrollIntoViewIfNeeded()
  await owner.screenshot({ path: testInfo.outputPath('club-setup.png') })

  const battleId = await battleIdFor(lastPathSegment(battleUrl))
  await expectClubBattle(battleId)

  // Settle the battle in its log: the table is what is under test, not the game.
  const [first, second] = await seatsBySide(battleId)
  for (const [by, command] of [
    [first, { kind: 'attach-roster', roster: { name: 'Owner army', text: '10 Intercessors' } }],
    [second, { kind: 'attach-roster', roster: { name: 'Member army', text: '10 Plague Marines' } }],
    [first, { kind: 'begin-battle', firstPlayerId: first }],
    [second, { kind: 'end-battle', reason: 'conceded', concededBy: second }],
  ] as [string, Command][])
    await appendCommand(battleId, by, command)

  await owner.goto(`${clubUrl}?tab=leaderboard`)
  const table = owner.locator('[data-standings]')
  // The winner leads the table, and both members are on it.
  await expect(table.locator('tbody tr')).toHaveCount(2)
  await expect(table.locator('tbody tr').first()).toContainText(ownerName)
  await owner.screenshot({ path: testInfo.outputPath('club-page.png'), fullPage: true })

  await ownerContext.close()
  await memberContext.close()
})

test('members who are not friends start a club game from the club page', async ({ browser }) => {
  const ownerContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const memberContext = await browser.newContext()
  const owner = await ownerContext.newPage()
  const member = await memberContext.newPage()
  await signUp(owner, uniqueName('Club host'))
  const memberName = uniqueName('Club regular')
  await signUp(member, memberName)

  const clubName = uniqueName('Open night')
  const clubUrl = await createClub(owner, clubName)
  await joinClub(member, clubUrl, memberName)

  await owner.reload()
  await openNewGame(owner)
  await owner.getByRole('dialog', { name: 'New game', exact: true }).getByRole('button', { name: 'Start battle' }).click()
  await owner.waitForURL(/\/battles\/[^/]+$/)
  const battleId = await battleIdFor(lastPathSegment(owner.url()))
  await expectClubBattle(battleId)
  await ownerContext.close()
  await memberContext.close()
})

test('a club seals lists for a game night and plays them from the club page', async ({ browser }, testInfo) => {
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

  const clubName = uniqueName('Game night')
  const clubUrl = await createClub(owner, clubName)
  await joinClub(member, clubUrl, memberName)

  // The game is started, sealed, revealed and played without leaving the club page.
  await owner.reload()
  await openNewGame(owner)
  const dialog = owner.getByRole('dialog', { name: 'New sealed game' })
  await retryUntilVisible(dialog, () => owner.getByRole('button', { name: 'New sealed game' }).click({ timeout: 1_000 }))
  await dialog.getByRole('button', { name: 'Start sealed game' }).click()
  await expect(owner).toHaveURL(/\/clubs\/[^/?]+\?game=/)
  const gameToken = new URL(owner.url()).searchParams.get('game')!
  const game = owner.locator('[data-sealed-game]')
  await sealFromClub(owner, game, 'Host army')
  await member.goto(clubUrl)
  await sealFromClub(member, member.locator('[data-sealed-game]'), 'Regular army')

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
  await owner.screenshot({ path: testInfo.outputPath('club-up-next-mobile.png') })
  await owner.setViewportSize({ width: 1440, height: 1000 })
  await game.scrollIntoViewIfNeeded()
  await owner.screenshot({ path: testInfo.outputPath('club-up-next-desktop.png') })
  await game.getByRole('button', { name: `Play ${memberName}` }).click()
  await owner.waitForURL(/\/battles\/[^/]+$/)
  await expect(owner.getByText('Host army').first()).toBeVisible()
  const battlePath = new URL(owner.url()).pathname

  // Sealed games stay off the tournaments page, and their own address opens them on the club, even once played.
  const token = lastPathSegment(clubUrl)
  await owner.goto('/tournaments')
  await expect(owner.getByRole('heading', { name: 'Tournaments', exact: true })).toBeVisible()
  await expect(owner.locator(`[data-league="${gameToken}"]`)).toHaveCount(0)
  await owner.goto(`/tournaments/${gameToken}`)
  await expect(owner).toHaveURL(new RegExp(`/clubs/${token}\\?game=${gameToken}`))
  await expect(owner.locator(`[data-sealed-game="${gameToken}"]`)).toContainText('Regular army')
  // A battle still being played shows once, inside its game under Up next.
  await expect(owner.locator(`a[href="${battlePath}"]`)).toHaveCount(1)
  const midnight = await owner.evaluate(() => {
    const date = new Date()
    date.setHours(24, 0, 0, 0)
    return date.getTime()
  })
  await owner.clock.fastForward(midnight - (await owner.evaluate(() => Date.now())) + 1)
  await expect(game.locator('summary')).toBeVisible()
  await game.locator('summary').click()
  await expect(game.getByRole('button', { name: /^Play / })).toHaveCount(0)
  await expect(game.getByRole('button', { name: `Simulate against ${memberName}`, exact: true })).toBeVisible()
  await expect(game.locator(`a[href="${battlePath}"]`)).toBeVisible()
  await owner.screenshot({ path: testInfo.outputPath('club-game-after-midnight.png'), fullPage: true })
  await game.locator(`a[href="${battlePath}"]`).click()
  await expect(owner.getByText('Host army').first()).toBeVisible()
  await ownerContext.close()
  await memberContext.close()
})

test('a club plays a solo-vs-pair sealed game, its players taking their own sides', async ({ browser }) => {
  test.setTimeout(240_000)
  const contexts = await Promise.all([0, 1, 2].map(() => browser.newContext({ viewport: { width: 1440, height: 1000 } })))
  const [solo, ally, partner] = (await Promise.all(contexts.map((context) => context.newPage()))) as [Page, Page, Page]
  await signUp(solo, uniqueName('Solo host'))
  await signUp(ally, uniqueName('First ally'))
  await signUp(partner, uniqueName('Second ally'))
  await sealableRoster(solo, 'Solo army')
  await sealableRoster(ally, 'First allied army', { size: /Incursion/ })
  await sealableRoster(partner, 'Second allied army', { size: /Incursion/ })

  const clubUrl = await createClub(solo, uniqueName('Team night'))
  for (const player of [ally, partner]) {
    await player.goto(clubUrl)
    await retryUntilVisible(player.getByRole('button', { name: 'Copy invite link' }), () =>
      player.getByRole('button', { name: 'Join club' }).click({ timeout: 1_000 }),
    )
  }

  await solo.reload()
  await openNewGame(solo)
  const dialog = solo.getByRole('dialog', { name: 'New sealed game' })
  await retryUntilVisible(dialog, () => solo.getByRole('button', { name: 'New sealed game' }).click({ timeout: 1_000 }))
  await dialog.getByRole('button', { name: /^Solo vs pair/ }).click()
  await dialog.getByRole('button', { name: 'Start sealed game' }).click()
  await expect(solo).toHaveURL(/\?game=/)
  const gameUrl = solo.url()
  const game = (page: Page) => page.locator('[data-sealed-game]')

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
  await sealFromClub(solo, game(solo), 'Solo army')
  await sealFromClub(ally, game(ally), 'First allied army')
  await sealFromClub(partner, game(partner), 'Second allied army')

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

test('club team rows keep their actions inside the card at narrow widths', async ({ page }, testInfo) => {
  await signInAsPreview(page)
  const { promise: historyHeld, resolve: releaseHistory } = Promise.withResolvers<void>()
  const isHistory = (url: string) => {
    const decoded = decodeURIComponent(url)
    return decoded.includes('preview-club-game-doubles') && decoded.includes('"before"')
  }
  let historyStarted = false
  await page.route('**/_serverFn/**', async (route) => {
    if (isHistory(route.request().url())) {
      historyStarted = true
      await historyHeld
    }
    await route.continue()
  })
  await page.goto('/clubs/preview-club?tab=sealed')
  const game = page.locator('[data-sealed-game="preview-club-game-doubles"]')
  await expect.poll(() => historyStarted).toBe(true)
  await expect(game.locator('details')).not.toHaveAttribute('open', '')
  const simulation = game.getByRole('button', { name: 'Simulate against Preview Opponent', exact: true })
  await retryUntilVisible(simulation, () => game.locator('summary').click({ timeout: 1_000 }))
  const historyLoaded = page.waitForResponse((response) => isHistory(response.url()))
  releaseHistory()
  await historyLoaded
  await expect(game.locator('a[href="/battles/preview-club-game-battle-doubles"]')).toBeVisible()
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
  const past = page.locator('[data-sealed-game="preview-club-game-duel-past"]')
  await retryUntilVisible(past.getByRole('button', { name: 'Simulate against Preview Opponent', exact: true }), () =>
    past.locator('summary').click({ timeout: 1_000 }),
  )
  await expect(past.getByRole('button', { name: /^Play / })).toHaveCount(0)
  await past.getByRole('button', { name: 'Simulate against Preview Opponent', exact: true }).click()
  await expect(simulator.getByRole('combobox', { name: 'Attacking roster', exact: true })).toContainText('Preview Player')
  await expect(simulator.getByRole('combobox', { name: 'Defending roster', exact: true })).toContainText('Preview Opponent')
  await simulator.getByRole('button', { name: 'Close', exact: true }).click()
  await page.setViewportSize(PHONE)
  await game.scrollIntoViewIfNeeded()
  await page.screenshot({ path: testInfo.outputPath('club-doubles-mobile.png') })
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.getByRole('tab', { name: 'Overview' }).click()
  await page.getByRole('heading', { name: 'Up next', exact: true }).scrollIntoViewIfNeeded()
  await page.screenshot({ path: testInfo.outputPath('club-activity-desktop.png') })
})

test('a new sealed game replaces the previous one in another open tab', async ({ page }, testInfo) => {
  await signUp(page, uniqueName('Automatic game host'))
  const clubUrl = await createClub(page, uniqueName('Automatic game nights'))
  const createGame = async (tab: Page) => {
    await openNewGame(tab)
    await tab.getByRole('button', { name: 'New sealed game', exact: true }).click()
    await tab.getByRole('dialog', { name: 'New sealed game' }).getByRole('button', { name: 'Start sealed game' }).click()
    await expect(tab).toHaveURL(/\?game=/)
    return new URL(tab.url()).searchParams.get('game')!
  }
  const previous = await createGame(page)
  const organizer = await page.context().newPage()
  await organizer.goto(clubUrl)
  const current = await createGame(organizer)
  // The page still names the previous game, so it follows it to the past games.
  const past = page.getByRole('heading', { name: /^Past sealed games/ }).locator('..')
  await expect(past.locator(`[data-sealed-game="${previous}"]`)).toBeVisible()
  await expect(past.getByRole('button', { name: 'Seal your list', exact: true })).toHaveCount(0)
  await page.getByRole('tab', { name: 'Overview' }).click()
  const next = page.getByRole('heading', { name: 'Up next', exact: true }).locator('..')
  await expect(next.locator(`[data-sealed-game="${current}"]`)).toBeVisible()
  await organizer.close()
  await page.screenshot({ path: testInfo.outputPath('club-replaced-game.png'), fullPage: true })
})

test('a season fixture starts its battle from the club page and links to it', async ({ page }) => {
  await signInAsPreview(page)
  await page.goto('/clubs/preview-club?tab=season', { waitUntil: 'networkidle' })
  await page.locator('[data-club-season]').getByRole('button', { name: 'Start battle', exact: true }).first().click()
  await page.waitForURL(/\/battles\/[^/]+$/)
  const token = lastPathSegment(page.url())
  await page.goto('/clubs/preview-club?tab=season')
  await expect(page.locator(`[data-club-season] a[href="/battles/${token}"]`)).toHaveText('Setting up')
})

async function openNewGame(page: Page) {
  const dialog = page.getByRole('dialog', { name: 'New game', exact: true })
  await retryUntilVisible(dialog, () => page.getByRole('button', { name: 'New game', exact: true }).click({ timeout: 1_000 }))
}

/** Seals a saved roster from the club page's sealed game card, which also enters its player. */
async function sealFromClub(page: Page, game: Locator, rosterName: string) {
  const chooser = page.getByRole('dialog', { name: 'Seal a roster' })
  await retryUntilVisible(chooser, () => game.getByRole('button', { name: /^(Seal|Swap) your list$/ }).click({ timeout: 1_000 }))
  await chooser.locator(`[data-roster="${rosterName}"]`).click()
  await chooser.getByRole('button', { name: `Seal ${rosterName}` }).click()
  await expect(chooser).toBeHidden()
  await expect(game.getByRole('button', { name: 'Swap your list' })).toBeVisible()
}
