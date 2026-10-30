import { InfiniteQueryObserver, QueryClient } from '@tanstack/react-query'
import { afterEach, expect, it, vi } from 'vitest'
import * as functions from '../../server/functions'
import { battlesQuery } from '../queries/battles'
import { refreshBattleFeed } from './refreshBattleFeed'

const client = new QueryClient()
afterEach(() => {
  vi.restoreAllMocks()
  client.clear()
})
const cursor = { at: 1, id: 'earlier' }
const history = {
  pages: [
    { battles: [], nextCursor: cursor },
    { battles: [], nextCursor: null },
  ],
  pageParams: [null, cursor],
}

async function refresh(saved: unknown) {
  client.setQueryData(['battles'], saved)
  await client.invalidateQueries({ queryKey: ['battles'] })
  return refreshBattleFeed(client, battlesQuery())
}

it('refetches active history only once in a background refresh cycle', async () => {
  const request = vi.spyOn(functions, 'myBattles').mockResolvedValueOnce(history.pages[0]!).mockResolvedValueOnce(history.pages[1]!)
  client.setQueryData(['battles'], history)
  const unsubscribe = new InfiniteQueryObserver(client, battlesQuery()).subscribe(() => {})
  try {
    await refresh(history)
    expect(request).toHaveBeenCalledTimes(2)
  } finally {
    unsubscribe()
  }
})

it('does not download inactive history or discard its loaded pages', async () => {
  const request = vi.spyOn(functions, 'myBattles')
  await expect(refresh(history)).resolves.toEqual(history)
  expect(request).not.toHaveBeenCalled()
})

it('updates a saved single-page feed in the background', async () => {
  vi.spyOn(functions, 'myBattles').mockResolvedValue({ battles: [], nextCursor: null })
  expect((await refresh({ pages: [history.pages[0]], pageParams: [null] })).pages).toEqual([{ battles: [], nextCursor: null }])
})

it('retains the saved feed when a background request fails', async () => {
  const saved = { pages: [history.pages[0]], pageParams: [null] }
  vi.spyOn(functions, 'myBattles').mockRejectedValue(new Error('Disconnected'))
  await refresh(saved).catch(() => {})
  expect(client.getQueryData(['battles'])).toBe(saved)
})
