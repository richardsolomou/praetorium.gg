import { randomUUID } from 'node:crypto'
import { expect, it, vi } from 'vitest'
import { z } from 'zod'
import { DbConnection, tables } from '../spacetime/generated'
import { SpacetimeOperator } from './spacetimeOperator'

const url = process.env.SPACETIME_TEST_URL
const database = process.env.SPACETIME_TEST_DATABASE
const token = process.env.SPACETIME_TEST_OPERATOR_TOKEN

it.skipIf(!url || !database || !token)('streams league entry removal when an account is deleted', async () => {
  const operator = new SpacetimeOperator(url!, database!, token!)
  const ownerId = randomUUID()
  const entrantId = randomUUID()
  const leagueToken = randomUUID()
  const guest = (await (await fetch(new URL('/v1/identity', url), { method: 'POST' })).json()) as { token: string }
  const changes: bigint[] = []
  let disconnect = () => {}
  const initial = await new Promise<bigint>((resolve, reject) => {
    const connection = DbConnection.builder()
      .withUri(url!)
      .withDatabaseName(database!)
      .withToken(guest.token)
      .onConnect((current) => {
        let applied = false
        const changed = (row: { scope: string; revision: bigint }) => {
          if (applied && row.scope === 'leagues') changes.push(row.revision)
        }
        current.db.publicProductSignals.onInsert((_context, row) => changed(row))
        current.db.publicProductSignals.onUpdate((_context, _previous, row) => changed(row))
        current
          .subscriptionBuilder()
          .onApplied(() => {
            applied = true
            resolve([...current.db.publicProductSignals.iter()].find((row) => row.scope === 'leagues')?.revision ?? 0n)
          })
          .onError((context) => reject(new Error(context.event?.message || 'League subscription failed')))
          .subscribe(tables.publicProductSignals)
      })
      .onConnectError((_current, error) => reject(error))
      .build()
    disconnect = () => connection.disconnect()
  })
  try {
    await operator.leagueCommand(
      {
        op: 'create',
        id: randomUUID(),
        token: leagueToken,
        eventId: randomUUID(),
        eventToken: randomUUID(),
        ownerId,
        name: 'Deletion signal proof',
        description: '',
        visibility: 'private',
        admission: 'automatic',
        playerLimit: null,
        recurring: false,
        format: null,
        rosterLimit: null,
        now: Date.now(),
      },
      z.null(),
    )
    expect(
      await operator.leagueCommand(
        { op: 'join', token: leagueToken, eventToken: '', userId: entrantId, memberLimit: 128, now: Date.now() },
        z.literal('accepted'),
      ),
    ).toBe('accepted')
    await vi.waitFor(() => expect(changes.at(-1)).toBe(initial + 2n))

    await operator.deleteUserData(entrantId)
    await vi.waitFor(() => expect(changes.at(-1)).toBe(initial + 3n))
    expect((await operator.leagueByToken(leagueToken))?.entries).toEqual([])
  } finally {
    disconnect()
    await operator.deleteUserData(ownerId)
  }
})
