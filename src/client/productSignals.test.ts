import { QueryClient } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  coalescedBy,
  invalidateAdminProductQueries,
  invalidateProductQueries,
  invalidatePublicProductQueries,
  invalidateSyncedQueries,
} from './productSignals'

it('refreshes the home roster shelf and saved lists after a roster signal without reloading catalogue data', async () => {
  const client = new QueryClient()
  for (const key of ['home-rosters', 'saved-roster-summaries', 'saved-roster-changed-ids', 'faction-index']) {
    client.setQueryData([key], {})
  }
  client.setQueryData(['saved-roster-page', ['roster-1']], {})

  await invalidateProductQueries(client, 'rosters')

  expect([
    client.getQueryState(['home-rosters'])?.isInvalidated,
    client.getQueryState(['saved-roster-summaries'])?.isInvalidated,
    client.getQueryState(['saved-roster-page', ['roster-1']])?.isInvalidated,
    client.getQueryState(['saved-roster-changed-ids'])?.isInvalidated,
    client.getQueryState(['faction-index'])?.isInvalidated,
  ]).toEqual([true, true, true, true, false])
})

it('refreshes both sides of a friendship without reloading saved rosters', async () => {
  const client = new QueryClient()
  for (const key of ['friendships', 'friend-battles', 'opponents', 'player-search', 'home-rosters']) client.setQueryData([key], {})

  await invalidateProductQueries(client, 'friends')

  expect(
    ['friendships', 'friend-battles', 'opponents', 'player-search', 'home-rosters'].map(
      (key) => client.getQueryState([key])?.isInvalidated,
    ),
  ).toEqual([true, true, true, true, false])
})

it('refreshes battle feeds and standings after a shared battle changes without refetching an open battle', async () => {
  const client = new QueryClient()
  for (const key of ['public-battles', 'battle', 'report', 'standings', 'home-rosters']) client.setQueryData([key], {})

  await invalidatePublicProductQueries(client, 'battles')
  await invalidatePublicProductQueries(client, 'standings')

  expect(
    ['public-battles', 'battle', 'report', 'standings', 'home-rosters'].map((key) => client.getQueryState([key])?.isInvalidated),
  ).toEqual([true, false, false, true, false])
})

it('refreshes public roster and sealed event readers without touching catalogue assets', async () => {
  const client = new QueryClient()
  for (const key of ['player-rosters', 'shared-roster', 'sealed-events', 'sealed-event', 'faction-index']) client.setQueryData([key], {})

  await invalidatePublicProductQueries(client, 'rosters')
  await invalidatePublicProductQueries(client, 'leagues')

  expect(
    ['player-rosters', 'shared-roster', 'sealed-events', 'sealed-event', 'faction-index'].map(
      (key) => client.getQueryState([key])?.isInvalidated,
    ),
  ).toEqual([true, true, true, true, false])
})

it('takes a roster out of public army discovery when its owner changes who can read it', async () => {
  const client = new QueryClient()
  client.setQueryData(['discovered-rosters', {}], {})

  await invalidatePublicProductQueries(client, 'rosters')

  expect(client.getQueryState(['discovered-rosters', {}])?.isInvalidated).toBe(true)
})

it.each(['rosters', 'leagues'] as const)('refreshes sealed event roster sharing after a %s change', async (scope) => {
  const client = new QueryClient()
  const key = ['sealed-event-roster-sharing', 'league', 'event', 'owner']
  client.setQueryData(key, {})
  await invalidateProductQueries(client, scope)
  expect(client.getQueryState(key)?.isInvalidated).toBe(true)
})

it('refreshes opponent choices when a practice account is removed', async () => {
  const client = new QueryClient()
  client.setQueryData(['opponents'], [])
  client.setQueryData(['player-search', 'practice'], [])
  client.setQueryData(['faction-index'], {})

  await invalidatePublicProductQueries(client, 'opponents')

  expect([
    client.getQueryState(['opponents'])?.isInvalidated,
    client.getQueryState(['player-search', 'practice'])?.isInvalidated,
    client.getQueryState(['faction-index'])?.isInvalidated,
  ]).toEqual([true, true, false])
})

it('refreshes admin counts after a private product change', async () => {
  const client = new QueryClient()
  client.setQueryData(['admin', 'users', 'richard'], [])
  client.setQueryData(['faction-index'], {})

  await invalidateAdminProductQueries(client, 'admin-users')

  expect([
    client.getQueryState(['admin', 'users', 'richard'])?.isInvalidated,
    client.getQueryState(['faction-index'])?.isInvalidated,
  ]).toEqual([true, false])
})

