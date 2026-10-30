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
const clients: QueryClient[] = []
const newClient = (...options: ConstructorParameters<typeof QueryClient>) => {
  const client = new QueryClient(...options)
  clients.push(client)
  return client
}
afterEach(() => {
  for (const client of clients.splice(0)) client.clear()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  onlineManager.setOnline(true)
})

it('keeps an edit completed while an older bootstrap response was in flight', async () => {
  const client = newClient()
  const options = rosterBootstrapQuery('army')
  client.setQueryData(options.queryKey, bootstrap('Original army', 1))
  let resolve!: (value: ReturnType<typeof bootstrap>) => void
  vi.spyOn(functions, 'rosterBootstrap').mockImplementation(() => new Promise((done) => (resolve = done)))
  await load(client)
  const newer = bootstrap('Renamed army', 2)
  client.setQueryData(rosterAccessQuery('army').queryKey, newer)
  resolve(bootstrap('Original army', 1))
  await vi.waitFor(() => expect(client.getQueryState(options.queryKey)?.fetchStatus).toBe('idle'))
  expect(client.getQueryData(rosterAccessQuery('army').queryKey)?.roster.name).toBe('Renamed army')
})

it('refreshes an invalidated bootstrap after client navigation', async () => {
  const client = newClient()
  client.setQueryData(rosterBootstrapQuery('army').queryKey, bootstrap('Original army'))
  await client.invalidateQueries({ queryKey: ['roster-bootstrap'] })
  const request = vi.spyOn(functions, 'rosterBootstrap').mockResolvedValue(bootstrap('Renamed army'))
  await load(client)
  await vi.waitFor(() => expect(client.getQueryData(rosterAccessQuery('army').queryKey)?.roster.name).toBe('Renamed army'))
  expect(request).toHaveBeenCalledOnce()
})

it('does not overwrite newer roster access with an older cached bootstrap', async () => {
  const client = newClient()
  client.setQueryData(rosterBootstrapQuery('army').queryKey, bootstrap('Original army'), { updatedAt: 10 })
  const newer = bootstrap('Renamed army')
  client.setQueryData(rosterAccessQuery('army').queryKey, newer, { updatedAt: 20 })
  await load(client)
  expect(client.getQueryData(rosterAccessQuery('army').queryKey)).toBe(newer)
})

it('opens an invalidated saved roster while disconnected', async () => {
  onlineManager.setOnline(false)
  const client = newClient()
  client.setQueryData(rosterBootstrapQuery('army').queryKey, bootstrap('Saved army'))
  await client.invalidateQueries({ queryKey: ['roster-bootstrap'] })
  await expect(load(client)).resolves.toMatchObject({ preview: { title: 'Saved army' } })
})

it('opens a saved editable roster when its league update check fails', async () => {
  const client = newClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(rosterBootstrapQuery('army').queryKey, bootstrap('Saved army', 0, true))
  vi.spyOn(functions, 'outdatedLeagueEntriesForRoster').mockRejectedValue(new TypeError('Load failed'))
  await expect(load(client)).resolves.toMatchObject({ editable: true, preview: { title: 'Saved army' } })
})

it('asks again for a roster the reader could not open before', async () => {
  const client = newClient()
  client.setQueryData(rosterBootstrapQuery('army').queryKey, null)
  const request = vi.spyOn(functions, 'rosterBootstrap').mockResolvedValue(bootstrap('Lent army'))
  await load(client)
  expect(request).toHaveBeenCalledOnce()
})

it('keeps the lender when it seeds the roster a friend lent', async () => {
  const client = newClient()
  const lentBy = { id: 'owner', name: 'Owner' }
  vi.spyOn(functions, 'rosterBootstrap').mockResolvedValue({ ...bootstrap('Lent army'), lentBy } as ReturnType<typeof bootstrap>)
  await load(client)
  expect(client.getQueryData(rosterAccessQuery('army').queryKey)?.lentBy).toEqual(lentBy)
})

const builderPrice = (editable: boolean) => priceQuery('necrons', [], null, 2000, [], [], null, [], editable).queryKey

it("opens an owner's builder on the bootstrap price, unit limits included", async () => {
  const client = newClient()
  const price = { kind: 'full', points: 0, detachments: [], unitLimits: [] }
  vi.spyOn(functions, 'rosterBootstrap').mockResolvedValue({ ...bootstrap('Army', 0, true), price } as unknown as ReturnType<
    typeof bootstrap
  >)
  await load(client)
  expect(client.getQueryData(builderPrice(true))).toBe(price)
})

it("opens a reader's builder on the bootstrap price", async () => {
  const client = newClient()
  const price = { kind: 'full', points: 0, detachments: [] }
  vi.spyOn(functions, 'rosterBootstrap').mockResolvedValue({ ...bootstrap('Army'), price } as unknown as ReturnType<typeof bootstrap>)
  await load(client)
  expect(client.getQueryData(builderPrice(false))).toBe(price)
})

it('leaves the price for the builder to ask when the bootstrap has none', async () => {
  const client = newClient()
  vi.spyOn(functions, 'rosterBootstrap').mockResolvedValue(bootstrap('Army', 0, true))
  await load(client)
  expect(client.getQueryState(builderPrice(true))).toBeUndefined()
})

it("leaves an owner's price for the builder to ask when it lacks unit limits", async () => {
  const client = newClient()
  const price = { kind: 'full', points: 0, detachments: [] }
  vi.spyOn(functions, 'rosterBootstrap').mockResolvedValue({ ...bootstrap('Army', 0, true), price } as unknown as ReturnType<
    typeof bootstrap
  >)
  await load(client)
  expect(client.getQueryState(builderPrice(true))).toBeUndefined()
})

it('defers a roster the server lacks to the browser, which may hold it unsynced', async () => {
  vi.stubEnv('SSR', true)
  const client = newClient()
  vi.spyOn(functions, 'rosterBootstrap').mockResolvedValue(null)
  await expect(load(client)).resolves.toMatchObject({ onDevice: true })
})

it('reports a roster missing from both the server and this device as not found', async () => {
  vi.stubEnv('SSR', false)
  const client = newClient()
  vi.spyOn(functions, 'rosterBootstrap').mockResolvedValue(null)
  await expect(load(client)).rejects.toMatchObject({ isNotFound: true })
})

it.each([
  [false, 1],
  [true, 0],
])('starts building an editable roster’s picker unless the load is a link preload (preload %s)', async (preload, calls) => {
  const client = newClient()
  client.setQueryData(rosterBootstrapQuery('army').queryKey, bootstrap('Army', 0, true))
  vi.spyOn(functions, 'outdatedLeagueEntriesForRoster').mockResolvedValue([])
  const prepare = vi.spyOn(functions, 'preparePickerUnits').mockResolvedValue(null)
  await loadRoster(client, 'army', {}, preload)
  expect(prepare).toHaveBeenCalledTimes(calls)
})
