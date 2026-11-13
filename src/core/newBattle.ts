export type NewBattlePlayers = { opponentId?: string; opponentIds?: string[]; allyId?: string }
export type CreateBattleInput = NewBattlePlayers & {
  limit?: number | null
  missionPackId: string | null
  casual?: boolean
  manual?: boolean
  /** The group whose table the battle counts on, when it is started from the group between its members. */
  groupToken?: string
  /** The fixture of that group's league this battle plays. */
  fixture?: string
}

/** The prefix no account id carries, so a guest seat can never be mistaken for, or claimed by, an account. */
const GUEST_SEAT = 'guest:'

/** A guest's seat, scoped to its battle: the same person in two battles is two unrelated guests. */
export function guestSeatId(battleId: string, at: number) {
  return `${GUEST_SEAT}${battleId}:${at}`
}

export function isGuestSeat(playerId: string) {
  return playerId.startsWith(GUEST_SEAT)
}

/** A seat nobody signs in to that stands for no real opponent; a guest is also played by the table but is a real one. */
export function isPracticeSeat(player: { id: string; automated: boolean }) {
  return player.automated && !isGuestSeat(player.id)
}

/**
 * What a battle calls a seat its creator plays for themselves: the army it brings, or where it sits beside them
 * until it has one. The automated account behind it is nobody anyone plays against, so its own name never shows.
 */
export function playedSeatName(seats: readonly { side: number; army: string | null | undefined }[], at: number, creatorSide: number) {
  const seat = seats[at]!
  if (seat.army) return seat.army
  if (seat.side === creatorSide) return 'Ally'
  return seats.findIndex((other) => other.side === seat.side) === at ? 'Opponent' : 'Second opponent'
}

export function newBattleSeats(input?: string | NewBattlePlayers) {
  const opponentIds = typeof input === 'string' ? [input] : (input?.opponentIds ?? (input?.opponentId ? [input.opponentId] : []))
  const allyIds = typeof input === 'object' && input.allyId ? [input.allyId] : []
  return { allyIds, opponentIds, invited: [...allyIds, ...opponentIds] }
}
