import { type BattleState, builtDetachments } from '../core/battle'
import type { BattleDigest } from '../core/battleDigest'
import { matchupMission } from './battleRules'
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

/** What every list shows of a battle, built from its digest so a list never replays a log. */
export function battleSummary(
  {
    battle,
    players,
  }: {
    battle: { token: string; createdAt: number }
    players: { id: string; name: string; image?: string | null; automated: boolean }[]
  },
  digest: BattleDigest,
  viewerId: string | null,
  rules: BattleMissionRules | null | undefined,
  factionsById: ReadonlyMap<string, BattleFaction>,
) {
  const viewerSeat = digest.seats.find((seat) => seat.id === viewerId) ?? digest.seats.find((seat) => seat.side === 0)
  return {
    token: battle.token,
    createdAt: battle.createdAt,
    status: digest.status,
    round: digest.round,
    phase: digest.phase,
    players: players.map((player) => player.name),
    playerDetails: players.map(({ id, name, image, automated }) => ({ id, name, image: image ?? null, automated })),
    playerIds: players.map((player) => player.id),
    sides: digest.seats.map((seat) => seat.side),
    armies: digest.seats.map((seat) => seat.army),
    // The catalogue army each seat brought, so a battle can also be counted as a
    // result for the faction that fielded it. A pasted list has none.
    factions: digest.seats.map((seat) => builtFaction(seat.built ?? undefined, factionsById)),
    detachments: digest.seats.map((seat) => builtDetachments(seat.built ?? undefined).map((detachment) => detachment.name)),
    // Who took the first turn, and the two halves each seat's score is made of,
    // so a player's record can separate going first from going second and say
    // where their points came from. `scores` only carries the total.
    firstPlayerId: digest.firstPlayerId,
    primaries: digest.seats.map((seat) => seat.primary),
    secondaries: digest.seats.map((seat) => seat.secondary),
    scores: digest.seats.map((seat) => seat.score),
    mission: rules && viewerSeat ? matchupMission(rules, digest.settings, viewerSeat.matchup) : null,
    deploymentId: digest.deploymentId,
    settings: digest.settings,
    // Whether it counts for a group or tournament, without naming one a private group keeps to its players.
    organised: digest.groupId !== null || digest.eventToken !== null || digest.sealedEventToken !== null,
    result: digest.result,
    lastActivity: digest.lastCommandAt ?? battle.createdAt,
    // The same version `BattleWorkspace.serverSeq` names, so a device knows whether its saved copy is current.
    serverSeq: digest.lastSeq,
  }
}
