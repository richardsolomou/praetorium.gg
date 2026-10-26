import { opposingSide, refuse } from '../core/battlePrimitives'
import {
  type BattleState,
  type Command,
  type PlayerId,
  type PlayerState,
  type Secondary,
  type Refusal,
  reduceBattle,
  commandArmy,
  commandRefusal,
  sideDisposition,
  sideCaptain,
  scoringTarget,
  pointsRound,
  FIXED_SECONDARIES,
  isKotcLimit,
} from '../core/battle'
import { KOTC_MATCHUP_ID } from '../contracts/terrain'
import { terrainMatchupIds } from '../contracts/terrainReference'
import type { MissionAward } from '../core/scoring'
import type { MissionSelectionKind } from '../core/missionSelections'
import { type LoadedRules, type BattleMissionRules, type BattleReadRules, missionFor } from './rules'

export function withAuthoritativeAwards<
  T extends Pick<Extract<Command, { kind: 'set-prep' }>, 'primary' | 'secondaries' | 'secondaryDeck'>,
>(prep: T, rules: LoadedRules, frozen?: PlayerState): T {
  const primaryByKey = new Map((rules.primaries ?? []).map((card) => [card.key, card]))
  const secondaryByKey = new Map((rules.secondaries ?? []).map((card) => [card.key, card]))
  const existing = frozen
    ? [...(frozen.primaryCard ? [frozen.primaryCard] : []), ...frozen.secondaries, ...(frozen.secondaryDeck ?? [])]
    : null
  const card = (submitted: Secondary, available: Map<string, AvailableCard>) => {
    const authoritative = authoritativeCard(submitted, available)
    return existing ? { ...authoritative, selection: existing.find((saved) => saved.key === submitted.key)?.selection } : authoritative
  }
  return {
    ...prep,
    primary: prep.primary ? card(prep.primary, primaryByKey) : null,
    secondaries: prep.secondaries.map((secondary) => card(secondary, secondaryByKey)),
    secondaryDeck: prep.secondaryDeck?.map((secondary) => card(secondary, secondaryByKey)),
  }
}

type AvailableCard = { key: string; name: string; awards: MissionAward[]; selection?: MissionSelectionKind }

function authoritativeCard(submitted: Secondary, available: Map<string, AvailableCard>): Secondary {
  const authoritative = available.get(submitted.key)
  return authoritative
    ? { key: authoritative.key, name: authoritative.name, awards: authoritative.awards, selection: authoritative.selection }
    : { key: submitted.key, name: submitted.name }
}

export function hydrateAuthoritativeAwards(state: BattleState, rules: BattleReadRules) {
  const primaryByKey = new Map((rules.primaries ?? []).map((card) => [card.key, card]))
  const secondaryByKey = new Map((rules.secondaries ?? []).map((card) => [card.key, card]))
  const hydrate = (card: Secondary, available: Map<string, AvailableCard>) =>
    card.awards === undefined ? { ...authoritativeCard(card, available), selection: card.selection } : card
  for (const player of state.players) {
    if (player.primaryCard) {
      const mission = state.status === 'setup' ? null : resolvedMissionForSide(state, rules, player.side)
      const primary = mission ? primaryByKey.get(mission.id) : null
      player.primaryCard = mission
        ? {
            key: mission.id,
            name: mission.name,
            awards: player.primaryCard.awards ?? primary?.awards,
            selection: player.primaryCard.selection,
          }
        : hydrate(player.primaryCard, primaryByKey)
    }
    player.secondaries = player.secondaries.map((secondary) => hydrate(secondary, secondaryByKey))
    player.secondaryDeck = player.secondaryDeck?.map((secondary) => hydrate(secondary, secondaryByKey)) ?? null
  }
}

export function resolvedMissionForSide(state: BattleState, rules: BattleMissionRules, side: number) {
  if (state.settings.manual) return null
  const ownDisposition = sideDisposition(state, side)
  const opponent = opposingSide(state, side)
  const opposingDisposition = opponent === undefined ? null : sideDisposition(state, opponent)
  return missionFor(rules, ownDisposition, opposingDisposition, state.settings.missionPackId)
}

