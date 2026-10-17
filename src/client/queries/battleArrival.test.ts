import { QueryClient, QueryObserver, environmentManager } from '@tanstack/react-query'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import * as functions from '../../server/functions'
import { BATTLE_ARRIVAL_CHECKS, BATTLE_ARRIVAL_INTERVAL_MS, battleArrivalQuery, battleQuery } from './battles'

const screen = { kind: 'unavailable' } as Awaited<ReturnType<typeof functions.openBattle>>

// A reader's browser schedules the checks; tests run where TanStack Query would otherwise assume a server.
beforeEach(() => environmentManager.setIsServer(() => false))
afterEach(() => {
  environmentManager.setIsServer(() => typeof window === 'undefined')
  vi.useRealTimers()
  vi.restoreAllMocks()
})

function watch(client: QueryClient) {
  const observer = new QueryObserver(client, battleArrivalQuery('just-shared'))
  const stop = observer.subscribe(() => undefined)
  return stop
}

it('finds a battle that reaches the service after its link was opened', async () => {
  vi.useFakeTimers()
  const client = new QueryClient()
  // The loader already asked once and was told there is no such battle yet.
  client.setQueryData(battleQuery('just-shared').queryKey, null)
  const open = vi.spyOn(functions, 'openBattle').mockResolvedValueOnce(null).mockResolvedValue(screen)
  const stop = watch(client)
  try {
    await vi.advanceTimersByTimeAsync(BATTLE_ARRIVAL_INTERVAL_MS * 2)
    expect(client.getQueryData(battleQuery('just-shared').queryKey)).toEqual(screen)
    expect(open).toHaveBeenCalledTimes(2)
  } finally {
    stop()
    client.clear()
  }
})

it('stops asking once a battle has had time to arrive', async () => {
  vi.useFakeTimers()
  const client = new QueryClient()
  client.setQueryData(battleQuery('just-shared').queryKey, null)
  const open = vi.spyOn(functions, 'openBattle').mockResolvedValue(null)
  const stop = watch(client)
  try {
    await vi.advanceTimersByTimeAsync(BATTLE_ARRIVAL_INTERVAL_MS * (BATTLE_ARRIVAL_CHECKS + 5))
    expect(open.mock.calls.length).toBeLessThanOrEqual(BATTLE_ARRIVAL_CHECKS)
  } finally {
    stop()
    client.clear()
  }
})
