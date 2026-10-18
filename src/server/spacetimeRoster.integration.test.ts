import { randomUUID } from 'node:crypto'
import { expect, it, vi } from 'vitest'
import { DbConnection, tables } from '../spacetime/generated'
import { SpacetimeOperator } from './spacetimeOperator'
import { LOCKED_ROSTER_MESSAGE } from '../core/rosterLock'

const url = process.env.SPACETIME_TEST_URL
const database = process.env.SPACETIME_TEST_DATABASE
const token = process.env.SPACETIME_TEST_OPERATOR_TOKEN

it.skipIf(!url || !database || !token)('keeps roster writes atomic and owned in SpacetimeDB', async () => {
  const store = new SpacetimeOperator(url!, database!, token!)
  const id = randomUUID()
  const userId = randomUUID()
  const input = {
    id,
    userId,
    name: 'Proof roster',
    catalogueId: 'catalogue-proof',
    detachmentId: null,
    disposition: null,
    limit: 1_000,
    picks: '[]',
    prep: null,
    tags: '[]',
    waivedRules: '[]',
    optionalRules: '[]',
    borrowedDetachmentId: null,
    visibility: 'private' as const,
    source: 'editable' as const,
    now: Date.now(),
  }
  try {
    expect(await store.saveRoster(input)).toBe('inserted')
    expect((await store.roster(id))?.userId).toBe(userId)
    expect(await store.homeRostersByUser(userId)).toMatchObject({ count: 1, rows: [{ id }] })
    expect(await store.saveRoster({ ...input, userId: 'other', name: 'stolen' })).toBeNull()
    expect((await store.roster(id))?.name).toBe('Proof roster')
    expect(await store.saveRoster({ ...input, name: 'Updated', now: input.now + 1 })).toBe('updated')
    expect(await store.publicRostersByUser(userId, 10)).toEqual([])
    expect(await store.setRosterVisibility(id, 'other', 'public', input.now + 2)).toBe(false)
    expect(await store.setRosterVisibility(id, userId, 'public', input.now + 2)).toBe(true)
    expect((await store.publicRostersByUser(userId, 10)).map((row) => row.id)).toEqual([id])
    await store.deleteRoster(id, 'other')
    expect(await store.roster(id)).toBeTruthy()
  } finally {
    await store.deleteRoster(id, userId)
  }
  expect(await store.roster(id)).toBeUndefined()
})

it.skipIf(!url || !database || !token)('lists a roster for discovery only while its owner keeps it public', async () => {
  const store = new SpacetimeOperator(url!, database!, token!)
  const id = randomUUID()
  const userId = randomUUID()
  const catalogueId = `catalogue-${randomUUID()}`
  const now = Date.now()
  const discovered = async () =>
    (
      await store.discoverRosters({
        audience: 'public',
        viewerId: null,
        sort: 'updated-desc',
        catalogueIds: [catalogueId],
        detachmentIds: null,
        before: null,
        limit: 10,
      })
    ).rows.map((row) => row.id)
  const input = {
    id,
    userId,
    name: 'Discovered roster',
    catalogueId,
    detachmentId: null,
    disposition: null,
    limit: 1_000,
    picks: '[]',
    prep: null,
    tags: '[]',
    waivedRules: '[]',
    optionalRules: '[]',
    borrowedDetachmentId: null,
    visibility: 'private' as const,
    source: 'editable' as const,
    now,
  }
  try {
    await store.saveRoster(input)
    expect(await discovered()).toEqual([])
    await store.setRosterVisibility(id, userId, 'unlisted', now + 1)
    expect(await discovered()).toEqual([])
    await store.setRosterVisibility(id, userId, 'public', now + 2)
    expect(await discovered()).toEqual([id])
    await store.setRosterVisibility(id, userId, 'private', now + 3)
    expect(await discovered()).toEqual([])
    await store.setRosterVisibility(id, userId, 'public', now + 4)
  } finally {
    await store.deleteRoster(id, userId)
  }
  expect(await discovered()).toEqual([])
})

