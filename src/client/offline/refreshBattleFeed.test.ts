import { InfiniteQueryObserver, QueryClient } from '@tanstack/react-query'
import { afterEach, expect, it, vi } from 'vitest'
import * as functions from '../../server/functions'
import { battlesQuery } from '../queries/battles'
import { refreshBattleFeed } from './refreshBattleFeed'

afterEach(() => vi.restoreAllMocks())
const cursor = { at: 1, id: 'earlier' }
const history = {
  pages: [
    { battles: [], nextCursor: cursor },
    { battles: [], nextCursor: null },
  ],
  pageParams: [null, cursor],
}

it('refetches active history only once in a background refresh cycle', async () => {
  const client = new QueryClient()
  client.setQueryData(['battles'], history)
  const request = vi.spyOn(functions, 'myBattles').mockResolvedValueOnce(history.pages[0]!).mockResolvedValueOnce(history.pages[1]!)
  const observer = new InfiniteQueryObserver(client, battlesQuery())
  const unsubscribe = observer.subscribe(() => {})
  try {
    await client.invalidateQueries({ queryKey: ['battles'] })
    await refreshBattleFeed(client, battlesQuery())
    expect(request).toHaveBeenCalledTimes(2)
  } finally {
    unsubscribe()
    client.clear()
  }
})

it('does not download inactive history or discard its loaded pages', async () => {
  const client = new QueryClient()
  client.setQueryData(['battles'], history)
  const request = vi.spyOn(functions, 'myBattles')
  try {
    await client.invalidateQueries({ queryKey: ['battles'] })
    await expect(refreshBattleFeed(client, battlesQuery())).resolves.toEqual(history)
    expect(request).not.toHaveBeenCalled()
  } finally {
    client.clear()
  }
})

it('updates a saved single-page feed in the background', async () => {
  const client = new QueryClient()
  client.setQueryData(['battles'], { pages: [history.pages[0]], pageParams: [null] })
  vi.spyOn(functions, 'myBattles').mockResolvedValue({ battles: [], nextCursor: null })
  try {
    await client.invalidateQueries({ queryKey: ['battles'] })
    expect((await refreshBattleFeed(client, battlesQuery())).pages).toEqual([{ battles: [], nextCursor: null }])
  } finally {
    client.clear()
  }
})

it('retains the saved feed when a background request fails', async () => {
  const client = new QueryClient()
  const saved = { pages: [history.pages[0]], pageParams: [null] }
  client.setQueryData(['battles'], saved)
  vi.spyOn(functions, 'myBattles').mockRejectedValue(new Error('Disconnected'))
  try {
    await client.invalidateQueries({ queryKey: ['battles'] })
    await refreshBattleFeed(client, battlesQuery()).catch(() => {})
    expect(client.getQueryData(['battles'])).toBe(saved)
  } finally {
    client.clear()
  }
})