it('leaves standings to the standings signal when a seated player’s battle changes', async () => {
  const client = new QueryClient()
  for (const key of ['battles', 'standings', 'player-rankings']) client.setQueryData([key], {})

  await invalidateProductQueries(client, 'battles')

  expect(['battles', 'standings', 'player-rankings'].map((key) => client.getQueryState([key])?.isInvalidated)).toEqual([true, false, false])
})

describe('refreshes after local work syncs', () => {
  const invalidated = (client: QueryClient, keys: readonly (readonly unknown[])[]) =>
    keys.map((key) => client.getQueryState(key)?.isInvalidated ?? false)
  const seeded = (keys: readonly (readonly unknown[])[]) => {
    const client = new QueryClient()
    for (const key of keys) client.setQueryData(key, {})
    return client
  }

  it('refreshes saved rosters and sealed event entries after a roster save without reloading catalogue data, prices or settings', async () => {
    const keys = [
      ['roster-access', 'roster-1'],
      ['saved-roster-summaries'],
      ['outdated-sealed-event-entries', 'roster-1'],
      ['units', 'faction', 2000],
      ['price', 'faction'],
      ['release'],
      ['realtime-mode'],
      ['notification-settings'],
    ]
    const client = seeded(keys)

    await invalidateSyncedQueries(client, [{ id: crypto.randomUUID(), kind: 'saveRoster', resource: 'roster:roster-1' }])

    expect(invalidated(client, keys)).toEqual([true, true, true, false, false, false, false, false])
  })

  it('refreshes once when the same acknowledgement is reported twice', async () => {
    const client = seeded([['home-rosters']])
    const operation = { id: crypto.randomUUID(), kind: 'saveRoster', resource: 'roster:roster-1' }
    await invalidateSyncedQueries(client, [operation])
    client.setQueryData(['home-rosters'], {})

    await invalidateSyncedQueries(client, [operation])

    expect(client.getQueryState(['home-rosters'])?.isInvalidated).toBe(false)
  })

  it('refreshes the synced battle and its report without refetching another open battle', async () => {
    const keys = [['battle', 'battle-1'], ['report', 'battle-1'], ['battles'], ['battle', 'battle-2']]
    const client = seeded(keys)

    await invalidateSyncedQueries(client, [{ id: crypto.randomUUID(), kind: 'battleCommand', resource: 'battle:battle-1' }])

    expect(invalidated(client, keys)).toEqual([true, true, true, false])
  })

  it('refreshes only the collection after a collection change', async () => {
    const keys = [['collection'], ['collection-counts'], ['home-rosters'], ['favourite-factions']]
    const client = seeded(keys)

    await invalidateSyncedQueries(client, [{ id: crypto.randomUUID(), kind: 'setOwned', resource: 'query:["collection"]' }])

    expect(invalidated(client, keys)).toEqual([true, true, false, false])
  })

  it('refreshes every product reader for an unknown saved operation but still not catalogue data', async () => {
    const keys = [['home-rosters'], ['collection'], ['sealed-events'], ['faction-index']]
    const client = seeded(keys)

    await invalidateSyncedQueries(client, [{ id: crypto.randomUUID(), kind: 'futureAction', resource: 'future:1' }])

    expect(invalidated(client, keys)).toEqual([true, true, true, false])
  })
})

describe('coalesced signal refreshes', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('refreshes at once, then once more for every burst inside the window', () => {
    const run = vi.fn()
    const refresh = coalescedBy(10_000, run)
    refresh('battles')
    refresh('battles')
    refresh('battles')
    expect(run).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(10_000)
    expect(run).toHaveBeenCalledTimes(2)
    vi.advanceTimersByTime(10_000)
    expect(run).toHaveBeenCalledTimes(2)
  })

  it('refreshes another scope without waiting', () => {
    const run = vi.fn()
    const refresh = coalescedBy(10_000, run)
    refresh('battles')
    refresh('standings')
    expect(run.mock.calls).toEqual([['battles'], ['standings']])
  })

  it('drops a pending refresh when cancelled', () => {
    const run = vi.fn()
    const refresh = coalescedBy(10_000, run)
    refresh('battles')
    refresh('battles')
    refresh.cancel()
    vi.advanceTimersByTime(10_000)
    expect(run).toHaveBeenCalledTimes(1)
  })
})
