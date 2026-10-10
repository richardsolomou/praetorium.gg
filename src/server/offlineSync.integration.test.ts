import { randomUUID } from 'node:crypto'
import { expect, it } from 'vitest'
import { SpacetimeOperator } from './spacetimeOperator'
import { offlineContext } from './offlineContext'
import { z } from 'zod'

const url = process.env.SPACETIME_TEST_URL
const database = process.env.SPACETIME_TEST_DATABASE
const token = process.env.SPACETIME_TEST_OPERATOR_TOKEN
const store = () => new SpacetimeOperator(url!, database!, token!)
const rowFor = (owner: string, id = randomUUID()) => ({
  id,
  userId: owner,
  name: 'Plane army',
  catalogueId: 'offline-proof',
  detachmentId: '[]',
  disposition: null,
  limit: 1_000,
  picks: '[]',
  prep: null,
  tags: '[]',
  waivedRules: '[]',
  optionalRules: '[]',
  borrowedDetachmentId: null,
  baseRosterId: null,
  visibility: 'private' as const,
  source: 'editable' as const,
  now: Date.now(),
})
const fingerprint = 'a'.repeat(64)

it.skipIf(!url || !database || !token)('acknowledges and replays a successfully sealed offline league roster', async () => {
  const operator = store()
  const owner = randomUUID()
  const leagueToken = randomUUID()
  const row = { ...rowFor(owner), limit: 2000 }
  const id = randomUUID()
  const context = () => ({ id, owner, fingerprint, createdAt: Date.now(), identifiers: {}, wrote: false })
  try {
    await operator.saveRoster(row)
    await operator.leagueCommand(
      {
        op: 'create',
        id: randomUUID(),
        token: leagueToken,
        eventId: randomUUID(),
        eventToken: leagueToken,
        ownerId: owner,
        ownerPlays: true,
        name: 'Offline league',
        description: '',
        visibility: 'private',
        admission: 'automatic',
        playerLimit: 2,
        recurring: false,
        format: '1v1',
        rosterLimit: 2000,
        now: row.now,
      },
      z.null(),
    )
    const command = {
      op: 'submit',
      token: leagueToken,
      eventToken: leagueToken,
      ownerId: owner,
      userId: owner,
      rosterId: row.id,
      rosterName: row.name,
      rosterLimit: row.limit,
      rosterUpdatedAt: row.now,
      now: row.now,
      snapshot: JSON.stringify({
        name: row.name,
        text: row.name,
        built: {
          catalogueId: 'test',
          revision: 'test',
          limit: 2000,
          detachment: null,
          disposition: null,
          detachmentIds: [],
          waivedRules: [],
          picks: [],
          units: [{ key: 'lord', name: 'Lord', points: 80, models: 1, group: 'character', warlord: true }],
        },
      }),
    }
    const result = await offlineContext.run(context(), () => operator.leagueCommand(command, z.object({ outcome: z.literal('sealed') })))
    const retry = await offlineContext.run(context(), () => operator.leagueCommand(command, z.object({ outcome: z.literal('sealed') })))
    expect({
      result,
      retry,
      receipt: (await operator.syncReceipt(id, owner, fingerprint))?.outcome,
      snapshot: (await operator.leagueRosters(leagueToken, owner))[0]?.entry.rosterSnapshot,
    }).toEqual({ result: { outcome: 'sealed' }, retry: { outcome: 'sealed' }, receipt: 'applied', snapshot: command.snapshot })
  } finally {
    await operator.deleteUserData(owner)
  }
})

it.skipIf(!url || !database || !token)('acknowledges a notification opt-out and retains its saved value on retry', async () => {
  const operator = store()
  const owner = randomUUID()
  const id = randomUUID()
  const context = () => ({ id, owner, fingerprint, createdAt: Date.now(), identifiers: {}, wrote: false })
  try {
    await operator.setPushEnabled(owner, true, Date.now())
    const first = await offlineContext.run(context(), () => operator.setPushEnabled(owner, false, Date.now()))
    const retry = await offlineContext.run(context(), () => operator.setPushEnabled(owner, false, Date.now()))
    expect({
      first,
      retry,
      enabled: await operator.pushEnabled(owner),
      receipt: (await operator.syncReceipt(id, owner, fingerprint))?.outcome,
    }).toEqual({ first: false, retry: false, enabled: false, receipt: 'applied' })
  } finally {
    await operator.deleteUserData(owner)
  }
})

it.skipIf(!url || !database || !token)('commits offline battle creation and its receipt together', async () => {
  const operator = store()
  const owner = randomUUID()
  const id = randomUUID()
  const battleId = randomUUID()
  try {
    await offlineContext.run({ id, owner, fingerprint, createdAt: Date.now(), identifiers: {}, wrote: false }, () =>
      operator.createBattle({
        id: battleId,
        token: randomUUID(),
        userId: owner,
        opponentIds: [randomUUID()],
        now: Date.now(),
        initialCommand: {
          kind: 'configure-battle',
          limit: null,
          missionPackId: null,
          terrainLayoutId: null,
          twistId: null,
          clockLimitMinutes: null,
        },
      }),
    )
    expect((await operator.syncReceipt(id, owner, fingerprint))?.outcome).toBe('applied')
  } finally {
    await operator.deleteUserData(owner)
  }
})

