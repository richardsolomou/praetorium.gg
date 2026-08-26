import type { TableShape } from '../core/tableShape'

/** Which side of a 2v1 the player being seated is on. Only the seating differs. */
export type SoloPairRole = 'solo' | 'pair'

/** A seat a shape asks to be filled, in the order the table reads them. */
export type Seat = { id: string; label: string; placeholder: string; side: 'yours' | 'theirs'; at: number }

const SEATS: Record<'1v1' | SoloPairRole | '2v2', readonly Seat[]> = {
  '1v1': [{ id: 'opponent', label: 'Opponent', placeholder: 'Choose a player', side: 'theirs', at: 0 }],
  pair: [
    { id: 'ally', label: 'Your ally', placeholder: 'Choose your ally', side: 'yours', at: 0 },
    { id: 'opponent', label: 'Opponent', placeholder: 'Choose a player', side: 'theirs', at: 0 },
  ],
  solo: [
    { id: 'opponent', label: 'First opponent', placeholder: 'Choose a player', side: 'theirs', at: 0 },
    { id: 'opponent-ally', label: 'Second opponent', placeholder: 'Choose a player', side: 'theirs', at: 1 },
  ],
  '2v2': [
    { id: 'ally', label: 'Your ally', placeholder: 'Choose your ally', side: 'yours', at: 0 },
    { id: 'opponent', label: 'First opponent', placeholder: 'Choose a player', side: 'theirs', at: 0 },
    { id: 'opponent-ally', label: 'Second opponent', placeholder: 'Choose their ally', side: 'theirs', at: 1 },
  ],
}

/**
 * Which seats a shape asks the player being seated to fill.
 *
 * `role` only matters to a 2v1, where whoever is opening the battle may be either the
 * solo player or one of the pair.
 */
export function seatsFor(shape: TableShape, role: SoloPairRole = 'solo'): readonly Seat[] {
  return SEATS[shape === '2v1' ? role : shape]
}

/** The players a request needs, read off the filled seats: the opposing side in order, and an ally if the shape seats one. */
export function seatedPlayers(seats: readonly Seat[], seatedIn: (seat: Seat) => string | null) {
  const opponentIds = seats
    .filter((seat) => seat.side === 'theirs')
    .flatMap((seat) => {
      const id = seatedIn(seat)
      return id ? [id] : []
    })
  const allySeat = seats.find((seat) => seat.side === 'yours')
  return { opponentIds, allyId: allySeat ? seatedIn(allySeat) : null }
}
