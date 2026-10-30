import { type BattleState, builtDetachments, type LoggedCommand, sideCaptain, sidePaintedPoints } from '../core/battle'
import { resolvedMissionForSide } from './battleRules'
import type { BattleMissionRules } from './rules'
import type { StandingFaction } from '../core/standings'

export type BattleFaction = {
  id: string
  slug: string
  displayName: string
  icon: string | null
  edition?: StandingFaction['edition']
  detachments?: readonly { name: string; referenceRoute?: { catalogueId: string; slug: string } | null }[]
}

/** The catalogue army a built list came from, as `factionsById` names it. */
export function builtFaction(
  built: Pick<NonNullable<NonNullable<BattleState['players'][number]['roster']>['built']>, 'catalogueId' | 'edition'> | undefined,
  factionsById: ReadonlyMap<string, BattleFaction>,
): StandingFaction | null {
  const faction = built?.catalogueId ? factionsById.get(built.catalogueId) : undefined
  return faction ? { slug: faction.slug, displayName: faction.displayName, icon: faction.icon, edition: built?.edition ?? null } : null
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
    factions: state.players.map((player) => builtFaction(player.roster?.built, factionsById)),
    detachments: state.players.map((player) => builtDetachments(player.roster?.built).map((detachment) => detachment.name)),
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
    mission: rules ? resolvedMissionForSide(state, rules, viewerSide) : null,
    deploymentId: state.deploymentId,
    settings: state.settings,
    result: state.result,
    lastActivity: log.at(-1)?.at ?? battle.createdAt,
  }
}
