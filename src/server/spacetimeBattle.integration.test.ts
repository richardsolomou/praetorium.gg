import { randomUUID } from 'node:crypto'
import { expect, it } from 'vitest'
import { SpacetimeOperator } from './spacetimeOperator'

const url = process.env.SPACETIME_TEST_URL
const database = process.env.SPACETIME_TEST_DATABASE
const token = process.env.SPACETIME_TEST_OPERATOR_TOKEN

it.skipIf(!url || !database || !token)('serializes concurrent battle commands and keeps refusal paths read only', async () => {
  const operator = new SpacetimeOperator(url!, database!, token!)
  const battleId = randomUUID()
  const creatorId = randomUUID()
  const opponentId = randomUUID()
  const battleToken = randomUUID()
  const now = Date.now()
  await operator.createBattle({ id: battleId, token: battleToken, userId: creatorId, opponentIds: [opponentId], now })
  try {
    expect((await operator.battleByToken(battleToken))?.battle.id).toBe(battleId)
    expect((await operator.productStats([creatorId])).get(creatorId)?.battleCount).toBe(1)
    expect(await operator.shareBattle(creatorId, opponentId)).toBe(true)
    const command = { kind: 'set-setup-step' as const, step: 1 }
    const input = { battleId, userId: creatorId, expectedSeq: 0, command, now }
    const results = await Promise.all([operator.submit(input), operator.submit(input)])
    expect(results.map((one) => one.result.outcome).sort()).toEqual(['appended', 'stale'])
    expect((await operator.battleForOperator(battleId)).log).toHaveLength(1)

    const viewerId = randomUUID()
    const feed = (scope: 'public' | 'friends') => operator.battleFeed({ scope, userId: viewerId, viewerId, limit: 500 })
    expect((await feed('public')).battles.some((row) => row.battle.id === battleId)).toBe(true)
    await operator.requestFriend(creatorId, viewerId, now)
    await operator.acceptFriend(creatorId, viewerId, now)
    await operator.setBattleAudience(creatorId, 'friends', now)
    expect((await feed('public')).battles.some((row) => row.battle.id === battleId)).toBe(false)
    expect((await feed('friends')).battles.some((row) => row.battle.id === battleId)).toBe(true)
    await operator.setBattleAudience(creatorId, 'private', now)
    expect((await feed('friends')).battles.some((row) => row.battle.id === battleId)).toBe(false)

    const refused = await operator.submit({ ...input, userId: 'outsider', expectedSeq: 1 })
    expect(refused.result).toEqual({ outcome: 'refused', code: 'not-seated', reason: 'you are not in this battle' })

    const externallyRefused = await operator.submit({ ...input, expectedSeq: 1 }, () => ({
      code: 'missing-deployment',
      message: 'choose a deployment',
    }))
    expect(externallyRefused.result).toEqual({ outcome: 'refused', code: 'missing-deployment', reason: 'choose a deployment' })
    expect((await operator.battleForOperator(battleId)).log).toHaveLength(1)
    expect(await operator.deleteBattle(battleId, opponentId)).toBe(false)
    expect(await operator.deleteBattle(battleId, creatorId)).toBe(true)
    expect(await operator.battleByToken(battleToken)).toBeUndefined()
  } finally {
    await operator.deleteUserData(creatorId)
  }
})

it.skipIf(!url || !database || !token)('rolls back battle creation when an initial command is refused', async () => {
  const operator = new SpacetimeOperator(url!, database!, token!)
  const battleToken = randomUUID()
  await expect(
    operator.createBattle({
      id: randomUUID(),
      token: battleToken,
      userId: randomUUID(),
      opponentIds: [randomUUID()],
      initialCommand: { kind: 'begin-battle', firstPlayerId: randomUUID() },
      now: Date.now(),
    }),
  ).rejects.toThrow()
  expect(await operator.battleByToken(battleToken)).toBeUndefined()
})

it.skipIf(!url || !database || !token)('advances standings revision only when a battle changes its result', async () => {
  const operator = new SpacetimeOperator(url!, database!, token!)
  const battleId = randomUUID()
  const userId = randomUUID()
  const opponentId = randomUUID()
  await operator.createBattle({ id: battleId, token: randomUUID(), userId, opponentIds: [opponentId], now: Date.now() })
  try {
    const before = await operator.publicStandingsRevision()
    const send = (by: string, expectedSeq: number, command: Parameters<typeof operator.submit>[0]['command']) =>
      operator.submit({ battleId, userId: by, expectedSeq, command, now: Date.now() })

    expect((await send(userId, 0, { kind: 'attach-roster', roster: { name: 'Army one', text: 'Army one' } })).result.outcome).toBe(
      'appended',
    )
    expect((await send(opponentId, 1, { kind: 'attach-roster', roster: { name: 'Army two', text: 'Army two' } })).result.outcome).toBe(
      'appended',
    )
    expect((await send(userId, 2, { kind: 'begin-battle', firstPlayerId: userId })).result.outcome).toBe('appended')
    expect(await operator.publicStandingsRevision()).toBe(before)

    expect((await send(userId, 3, { kind: 'end-battle', reason: 'conceded', concededBy: userId })).result.outcome).toBe('appended')
    const finished = await operator.publicStandingsRevision()
    expect(BigInt(finished)).toBeGreaterThan(BigInt(before))

    expect((await send(userId, 4, { kind: 'reopen-battle' })).result.outcome).toBe('appended')
    expect(BigInt(await operator.publicStandingsRevision())).toBeGreaterThan(BigInt(finished))
  } finally {
    await operator.deleteBattle(battleId, userId)
  }
})

it.skipIf(!url || !database || !token)('orders a player feed by activity across cursor pages', async () => {
  const operator = new SpacetimeOperator(url!, database!, token!)
  const userId = randomUUID()
  const ids = [randomUUID(), randomUUID(), randomUUID()]
  const now = Date.now()
  try {
    for (const [index, id] of ids.entries()) {
      await operator.createBattle({ id, token: randomUUID(), userId, opponentIds: [randomUUID()], now: now + index })
    }
    await operator.submit({
      battleId: ids[0]!,
      userId,
      expectedSeq: 0,
      command: { kind: 'set-setup-step', step: 1 },
      now: now + 10,
    })
    const first = await operator.battleFeed({ scope: 'user', userId, limit: 2 })
    const second = await operator.battleFeed({ scope: 'user', userId, before: first.nextCursor, limit: 2 })
    expect([...first.battles, ...second.battles].map((row) => row.battle.id)).toEqual([ids[0], ids[2], ids[1]])
  } finally {
    for (const id of ids) await operator.deleteBattle(id, userId)
  }
})
