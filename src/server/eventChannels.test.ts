import { format } from 'node:util'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EventChannels } from './eventChannels'

const URL = `https://discord.com/api/webhooks/${'1'.repeat(18)}/${'t'.repeat(68)}`

function setup(request: (url: string, init: RequestInit) => Promise<Response>) {
  const recorded: string[] = []
  const repository = {
    eventChannelTarget: vi.fn(async () => ({ hostId: 'tournament-id', url: URL, name: 'Spring Open', league: false })),
    recordEventChannelDelivery: vi.fn(async (_hostId: string, _url: string, outcome: string) => void recorded.push(outcome)),
    battlesByIds: vi.fn(async () => []),
    namesByIds: vi.fn(async (ids: readonly string[]) => new Map(ids.map((id) => [id, { name: id.toUpperCase() }]))),
  }
  const pairedRound = vi.fn(async () => ({
    tables: [
      { table: 1, aId: 'a', bId: 'b' },
      { table: 2, aId: 'c', bId: null },
    ],
    standings: [{ userId: 'a', points: 3, won: 1, drawn: 0, lost: 0 }],
  }))
  const channels = new EventChannels(repository as never, pairedRound as never, 'https://praetorium.gg', request as typeof fetch)
  const paired = () =>
    channels.noticed([
      { kind: 'sealed-event-round-paired', actorId: 'organizer', recipientIds: ['a', 'b', 'c'], sealedEventToken: 'open', round: 2 },
    ])
  return { recorded, paired, settled: () => vi.waitFor(() => expect(recorded).toHaveLength(1)) }
}

afterEach(() => vi.restoreAllMocks())

describe('EventChannels', () => {
  it('posts a paired round’s tables and standings without letting a name ping anyone', async () => {
    const request = vi.fn(async (_url: string, _init: RequestInit) => new Response(null, { status: 204 }))
    const channels = setup(request)
    channels.paired()
    await channels.settled()
    expect(JSON.parse(request.mock.calls[0]![1].body as string)).toEqual({
      content: [
        '**Spring Open**: round 2 is paired.',
        'Table 1: A v B',
        'Bye: C',
        '',
        'Standings after round 1:',
        '1. A, 3 pts (1–0–0)',
        '[See your table](https://praetorium.gg/tournaments/open)',
      ].join('\n'),
      allowed_mentions: { parse: [] },
      flags: 4,
    })
  })

  it('stops the channel when Discord no longer knows the webhook', async () => {
    const channels = setup(async () => new Response(null, { status: 404 }))
    channels.paired()
    await channels.settled()
    expect(channels.recorded).toEqual(['refused'])
  })

  it('never logs the webhook address when Discord is unreachable', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const channels = setup(async () => {
      throw new TypeError(`fetch failed for ${URL}`)
    })
    channels.paired()
    await channels.settled()
    const logged = warn.mock.calls.map((call) => format(...call)).join('\n')
    expect([logged.includes('event_channel_post_unreachable'), logged.includes('t'.repeat(68))]).toEqual([true, false])
  })
})
