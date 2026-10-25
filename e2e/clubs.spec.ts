import { expect, test } from './test'
import { befriend, createBattle, retryUntilVisible, signUp, uniqueName } from './account'
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

  // A tournament the club runs links back to it and is listed on the club page.
  const tournamentName = uniqueName('Club tournament')
  const tournament = owner.getByRole('dialog', { name: 'New tournament' })
  await retryUntilVisible(tournament, () => owner.getByRole('button', { name: 'New tournament' }).click({ timeout: 1_000 }))
  await tournament.getByLabel('Name').fill(tournamentName)
  await tournament.getByRole('button', { name: 'Create tournament' }).click()
  await expect(owner).toHaveURL(/\/tournaments\/[^/?]+/)
  await owner.getByRole('link', { name: clubName }).click()
  await expect(owner.getByRole('link', { name: new RegExp(tournamentName) })).toBeVisible()
  await ownerContext.close()
  await memberContext.close()
})
