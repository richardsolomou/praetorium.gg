import { expect, test, type Locator, type Page } from './test'
import { befriend, createBattle, createRoster, makeWarlord, retryUntilVisible, signUp, uniqueName } from './account'
import { productSql } from './storage'
import type { Command } from '../src/core/battle'

test.setTimeout(120_000)

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
  await owner.goto('/clubs')
  const create = owner.getByRole('dialog', { name: 'New club' })
  await retryUntilVisible(create, () => owner.getByRole('button', { name: 'New club' }).click({ timeout: 1_000 }))
  await create.getByLabel('Name').fill(clubName)
  await create.getByRole('button', { name: 'Create club' }).click()
  await expect(owner.getByRole('heading', { name: clubName })).toBeVisible()
  const clubUrl = owner.url()

  await member.goto(clubUrl)
  const join = member.getByRole('button', { name: 'Join club' })
  await retryUntilVisible(member.locator('[data-person]').filter({ hasText: memberName }), () => join.click({ timeout: 1_000 }))

  const battleUrl = await createBattle(owner, { opponent: memberName })
  const club = owner.getByRole('group', { name: 'Club', exact: true })
  await expect(club.getByRole('button', { name: new RegExp(clubName) })).toBeVisible()
  await club.getByRole('button', { name: new RegExp(clubName) }).click()
  await expect(club.getByRole('button', { name: new RegExp(clubName) })).toHaveAttribute('aria-pressed', 'true')
  await club.scrollIntoViewIfNeeded()
  await owner.screenshot({ path: testInfo.outputPath('club-setup.png') })

  const token = new URL(battleUrl).pathname.split('/').at(-1)!
  const [battle] = await productSql<{ id: string }>`SELECT id FROM battles WHERE token = ${token}`
  await expect.poll(async () => (await productSql`SELECT club_id FROM club_battles WHERE battle_id = ${battle.id}`).length).toBe(1)

  // Settle the battle in its log, as other specs do: the table is what is under test, not the game.
  const seats = await productSql<{ user_id: string; side: number }>`SELECT user_id, side FROM battle_users WHERE battle_id = ${battle.id}`
  const [first, second] = seats.toSorted((left, right) => left.side - right.side).map((seat) => seat.user_id)
  let seq = Math.max(...(await productSql<{ seq: number }>`SELECT seq FROM commands WHERE battle_id = ${battle.id}`).map((row) => row.seq))
  for (const [by, command] of [
    [first, { kind: 'attach-roster', roster: { name: 'Owner army', text: '10 Intercessors' } }],
    [second, { kind: 'attach-roster', roster: { name: 'Member army', text: '10 Plague Marines' } }],
    [first, { kind: 'begin-battle', firstPlayerId: first }],
    [second, { kind: 'end-battle', reason: 'conceded', concededBy: second }],
  ] as [string, Command][]) {
    seq += 1
    await productSql`INSERT INTO commands (key, battle_id, seq, user_id, at, body) VALUES (${JSON.stringify([battle.id, seq])}, ${battle.id}, ${seq}, ${by}, ${Date.now() + seq}, ${JSON.stringify(command)})`
  }

  await owner.goto(clubUrl)
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

  await owner.goto('/clubs')
  const create = owner.getByRole('dialog', { name: 'New club' })
  await retryUntilVisible(create, () => owner.getByRole('button', { name: 'New club' }).click({ timeout: 1_000 }))
  const clubName = uniqueName('Open night')
  await create.getByLabel('Name').fill(clubName)
  await create.getByRole('button', { name: 'Create club' }).click()
  await expect(owner.getByRole('heading', { name: clubName })).toBeVisible()
  const clubUrl = owner.url()
  await member.goto(clubUrl)
  await retryUntilVisible(member.locator('[data-person]').filter({ hasText: memberName }), () =>
    member.getByRole('button', { name: 'Join club' }).click({ timeout: 1_000 }),
  )

  await owner.reload()
  await owner.getByRole('button', { name: `Play ${memberName}` }).click()
  await owner.waitForURL(/\/battles\/[^/]+$/)
  const token = new URL(owner.url()).pathname.split('/').at(-1)!
  const [battle] = await productSql<{ id: string }>`SELECT id FROM battles WHERE token = ${token}`
  await expect.poll(async () => (await productSql`SELECT club_id FROM club_battles WHERE battle_id = ${battle.id}`).length).toBe(1)
  await ownerContext.close()
  await memberContext.close()
})

