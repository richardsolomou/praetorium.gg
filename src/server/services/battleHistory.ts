import { reduceBattle } from '../../core/battle'
import { battleFoldArgs } from '../../core/offlineBattle'
import type { BattleHistory, BattleSeats, RepositoryPort } from '../spacetimeRepository'

/** Every battle with a seated player is open to watch; a table nobody sits at is not. */
export function mayWatch(history: BattleSeats) {
  return history.players.length > 0
}

export function foldHistory({ players, log }: BattleHistory) {
  return reduceBattle(...battleFoldArgs(players, log))
}

export async function mustFindBattle(repository: RepositoryPort, token: string): Promise<BattleHistory> {
  const history = await repository.battleHistoryByToken(token)
  if (!history) throw new Response('no such battle', { status: 404 })
  return history
}
