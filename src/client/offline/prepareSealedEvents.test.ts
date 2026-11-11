import { QueryClient } from '@tanstack/react-query'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { sealedEventKey, sealedEventRosterKey } from '../queries/queryKeys'
import { prepareSealedEvents, SEALED_CLOCK_MARGIN_MS } from './prepareSealedEvents'

const mocks = vi.hoisted(() => ({ openSealedEvent: vi.fn(), openSealedEventRoster: vi.fn() }))
vi.mock('../functions', () => ({ openSealedEvent: mocks.openSealedEvent, openSealedEventRoster: mocks.openSealedEventRoster }))
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
const sealedAt = 1_000_000
const event = (entry: { sealedAt: number | null; userId?: string }) => ({
  eventToken: 'event',
  revealedAt: sealedAt,
  entries: [{ userId: entry.userId ?? 'rival', submitted: true, sealedAt: entry.sealedAt }],
})
const holdRoster = (roster: unknown, fetchedAt: number) =>
  client.setQueryData(sealedEventRosterKey('tournament', 'event', 'rival'), roster, { updatedAt: fetchedAt })
const downloaded = () => mocks.openSealedEventRoster.mock.calls.map(([args]) => args.data.userId)

beforeEach(() => {
  vi.resetAllMocks()
  mocks.openSealedEventRoster.mockResolvedValue({ name: 'fresh' })
})
afterEach(() => client.clear())

async function prepare(entry: { sealedAt: number | null; userId?: string }) {
  mocks.openSealedEvent.mockResolvedValue(event(entry))
  await prepareSealedEvents(client, [{ token: 'tournament', personal: true }], 'me', () => true)
}

it('downloads a revealed roster the device does not hold', async () => {
  await prepare({ sealedAt })
  expect(downloaded()).toEqual(['rival'])
})

it('keeps a revealed roster the device read after it was sealed', async () => {
  holdRoster({ name: 'held' }, sealedAt + SEALED_CLOCK_MARGIN_MS)
  await prepare({ sealedAt })
  expect(downloaded()).toEqual([])
})

it('downloads a roster sealed again since the device read it', async () => {
  holdRoster({ name: 'held' }, sealedAt + SEALED_CLOCK_MARGIN_MS - 1)
  await prepare({ sealedAt })
  expect(downloaded()).toEqual(['rival'])
})

it('downloads a roster the device read before the reveal let it see one', async () => {
  holdRoster(null, sealedAt + SEALED_CLOCK_MARGIN_MS)
  await prepare({ sealedAt })
  expect(downloaded()).toEqual(['rival'])
})

it('keeps the event itself in the saved screens', async () => {
  await prepare({ sealedAt })
  expect(client.getQueryData(sealedEventKey('tournament'))).toMatchObject({ eventToken: 'event' })
})
