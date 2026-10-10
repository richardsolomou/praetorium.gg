import { type BattleState, type LoggedCommand, sideDisposition, sideCaptain, sidePaintedPoints } from '../core/battle'
import { type BattleMissionRules, missionFor } from './rules'

export type BattleFaction = {
  id: string
  slug: string
  displayName: string
  icon: string | null
  detachments?: readonly { name: string; referenceRoute?: { catalogueId: string; slug: string } | null }[]
}

export function battleSummary(
  {
    battle,
    players,
    log,
  }: {
    battle: { token: string; createdAt: number }
    players: { id: string; name: string; image?: string | null; automated: boolean }[]
    log: LoggedCommand[]
  },
  state: BattleState,
  viewerId: string | null,
  rules: BattleMissionRules | null | undefined,
  factionsById: ReadonlyMap<string, BattleFaction>,
) {
  const viewerSide = state.players.find((player) => player.id === viewerId)?.side ?? 0
  const opposingSide = state.players.find((player) => player.side !== viewerSide)?.side
  const ownDisposition = sideDisposition(state, viewerSide)
  const opposingDisposition = opposingSide === undefined ? null : sideDisposition(state, opposingSide)
  return {
    token: battle.token,
    createdAt: battle.createdAt,
    status: state.status,
    round: state.round,
    phase: state.phase,
    players: players.map((player) => player.name),
    playerDetails: players.map(({ id, name, image, automated }) => ({ id, name, image: image ?? null, automated })),
    playerIds: players.map((player) => player.id),
    sides: state.players.map((player) => player.side),
    armies: state.players.map((player) => player.roster?.name ?? null),
    // The catalogue army each seat brought, so a battle can also be counted as a
    // result for the faction that fielded it. A pasted list has none.
    factions: state.players.map((player) => {
      const faction = player.roster?.built?.catalogueId ? factionsById.get(player.roster.built.catalogueId) : undefined
      return faction ? { slug: faction.slug, displayName: faction.displayName, icon: faction.icon } : null
    }),
    detachments: state.players.map(
      (player) =>
        player.roster?.built?.detachments?.map((detachment) => detachment.name) ??
        (player.roster?.built?.detachment ? [player.roster.built.detachment] : []),
    ),
    // Who took the first turn, and the two halves each seat's score is made of,
    // so a player's record can separate going first from going second and say
    // where their points came from. `scores` only carries the total.
    firstPlayerId: state.firstPlayerId,
    primaries: state.players.map((player) => player.primary),
    secondaries: state.players.map((player) => player.secondary),
    // The painted bonus is paid when the battle begins, and it is the side's one
    // bonus, the same as everywhere else. Onto the seat that already carries the
    // side's score, because that is the seat every reader of this list picks out to
    // ask what a side is on.
    scores: state.players.map(
      (player) =>
        player.primary +
        player.secondary +
        (state.status !== 'setup' && player.id === sideCaptain(state, player.side).id ? sidePaintedPoints(state, player.side) : 0),
    ),
    mission: rules ? missionFor(rules, ownDisposition, opposingDisposition, state.settings.missionPackId) : null,
    deploymentId: state.deploymentId,
    settings: state.settings,
    result: state.result,
    lastActivity: log.at(-1)?.at ?? battle.createdAt,
  }
}
