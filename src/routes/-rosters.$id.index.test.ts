import { QueryClient, onlineManager } from '@tanstack/react-query'
import { afterEach, expect, it, vi } from 'vitest'
import * as functions from '../server/functions'
import { rosterAccessQuery, rosterBootstrapQuery } from '../client/queries'
import { Route } from './rosters.$id.index'

vi.mock('../client/features/rosters/RosterPage', () => ({ RosterPage: () => null }))
const bootstrap = (name: string, updatedAt = 0) =>
  ({
    roster: {
      id: 'army',
      name,
      updatedAt,
      catalogueId: 'necrons',
      detachmentIds: [],
      disposition: null,
      limit: 2000,
      picks: [],
      visibility: 'private',
    },
    editable: false,
    variants: [],
    differences: [],
    faction: null,
    price: null,
    changes: [],
  }) as unknown as NonNullable<Awaited<ReturnType<typeof functions.rosterBootstrap>>>
const load = (queryClient: QueryClient) => {
  const loader = Route.options.loader
  if (typeof loader !== 'function') throw new Error('Missing roster loader')
  return loader({ context: { queryClient }, params: { id: 'army' }, deps: {} } as never)
}
afterEach(() => {
  vi.restoreAllMocks()
  onlineManager.setOnline(true)
})

it('keeps an edit completed while an older bootstrap response was in flight', async () => {
  const client = new QueryClient()
  const options = rosterBootstrapQuery('army')
  client.setQueryData(options.queryKey, bootstrap('Original army', 1))
  let resolve!: (value: ReturnType<typeof bootstrap>) => void
  vi.spyOn(functions, 'rosterBootstrap').mockImplementation(() => new Promise((done) => (resolve = done)))
  try {
    await load(client)
    const newer = bootstrap('Renamed army', 2)
    client.setQueryData(rosterAccessQuery('army').queryKey, newer)
    resolve(bootstrap('Original army', 1))
    await vi.waitFor(() => expect(client.getQueryState(options.queryKey)?.fetchStatus).toBe('idle'))
    expect(client.getQueryData(rosterAccessQuery('army').queryKey)?.roster.name).toBe('Renamed army')
  } finally {
    client.clear()
  }
})

it('refreshes an invalidated bootstrap after client navigation', async () => {
  const client = new QueryClient()
  client.setQueryData(rosterBootstrapQuery('army').queryKey, bootstrap('Original army'))
  await client.invalidateQueries({ queryKey: ['roster-bootstrap'] })
  const request = vi.spyOn(functions, 'rosterBootstrap').mockResolvedValue(bootstrap('Renamed army'))
  try {
    await load(client)
    await vi.waitFor(() => expect(client.getQueryData(rosterAccessQuery('army').queryKey)?.roster.name).toBe('Renamed army'))
    expect(request).toHaveBeenCalledOnce()
  } finally {
    client.clear()
  }
})

it('does not overwrite newer roster access with an older cached bootstrap', async () => {
  const client = new QueryClient()
  client.setQueryData(rosterBootstrapQuery('army').queryKey, bootstrap('Original army'), { updatedAt: 10 })
  const newer = bootstrap('Renamed army')
  client.setQueryData(rosterAccessQuery('army').queryKey, newer, { updatedAt: 20 })
  try {
    await load(client)
    expect(client.getQueryData(rosterAccessQuery('army').queryKey)).toBe(newer)
  } finally {
    client.clear()
  }
})

it('opens an invalidated saved roster while disconnected', async () => {
  onlineManager.setOnline(false)
  const client = new QueryClient()
  client.setQueryData(rosterBootstrapQuery('army').queryKey, bootstrap('Saved army'))
  await client.invalidateQueries({ queryKey: ['roster-bootstrap'] })
  try {
    await expect(load(client)).resolves.toMatchObject({ preview: { title: 'Saved army' } })
  } finally {
    client.clear()
  }
})
