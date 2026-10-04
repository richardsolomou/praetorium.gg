import { afterEach, expect, it, vi } from 'vitest'
import { createQueryClient } from './queryClient'
import { writeAppSnapshot } from './offline/appStorage'

vi.mock('./offline/appStorage', () => ({ writeAppSnapshot: vi.fn().mockResolvedValue(undefined) }))
afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

it('persists refreshed data before a successful mutation finishes', async () => {
  vi.stubGlobal('window', {})
  const client = createQueryClient()
  client.setQueryData(['me'], { id: 'player' })
  let finish!: () => void
  vi.mocked(writeAppSnapshot).mockImplementationOnce(() => new Promise<void>((resolve) => (finish = resolve)))
  const mutation = client.getMutationCache().build(client, {
    mutationFn: async () => 'saved',
    onSuccess: () => client.setQueryData(['roster-access', 'army'], { name: 'Updated roster' }),
  })
  const result = mutation.execute(undefined)
  await vi.waitFor(() =>
    expect(writeAppSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        queries: expect.arrayContaining([expect.objectContaining({ key: ['roster-access', 'army'], data: { name: 'Updated roster' } })]),
      }),
    ),
  )
  expect(mutation.state.status).toBe('pending')
  finish()
  await expect(result).resolves.toBe('saved')
  client.clear()
})

it('does not retry a completed server mutation when snapshot storage fails', async () => {
  vi.stubGlobal('window', {})
  vi.mocked(writeAppSnapshot).mockRejectedValueOnce(new Error('Storage unavailable'))
  const client = createQueryClient()
  const mutation = client.getMutationCache().build(client, { mutationFn: async () => 'saved' })
  await expect(mutation.execute(undefined)).resolves.toBe('saved')
  expect(writeAppSnapshot).toHaveBeenCalledOnce()
  client.clear()
})

it('does not persist failed mutations', async () => {
  vi.stubGlobal('window', {})
  const client = createQueryClient()
  const mutation = client.getMutationCache().build(client, {
    mutationFn: async () => {
      throw new Error('Rejected')
    },
  })
  await expect(mutation.execute(undefined)).rejects.toThrow('Rejected')
  expect(writeAppSnapshot).not.toHaveBeenCalled()
  client.clear()
})