test('a club seals lists for a game night and plays them from the club page', async ({ browser }) => {
  test.setTimeout(180_000)
  const ownerContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const memberContext = await browser.newContext()
  const owner = await ownerContext.newPage()
  const member = await memberContext.newPage()
  const memberName = uniqueName('Sealed regular')
  await signUp(owner, uniqueName('Sealed host'))
  await signUp(member, memberName)
  await sealableRoster(owner, 'Host army')
  await sealableRoster(member, 'Regular army')

  await owner.goto('/clubs')
  const create = owner.getByRole('dialog', { name: 'New club' })
  await retryUntilVisible(create, () => owner.getByRole('button', { name: 'New club' }).click({ timeout: 1_000 }))
  const clubName = uniqueName('Game night')
  await create.getByLabel('Name').fill(clubName)
  await create.getByRole('button', { name: 'Create club' }).click()
  await expect(owner.getByRole('heading', { name: clubName })).toBeVisible()
  const clubUrl = owner.url()
  await member.goto(clubUrl)
  await retryUntilVisible(member.locator('[data-person]').filter({ hasText: memberName }), () =>
    member.getByRole('button', { name: 'Join club' }).click({ timeout: 1_000 }),
  )

  // The game is started, sealed, revealed and played without leaving the club page.
  await owner.reload()
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
  await game.getByRole('button', { name: 'Reveal lists' }).click()
  await owner.getByRole('alertdialog', { name: 'Reveal every list?' }).getByRole('button', { name: 'Reveal lists' }).click()
  await expect(game).toContainText('Regular army')
  await game.getByRole('button', { name: `Play ${memberName}` }).click()
  await owner.waitForURL(/\/battles\/[^/]+$/)
  await expect(owner.getByText('Host army').first()).toBeVisible()

  // Sealed games stay off the tournaments page, and their own address opens them on the club.
  const token = new URL(clubUrl).pathname.split('/').at(-1)!
  await owner.goto('/tournaments')
  await expect(owner.getByRole('heading', { name: 'Tournaments', exact: true })).toBeVisible()
  await expect(owner.locator(`[data-league="${gameToken}"]`)).toHaveCount(0)
  await owner.goto(`/tournaments/${gameToken}`)
  await expect(owner).toHaveURL(new RegExp(`/clubs/${token}\\?game=${gameToken}`))
  await ownerContext.close()
  await memberContext.close()
})

/** Seals a saved roster from the club page's sealed game card, which also enters its player. */
async function sealFromClub(page: Page, game: Locator, rosterName: string) {
  const chooser = page.getByRole('dialog', { name: 'Seal a roster' })
  await retryUntilVisible(chooser, () => game.getByRole('button', { name: /^(Seal|Swap) your list$/ }).click({ timeout: 1_000 }))
  await chooser.locator(`[data-roster="${rosterName}"]`).click()
  await chooser.getByRole('button', { name: `Seal ${rosterName}` }).click()
  await expect(chooser).toBeHidden()
  await expect(game.getByRole('button', { name: 'Swap your list' })).toBeVisible()
}

/** A roster a sealed game accepts: one Warlord at Strike Force. */
async function sealableRoster(page: Page, name: string) {
  await createRoster(page, { faction: 'Necrons', detachment: /Cursed Legion/, name })
  await page.getByLabel('Add a unit').fill('Skorpekh Lord')
  await page.getByRole('button', { name: 'Add Skorpekh Lord', exact: true }).first().click()
  await page.locator('[data-unit="Skorpekh Lord"]').getByRole('button', { name: 'Skorpekh Lord', exact: true }).click()
  await makeWarlord(page, 'Skorpekh Lord')
}
