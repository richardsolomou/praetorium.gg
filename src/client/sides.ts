import type { BattleView } from '../core/battleView'

type ViewPlayer = BattleView['players'][number]

/**
 * One army on the table and the player it belongs to.
 *
 * A 2v1 side fields two of these. Everything here is the player's own: their list,
 * their units, and their battle-ready bonus. Everything a side shares lives on the
 * side, not here.
 */
export type Army = {
  playerId: string
  playerName: string
  playerImage: string | null
  isViewer: boolean
  roster: ViewPlayer['roster']
  /** The saved list this army came from, when it came from one. */
  rosterId: string | null
  units: ViewPlayer['units']
  painted: boolean
  /** What the bonus will pay at the end. It is not in the running score. */
  paintedPoints: number
  /** What the list actually costs, summed from the units as submitted. */
  points: number | null
  detachment: string | null
}

/**
 * A side of the table, which is what the game is actually played between.
 *
 * Command points, victory points, mission cards and stratagems belong to a side and
 * not to a player — the domain already folds them that way, through the first seat
 * on the side. Reading them from here is what stops a 2v1 drawing one pool twice
 * and letting the two copies disagree.
 */
export type Side = {
  /** The `side` a player carries, and the index into the two tints. */
  index: number
  /** Every army on this side, in seating order. */
  armies: Army[]
  /** The seat the domain folds this side's shared resources onto. */
  captain: ViewPlayer
  /** The side the viewer is sitting on. */
  isViewer: boolean
  isActive: boolean
  cp: number
  cpGained: number
  cpSpent: number
  canGainCp: boolean
  primary: number
  secondary: number
  /** The battle-ready bonus of every army on the side, added together. */
  paintedPoints: number
  /** The score as it stands. The battle-ready bonus joins it when the battle ends. */
  total: number
  rounds: ViewPlayer['rounds']
  primaryCard: ViewPlayer['primaryCard']
  secondaries: ViewPlayer['secondaries']
  secondaryMode: ViewPlayer['secondaryMode']
  remainingSecondaries: ViewPlayer['remainingSecondaries']
  stratagems: ViewPlayer['stratagems']
}

/** Both sides of the table, lowest side first, so both devices agree on the order. */
export function sides(view: BattleView): Side[] {
  const indexes = [...new Set(view.players.map((player) => player.side))].toSorted((left, right) => left - right)
  return indexes.flatMap((index) => {
    const seated = view.players.filter((player) => player.side === index)
    const captain = seated[0]
    if (!captain) return []
    const paintedPoints = seated.reduce((total, player) => total + player.paintedPoints, 0)
    return [
      {
        index,
        armies: seated.map(toArmy),
        captain,
        isViewer: seated.some((player) => player.isViewer),
        isActive: captain.isActive,
        cp: captain.cp,
        cpGained: captain.cpGained,
        cpSpent: captain.cpSpent,
        canGainCp: captain.canGainCp,
        primary: captain.primary,
        secondary: captain.secondary,
        paintedPoints,
        total: captain.primary + captain.secondary + (view.status === 'finished' ? paintedPoints : 0),
        rounds: captain.rounds,
        primaryCard: captain.primaryCard,
        secondaries: unsettledFirst(captain.secondaries),
        secondaryMode: captain.secondaryMode,
        remainingSecondaries: captain.remainingSecondaries,
        stratagems: captain.stratagems,
      },
    ]
  })
}

/**
 * The hand with whatever is still in play at the top.
 *
 * A card that has been neither scored nor put back is still something to do, and a
 * list that leaves it wherever it was dealt is a list a player can lose it in. Cards
 * that are done keep their dealt order underneath, so settling one moves it down
 * rather than shuffling the rest.
 */
const unsettledFirst = (cards: ViewPlayer['secondaries']): ViewPlayer['secondaries'] => [
  ...cards.filter((card) => card.status === 'active'),
  ...cards.filter((card) => card.status !== 'active'),
]

/** The side the viewer plays on first, then the ones they are playing against. */
export function facingSides(view: BattleView): { yours: Side | undefined; theirs: Side[] } {
  const all = sides(view)
  return { yours: all.find((side) => side.isViewer), theirs: all.filter((side) => !side.isViewer) }
}

/** What a side is called: every player on it, in seating order. */
export function sideName(side: Side): string {
  return side.armies.map((army) => army.playerName).join(' & ')
}

function toArmy(player: ViewPlayer): Army {
  const units = player.roster?.built?.units
  return {
    playerId: player.id,
    playerName: player.name,
    playerImage: player.image,
    isViewer: player.isViewer,
    roster: player.roster,
    rosterId: player.roster?.id ?? null,
    units: player.units,
    painted: player.painted,
    paintedPoints: player.paintedPoints,
    points: units?.length ? units.reduce((total, unit) => total + unit.points, 0) : null,
    detachment: player.roster?.built?.detachment ?? null,
  }
}
