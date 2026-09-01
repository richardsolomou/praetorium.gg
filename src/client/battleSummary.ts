/**
 * A battle in a list, folded into the two sides it was actually played between.
 *
 * The rows carry a value per seat, and for most of this app's life the first seat was
 * one side and everything after it was the other. A 2v1 opened from the allied side
 * seats an ally second, so reading a row that way puts a player's own ally across the
 * table from them — and reads the side's score off a seat that never holds one, since
 * a side's points fold onto its first seat.
 *
 * The same fold as `sides()` makes for a battle on screen, over the far smaller thing
 * a list row knows.
 */
export type BattleSummary = {
  players: readonly string[]
  playerDetails?: readonly { id: string; name: string; image: string | null; automated: boolean }[]
  armies: readonly (string | null)[]
  factions?: readonly ({ slug: string; displayName: string; icon: string | null } | null)[]
  detachments: readonly string[][]
  scores: readonly number[]
  sides: readonly number[]
}

export type SummarySide = {
  index: number
  players: string[]
  armies: string[]
  detachments: string[]
  seats: {
    player: { id: string; name: string; image: string | null; automated: boolean }
    army: string | null
    faction: { slug: string; displayName: string; icon: string | null } | null
    detachments: string[]
  }[]
  /** The side's score, which the seat holding its resources carries. */
  score: number
}

export function summarySides(battle: BattleSummary): SummarySide[] {
  const indexes = [...new Set(battle.sides)].toSorted((left, right) => left - right)
  return indexes.map((index) => {
    const seats = battle.sides.flatMap((side, at) => (side === index ? [at] : []))
    return {
      index,
      players: seats.flatMap((at) => (battle.players[at] ? [battle.players[at]] : [])),
      armies: seats.flatMap((at) => {
        const army = battle.armies[at]
        return army ? [army] : []
      }),
      detachments: seats.flatMap((at) => battle.detachments[at] ?? []),
      seats: seats.flatMap((at) => {
        const player = battle.playerDetails?.[at]
        const name = battle.players[at]
        if (!player && !name) return []
        return [
          {
            player: player ?? { id: '', name: name!, image: null, automated: false },
            army: battle.armies[at] ?? null,
            faction: battle.factions?.[at] ?? null,
            detachments: [...(battle.detachments[at] ?? [])],
          },
        ]
      }),
      score: battle.scores[seats[0] ?? 0] ?? 0,
    }
  })
}
