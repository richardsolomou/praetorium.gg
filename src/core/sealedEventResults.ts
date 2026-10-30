import { battleOutcome, sideScore, type StandingBattle } from './standings'

/** The battle feed's largest page; an event with more battles than this shows a partial table. */
export const SEALED_EVENT_RESULTS_BATTLE_LIMIT = 500

/** One entrant's line in an event's results: finished battles only, with the victory points their side finished on. */
type SealedEventResult = { userId: string; played: number; won: number; drawn: number; lost: number; points: number }

/**
 * An event's results table and who has met whom, from the battles started in it.
 *
 * Wins rank first, then draws, then victory points. A started battle already counts as a meeting,
 * so nobody is pointed at an opponent they are still playing.
 */
export function sealedEventResults(entrantIds: readonly string[], battles: readonly StandingBattle[]) {
  const rows = new Map(
    entrantIds.map((userId): [string, SealedEventResult] => [userId, { userId, played: 0, won: 0, drawn: 0, lost: 0, points: 0 }]),
  )
  const met = new Set<string>()
  for (const battle of battles) {
    battle.playerIds.forEach((one, seat) =>
      battle.playerIds.forEach((other, otherSeat) => {
        if (battle.sides[seat] !== battle.sides[otherSeat]) met.add(JSON.stringify([one, other].toSorted()))
      }),
    )
    if (battle.status !== 'finished') continue
    battle.playerIds.forEach((userId, seat) => {
      const row = rows.get(userId)
      if (!row) return
      const side = battle.sides[seat]!
      row.played += 1
      row[battleOutcome(battle, side)] += 1
      row.points += sideScore(battle, side)
    })
  }
  return {
    rows: [...rows.values()].toSorted(
      (one, other) => other.won - one.won || other.drawn - one.drawn || other.points - one.points || one.lost - other.lost,
    ),
    met: [...met].map((pair) => JSON.parse(pair) as [string, string]),
  }
}
