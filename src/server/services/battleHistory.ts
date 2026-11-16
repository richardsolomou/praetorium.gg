import { reduceBattle } from '../../core/battle'
import { battleFoldArgs } from '../../core/offlineBattle'
import type { BattleHistory, BattleSeats, RepositoryPort } from '../spacetimeRepository'

/** Every battle with a seated player is open to watch; a table nobody sits at is not. */
export function mayWatch(history: BattleSeats) {
  return history.players.length > 0
}

export function isSeated(seats: BattleSeats, userId: string) {
  return seats.players.some((player) => player.id === userId)
}

export function foldHistory({ players, log }: BattleHistory) {
  return reduceBattle(...battleFoldArgs(players, log))
}

export async function mustFindBattle(repository: RepositoryPort, token: string): Promise<BattleHistory> {
  const history = await repository.battleHistoryByToken(token)
  if (!history) throw new Response('no such battle', { status: 404 })
  return history
}

/** Finishes a battle with a score typed in for a game that wasn't tracked here, `vp` in the order of `players`. */
export async function reportScore(
  repository: RepositoryPort,
  {
    token,
    players,
    vp,
    userId,
    organizer,
    now,
  }: {
    token: string
    players: [string, string]
    vp: [number, number]
    userId: string
    organizer: boolean
    now: number
  },
) {
  const history = await mustFindBattle(repository, token)
  const { result } = await repository.submit({
    battleId: history.battle.id,
    userId,
    expectedSeq: foldHistory(history).seq,
    command: { kind: 'report-result', vp: { [players[0]]: vp[0], [players[1]]: vp[1] } },
    now,
    snapshot: { seats: history.players, log: history.log },
    organizer,
  })
  if (result.outcome === 'refused') throw new Response(result.reason, { status: 409 })
  if (result.outcome === 'stale') throw new Response('the battle changed while the score was being saved, so try again', { status: 409 })
}
