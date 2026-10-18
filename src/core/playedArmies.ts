import type { BattleState, Roster } from './battle'
import { attachedUnitCount } from './attachedUnits'
import type { RosterPick } from './roster'

type Built = NonNullable<Roster['built']>

/** One army a finished battle fielded, as discovery lists it: who played it, when, and under which rules. */
export type PlayedArmy = {
  battle: string
  player: { id: string; name: string }
  name: string
  catalogueId: string
  edition: Built['edition'] | null
  detachmentIds: string[]
  detachments: string[]
  disposition: string | null
  limit: number
  pointsBudget: number | null
  waivedRules: NonNullable<Built['waivedRules']>
  picks: RosterPick[]
  unitCount: number
  playedAt: number
}

/**
 * The catalogue armies a finished battle fielded, one per seat that brought one.
 *
 * A pasted list names no catalogue army and a practice opponent is nobody's, so neither is listed.
 * Who may read the battle is the caller's question: this reads only what was fielded.
 */
export function playedArmies(
  history: {
    battle: { token: string; createdAt: number }
    players: readonly { id: string; name: string }[]
    log: readonly { at: number }[]
  },
  state: { status: BattleState['status']; players: readonly Pick<BattleState['players'][number], 'id' | 'automated' | 'roster'>[] },
): PlayedArmy[] {
  if (state.status !== 'finished') return []
  const names = new Map(history.players.map((player) => [player.id, player.name]))
  const playedAt = history.log.at(-1)?.at ?? history.battle.createdAt
  return state.players.flatMap((seat) => {
    const built = seat.roster?.built
    const name = names.get(seat.id)
    if (seat.automated || !built?.picks?.length || name === undefined) return []
    return [
      {
        battle: history.battle.token,
        player: { id: seat.id, name },
        name: seat.roster!.name,
        catalogueId: built.catalogueId,
        edition: built.edition ?? null,
        detachmentIds: built.detachmentIds ?? [],
        detachments: built.detachments?.map((detachment) => detachment.name) ?? (built.detachment ? [built.detachment] : []),
        disposition: built.disposition,
        limit: built.limit,
        pointsBudget: built.pointsBudget ?? null,
        waivedRules: built.waivedRules ?? [],
        picks: built.picks,
        unitCount: attachedUnitCount(built.picks.map((pick, key) => ({ key, attachedTo: pick.attachedTo }))),
        playedAt,
      },
    ]
  })
}
