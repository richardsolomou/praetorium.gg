import { reduceBattle } from '../core/battle'
import { battleDigest } from '../core/battleDigest'
import { battleFoldArgs } from '../core/offlineBattle'
import type { BattleCard, BattleHistory } from './spacetimeRepository'

type TestHistory = Omit<BattleHistory, 'players'> & {
  players: Pick<BattleHistory['players'][number], 'id' | 'name' | 'side' | 'automated'>[]
}

/** A battle as the feed returns it: its digest in place of its log, as the module folds it. */
export function battleCard({ log, ...seats }: TestHistory & { at?: number }): BattleCard {
  return {
    ...(seats as BattleCard),
    at: seats.at ?? log.at(-1)?.at ?? seats.battle.createdAt,
    digest: battleDigest(reduceBattle(...battleFoldArgs(seats.players, log)), log),
  }
}
