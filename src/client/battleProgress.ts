/** The last fully completed round; the current playing round is still in progress. */
export function completedBattleRound(status: 'setup' | 'playing' | 'finished', round: number, reason?: string | null) {
  if (status === 'finished' && reason === 'completed') return round
  return Math.max(0, round - 1)
}
