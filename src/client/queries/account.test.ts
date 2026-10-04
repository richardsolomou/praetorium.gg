import { QueryClient } from '@tanstack/react-query'
import { afterEach, expect, it, vi } from 'vitest'
import * as functions from '../../server/functions'
import { writeAppSnapshot } from '../offline/appStorage'
import { meQuery } from './account'

vi.mock('../offline/appStorage', () => ({
  clearSavedApp: vi.fn().mockResolvedValue(undefined),
  writeAppSnapshot: vi.fn().mockResolvedValue(undefined),
}))
afterEach(() => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

it('saves the new account before its refreshed session returns', async () => {
  vi.stubGlobal('window', {})
  vi.spyOn(functions, 'me').mockResolvedValue({ id: 'player' } as Awaited<ReturnType<typeof functions.me>>)
  const client = new QueryClient()
  client.setQueryData(['me'], null)
  await client.query({ ...meQuery(), staleTime: 0 })
  expect(writeAppSnapshot).toHaveBeenCalledWith(
    expect.objectContaining({ owner: 'player', queries: [expect.objectContaining({ key: ['me'], data: { id: 'player' } })] }),
  )
  client.clear()
})
