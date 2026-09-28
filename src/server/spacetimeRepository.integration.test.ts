import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { expect, it } from 'vitest'
import { user } from '../db/authSchema'
import { importAuthSqlite } from '../../scripts/nodeAuthSqlite'
import { SqliteAccountRepository } from './accountRepository'
import { localAuthDatabase } from './localAuthDatabase'
import { SpacetimeOperator } from './spacetimeOperator'
import { SpacetimeRepository } from './spacetimeRepository'

const url = process.env.SPACETIME_TEST_URL
const database = process.env.SPACETIME_TEST_DATABASE
const token = process.env.SPACETIME_TEST_OPERATOR_TOKEN

it.skipIf(!url || !database || !token)('joins SQLite profiles with SpacetimeDB battles and relationships', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'praetorium-joined-repository-'))
  const file = path.join(directory, 'auth.sqlite')
  await importAuthSqlite(path.resolve('drizzle-auth/0000_curly_gambit.sql'), file)
  const local = localAuthDatabase(file)
  const operator = new SpacetimeOperator(url!, database!, token!)
  const repository = new SpacetimeRepository(new SqliteAccountRepository(local.database), operator)
  const creatorId = randomUUID()
  const opponentId = randomUUID()
  const battleId = randomUUID()
  const battleToken = randomUUID()
  const leagueId = randomUUID()
  const leagueToken = randomUUID()
  const leagueBattleId = randomUUID()
  try {
    const now = new Date()
    await local.database.insert(user).values([
      { id: creatorId, name: 'Creator', email: `${creatorId}@example.com`, emailVerified: true, createdAt: now, updatedAt: now },
      { id: opponentId, name: 'Opponent', email: `${opponentId}@example.com`, emailVerified: true, createdAt: now, updatedAt: now },
    ])
    await repository.createBattle({ id: battleId, token: battleToken, userId: creatorId, opponentIds: [opponentId], now: now.getTime() })
    expect((await repository.battleHistoryByToken(battleToken))?.players.map((player) => player.name)).toEqual(['Creator', 'Opponent'])
    expect((await repository.adminUsers({})).users.find((entry) => entry.id === creatorId)?.battleCount).toBe(1)
    expect((await repository.searchPlayers(creatorId, 'Opponent')).map((entry) => entry.id)).toEqual([opponentId])
    await repository.requestFriend(creatorId, opponentId, now.getTime())
    expect((await repository.searchPlayers(creatorId, 'Opponent')).map((entry) => entry.id)).toEqual([])
    expect((await repository.relationships(creatorId)).map((entry) => entry.otherName)).toEqual(['Opponent'])

    await repository.createLeague({
      id: leagueId,
      token: leagueToken,
      ownerId: creatorId,
      name: 'Test league',
      description: '',
      visibility: 'private',
      admission: 'automatic',
      playerLimit: 2,
      format: '1v1',
      rosterLimit: 2_000,
      now: now.getTime(),
    })
    expect(await repository.joinLeague(leagueToken, creatorId, now.getTime(), 128)).toBe('accepted')
    expect(await repository.joinLeague(leagueToken, opponentId, now.getTime() + 1, 128)).toBe('accepted')
    expect(await repository.joinLeague(leagueToken, randomUUID(), now.getTime(), 128)).toBe('full')
    expect((await repository.leagueByToken(leagueToken, creatorId))?.entries.map((entry) => entry.name)).toEqual(['Creator', 'Opponent'])
    expect((await repository.leaguesVisibleTo(creatorId)).find((entry) => entry.token === leagueToken)?.entrantCount).toBe(2)
    for (const [userId, name] of [
      [creatorId, 'Creator'],
      [opponentId, 'Opponent'],
    ] as const) {
      const rosterId = randomUUID()
      await operator.saveRoster({
        id: rosterId,
        userId,
        name,
        catalogueId: 'test',
        detachmentId: null,
        disposition: null,
        limit: 2_000,
        picks: '[]',
        prep: null,
        tags: '[]',
        waivedRules: '[]',
        optionalRules: '[]',
        borrowedDetachmentId: null,
        visibility: 'private',
        source: 'editable',
        now: now.getTime(),
      })
      const snapshot = JSON.stringify({
        name,
        text: name,
        built: {
          catalogueId: 'test',
          revision: 'test',
          limit: 2_000,
          detachment: null,
          disposition: null,
          units: [{ key: `${userId}-unit`, name: 'Test unit', points: 80, models: 5, group: 'character', warlord: true }],
        },
      })
      expect(
        await repository.submitLeagueRoster({
          token: leagueToken,
          userId,
          rosterId,
          rosterName: name,
          rosterLimit: 2_000,
          rosterUpdatedAt: now.getTime(),
          snapshot,
          now: now.getTime(),
        }),
      ).toEqual({ outcome: 'sealed', format: '1v1', requiredLimit: 2_000 })
    }
    expect(await repository.revealLeague(leagueToken, creatorId, now.getTime())).toEqual({
      outcome: 'revealed',
      entrantIds: [creatorId, opponentId],
    })
    expect((await repository.leagueBattleCandidates(creatorId, [creatorId, opponentId])).map((row) => row.token)).toEqual([leagueToken])
    expect((await operator.leagueByToken(leagueToken))?.entries.map((entry) => [entry.status, entry.rosterSnapshot !== null])).toEqual([
      ['accepted', true],
      ['accepted', true],
    ])
    expect(
      await repository.createLeagueBattle(
        {
          id: leagueBattleId,
          token: randomUUID(),
          leagueToken,
          userId: creatorId,
          userIds: [creatorId, opponentId],
          now: now.getTime(),
        },
        () => ({ allyIds: [], opponentIds: [opponentId], initialCommands: [], result: 'created' }),
      ),
    ).toBe('created')
    expect(await repository.unsealLeagueRoster(leagueToken, creatorId, opponentId)).toBe('unsealed')
    expect(
      await repository.createLeagueBattle(
        {
          id: randomUUID(),
          token: randomUUID(),
          leagueToken,
          userId: creatorId,
          userIds: [creatorId, opponentId],
          now: now.getTime(),
        },
        () => ({ allyIds: [], opponentIds: [opponentId], initialCommands: [], result: 'created' }),
      ),
    ).toBeUndefined()
  } finally {
    await operator.deleteUserData(opponentId)
    await operator.deleteBattle(battleId, creatorId)
    await operator.deleteUserData(creatorId)
    local.client.close()
    await rm(directory, { recursive: true, force: true })
  }
})
