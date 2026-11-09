import { expect, it, vi } from 'vitest'
import type { Command } from '../core/battle'
import { ALICE, BOB, NAMES, log, started } from '../core/battle.fixtures'
import type { RepositoryPort } from './spacetimeRepository'
import { PraetoriumService } from './service'

const cards = [
  { key: 'a', name: 'Behind Enemy Lines' },
  { key: 'b', name: 'Bring It Down' },
  { key: 'c', name: 'Area Denial' },
  { key: 'd', name: 'Storm Hostile Objective' },
]
const tactical: [string, Command] = [
  ALICE,
  { kind: 'set-prep', stratagems: [], primary: null, secondaryMode: 'tactical', secondaries: [], secondaryDeck: cards },
]
const draw: Command = { kind: 'draw-secondaries', secondaries: cards.slice(0, 2) }

/** The sequence the product database is asked to append a draw at, when the draw was worked out before `since`. */
async function drawnAt(since: [string, Command][]) {
  const seen = log(...started(), tactical)
  const history = {
    battle: { id: 'battle', token: 'token', createdAt: 0 },
    players: NAMES.map((player, side) => ({ ...player, side, automated: false })),
    log: log(...started(), tactical, ...since),
  }
  const repository = {
    battleHistoryByToken: vi.fn().mockResolvedValue(history),
    battleByToken: vi.fn().mockResolvedValue(history),
    submit: vi.fn().mockResolvedValue({ result: { outcome: 'stale', seq: history.log.length }, log: history.log }),
  } as unknown as RepositoryPort
  const service = new PraetoriumService(
    repository,
    () => 10,
    () => 0,
  )
  await service.submit('token', ALICE, seen.length, draw)
  return vi.mocked(repository.submit).mock.calls[0]![0].expectedSeq
}

it('draws against the newer history when the opponent acted without touching the hand', async () => {
  const since: [string, Command][] = [[BOB, { kind: 'adjust-cp', delta: 1 }]]
  expect(await drawnAt(since)).toBe(log(...started(), tactical, ...since).length)
})

it('stays stale when the hand was drawn from another device meanwhile', async () => {
  expect(await drawnAt([[ALICE, draw]])).toBe(log(...started(), tactical).length)
})
