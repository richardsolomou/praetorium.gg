import { QueryClient } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { coalescedBy, invalidateAdminProductQueries, invalidateProductQueries, invalidatePublicProductQueries } from './productSignals'

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

it('refreshes spectators and standings after a shared battle changes', async () => {
  const client = new QueryClient()
  for (const key of ['public-battles', 'battle', 'standings', 'home-rosters']) client.setQueryData([key], {})

  await invalidatePublicProductQueries(client, 'battles')
  await invalidatePublicProductQueries(client, 'standings')

  expect(['public-battles', 'battle', 'standings', 'home-rosters'].map((key) => client.getQueryState([key])?.isInvalidated)).toEqual([
    true,
    true,
    true,
    false,
  ])
})

it('refreshes public roster and league readers without touching catalogue assets', async () => {
  const client = new QueryClient()
  for (const key of ['player-rosters', 'shared-roster', 'leagues', 'league', 'faction-index']) client.setQueryData([key], {})

  await invalidatePublicProductQueries(client, 'rosters')
  await invalidatePublicProductQueries(client, 'leagues')

  expect(
    ['player-rosters', 'shared-roster', 'leagues', 'league', 'faction-index'].map((key) => client.getQueryState([key])?.isInvalidated),
  ).toEqual([true, true, true, true, false])
})

it('takes a roster out of public army discovery when its owner changes who can read it', async () => {
  const client = new QueryClient()
  client.setQueryData(['discovered-rosters', {}], {})

  await invalidatePublicProductQueries(client, 'rosters')

  expect(client.getQueryState(['discovered-rosters', {}])?.isInvalidated).toBe(true)
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