it.skipIf(!url || !database || !token)('keeps roster variants in one flat group owned by one player', async () => {
  const store = new SpacetimeOperator(url!, database!, token!)
  const userId = randomUUID()
  const [base, variant, nested, stolen] = [randomUUID(), randomUUID(), randomUUID(), randomUUID()]
  const now = Date.now()
  const input = (id: string, baseRosterId: string | null = null, at = 0) => ({
    id,
    userId,
    name: 'Variant roster',
    catalogueId: 'catalogue-proof',
    detachmentId: null,
    disposition: null,
    limit: 1_000,
    picks: '[]',
    prep: null,
    tags: '[]',
    waivedRules: '[]',
    optionalRules: '[]',
    borrowedDetachmentId: null,
    baseRosterId,
    visibility: 'private' as const,
    source: 'editable' as const,
    now: now + at,
  })
  try {
    await store.saveRoster(input(base, null, 1))
    await store.saveRoster(input(variant, base, 2))
    expect(await store.saveRoster(input(nested, variant, 3))).toBe('inserted')
    expect((await store.roster(nested))?.baseRosterId).toBe(base)
    expect(await store.saveRoster({ ...input(stolen, base), userId: 'other' })).toBeNull()
    expect(await store.roster(stolen)).toBeUndefined()
    await store.saveRoster({ ...input(variant, null, 4), name: 'Renamed' })
    expect((await store.rosterSummariesByUser(userId)).find((row) => row.id === variant)?.baseRosterId).toBe(base)
    expect((await store.rosterGroupByUser(userId, base)).map((row) => row.id)).toEqual([base, variant, nested])
  } finally {
    for (const id of [base, variant, nested]) await store.deleteRoster(id, userId)
  }
})

it.skipIf(!url || !database || !token)('keeps a variant group open to its owner after its base is deleted', async () => {
  const store = new SpacetimeOperator(url!, database!, token!)
  const userId = randomUUID()
  const [base, variant, joined, stolen] = [randomUUID(), randomUUID(), randomUUID(), randomUUID()]
  const now = Date.now()
  const input = (id: string, baseRosterId: string | null = null, at = 0) => ({
    id,
    userId,
    name: 'Variant roster',
    catalogueId: 'catalogue-proof',
    detachmentId: null,
    disposition: null,
    limit: 1_000,
    picks: '[]',
    prep: null,
    tags: '[]',
    waivedRules: '[]',
    optionalRules: '[]',
    borrowedDetachmentId: null,
    baseRosterId,
    visibility: 'private' as const,
    source: 'editable' as const,
    now: now + at,
  })
  try {
    await store.saveRoster(input(base, null, 1))
    await store.saveRoster(input(variant, base, 2))
    await store.deleteRoster(base, userId)
    expect(await store.saveRoster(input(joined, base, 3))).toBe('inserted')
    expect((await store.rosterGroupByUser(userId, base)).map((row) => row.id)).toEqual([variant, joined])
    expect(await store.saveRoster({ ...input(stolen, base), userId: 'other' })).toBeNull()
  } finally {
    for (const id of [variant, joined]) await store.deleteRoster(id, userId)
  }
})

const lockedInput = (userId: string, id = randomUUID(), now = Date.now()) => ({
  id,
  userId,
  name: 'Finished list',
  automaticName: false,
  catalogueId: 'catalogue-proof',
  detachmentId: '["detachment-proof"]',
  disposition: null,
  limit: 1_000,
  picks: '[{"entryId":"unit-proof"}]',
  prep: null,
  tags: '[]',
  waivedRules: '[]',
  optionalRules: '[]',
  borrowedDetachmentId: null,
  baseRosterId: null,
  visibility: 'private' as const,
  source: 'editable' as const,
  now,
})

it.skipIf(!url || !database || !token)(
  'refuses direct content saves to a locked roster while visibility and deletion stay available',
  async () => {
    const store = new SpacetimeOperator(url!, database!, token!)
    const userId = randomUUID()
    const input = lockedInput(userId)
    try {
      await store.saveRoster(input)
      expect(await store.setRosterLocked(input.id, 'other', true, input.now + 1)).toBe(false)
      expect(await store.setRosterLocked(input.id, userId, true, input.now + 1)).toBe(true)
      expect({
        edit: await store.saveRoster({ ...input, picks: '[]', now: input.now + 2 }),
        rename: await store.saveRoster({ ...input, name: 'Renamed', now: input.now + 2 }),
        visibility: await store.saveRoster({ ...input, visibility: 'unlisted', now: input.now + 3 }),
        shared: await store.setRosterVisibility(input.id, userId, 'public', input.now + 4),
        stored: await store
          .roster(input.id)
          .then((row) => row && { name: row.name, picks: row.picks, locked: row.locked, visibility: row.visibility }),
        summary: (await store.rosterSummariesByUser(userId))[0]?.locked,
      }).toEqual({
        edit: 'locked',
        rename: 'locked',
        visibility: 'updated',
        shared: true,
        stored: { name: 'Finished list', picks: input.picks, locked: true, visibility: 'public' },
        summary: true,
      })
      await store.deleteRoster(input.id, userId)
      expect(await store.roster(input.id)).toBeUndefined()
    } finally {
      await store.deleteRoster(input.id, userId)
    }
  },
)

