import { QueryClient, onlineManager } from '@tanstack/react-query'
import { afterEach, expect, it, vi } from 'vitest'
import * as functions from '../../../server/functions'
import { priceQuery, rosterAccessQuery, rosterBootstrapQuery } from '../../queries'
import { loadRoster } from './rosterRouteData'

const bootstrap = (name: string, updatedAt = 0, editable = false) =>
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
    editable,
    variants: [],
    differences: [],
    faction: null,
    price: null,
    changes: [],
  }) as unknown as NonNullable<Awaited<ReturnType<typeof functions.rosterBootstrap>>>
const load = (queryClient: QueryClient) => loadRoster(queryClient, 'army', {})
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

it('opens a saved editable roster when its league update check fails', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(rosterBootstrapQuery('army').queryKey, bootstrap('Saved army', 0, true))
  vi.spyOn(functions, 'outdatedLeagueEntriesForRoster').mockRejectedValue(new TypeError('Load failed'))
  try {
    await expect(load(client)).resolves.toMatchObject({ editable: true, preview: { title: 'Saved army' } })
  } finally {
    client.clear()
  }
})

it('asks again for a roster the reader could not open before', async () => {
  const client = new QueryClient()
  client.setQueryData(rosterBootstrapQuery('army').queryKey, null)
  const request = vi.spyOn(functions, 'rosterBootstrap').mockResolvedValue(bootstrap('Lent army'))
  try {
    await load(client)
    expect(request).toHaveBeenCalledOnce()
  } finally {
    client.clear()
  }
})

it('keeps the lender when it seeds the roster a friend lent', async () => {
  const client = new QueryClient()
  const lentBy = { id: 'owner', name: 'Owner' }
  vi.spyOn(functions, 'rosterBootstrap').mockResolvedValue({ ...bootstrap('Lent army'), lentBy } as ReturnType<typeof bootstrap>)
  try {
    await load(client)
    expect(client.getQueryData(rosterAccessQuery('army').queryKey)?.lentBy).toEqual(lentBy)
  } finally {
    client.clear()
  }
})

const builderPrice = (editable: boolean) => priceQuery('necrons', [], null, 2000, [], [], null, [], editable).queryKey

it("opens an owner's builder on the bootstrap price, unit limits included", async () => {
  const client = new QueryClient()
  const price = { kind: 'full', points: 0, detachments: [], unitLimits: [] }
  vi.spyOn(functions, 'rosterBootstrap').mockResolvedValue({ ...bootstrap('Army', 0, true), price } as unknown as ReturnType<
    typeof bootstrap
  >)
  try {
    await load(client)
    expect(client.getQueryData(builderPrice(true))).toBe(price)
  } finally {
    client.clear()
  }
})

it("opens a reader's builder on the bootstrap price", async () => {
  const client = new QueryClient()
  const price = { kind: 'full', points: 0, detachments: [] }
  vi.spyOn(functions, 'rosterBootstrap').mockResolvedValue({ ...bootstrap('Army'), price } as unknown as ReturnType<typeof bootstrap>)
  try {
    await load(client)
    expect(client.getQueryData(builderPrice(false))).toBe(price)
  } finally {
    client.clear()
  }
})

it('leaves the price for the builder to ask when the bootstrap has none', async () => {
  const client = new QueryClient()
  vi.spyOn(functions, 'rosterBootstrap').mockResolvedValue(bootstrap('Army', 0, true))
  try {
    await load(client)
    expect(client.getQueryState(builderPrice(true))).toBeUndefined()
  } finally {
    client.clear()
  }
})

it("leaves an owner's price for the builder to ask when it lacks unit limits", async () => {
  const client = new QueryClient()
  const price = { kind: 'full', points: 0, detachments: [] }
  vi.spyOn(functions, 'rosterBootstrap').mockResolvedValue({ ...bootstrap('Army', 0, true), price } as unknown as ReturnType<
    typeof bootstrap
  >)
  try {
    await load(client)
    expect(client.getQueryState(builderPrice(true))).toBeUndefined()
  } finally {
    client.clear()
  }
})

it('defers a roster the server lacks to the browser, which may hold it unsynced', async () => {
  vi.stubEnv('SSR', true)
  const client = new QueryClient()
  vi.spyOn(functions, 'rosterBootstrap').mockResolvedValue(null)
  try {
    await expect(load(client)).resolves.toMatchObject({ onDevice: true })
  } finally {
    vi.unstubAllEnvs()
    client.clear()
  }
})

it('reports a roster missing from both the server and this device as not found', async () => {
  vi.stubEnv('SSR', false)
  const client = new QueryClient()
  vi.spyOn(functions, 'rosterBootstrap').mockResolvedValue(null)
  try {
    await expect(load(client)).rejects.toMatchObject({ isNotFound: true })
  } finally {
    vi.unstubAllEnvs()
    client.clear()
  }
})

it.each([
  [false, 1],
  [true, 0],
])('starts building an editable roster’s picker unless the load is a link preload (preload %s)', async (preload, calls) => {
  const client = new QueryClient()
  client.setQueryData(rosterBootstrapQuery('army').queryKey, bootstrap('Army', 0, true))
  vi.spyOn(functions, 'outdatedLeagueEntriesForRoster').mockResolvedValue([])
  const prepare = vi.spyOn(functions, 'preparePickerUnits').mockResolvedValue(null)
  try {
    await loadRoster(client, 'army', {}, preload)
    expect(prepare).toHaveBeenCalledTimes(calls)
  } finally {
    client.clear()
  }
})
