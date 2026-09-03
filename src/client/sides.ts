import { FIXED_SECONDARIES } from '../core/battle'
import type { BattleView } from '../core/battleView'

type ViewPlayer = BattleView['players'][number]

/**
 * What the mission a side plays says about itself.
 *
 * Both sides derive one from their own disposition first, so the two can differ and
 * the ceilings a side is held to are that side's. Null is a side whose mission could
 * not be resolved, which is a side nothing is enforced for rather than a side with
 * no limits guessed at.
 */
export type SideMission = {
  id: string
  name: string
  roundCap: number | null
  gameCap: number | null
  secondaryRoundCap: number | null
  secondaryGameCap: number | null
  /** What one fixed secondary card may bank all battle, where the pack states it. */
  fixedSecondaryCap?: number | null
}

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
  /** A practice opponent's army: nobody signs in to it, so the table plays it. */
  automated: boolean
  roster: ViewPlayer['roster']
  /** The saved list this army came from, when it came from one. */
  rosterId: string | null
  units: ViewPlayer['units']
  /** How many of them are still on the table, folded by the domain rather than counted again here. */
  standing: number
  /** How many units the army plays after attachments are formed. */
  unitCount: number
  painted: boolean
  /** What the bonus will pay at the end. It is not in the running score. */
  paintedPoints: number
  /** What the list actually costs, summed from the units as submitted. */
  points: number | null
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
  /**
   * The seat whose device records what this side shares: its cards, its hand, and
   * its settlements.
   *
   * Not always the captain. The domain folds a side's resources onto its first
   * seat, but nobody signs in to a practice opponent — so a side that opens with
   * one has a captain no device is ever behind, and asking for the captain's
   * device left a side of a practice opponent and a player with no one able to
   * settle its cards at all. The first seat someone can sign in to writes for the
   * side. A side of practice opponents alone has none, and `played` is what says
   * the table facing it writes instead.
   */
  writer: ViewPlayer
  /** The side the viewer is sitting on. */
  isViewer: boolean
  /** A side of practice opponents alone. Nobody signs in to it, so the table plays it. */
  automated: boolean
  /**
   * Whether the viewer is one of the people playing this side.
   *
   * Their own side, or a side of practice opponents — nobody signs in to those, so
   * their cards, reserves and turns are taken by the table facing them. Every
   * control that asks "is this mine to press" asks this instead of `isViewer`, so
   * one answer decides it everywhere.
   */
  played: boolean
  isActive: boolean
  cp: number
  cpGained: number
  cpSpent: number
  canGainCp: boolean
  primary: number
  secondary: number
  /** The battle-ready bonus the side has earned, which is one bonus however many armies it fields. */
  paintedPoints: number
  /** The Force Disposition the side plays, or nothing while two allies disagree. */
  disposition: string | null
  /** The cards the side could play, where its allies brought more than one. */
  dispositionChoices: string[]
  /** The score as it stands. The battle-ready bonus joins it when the battle ends. */
  total: number
  rounds: ViewPlayer['rounds']
  primaryCard: ViewPlayer['primaryCard']
  secondaries: ViewPlayer['secondaries']
  secondaryMode: ViewPlayer['secondaryMode']
  secondaryDeckReady: ViewPlayer['secondaryDeckReady']
  remainingSecondaries: ViewPlayer['remainingSecondaries']
  secondariesDrawnThisTurn: ViewPlayer['secondariesDrawnThisTurn']
  secondaryDrawTarget: ViewPlayer['secondaryDrawTarget']
  secondariesToReview: ViewPlayer['secondariesToReview']
  stratagems: ViewPlayer['stratagems']
  /** The mission this side plays, which is not always the one the viewer plays. */
  mission: SideMission | null
}

/**
 * Both sides of the table, lowest side first, so both devices agree on the order.
 *
 * `missions` is what each side is playing. A caller with no need for it leaves it out
 * and gets sides that state no mission, rather than sides quietly wearing someone
 * else's.
 */
export function sides(view: BattleView, missions: readonly { side: number; mission: SideMission | null }[] = []): Side[] {
  const indexes = [...new Set(view.players.map((player) => player.side))].toSorted((left, right) => left - right)
  return indexes.flatMap((index) => {
    const seated = view.players.filter((player) => player.side === index)
    const captain = seated[0]
    if (!captain) return []
    // The side's, not each seat's: the domain already folded it, and summing the
    // copies every seat carries would pay an allied pair twice.
    const paintedPoints = captain.paintedPoints
    return [
      {
        index,
        armies: seated.map(toArmy),
        captain,
        writer: seated.find((player) => !player.automated) ?? captain,
        isViewer: seated.some((player) => player.isViewer),
        automated: seated.every((player) => player.automated),
        played: seated.some((player) => player.isViewer) || seated.every((player) => player.automated),
        isActive: captain.isActive,
        cp: captain.cp,
        cpGained: captain.cpGained,
        cpSpent: captain.cpSpent,
        canGainCp: captain.canGainCp,
        primary: captain.primary,
        secondary: captain.secondary,
        // Taken as absent rather than trusted to be there: this app runs more than one
        // replica, so a view can arrive from an instance older than the screen reading
        // it, and a side with no card to play is a question this screen already asks.
        disposition: captain.disposition ?? null,
        dispositionChoices: captain.dispositionChoices ?? [],
        paintedPoints,
        total: captain.primary + captain.secondary + (view.status === 'finished' ? paintedPoints : 0),
        rounds: captain.rounds,
        primaryCard: captain.primaryCard,
        secondaries: unsettledFirst(captain.secondaries),
        secondaryMode: captain.secondaryMode,
        secondaryDeckReady: captain.secondaryDeckReady,
        remainingSecondaries: captain.remainingSecondaries,
        secondariesDrawnThisTurn: captain.secondariesDrawnThisTurn,
        secondaryDrawTarget: captain.secondaryDrawTarget,
        secondariesToReview: captain.secondariesToReview,
        stratagems: captain.stratagems,
        mission: missions.find((entry) => entry.side === index)?.mission ?? null,
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
export function sideName(side: { armies: readonly { playerName: string }[] }): string {
  return side.armies.map((army) => army.playerName).join(' & ')
}

export function canWritePrep(side: Pick<Side, 'played' | 'writer' | 'automated'>, viewerId: string, tacticalOnly: boolean): boolean {
  return tacticalOnly || (side.played && (side.writer.id === viewerId || side.automated))
}

export function missionCardsReady(
  side: Pick<Side, 'mission' | 'primaryCard' | 'secondaryMode' | 'secondaryDeckReady' | 'secondaries'>,
): boolean {
  if (!side.mission) return true
  if (side.primaryCard?.key !== side.mission.id) return false
  return side.secondaryMode === 'fixed' ? side.secondaries.length === FIXED_SECONDARIES && side.secondaryDeckReady : side.secondaryDeckReady
}

function toArmy(player: ViewPlayer): Army {
  // The frozen points travel on the player's units; the view no longer repeats them under `built`.
  const units = player.roster?.built ? player.units : undefined
  return {
    playerId: player.id,
    playerName: player.name,
    playerImage: player.image,
    isViewer: player.isViewer,
    automated: player.automated,
    roster: player.roster,
    rosterId: player.roster?.id ?? null,
    units: player.units,
    standing: player.standing,
    unitCount: player.unitCount,
    painted: player.painted,
    paintedPoints: player.paintedPoints,
    points: units?.length ? units.reduce((total, unit) => total + unit.points, 0) : null,
  }
}