it.skipIf(!url || !database || !token)('refuses queued edits to a locked roster from stale and current devices', async () => {
  const store = new SpacetimeOperator(url!, database!, token!)
  const userId = randomUUID()
  const input = lockedInput(userId)
  const sync = (row: typeof input, expectedVersion: number | null) =>
    store.syncRoster({ row: JSON.stringify(row), operationId: randomUUID(), fingerprint: 'b'.repeat(64), expectedVersion, deleted: false })
  try {
    await store.saveRoster(input)
    const before = (await store.roster(input.id))!.updatedAt
    await store.setRosterLocked(input.id, userId, true, input.now + 1)
    const locked = (await store.roster(input.id))!.updatedAt
    expect({
      lockedVersionAdvanced: locked > before,
      stale: await sync({ ...input, picks: '[]', now: input.now + 2 }, before),
      current: await sync({ ...input, picks: '[]', now: input.now + 2 }, locked),
      picks: (await store.roster(input.id))?.picks,
    }).toEqual({
      lockedVersionAdvanced: true,
      stale: { outcome: 'refused', message: LOCKED_ROSTER_MESSAGE },
      current: { outcome: 'refused', message: LOCKED_ROSTER_MESSAGE },
      picks: input.picks,
    })
  } finally {
    await store.deleteRoster(input.id, userId)
  }
})

it.skipIf(!url || !database || !token)('saves edits again once unlocked and starts copies of a locked roster unlocked', async () => {
  const store = new SpacetimeOperator(url!, database!, token!)
  const userId = randomUUID()
  const input = lockedInput(userId)
  const copy = randomUUID()
  try {
    await store.saveRoster(input)
    await store.setRosterLocked(input.id, userId, true, input.now + 1)
    expect(await store.saveRoster({ ...lockedInput(userId, copy, input.now + 2), baseRosterId: input.id })).toBe('inserted')
    expect(await store.saveRoster({ ...lockedInput(userId, copy, input.now + 3), picks: '[]' })).toBe('updated')
    await store.setRosterLocked(input.id, userId, false, input.now + 4)
    expect(await store.saveRoster({ ...input, picks: '[]', now: input.now + 5 })).toBe('updated')
    expect({ original: (await store.roster(input.id))?.locked, copy: (await store.roster(copy))?.locked ?? null }).toEqual({
      original: false,
      copy: false,
    })
  } finally {
    for (const id of [input.id, copy]) await store.deleteRoster(id, userId)
  }
})

it.skipIf(!url || !database || !token)('streams public roster changes to an anonymous reader without private signals', async () => {
  const store = new SpacetimeOperator(url!, database!, token!)
  const id = randomUUID()
  const userId = randomUUID()
  const changes: bigint[] = []
  let disconnect = () => {}
  let baseline = 0n
  const guest = (await (await fetch(new URL('/v1/identity', url), { method: 'POST' })).json()) as { token: string }
  const initial = await new Promise<bigint>((resolve, reject) => {
    const connection = DbConnection.builder()
      .withUri(url!)
      .withDatabaseName(database!)
      .withToken(guest.token)
      .onConnect((current) => {
        let applied = false
        current.db.publicProductSignals.onInsert((_context, row) => {
          if (applied && row.scope === 'rosters' && row.revision > baseline) changes.push(row.revision)
        })
        current.db.publicProductSignals.onUpdate((_context, _old, row) => {
          if (applied && row.scope === 'rosters' && row.revision > baseline) changes.push(row.revision)
        })
        current
          .subscriptionBuilder()
          .onApplied(() => {
            applied = true
            if ([...current.db.myProductSignals.iter()].length) return reject(new Error('Anonymous reader received private signals'))
            baseline = [...current.db.publicProductSignals.iter()].find((row) => row.scope === 'rosters')?.revision ?? 0n
            resolve(baseline)
          })
          .onError((context) => reject(new Error(context.event?.message || 'Public subscription failed')))
          .subscribe([tables.myProductSignals, tables.publicProductSignals])
      })
      .onConnectError((_current, error) => reject(error))
      .build()
    disconnect = () => connection.disconnect()
  })
  try {
    const input = {
      id,
      userId,
      name: 'Shared roster',
      catalogueId: 'catalogue-proof',
      detachmentId: null,
      disposition: null,
      limit: 1_000,
      picks: '[]',
      prep: null,
      tags: '[]',
      waivedRules: '[]',
      visibility: 'public' as const,
      source: 'editable' as const,
      now: Date.now(),
    }
    expect(await store.saveRoster(input)).toBe('inserted')
    await vi.waitFor(() => expect(changes).toEqual([initial + 1n]))
    await store.deleteRoster(id, userId)
    await vi.waitFor(() => expect(changes).toEqual([initial + 1n, initial + 2n]))
  } finally {
    disconnect()
    await store.deleteRoster(id, userId)
  }
})

