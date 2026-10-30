import { randomUUID } from 'node:crypto'
import { expect, it } from 'vitest'
import { SpacetimeOperator } from './spacetimeOperator'
import { attachedRoster, builtRoster } from '../core/battle.fixtures'
import { reduceBattle, type Command } from '../core/battle'
import { savedMissionUnitStatus } from '../core/missionSelections'

const url = process.env.SPACETIME_TEST_URL
const database = process.env.SPACETIME_TEST_DATABASE
const token = process.env.SPACETIME_TEST_OPERATOR_TOKEN

it.skipIf(!url || !database || !token)('serializes mission nominations and restores their original identity after undo', async () => {
  const operator = new SpacetimeOperator(url!, database!, token!)
  const battleId = randomUUID()
  const creatorId = randomUUID()
  const opponentId = randomUUID()
  await operator.createBattle({ id: battleId, token: randomUUID(), userId: creatorId, opponentIds: [opponentId], now: Date.now() })
  const send = (by: string, expectedSeq: number, command: Command) =>
    operator.submit({ battleId, userId: by, expectedSeq, command, now: Date.now() })
  try {
    for (const [by, command] of [
      [creatorId, builtRoster('Friendly', ['Squad'])],
      [opponentId, attachedRoster()],
      [
        creatorId,
        {
          kind: 'set-prep',
          primary: { key: 'punishment', name: 'Punishment', selection: 'punishment' },
          secondaries: [],
          stratagems: [],
          secondaryMode: 'fixed',
        },
      ],
      [creatorId, { kind: 'begin-battle', firstPlayerId: creatorId }],
    ] as [string, Command][])
      expect((await send(by, (await operator.battleForOperator(battleId)).log.length, command)).result).toMatchObject({
        outcome: 'appended',
      })
    const nomination: Command = {
      kind: 'select-mission',
      cardKey: 'punishment',
      occurrence: 4,
      selection: { kind: 'punishment', units: [{ playerId: opponentId, rosterSeq: 2, unitKey: 'u0' }], fallback: false, qualified: true },
    }
    expect(
      (await Promise.all([send(creatorId, 4, nomination), send(creatorId, 4, nomination)])).map((answer) => answer.result.outcome).sort(),
    ).toEqual(['appended', 'stale'])
    expect((await send(creatorId, 5, nomination)).result).toMatchObject({ outcome: 'refused', code: 'mission-selection-recorded' })
    expect((await send(creatorId, 5, { kind: 'undo', target: 5 })).result.outcome).toBe('appended')
    expect((await send(creatorId, 6, nomination)).result.outcome).toBe('appended')
    expect((await send(opponentId, 7, { kind: 'set-unit', unitKey: 'u0', destroyed: true })).result.outcome).toBe('appended')
    const history = await operator.battleForOperator(battleId)
    const state = reduceBattle([creatorId, opponentId], history.log)
    expect({
      selections: state.players[0]!.missionSelections.length,
      seq: state.players[0]!.missionSelections[0]!.seq,
      group: state.players[0]!.missionSelections[0]!.units[0]!.memberKeys,
      status: savedMissionUnitStatus(state, state.players[0]!.missionSelections[0]!.units[0]!),
    }).toEqual({ selections: 1, seq: 7, group: ['u0', 'u1'], status: 'battlefield' })
  } finally {
    await operator.deleteUserData(creatorId)
  }
})

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
    expect((await feed('friends')).battles.some((row) => row.battle.id === battleId)).toBe(true)

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
      initialCommands: [{ kind: 'begin-battle', firstPlayerId: randomUUID() }],
      now: Date.now(),
    }),
  ).rejects.toThrow()
  expect(await operator.battleByToken(battleToken)).toBeUndefined()
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
