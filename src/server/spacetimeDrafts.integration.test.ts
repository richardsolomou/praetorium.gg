import { randomUUID } from 'node:crypto'
import { expect, it } from 'vitest'
import { SpacetimeOperator } from './spacetimeOperator'
import { attachedRoster } from '../core/battle.fixtures'
import type { Command } from '../core/battle'

const url = process.env.SPACETIME_TEST_URL
const database = process.env.SPACETIME_TEST_DATABASE
const token = process.env.SPACETIME_TEST_OPERATOR_TOKEN

const configure = (places: [number, number] = [1, 1]): Command => ({
  kind: 'configure-battle',
  limit: null,
  missionPackId: null,
  terrainLayoutId: null,
  twistId: null,
  teamBattle: places[0] + places[1] > 2,
  playerCount: (places[0] + places[1]) as 2 | 3 | 4,
  places,
  clockLimitMinutes: null,
})

it.skipIf(!url || !database || !token)('keeps a draft out of every list until its last army is chosen', async () => {
  const operator = new SpacetimeOperator(url!, database!, token!)
  const creatorId = randomUUID()
  const joinerId = randomUUID()
  const now = Date.now()
  const draft = () =>
    operator.createBattle({ id: randomUUID(), token: randomUUID(), userId: creatorId, draft: true, initialCommands: [configure()], now })
  const { battle } = await draft()
  try {
    const listed = async () =>
      (await operator.battleFeed({ scope: 'user', userId: creatorId, limit: 10 })).battles.map((row) => row.battle.id)
    expect({
      reused: (await draft()).battle.id,
      listed: await listed(),
      count: (await operator.productStats([creatorId])).get(creatorId)?.battleCount,
      drafts: (await operator.draftsByUser(creatorId)).map((row) => row.battle.id),
    }).toEqual({ reused: battle.id, listed: [], count: 0, drafts: [battle.id] })

    const link = await operator.battleInvite(battle.id, creatorId, randomUUID())
    const seat = (userId: string, invite = link!.invite) =>
      operator.seatBattlePlayer({ battleId: battle.id, userId, side: 1, by: userId, invite, now })
    expect([await seat(joinerId, randomUUID()), await seat(joinerId), await seat(randomUUID())]).toEqual(['missing', 'joined', 'full'])

    const send = async (by: string, command: Command) =>
      (
        await operator.submit({
          battleId: battle.id,
          userId: by,
          expectedSeq: (await operator.battleForOperator(battle.id)).log.length,
          command,
          now,
        })
      ).result
    await send(creatorId, attachedRoster())
    expect(await listed()).toEqual([])
    await send(joinerId, attachedRoster())
    expect({ listed: await listed(), state: await operator.battleDraftState(battle.id) }).toEqual({
      listed: [battle.id],
      state: { draft: false, invite: null },
    })
  } finally {
    await operator.deleteUserData(creatorId)
  }
})

it.skipIf(!url || !database || !token)('lets only the creator take a joined player back out before the start', async () => {
  const operator = new SpacetimeOperator(url!, database!, token!)
  const creatorId = randomUUID()
  const joinerId = randomUUID()
  const { battle } = await operator.createBattle({
    id: randomUUID(),
    token: randomUUID(),
    userId: creatorId,
    draft: true,
    initialCommands: [configure()],
    now: Date.now(),
  })
  try {
    const link = await operator.battleInvite(battle.id, creatorId, randomUUID())
    await operator.seatBattlePlayer({ battleId: battle.id, userId: joinerId, side: 1, by: joinerId, invite: link!.invite, now: Date.now() })
    expect([
      await operator.removeBattlePlayer(battle.id, joinerId, creatorId),
      await operator.removeBattlePlayer(battle.id, creatorId, joinerId),
      (await operator.battleForOperator(battle.id)).seats.map((seat) => seat.id),
      await operator.seatBattlePlayer({
        battleId: battle.id,
        userId: joinerId,
        side: 1,
        by: joinerId,
        invite: link!.invite,
        now: Date.now(),
      }),
    ]).toEqual([false, true, [creatorId], 'missing'])
  } finally {
    await operator.deleteUserData(creatorId)
  }
})

it.skipIf(!url || !database || !token)('deletes a draft nobody has changed or joined since the cutoff', async () => {
  const operator = new SpacetimeOperator(url!, database!, token!)
  const creatorId = randomUUID()
  const joinerId = randomUUID()
  const old = () =>
    operator.createBattle({
      id: randomUUID(),
      token: randomUUID(),
      userId: creatorId,
      draft: true,
      initialCommands: [configure()],
      now: 1_000,
    })
  const { battle: idle } = await old()
  const link = await operator.battleInvite(idle.id, creatorId, randomUUID())
  const { battle: joined } = await old()
  const joinedLink = await operator.battleInvite(joined.id, creatorId, randomUUID())
  await operator.seatBattlePlayer({ battleId: joined.id, userId: joinerId, side: 1, by: joinerId, invite: joinedLink!.invite, now: 3_000 })
  try {
    await operator.sweepDrafts(2_000)
    expect([Boolean(link), await operator.battleByToken(idle.token), (await operator.battleByToken(joined.token))?.battle.id]).toEqual([
      true,
      undefined,
      joined.id,
    ])
  } finally {
    await operator.deleteUserData(creatorId)
  }
})
