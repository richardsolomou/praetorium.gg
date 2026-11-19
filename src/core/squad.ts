import type { SwissMatch } from './swiss'

/**
 * Team tournaments: teams of the same size meet in Swiss rounds, and each meeting's pairing process decides which of
 * their players play each other. In code a tournament team is a squad, since `team` names a 2v1 or 2v2 pair.
 *
 * Each stage of the process, both teams choose in secret and the two choices are revealed together: a defender; then
 * two attackers to send against the other team's defender; then which of those two attackers their own defender
 * plays. Both defenders and both accepted attackers leave the pool, and the refused attackers return to it. Each stage
 * pairs two games until three or four players are left; the last stage also pairs the two refused attackers, and
 * the two players nobody chose.
 */

export const SQUAD_SIZES = [3, 4, 5, 6, 7, 8] as const
export type SquadSize = (typeof SQUAD_SIZES)[number]
export const SQUAD_NAME_MAX_LENGTH = 60

/** How a team match is won: by more of its games won, a draw counting half, or by more victory points across them. */
export const SQUAD_SCORINGS = ['games', 'points'] as const
export type SquadScoring = (typeof SQUAD_SCORINGS)[number]

/** A team tournament's teams: how many play for each, and how a team match is won. */
export type SquadRule = { size: SquadSize; scoring: SquadScoring }

export const SQUAD_STEPS = ['defender', 'attackers', 'accept'] as const
export type SquadStep = (typeof SQUAD_STEPS)[number]

const squadStages = (size: number) => (size <= 4 ? 1 : 1 + Math.ceil((size - 4) / 2))

export const squadStepCount = (size: number) => squadStages(size) * SQUAD_STEPS.length

type Pair<T> = readonly [T, T]

/** What both teams chose in one stage so far, each pair in the two teams' order. */
export type SquadStage = { defenders?: Pair<string>; attackers?: Pair<readonly string[]>; accepted?: Pair<string> }

export type SquadPairingState = {
  /** The choice both teams make next, or null once every game is paired. */
  step: { index: number; kind: SquadStep } | null
  /** Each team's players not yet paired. */
  pools: Pair<readonly string[]>
  stages: SquadStage[]
  /** Each game as the first team's player and the second's. */
  games: Pair<string>[]
}

/** Where two teams' pairing stands after the choices both have revealed, one pair of picks per step. */
export function squadPairing(members: Pair<readonly string[]>, revealed: readonly Pair<readonly string[]>[]): SquadPairingState {
  const size = members[0].length
  const pools: [string[], string[]] = [[...members[0]], [...members[1]]]
  const stages: SquadStage[] = []
  const games: Pair<string>[] = []
  const last = squadStages(size) - 1
  for (const [index, picks] of revealed.entries()) {
    const stageIndex = Math.floor(index / SQUAD_STEPS.length)
    const kind = SQUAD_STEPS[index % SQUAD_STEPS.length]!
    const stage = (stages[stageIndex] ??= {})
    if (kind === 'defender') stage.defenders = [picks[0][0]!, picks[1][0]!]
    if (kind === 'attackers') stage.attackers = picks
    if (kind !== 'accept') continue
    const [defenderA, defenderB] = stage.defenders!
    const accepted = [picks[0][0]!, picks[1][0]!] as const
    stage.accepted = accepted
    games.push([defenderA, accepted[0]], [accepted[1], defenderB])
    const leaving = [new Set([defenderA, accepted[1]]), new Set([defenderB, accepted[0]])]
    for (const side of [0, 1] as const) pools[side] = pools[side].filter((id) => !leaving[side]!.has(id))
    if (stageIndex !== last) continue
    const refused = [0, 1].map((side) => stage.attackers![side]!.find((id) => id !== accepted[1 - side])!)
    games.push([refused[0]!, refused[1]!])
    if (pools[0].length === 2) games.push([pools[0].find((id) => id !== refused[0])!, pools[1].find((id) => id !== refused[1])!])
    pools[0] = []
    pools[1] = []
  }
  const index = revealed.length
  return {
    step: games.length === size ? null : { index, kind: SQUAD_STEPS[index % SQUAD_STEPS.length]! },
    pools,
    stages,
    games,
  }
}

/** Why one team's choice cannot be their next pick, or null when it can. */
export function squadPickRefusal(state: SquadPairingState, side: 0 | 1, pick: readonly string[]): 'paired' | 'not-available' | null {
  if (!state.step) return 'paired'
  const stage = state.stages[Math.floor(state.step.index / SQUAD_STEPS.length)]
  const pool = state.pools[side]
  const choices =
    state.step.kind === 'defender'
      ? { count: 1, from: pool }
      : state.step.kind === 'attackers'
        ? { count: 2, from: pool.filter((id) => id !== stage!.defenders![side]) }
        : { count: 1, from: stage!.attackers![1 - side]! }
  const valid = pick.length === choices.count && new Set(pick).size === pick.length && pick.every((id) => choices.from.includes(id))
  return valid ? null : 'not-available'
}

/** A team match's result from its games, each scored as the first team's player against the second's. */
export function squadMatch(
  games: readonly { outcome: 'a' | 'b' | 'draw' | null; vp: Pair<number> }[],
  size: number,
  scoring: SquadScoring,
): { outcome: 'a' | 'b' | 'draw' | null; score: [number, number] } {
  const score: [number, number] = [0, 0]
  for (const game of games)
    for (const side of [0, 1] as const)
      score[side] += scoring === 'points' ? game.vp[side] : game.outcome === 'draw' ? 0.5 : game.outcome === 'ab'[side] ? 1 : 0
  if (games.length < size || games.some((game) => game.outcome === null)) return { outcome: null, score }
  return { outcome: score[0] > score[1] ? 'a' : score[1] > score[0] ? 'b' : 'draw', score }
}

type SquadPick = { round: number; table: number; squadId: string; step: number; userIds: readonly string[] }

/** What a meeting's two teams have revealed, step by step in the meeting's order: each step once both teams chose it. */
export function revealedSquadPicks(match: { round: number; table: number; aId: string; bId: string | null }, picks: readonly SquadPick[]) {
  const at = (squadId: string | null, step: number) =>
    picks.find((pick) => pick.round === match.round && pick.table === match.table && pick.squadId === squadId && pick.step === step)
      ?.userIds
  const revealed: Pair<readonly string[]>[] = []
  for (let a = at(match.aId, 0), b = at(match.bId, 0); a && b; a = at(match.aId, revealed.length), b = at(match.bId, revealed.length))
    revealed.push([a, b])
  return { revealed, chosen: (squadId: string | null) => at(squadId, revealed.length) ?? null }
}

/**
 * Each team meeting as a Swiss result, scored from the games at its tables: a meeting's games sit at the `size` tables
 * after the ones of the meetings before it. A meeting's score stands in for victory points, so ties break on it.
 */
export function squadSwissMatches(
  matches: readonly { round: number; table: number; aId: string; bId: string | null }[],
  games: readonly { round: number; table: number; outcome: 'a' | 'b' | 'draw' | null; vp: Pair<number> }[],
  size: number,
  scoring: SquadScoring,
): SwissMatch[] {
  return matches.map((match) => {
    if (!match.bId) return { round: match.round, a: match.aId, b: null, outcome: null, vp: [0, 0] }
    const first = (match.table - 1) * size
    const { outcome, score } = squadMatch(
      games.filter((game) => game.round === match.round && game.table > first && game.table <= first + size),
      size,
      scoring,
    )
    return { round: match.round, a: match.aId, b: match.bId, outcome, vp: score }
  })
}