it.skipIf(!url || !database || !token)('rejects a caller without the operator identity', async () => {
  const outsider = new SpacetimeOperator(url!, database!, 'invalid-operator-token')
  await expect(outsider.roster(randomUUID())).rejects.toThrow(/HTTP (401|403)/)
})

it.skipIf(!url || !database || !token)('keeps collection and favourites idempotent and scoped to one user', async () => {
  const store = new SpacetimeOperator(url!, database!, token!)
  const userId = randomUUID()
  const entryId = randomUUID()
  const catalogueId = randomUUID()
  const detachmentId = randomUUID()
  const now = Date.now()
  try {
    await store.addToCollection({ userId, entryId, now })
    await store.addToCollection({ userId, entryId, now: now + 1 })
    await store.addFavouriteFaction({ userId, catalogueId, now })
    await store.addFavouriteFaction({ userId, catalogueId, now: now + 1 })
    await store.addFavouriteDetachment({ userId, catalogueId, detachmentId, now })
    await store.addFavouriteDetachment({ userId, catalogueId, detachmentId, now: now + 1 })
    await store.addFavouriteDatasheet({ userId, entryId, now })
    await store.addFavouriteDatasheet({ userId, entryId, now: now + 1 })
    expect(await store.collectionByUser(userId)).toEqual([{ userId, entryId, at: now, models: 1 }])
    expect(await store.favouriteFactionsByUser(userId)).toEqual([{ userId, catalogueId, at: now }])
    expect(await store.favouriteDetachmentsByUser(userId)).toEqual([{ userId, catalogueId, detachmentId, at: now }])
    expect(await store.favouriteDatasheetsByUser(userId)).toEqual([{ userId, entryId, at: now }])
    expect(await store.favouriteDatasheetsByUser('other')).toEqual([])
    expect(await store.collectionByUser('other')).toEqual([])
  } finally {
    await store.removeFromCollection(userId, entryId)
    await store.removeFavouriteFaction(userId, catalogueId)
    await store.removeFavouriteDetachment(userId, catalogueId, detachmentId)
    await store.removeFavouriteDatasheet(userId, entryId)
  }
  expect(await store.collectionByUser(userId)).toEqual([])
})

it.skipIf(!url || !database || !token)('keeps saved loadouts to their owner and removes them with the account', async () => {
  const store = new SpacetimeOperator(url!, database!, token!)
  const userId = randomUUID()
  const id = randomUUID()
  const loadout = { name: 'Plasma squad', catalogueId: 'cat', pick: { entryId: 'squad', models: 10, choices: { weapon: 'plasma' } } }
  try {
    expect(await store.saveUnitLoadout(id, userId, loadout, 1)).toBe('saved')
    expect(await store.saveUnitLoadout(id, 'other', loadout, 2)).toBe('refused')
    expect(await store.unitLoadoutsByUser(userId)).toEqual([{ id, ...loadout, createdAt: 1 }])
    expect(await store.unitLoadoutsByUser('other')).toEqual([])
    expect(await store.deleteUnitLoadout(id, 'other')).toBe(false)
    await store.deleteUserData(userId)
    expect(await store.unitLoadoutsByUser(userId)).toEqual([])
  } finally {
    await store.deleteUnitLoadout(id, userId)
  }
})

it.skipIf(!url || !database || !token)('records a model count without duplicating the collection entry', async () => {
  const store = new SpacetimeOperator(url!, database!, token!)
  const userId = randomUUID()
  const entryId = randomUUID()
  const now = Date.now()
  try {
    await store.setCollectionModels({ userId, entryId, models: 3, now })
    await store.addToCollection({ userId, entryId, now: now + 1 })
    await store.setCollectionModels({ userId, entryId, models: 12, now: now + 2 })
    expect(await store.collectionByUser(userId)).toEqual([{ userId, entryId, at: now, models: 12 }])
    expect(await store.collectionByUser('other')).toEqual([])
  } finally {
    await store.removeFromCollection(userId, entryId)
  }
})
