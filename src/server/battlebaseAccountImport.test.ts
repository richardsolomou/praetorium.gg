import { expect, it, vi } from 'vitest'

const { linkExternalAccount, battlebasePlayer, battlebaseBattles, importBattlebaseBattle } = vi.hoisted(() => ({
  linkExternalAccount: vi.fn(),
  battlebasePlayer: vi.fn(),
  battlebaseBattles: vi.fn(),
  importBattlebaseBattle: vi.fn(),
}))
vi.mock('./app', () => ({
  app: () => ({
    repository: { externalAccountsByUser: async () => [], linkExternalAccount },
    catalogue: () => ({}),
    rulesFor: async () => ({}),
    battleFactionsFor: async () => [],
    service: { importBattlebaseBattle },
  }),
}))
vi.mock('./battlebaseData', () => ({ battlebaseNames: async () => ({}) }))
vi.mock('./battlebase', async (original) => ({
  ...(await original<typeof import('./battlebase')>()),
  battlebasePlayer,
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
