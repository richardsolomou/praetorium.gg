import { z } from 'zod'
import {
  facetActive,
  facetMatches,
  facetSchema,
  periodBounds,
  periodFields,
  withinPeriod,
  type Facet,
  type PeriodFilter,
} from './listFilter'
import { isGuestSeat } from './newBattle'
import { battleOutcome, type StandingBattle } from './standings'
import { matchesSearch } from './text'

export const BATTLE_TYPES = ['practice', 'guest', 'team', 'manual', 'organised'] as const
const battleFacets = {
  status: facetSchema,
  result: facetSchema,
  ending: facetSchema,
  faction: facetSchema,
  against: facetSchema,
  detachment: facetSchema,
  againstDetachment: facetSchema,
  player: facetSchema,
  size: facetSchema,
  pack: facetSchema,
  deployment: facetSchema,
  type: facetSchema,
}
export type BattleFacet = keyof typeof battleFacets
export const BATTLE_FILTER_FACETS = Object.keys(battleFacets) as BattleFacet[]

export const BATTLE_SEARCH_MAX_LENGTH = 80

export const battleFilterSchema = z.strictObject({
  q: z.string().trim().min(1).max(BATTLE_SEARCH_MAX_LENGTH).optional(),
  ...battleFacets,
  ...periodFields,
})

/** The one order besides a feed's default of newest first. */
export const BATTLE_ORDERS = ['oldest'] as const
export type BattleOrder = (typeof BATTLE_ORDERS)[number]

export type BattleFilter = PeriodFilter & { q?: string } & Partial<Record<BattleFacet, Facet>>

export const battleFilterActive = (filter: BattleFilter | undefined): filter is BattleFilter =>
  Boolean(filter && (filter.q || filter.period || filter.from || filter.to || BATTLE_FILTER_FACETS.some((key) => facetActive(filter[key]))))

type FilterableBattle = Omit<StandingBattle, 'playerDetails' | 'result'> & {
  result: { reason: string; concededBy: string | null } | null
  armies: readonly (string | null)[]
  detachments: readonly (readonly string[])[]
  playerDetails?: readonly { id: string; name: string; automated: boolean }[]
  mission: { name: string } | null
  deploymentId: string | null
  settings: { limit: number | null; missionPackId: string | null; manual?: boolean }
  organised?: boolean
}

function battleTypes(battle: FilterableBattle) {
  return [
    ...(battle.playerDetails?.some((player) => player.automated && !isGuestSeat(player.id)) ? ['practice'] : []),
    ...(battle.playerIds.some(isGuestSeat) ? ['guest'] : []),
    ...(battle.playerIds.length > 2 ? ['team'] : []),
    ...(battle.settings.manual ? ['manual'] : []),
    ...(battle.organised ? ['organised'] : []),
  ]
}

/** Armies are matched per side, the viewer's own when they sit in the battle, so Orks against Necrons never matches two Orks allies facing Tau. */
function matchupFits(battle: FilterableBattle, filter: BattleFilter, seat: number) {
  const sides = seat === -1 ? [...new Set(battle.sides)] : [battle.sides[seat]!]
  const seats = (fits: (side: number) => boolean) => battle.sides.flatMap((side, at) => (fits(side) ? [at] : []))
  const factions = (at: readonly number[]) => at.flatMap((index) => battle.factions?.[index]?.slug ?? [])
  const detachments = (at: readonly number[]) => at.flatMap((index) => battle.detachments[index] ?? [])
  return sides.some((side) => {
    const ours = seats((other) => other === side)
    const theirs = seats((other) => other !== side)
    return (
      facetMatches(filter.faction, factions(ours)) &&
      facetMatches(filter.detachment, detachments(ours)) &&
      facetMatches(filter.against, factions(theirs)) &&
      facetMatches(filter.againstDetachment, detachments(theirs))
    )
  })
}

/** Every battle list and its offline fallback answer through this, so a filter means the same online and off. */
export function matchesBattle(
  battle: FilterableBattle,
  filter: BattleFilter,
  viewerId: string | null | undefined,
  at: number,
  now: number,
) {
  const seat = viewerId ? battle.playerIds.indexOf(viewerId) : -1
  const outcome = seat !== -1 && battle.status === 'finished' ? [battleOutcome(battle, battle.sides[seat]!)] : []
  return (
    withinPeriod(at, periodBounds(filter, now)) &&
    facetMatches(filter.status, [battle.status]) &&
    facetMatches(filter.result, outcome) &&
    facetMatches(filter.ending, battle.result ? [battle.result.reason] : []) &&
    facetMatches(filter.player, battle.playerIds) &&
    facetMatches(filter.size, battle.settings.limit === null ? [] : [String(battle.settings.limit)]) &&
    facetMatches(filter.pack, battle.settings.missionPackId ? [battle.settings.missionPackId] : []) &&
    facetMatches(filter.deployment, battle.deploymentId ? [battle.deploymentId] : []) &&
    facetMatches(filter.type, battleTypes(battle)) &&
    matchupFits(battle, filter, seat) &&
    (!filter.q ||
      matchesSearch(
        [
          ...battle.players,
          ...battle.armies.flatMap((army) => army ?? []),
          ...(battle.factions ?? []).flatMap((faction) => faction?.displayName ?? []),
          ...battle.detachments.flat(),
          battle.mission?.name ?? '',
        ].join(' '),
        filter.q,
      ))
  )
}
