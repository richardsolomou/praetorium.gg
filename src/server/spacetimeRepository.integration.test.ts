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
  const sealedEventId = randomUUID()
  const sealedEventToken = randomUUID()
  const fullSealedEventToken = randomUUID()
  const sealedEventBattleId = randomUUID()
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

    await repository.createTournament({
      id: sealedEventId,
      token: sealedEventToken,
      eventId: randomUUID(),
      eventToken: randomUUID(),
      ownerId: creatorId,
      name: 'Test sealed event',
      description: '',
      visibility: 'private',
      admission: 'automatic',
      playerLimit: 2,
      format: '1v1',
      rosterLimit: 2_000,
      now: now.getTime(),
    })
    expect(await repository.joinSealedEvent(sealedEventToken, creatorId, now.getTime(), 128)).toBe('accepted')
    expect(await repository.joinSealedEvent(sealedEventToken, opponentId, now.getTime() + 1, 128)).toBe('accepted')
    expect(await repository.joinSealedEvent(sealedEventToken, randomUUID(), now.getTime(), 128)).toBe('full')
    expect((await repository.sealedEventByToken(sealedEventToken, creatorId))?.entries.map((entry) => entry.name)).toEqual([
      'Creator',
      'Opponent',
    ])
    expect((await repository.sealedEventsVisibleTo(creatorId)).find((entry) => entry.token === sealedEventToken)?.entrantCount).toBe(2)
    // Without a limit the organizer reveals; the self-revealing sealed event below fills its places.
    const details = {
      name: 'Test sealed event',
      description: '',
      visibility: 'private',
      admission: 'automatic',
      playerLimit: null,
    } as const
    expect(await repository.updateSealedEvent(sealedEventToken, creatorId, { details })).toEqual({ admitted: [], ruleChanged: false })
    const seals: { userId: string; rosterId: string; snapshot: string }[] = []
    for (const [userId, name] of [
      [creatorId, 'Creator'],
      [opponentId, 'Opponent'],
    ] as const) {
      const rosterId = randomUUID()
      const savedInput = {
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
      } as const
      await operator.saveRoster(savedInput)
      const snapshot = JSON.stringify({
        name,
        text: name,
        built: {
          catalogueId: 'test',
          revision: 'test',
          limit: 2_000,
          detachment: null,
          disposition: null,
          detachmentIds: [],
          waivedRules: [],
          picks: [],
          units: [{ key: `${userId}-unit`, name: 'Test unit', points: 80, models: 5, group: 'character', warlord: true }],
        },
      })
      expect(
        await repository.submitSealedEventRoster({
          token: sealedEventToken,
          userId,
          rosterId,
          rosterName: name,
          rosterLimit: 2_000,
          rosterUpdatedAt: now.getTime(),
          snapshot,
          now: now.getTime(),
        }),
      ).toEqual({ outcome: 'sealed', format: '1v1', requiredLimit: 2_000 })
      expect(await repository.outdatedSealedEventEntriesForRoster(userId, rosterId)).toEqual([])
      await operator.saveRoster({ ...savedInput, name: `${name} changed in the same millisecond` })
      expect(await repository.outdatedSealedEventEntriesForRoster(userId, rosterId)).toHaveLength(1)
      await operator.saveRoster({ ...savedInput, name: `${name} revised`, now: now.getTime() + 1 })
      expect(await repository.outdatedSealedEventEntriesForRoster(userId, rosterId)).toEqual([
        { token: sealedEventToken, name: 'Test sealed event', group: null },
      ])
      await operator.saveRoster({ ...savedInput, now: now.getTime() + 2 })
      expect(await repository.outdatedSealedEventEntriesForRoster(userId, rosterId)).toEqual([])
      await operator.saveRoster({ ...savedInput, picks: '[{"entryId":"another-unit"}]', now: now.getTime() + 3 })
      expect(await repository.outdatedSealedEventEntriesForRoster(userId, rosterId)).toHaveLength(1)
      await operator.saveRoster({ ...savedInput, now: now.getTime() + 4 })
      expect(await repository.outdatedSealedEventEntriesForRoster(userId, rosterId)).toEqual([])
      seals.push({ userId, rosterId, snapshot })
      expect(await repository.outdatedSealedEventEntriesForRoster(userId === creatorId ? opponentId : creatorId, rosterId)).toEqual([])
    }
    // Anyone playing may open a ready sealed event; somebody outside it may not.
    expect(await repository.revealSealedEvent(sealedEventToken, randomUUID(), now.getTime())).toEqual({ outcome: 'not-ready' })
    expect(await repository.revealSealedEvent(sealedEventToken, opponentId, now.getTime())).toEqual({
      outcome: 'revealed',
      entrantIds: [creatorId, opponentId],
    })
    // Admins come from the owner's friends, run the sealed event beside them, and cannot remove it or choose other admins.
    expect(await repository.setSealedEventAdmins(sealedEventToken, creatorId, [opponentId], now.getTime())).toBe('not-friends')
    expect(await repository.friendSealedEventRosters(creatorId)).toEqual([])
    await repository.acceptFriend(creatorId, opponentId, now.getTime())
    // A friend's revealed list is offered to the simulator; a stranger sees none.
    expect((await repository.friendSealedEventRosters(creatorId)).map((row) => [row.userId, row.ownerName, row.catalogueId])).toEqual([
      [opponentId, 'Opponent', 'test'],
    ])
    expect(await repository.friendSealedEventRosters(randomUUID())).toEqual([])
    expect(await repository.setSealedEventAdmins(sealedEventToken, creatorId, [opponentId], now.getTime())).toEqual({ added: [opponentId] })
    expect(await repository.setSealedEventAdmins(sealedEventToken, opponentId, [], now.getTime())).toBe('forbidden')
    expect(await repository.deleteSealedEvent(sealedEventToken, opponentId)).toBe('forbidden')
    expect(
      await repository.updateSealedEvent(sealedEventToken, opponentId, { details: { ...details, name: 'Renamed by an admin' } }),
    ).toEqual({
      admitted: [],
      ruleChanged: false,
    })
    expect(
      (await repository.sealedEventsVisibleTo(opponentId)).find((entry) => entry.token === sealedEventToken)?.tournament?.adminIds,
    ).toEqual([opponentId])
    const revealed = await repository.sealedEventByToken(sealedEventToken, null)
    expect([revealed?.tournament?.name, revealed?.tournament?.admins.map((admin) => admin.name), revealed?.revealedByName]).toEqual([
      'Renamed by an admin',
      ['Opponent'],
      'Opponent',
    ])
    expect(revealed?.entries.map((entry) => [entry.army?.name, entry.army?.points])).toEqual([
      ['Creator', 80],
      ['Opponent', 80],
    ])
    const creatorRosterId = (await operator.leagueByToken(sealedEventToken))!.entries.find((entry) => entry.userId === creatorId)!.rosterId!
    expect(await repository.outdatedSealedEventEntriesForRoster(creatorId, creatorRosterId)).toEqual([])
    expect((await repository.sealedEventBattleCandidates(creatorId, [creatorId, opponentId])).map((row) => row.token)).toEqual([
      sealedEventToken,
    ])
    expect((await operator.leagueByToken(sealedEventToken))?.entries.map((entry) => [entry.status, entry.rosterSnapshot !== null])).toEqual(
      [
        ['accepted', true],
        ['accepted', true],
      ],
    )
    expect(
      await repository.createSealedEventBattle(
        {
          id: sealedEventBattleId,
          token: randomUUID(),
          sealedEventToken,
          userId: creatorId,
          userIds: [creatorId, opponentId],
          now: now.getTime(),
        },
        () => ({ allyIds: [], opponentIds: [opponentId], initialCommands: [], result: 'created' }),
      ),
    ).toBe('created')
    expect(await repository.unsealSealedEventRoster(sealedEventToken, creatorId, opponentId)).toBe('unsealed')
    expect(
      await repository.createSealedEventBattle(
        {
          id: randomUUID(),
          token: randomUUID(),
          sealedEventToken,
          userId: creatorId,
          userIds: [creatorId, opponentId],
          now: now.getTime(),
        },
        () => ({ allyIds: [], opponentIds: [opponentId], initialCommands: [], result: 'created' }),
      ),
    ).toBeUndefined()

    await repository.createTournament({
      id: randomUUID(),
      token: fullSealedEventToken,
      eventId: randomUUID(),
      eventToken: randomUUID(),
      ownerId: creatorId,
      ...details,
      playerLimit: 2,
      format: '1v1',
      rosterLimit: 2_000,
      now: now.getTime(),
    })
    for (const seal of seals) await repository.joinSealedEvent(fullSealedEventToken, seal.userId, now.getTime(), 128)
    for (const seal of seals) {
      const result = await repository.submitSealedEventRoster({
        token: fullSealedEventToken,
        userId: seal.userId,
        rosterId: seal.rosterId,
        rosterName: 'Sealed',
        rosterLimit: 2_000,
        rosterUpdatedAt: (await repository.roster(seal.rosterId))!.updatedAt,
        snapshot: seal.snapshot,
        now: now.getTime(),
      })
      expect(result.outcome).toBe('sealed')
    }
    // Filling the last place leaves the lists sealed until someone reveals them.
    expect((await repository.sealedEventByToken(fullSealedEventToken, null))?.revealedAt).toBeNull()
  } finally {
    await operator.deleteUserData(opponentId)
    await operator.deleteBattle(battleId, creatorId)
    await operator.deleteUserData(creatorId)
    local.client.close()
    await rm(directory, { recursive: true, force: true })
  }
})