export function setupReferenceError(state: ReturnType<typeof reduceBattle>, rules: LoadedRules): Refusal | null {
  if (state.settings.manual) return null
  // A matchup is between the two sides, so it is read off each side's captain. Taking
  // the first two seats instead held while side 0 was always one player, and put a 2v1
  // whose pair opened the battle into a matchup between its own allies.
  const [one, two] = [...new Set(state.players.map((player) => player.side))]
    .toSorted((left, right) => left - right)
    .map((side) => sideDisposition(state, side))
  const missions = [
    missionFor(rules, one ?? null, two ?? null, state.settings.missionPackId),
    missionFor(rules, two ?? null, one ?? null, state.settings.missionPackId),
  ]
  if (one && two && state.settings.missionPackId && missions.some((mission) => !mission)) {
    return refuse('matchup-not-in-pack', 'the selected mission pack does not contain this matchup')
  }
  const sides = [...new Set(state.players.map((player) => player.side))].toSorted((left, right) => left - right)
  const primaries = rules.primaries ?? []
  const expectedSecondaries = new Set((rules.secondaries ?? []).map((card) => card.key))
  const fixedSecondaries = new Set(
    (rules.secondaries ?? []).filter((card) => card.awards.some((award) => award.mode === 'fixed')).map((card) => card.key),
  )
  const prepared = missions.every((mission, index) => {
    if (!mission) return true
    if (!primaries.some((card) => card.key === mission.id) || expectedSecondaries.size === 0) return true
    const player = sideCaptain(state, sides[index]!)
    if (player.primaryCard?.key !== mission.id) return false
    if (player.secondaryMode === 'fixed') {
      return (
        player.secondaries.length === FIXED_SECONDARIES &&
        new Set(player.secondaries.map((card) => card.key)).size === FIXED_SECONDARIES &&
        player.secondaries.every((card) => fixedSecondaries.has(card.key)) &&
        completeDeck(player.secondaryDeck, expectedSecondaries)
      )
    }
    return completeDeck(player.secondaryDeck, expectedSecondaries)
  })
  if (!prepared) return refuse('mission-cards-unprepared', 'every side must prepare its mission cards')
  const deploymentId = state.deploymentId
  if (!deploymentId) return refuse('missing-deployment', 'choose a deployment')
  if (!rules.deployments.some((deployment) => deployment.id === deploymentId))
    return refuse('unknown-deployment', 'that deployment is not available')
  const kotc = isKotcLimit(state.settings.limit)
  if (!kotc && missions.some((mission) => mission?.deploymentIds.length && !mission.deploymentIds.includes(deploymentId)))
    return refuse('deployment-mismatch', 'that deployment does not match the mission')
  if (!state.settings.terrainLayoutId) return kotc ? refuse('missing-terrain', 'choose the Colosseum battlefield') : null
  const terrain = rules.terrainLayouts.find((layout) => layout.id === state.settings.terrainLayoutId)
  if (!terrain) return refuse('unknown-terrain', 'that terrain layout is not available')
  const matchups = new Set(kotc ? [KOTC_MATCHUP_ID] : one && two ? terrainMatchupIds([one, two]) : [])
  if (matchups.size && !matchups.has(terrain.matchupId)) return refuse('terrain-mismatch', 'that terrain layout does not match the armies')
  if (terrain.deploymentId && terrain.deploymentId !== state.deploymentId)
    return refuse('terrain-mismatch', 'that terrain layout does not match the deployment')
  if (!terrain.geometry) return refuse('terrain-geometry-missing', 'exact terrain data is not available yet')
  return null
}

function completeDeck(cards: { key: string }[] | null | undefined, expected: Set<string>): boolean {
  return cards?.length === expected.size && cards.every((card) => expected.has(card.key))
}

export function repairPrepReferenceError(
  state: ReturnType<typeof reduceBattle>,
  by: PlayerId,
  command: Extract<Command, { kind: 'set-prep' }>,
  rules: LoadedRules,
): Refusal | null {
  const player = commandArmy(state, by, command)
  if (!player) return null
  const ownDisposition = sideDisposition(state, player.side)
  const opponent = opposingSide(state, player.side)
  const opposingDisposition = opponent === undefined ? null : sideDisposition(state, opponent)
  const mission = missionFor(rules, ownDisposition, opposingDisposition, state.settings.missionPackId)
  const expectedSecondaries = new Set((rules.secondaries ?? []).map((card) => card.key))
  const primaryExists = (rules.primaries ?? []).some((card) => card.key === mission?.id)
  if (
    !mission ||
    !primaryExists ||
    command.primary?.key !== mission.id ||
    !expectedSecondaries.size ||
    !completeDeck(command.secondaryDeck, expectedSecondaries)
  ) {
    return refuse('mission-cards-mismatch', 'those mission cards do not match this battle')
  }
  return null
}

