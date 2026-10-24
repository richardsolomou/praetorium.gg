import { expect, it, vi } from 'vitest'
import { BATTLE_ROUNDS, type Command } from '../core/battle'
import { ALICE, BOB, NAMES, log, roster, started, turns } from '../core/battle.fixtures'
import type { RepositoryPort } from './spacetimeRepository'
import { PraetoriumService } from './service'

const rounds = Array.from({ length: BATTLE_ROUNDS }, () => [...turns(6, ALICE), ...turns(6, BOB)]).flat()
const configured: [string, Command] = [
  ALICE,
  { kind: 'configure-battle', limit: 2000, missionPackId: null, terrainLayoutId: null, twistId: null, clockLimitMinutes: null },
]
const soloRounds: [string, Command][] = [
  configured,
  [ALICE, roster('Practice army')],
  [ALICE, { kind: 'begin-battle', firstPlayerId: ALICE }],
  ...turns(BATTLE_ROUNDS * 6, ALICE),
]
const ended: [string, Command][] = [...started(), [ALICE, { kind: 'end-battle', reason: 'conceded', concededBy: ALICE }]]

/** Submits the last entry of `entries` against a battle holding all the others. */
async function finishedBy(entries: [string, Command][], seats = NAMES, outcome: 'appended' | 'stale' = 'appended') {
  const after = log(...entries)
  const history = {
    battle: { id: 'battle', token: 'token', createdAt: 0 },
    players: seats.map((player, side) => ({ ...player, side, automated: false })),
    log: after.slice(0, -1),
  }
  const repository = {
    battleHistoryByToken: vi.fn().mockResolvedValue(history),
    battleByToken: vi.fn().mockResolvedValue(history),
    submit: vi.fn().mockResolvedValue({ result: { outcome, seq: after.length }, log: after }),
  } as unknown as RepositoryPort
  const service = new PraetoriumService(
    repository,
    () => 10,
    () => 0,
  )
  return (await service.submit('token', ALICE, history.log.length, after.at(-1)!.command)).finished
}

it('reports a battle completed by settling the final opponent turn', async () => {
  expect(await finishedBy([...started(), ...rounds, [BOB, { kind: 'settle-opponent-turn' }]])).toBe('completed')
})

it('reports a battle completed by advancing out of the final round', async () => {
  expect(await finishedBy(soloRounds, NAMES.slice(0, 1))).toBe('completed')
})

it('reports a battle ended early with the reason it was ended for', async () => {
  expect(await finishedBy(ended)).toBe('conceded')
})

it('reports no finish for a command recorded after the battle finished', async () => {
  expect(await finishedBy([...ended, [ALICE, { kind: 'add-note', text: 'Good game' }]])).toBeUndefined()
})

it('reports no finish for a command that did not append', async () => {
  expect(await finishedBy(ended, NAMES, 'stale')).toBeUndefined()
})
