import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import type { RepositoryPort } from './spacetimeRepository'
import { PraetoriumService } from './service'
import { GUEST_SESSION_MS } from '../core/guestSession'

const GUEST = 'guest:battle:0'
const NOW = 1_000_000
const hash = (secret: string) => createHash('sha256').update(secret).digest('hex')

function guestService({ now = NOW, joined = false } = {}) {
  const players = [
    { id: 'host', name: 'Host', image: null, side: 0, automated: false },
    { id: GUEST, name: 'Alex', image: null, side: 1, automated: !joined },
  ]
  const repository = {
    battleByToken: vi.fn().mockResolvedValue({ battle: { id: 'battle', token: 'battle-token', createdAt: 0 }, players }),
    guestInvite: vi.fn().mockResolvedValue('invite'),
    replaceGuestInvite: vi.fn().mockResolvedValue('renewed'),
    guestSeatByInvite: vi.fn().mockResolvedValue({
      battleId: 'battle',
      token: 'battle-token',
      seatId: GUEST,
      guestName: 'Alex',
      hostId: 'host',
      hostName: 'Host',
      joined,
    }),
    joinGuestSeat: vi.fn().mockResolvedValue({ battleId: 'battle', token: 'battle-token', seatId: GUEST }),
    guestDevice: vi.fn().mockResolvedValue({ battleId: 'battle', token: 'battle-token', deviceHash: hash('secret'), joinedAt: NOW }),
    claimGuestSeat: vi.fn().mockResolvedValue('claimed'),
  }
  const service = new PraetoriumService(
    repository as unknown as RepositoryPort,
    () => now,
    () => 0,
  )
  return { service, repository }
}

it('gives a seated account the link for its guest', async () => {
  const { service } = guestService()
  expect(await service.guestInvite('battle-token', 'host', GUEST)).toEqual({ invite: 'invite', joined: false })
})

it('says when the guest has joined on their own device', async () => {
  const { service } = guestService({ joined: true })
  expect((await service.guestInvite('battle-token', 'host', GUEST)).joined).toBe(true)
})

it('refuses the link to someone not seated', async () => {
  const { service } = guestService()
  await expect(service.guestInvite('battle-token', 'stranger', GUEST)).rejects.toMatchObject({ status: 403 })
})

it('refuses the guest a link to their own seat', async () => {
  const { service } = guestService()
  await expect(service.guestInvite('battle-token', GUEST, GUEST)).rejects.toMatchObject({ status: 403 })
})

it('refuses a link for an account seat', async () => {
  const { service } = guestService()
  await expect(service.guestInvite('battle-token', 'host', 'host')).rejects.toMatchObject({ status: 404 })
})

it('stores only the hash of the secret it gives the joining device', async () => {
  const { service, repository } = guestService()
  const { secret } = await service.joinGuest('invite', null)
  expect(repository.joinGuestSeat).toHaveBeenCalledWith('invite', hash(secret), NOW)
})

it('refuses a seated account joining its own battle as the guest', async () => {
  const { service } = guestService()
  await expect(service.joinGuest('invite', 'host')).rejects.toMatchObject({ status: 400 })
})

it('names the guest when another device already took the seat', async () => {
  const { service, repository } = guestService()
  repository.joinGuestSeat.mockResolvedValue('taken')
  await expect(service.joinGuest('invite', null)).rejects.toMatchObject({ status: 409 })
})

it('recognises the device holding the guest seat', async () => {
  const { service } = guestService()
  expect(await service.guestSeat('battle-token', { seat: GUEST, secret: 'secret' })).toBe(GUEST)
})

it('does not recognise a different secret', async () => {
  const { service } = guestService()
  expect(await service.guestSeat('battle-token', { seat: GUEST, secret: 'guess' })).toBeNull()
})

it('does not let a guest seat act in another battle', async () => {
  const { service } = guestService()
  expect(await service.guestSeat('other-token', { seat: GUEST, secret: 'secret' })).toBeNull()
})

it('lets a guest session lapse', async () => {
  const { service } = guestService({ now: NOW + GUEST_SESSION_MS })
  expect(await service.guestSeat('battle-token', { seat: GUEST, secret: 'secret' })).toBeNull()
})

it('claims the seat with the hash of the device secret', async () => {
  const { service, repository } = guestService()
  await service.claimGuest('battle-token', 'newcomer', { seat: GUEST, secret: 'secret' })
  expect(repository.claimGuestSeat).toHaveBeenCalledWith({
    battleId: 'battle',
    seatId: GUEST,
    userId: 'newcomer',
    deviceHash: hash('secret'),
    now: NOW,
  })
})

it('reports why a claim was refused', async () => {
  const { service, repository } = guestService()
  repository.claimGuestSeat.mockResolvedValue('finish the battle before adding it to your record')
  await expect(service.claimGuest('battle-token', 'newcomer', { seat: GUEST, secret: 'secret' })).rejects.toMatchObject({ status: 409 })
})

describe('what a guest’s live refresh reads', () => {
  const cards = [
    { key: 'secret', name: 'Hidden purpose' },
    { key: 'spare', name: 'Spare purpose' },
  ]
  const prep = { kind: 'set-prep', stratagems: [], secondaries: [], secondaryDeck: cards, primary: null, secondaryMode: 'fixed' } as const
  const history = (holder: string, joined: boolean) => ({
    battle: { id: 'battle', token: 'battle-token', createdAt: 0 },
    players: [
      { id: 'host', name: 'Host', image: null, side: 0, automated: false },
      { id: GUEST, name: 'Alex', image: null, side: 1, automated: !joined },
    ],
    log: (
      [
        ['host', { kind: 'attach-roster', roster: { name: 'Host army', text: '10 Intercessors' } }],
        [GUEST, { kind: 'attach-roster', roster: { name: 'Guest army', text: '10 Necron Warriors' } }],
        ['host', { kind: 'begin-battle', firstPlayerId: 'host' }],
        [holder, prep],
        [holder, { kind: 'select-secret', playerId: holder, secondary: cards[0] }],
      ] as const
    ).map(([by, command], index) => ({ seq: index + 1, by, at: index, command })),
  })
  const secondaries = async (holder: string, viewer: string, joined = true) => {
    const { service, repository } = guestService({ joined })
    Object.assign(repository, { battleHistoryByToken: vi.fn().mockResolvedValue(history(holder, joined)) })
    const screen = await service.screen('battle-token', viewer)
    if (screen.kind !== 'battle') throw new Error(`Expected a seated screen, got ${screen.kind}`)
    return screen.view.players.find((player) => player.id === holder)?.secondaries.map((card) => card.name)
  }

  it('keeps the host’s Secret Mission from the guest', async () => {
    expect(await secondaries('host', GUEST)).toEqual(['Secret mission'])
  })

  it('keeps a joined guest’s Secret Mission from the host', async () => {
    expect(await secondaries(GUEST, 'host')).toEqual(['Secret mission'])
  })

  it('shows the guest their own Secret Mission', async () => {
    expect(await secondaries(GUEST, GUEST)).toEqual(['Hidden purpose'])
  })
})