/**
 * The matched-play ceilings, refused rather than only shown as guidance.
 *
 * Only a score that raises the total is checked: a correction reducing one, or one
 * made without a resolvable mission, is never guessed at and always allowed through.
 */
export function scoringCapError(
  state: ReturnType<typeof reduceBattle>,
  by: PlayerId,
  command: Extract<Command, { kind: 'score' } | { kind: 'score-secondary' } | { kind: 'score-settlement' }>,
  rules: Pick<LoadedRules, 'missions' | 'fixedSecondaryCaps'>,
): Refusal | null {
  const target = scoringTarget(state, by, command)
  if (!target || state.settings.manual) return null
  if (command.kind === 'score-settlement' && command.scores.some((score) => score.category === 'primary' && score.final)) {
    const invalid = commandRefusal(state, by, command)
    if (invalid) return invalid
  }
  const deltas =
    command.kind === 'score-settlement'
      ? {
          primary: command.scores.filter((score) => score.category === 'primary').reduce((sum, score) => sum + score.delta, 0),
          secondary: command.scores.filter((score) => score.category === 'secondary').reduce((sum, score) => sum + score.delta, 0),
        }
      : {
          primary: command.kind === 'score' && command.category === 'primary' ? command.delta : 0,
          secondary:
            command.kind === 'score' && command.category === 'secondary'
              ? command.delta
              : command.kind === 'score-secondary'
                ? command.delta
                : 0,
        }
  const mission = resolvedMissionForSide(state, rules, target.side)
  if (!mission) return null
  // The round the points land in, which for a settlement of a turn already ended is
  // the round that turn was in rather than the one now being played.
  const round = command.kind === 'score-settlement' ? pointsRound(state, command) : state.round
  const named = round === state.round ? 'this round’s' : `battle round ${round}’s`
  // A fixed card carries a ceiling of its own for the whole battle, which the per-round
  // and per-battle secondary caps do not cover: a card paying per model destroyed would
  // otherwise bank as much as the battle's whole allowance on its own.
  const cardCap = mission.fixedSecondaryCap
  if (target.secondaryMode === 'fixed' && cardCap) {
    const byCard =
      command.kind === 'score-settlement'
        ? command.scores.flatMap((score) => (score.category === 'secondary' && score.delta > 0 ? [[score.key, score.delta] as const] : []))
        : command.kind === 'score-secondary' && command.delta > 0
          ? [[command.key, command.delta] as const]
          : []
    for (const [key, delta] of byCard) {
      if ((target.scored[key] ?? 0) + delta > cardCap)
        return refuse('score-cap-card', `that would score past the ${cardCap} VP cap for one fixed secondary mission`)
    }
  }
  for (const category of ['primary', 'secondary'] as const) {
    const delta = deltas[category]
    if (delta <= 0) continue
    const roundCap = category === 'primary' ? mission.roundCap : mission.secondaryRoundCap
    const gameCap = category === 'primary' ? mission.gameCap : mission.secondaryGameCap
    const roundSoFar =
      ((category === 'primary' ? target.primaryByRound : target.secondaryByRound)[round - 1] ?? 0) -
      (category === 'primary' && round === state.round ? target.finalPrimary : 0)
    const finalDelta =
      command.kind === 'score-settlement' && category === 'primary'
        ? command.scores.reduce((sum, score) => sum + (score.category === 'primary' ? (score.final?.delta ?? 0) : 0), 0)
        : 0
    const gameSoFar = category === 'primary' ? target.primary : target.secondary
    const label = category === 'primary' ? 'primary mission' : 'secondary missions'
    if (roundCap !== null && roundSoFar + delta - finalDelta > roundCap)
      return refuse('score-cap-round', `that would score past ${named} ${roundCap} VP cap for ${label}`)
    if (gameCap !== null && gameSoFar + delta > gameCap)
      return refuse('score-cap-battle', `that would score past the battle’s ${gameCap} VP cap for ${label}`)
  }
  return null
}
