import type { BattleView } from '../../../core/battleView'
import { isGuestSeat, isPracticeSeat } from '../../../core/newBattle'

type Seat = Pick<BattleView['players'][number], 'id' | 'side' | 'name' | 'automated' | 'roster'>

/**
 * A finished battle's table from the reader's chair: who a new battle between the same players seats, and who counts.
 *
 * Null when the reader has no account seat, or when the table is one battle creation cannot seat again (a guest
 * beside the reader, or more than one ally).
 */
export function battleTable(view: { players: readonly Seat[]; viewerId: string }) {
  const viewer = view.players.find((player) => player.id === view.viewerId)
  if (!viewer || isGuestSeat(viewer.id)) return null
  const others = view.players.filter((player) => player !== viewer)
  const allies = others.filter((player) => player.side === viewer.side)
  const opponents = others.filter((player) => player.side !== viewer.side)
  const accounts = others.filter((player) => !isGuestSeat(player.id) && !isPracticeSeat(player))
  const counted = !view.players.some(isPracticeSeat)
  return {
    /** Everyone with an account at the table but the reader: the people a rematch must be friends with. */
    accounts,
    /** The one account across the table, when the record against a single person means anything. */
    rival: counted && opponents.length === 1 && accounts.includes(opponents[0]!) ? opponents[0]! : null,
    seats:
      allies.length > 1 || allies.some((player) => isGuestSeat(player.id))
        ? null
        : {
            allyId: allies[0]?.id ?? null,
            opponentIds: opponents.filter((player) => !isGuestSeat(player.id)).map((player) => player.id),
            guestNames: opponents.filter((player) => isGuestSeat(player.id)).map((player) => player.name),
            // Only the reader's own list: anyone at the table may have fielded a practice seat's, and everyone else picks theirs again.
            rosterId: viewer.roster?.id ?? null,
          },
  }
}
