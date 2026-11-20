import { expect, it, vi } from 'vitest'

const {
  externalAccountsByUser,
  battlebaseNames,
  linkExternalAccount,
  battlebasePlayer,
  battlebaseBattlePage,
  battlebaseBattles,
  importBattlebaseBattle,
} = vi.hoisted(() => ({
  externalAccountsByUser: vi.fn().mockResolvedValue([]),
  battlebaseNames: vi.fn().mockResolvedValue({}),
  linkExternalAccount: vi.fn(),
  battlebaseBattlePage: vi.fn(),
  battlebasePlayer: vi.fn(),
  battlebaseBattles: vi.fn(),
  importBattlebaseBattle: vi.fn(),
}))
vi.mock('./app', () => ({
  app: () => ({
    repository: { externalAccountsByUser, linkExternalAccount },
    catalogue: () => ({}),
    rulesFor: async () => ({}),
    battleFactionsFor: async () => [],
    service: { importBattlebaseBattle },
  }),
}))
vi.mock('./battlebaseData', () => ({ battlebaseNames }))
vi.mock('./battlebase', async (original) => ({
  ...(await original<typeof import('./battlebase')>()),
  battlebasePlayer,
  battlebaseBattlePage,
  battlebaseBattles,
}))

import { battlebaseCode } from './battlebase'
import { importBattlebaseHistory } from './battlebaseAccountImport'

it('leaves an unverified account unlinked and does not fetch its games', async () => {
  battlebasePlayer.mockResolvedValueOnce({
    id: 'bb-1',
    username: 'league-player',
    tagline: battlebaseCode('someone-else', 'league-player'),
  })
  const result = await importBattlebaseHistory('player-1', 'league-player')
  expect([result.outcome, linkExternalAccount.mock.calls.length, battlebaseBattles.mock.calls.length]).toEqual(['unverified', 0, 0])
})

it('counts imported, previously imported and newly linked games after verification', async () => {
  battlebasePlayer.mockResolvedValueOnce({ id: 'bb-1', username: 'league-player', tagline: battlebaseCode('player-1', 'league-player') })
  linkExternalAccount.mockResolvedValueOnce(1)
  battlebaseBattles.mockResolvedValueOnce([{ id: 'old' }, { id: 'new' }])
  importBattlebaseBattle.mockResolvedValueOnce('alreadyImported').mockResolvedValueOnce('imported')
  const result = await importBattlebaseHistory('player-1', 'league-player')
  expect(result.outcome === 'imported' && (await result.counts)).toMatchObject({ imported: 1, joined: 1, alreadyImported: 0 })
})

it('leaves a verified account unlinked if the first page cannot load', async () => {
  const lastLink = linkExternalAccount.mock.calls.length
  battlebasePlayer.mockResolvedValueOnce({ id: 'bb-1', username: 'league-player', tagline: battlebaseCode('player-1', 'league-player') })
  battlebaseBattlePage.mockRejectedValueOnce(new Response('Unavailable', { status: 502 }))
  await expect(importBattlebaseHistory('player-1', 'league-player', {})).rejects.toMatchObject({ status: 502 })
  expect(linkExternalAccount.mock.calls).toHaveLength(lastLink)
})

it('ends an assistant import when shared BattleBase names are slow', async () => {
  const deadline = new AbortController()
  const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValueOnce(deadline.signal)
  const lastLink = linkExternalAccount.mock.calls.length
  battlebasePlayer.mockResolvedValueOnce({ id: 'bb-1', username: 'league-player', tagline: battlebaseCode('player-1', 'league-player') })
  battlebaseNames.mockImplementationOnce(async () => {
    deadline.abort()
    return new Promise(() => {})
  })
  battlebaseBattlePage.mockResolvedValueOnce([])
  try {
    await expect(importBattlebaseHistory('player-1', 'league-player', {})).rejects.toMatchObject({ status: 503 })
    expect(linkExternalAccount.mock.calls).toHaveLength(lastLink)
  } finally {
    timeout.mockRestore()
  }
})

it('continues BattleBase imports one page at a time using the linked account', async () => {
  externalAccountsByUser.mockResolvedValue([{ source: 'battlebase', playerId: 'bb-1', name: 'league-player' }])
  battlebasePlayer.mockResolvedValue({ id: 'bb-1', username: 'league-player', tagline: '' })
  battlebaseBattlePage
    .mockResolvedValueOnce(Array.from({ length: 20 }, (_, index) => ({ id: `game-${index}` })))
    .mockResolvedValueOnce([{ id: 'game-20' }])
  importBattlebaseBattle.mockResolvedValue('imported')
  const first = await importBattlebaseHistory('player-1', undefined, {})
  if (first.outcome !== 'imported') throw new Error(first.outcome)
  expect({ cursor: first.nextCursor, counts: await first.counts }).toMatchObject({ cursor: 'game-19', counts: { imported: 20 } })
  const second = await importBattlebaseHistory('player-1', undefined, { before: first.nextCursor! })
  if (second.outcome !== 'imported') throw new Error(second.outcome)
  expect(battlebaseBattlePage).toHaveBeenLastCalledWith('bb-1', 20, 'game-19', expect.any(AbortSignal))
  expect({ cursor: second.nextCursor, counts: await second.counts }).toMatchObject({ cursor: null, counts: { imported: 1 } })
})
