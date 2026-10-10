export type NewBattlePlayers = { opponentId?: string; opponentIds?: string[]; allyId?: string }
export type CreateBattleInput = NewBattlePlayers & { limit?: number | null; missionPackId: string | null; casual?: boolean }

export function newBattleSeats(input?: string | NewBattlePlayers) {
  const opponentIds = typeof input === 'string' ? [input] : (input?.opponentIds ?? (input?.opponentId ? [input.opponentId] : []))
  const allyIds = typeof input === 'object' && input.allyId ? [input.allyId] : []
  return { allyIds, opponentIds, invited: [...allyIds, ...opponentIds] }
}