it.skipIf(!url || !database || !token)('replays a roster save after a lost response without changing its version', async () => {
  const operator = store()
  const owner = randomUUID()
  const row = rowFor(owner)
  const input = { row: JSON.stringify(row), operationId: randomUUID(), fingerprint, expectedVersion: null, deleted: false }
  try {
    const first = await operator.syncRoster(input)
    expect(await operator.syncRoster(input)).toEqual(first)
  } finally {
    await operator.deleteUserData(owner)
  }
})
it.skipIf(!url || !database || !token)('refuses competing roster versions and preserves the accepted edit', async () => {
  const operator = store()
  const owner = randomUUID()
  const row = rowFor(owner)
  try {
    await operator.saveRoster(row)
    const input = {
      row: JSON.stringify({ ...row, name: 'First device', now: row.now + 1 }),
      operationId: randomUUID(),
      fingerprint,
      expectedVersion: row.now,
      deleted: false,
    }
    await operator.syncRoster(input)
    const stale = await operator.syncRoster({ ...input, row: JSON.stringify({ ...row, name: 'Other device' }), operationId: randomUUID() })
    expect({ outcome: stale.outcome, name: (await operator.roster(row.id))?.name }).toEqual({ outcome: 'conflict', name: 'First device' })
  } finally {
    await operator.deleteUserData(owner)
  }
})
it.skipIf(!url || !database || !token)('retains a roster deletion tombstone against an offline recreation', async () => {
  const operator = store()
  const owner = randomUUID()
  const row = rowFor(owner)
  try {
    await operator.saveRoster(row)
    const input = { row: JSON.stringify(row), operationId: randomUUID(), fingerprint, expectedVersion: row.now, deleted: true }
    await operator.syncRoster(input)
    expect((await operator.syncRoster({ ...input, operationId: randomUUID(), expectedVersion: null, deleted: false })).outcome).toBe(
      'conflict',
    )
  } finally {
    await operator.deleteUserData(owner)
  }
})
it.skipIf(!url || !database || !token)('rejects reuse of a roster operation identity for different contents', async () => {
  const operator = store()
  const owner = randomUUID()
  const row = rowFor(owner)
  try {
    const input = { row: JSON.stringify(row), operationId: randomUUID(), fingerprint, expectedVersion: null, deleted: false }
    await operator.syncRoster(input)
    await expect(operator.syncRoster({ ...input, fingerprint: 'b'.repeat(64) })).rejects.toThrow('Operation ID reused')
  } finally {
    await operator.deleteUserData(owner)
  }
})
it.skipIf(!url || !database || !token)('keeps deferred friendship writes and their retry receipts in one transaction', async () => {
  const operator = store()
  const owner = randomUUID()
  const friend = randomUUID()
  const id = randomUUID()
  const context = () => ({ id, owner, fingerprint, createdAt: Date.now(), identifiers: {}, wrote: false })
  try {
    const first = await offlineContext.run(context(), () => operator.requestFriend(owner, friend, Date.now()))
    const retry = await offlineContext.run(context(), () => operator.requestFriend(owner, friend, Date.now() + 1))
    expect({
      first,
      retry,
      receipt: (await operator.syncReceipt(id, owner, fingerprint))?.outcome,
      rows: (await operator.friendshipsByUser(owner)).length,
    }).toEqual({ first: true, retry: true, receipt: 'applied', rows: 1 })
  } finally {
    await operator.deleteUserData(owner)
    await operator.deleteUserData(friend)
  }
})
it.skipIf(!url || !database || !token)('records expired deferred actions as a definite failure without a product write', async () => {
  const operator = store()
  const owner = randomUUID()
  try {
    await expect(
      offlineContext.run(
        { id: randomUUID(), owner, fingerprint, createdAt: Date.now() - 91 * 24 * 60 * 60_000, identifiers: {}, wrote: false },
        () => operator.setBattleAudience(owner, 'private', Date.now()),
      ),
    ).rejects.toThrow('expired')
    expect(await operator.battleAudience(owner)).toBe('public')
  } finally {
    await operator.deleteUserData(owner)
  }
})
it.skipIf(!url || !database || !token)('replays an offline battle command after another device advances the log', async () => {
  const operator = store()
  const owner = randomUUID()
  const opponent = randomUUID()
  const battleId = randomUUID()
  const battleToken = randomUUID()
  const now = Date.now()
  try {
    await operator.createBattle({ id: battleId, token: battleToken, userId: owner, opponentIds: [opponent], now })
    const input = {
      battleId,
      userId: owner,
      expectedSeq: 0,
      command: { kind: 'set-setup-step' as const, step: 1 },
      now,
      operationId: randomUUID(),
      fingerprint,
      recordedAt: now - 1_000,
    }
    const first = await operator.submit(input)
    await operator.submit({ battleId, userId: opponent, expectedSeq: 1, command: { kind: 'set-setup-step', step: 2 }, now })
    const retry = await operator.submit(input)
    expect({ first: first.result, retry: retry.result, length: retry.log.length }).toEqual({
      first: { outcome: 'appended', seq: 1 },
      retry: { outcome: 'appended', seq: 1 },
      length: 2,
    })
  } finally {
    await operator.deleteUserData(owner)
    await operator.deleteUserData(opponent)
  }
})
it.skipIf(!url || !database || !token)('does not rebase an offline battle command onto an opponent’s newer turn', async () => {
  const operator = store()
  const owner = randomUUID()
  const opponent = randomUUID()
  const battleId = randomUUID()
  const now = Date.now()
  try {
    await operator.createBattle({ id: battleId, token: randomUUID(), userId: owner, opponentIds: [opponent], now })
    await operator.submit({ battleId, userId: opponent, expectedSeq: 0, command: { kind: 'set-setup-step', step: 1 }, now })
    const answer = await operator.submit({
      battleId,
      userId: owner,
      expectedSeq: 0,
      command: { kind: 'set-setup-step', step: 2 },
      now,
      operationId: randomUUID(),
      fingerprint,
      recordedAt: now,
    })
    expect(answer.result).toEqual({ outcome: 'stale', seq: 1 })
  } finally {
    await operator.deleteUserData(owner)
    await operator.deleteUserData(opponent)
  }
})
