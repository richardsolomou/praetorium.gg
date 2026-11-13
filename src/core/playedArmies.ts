import { builtDetachments, type Roster } from './battle'
import type { BattleDigest } from './battleDigest'
import { currentCatalogueFamilyId } from './retiredCatalogueIds'
import { facetActive, facetMatches, periodBounds, withinPeriod } from './listFilter'
import type { PlayedArmyFilter } from './rosterDiscovery'
import { matchesSearch } from './text'
import { battleOutcome, type BattleOutcome, opponentScore, sideScore, type StandingBattle, type StandingFaction } from './standings'

type Built = NonNullable<Roster['built']>

/** One army a finished battle fielded, as discovery lists it: who played it, when, and under which rules. */
export type PlayedArmy = {
  battle: string
  player: { id: string; name: string; colour?: string | null }
  name: string
  catalogueId: string
  edition: Built['edition'] | null
  detachmentIds: string[]
  detachments: string[]
  disposition: string | null
  limit: number
  pointsBudget: number | null
  waivedRules: NonNullable<Built['waivedRules']>
  /** What a copy would be saved under today, which discovery filters by. */
  copied: { catalogueId: string; detachmentIds: string[] }
  /** The faction families it played against, whichever rules version each fielded, which the Against filter reads. */
  against: string[]
  unitCount: number
  playedAt: number
  outcome: PlayedOutcome
}

/** How the battle went for the side an army stood on, as standings count it. */
type PlayedOutcome = {
  result: BattleOutcome
  conceded: boolean
  score: number
  /** The best total among the opposing sides. */
  opponentScore: number
  opponents: StandingFaction[]
}

/**
 * The catalogue armies a finished battle fielded, one per seat that brought one.
 *
 * A pasted list names no catalogue army and a practice opponent is nobody's, so neither is listed.
 * Who may read the battle is the caller's question: this reads only what was fielded.
 */
export function playedArmies(
  history: { battle: { token: string; createdAt: number }; players: readonly { id: string; name: string; colour?: string | null }[] },
  digest: Pick<BattleDigest, 'status' | 'lastCommandAt' | 'seats'>,
  summary: StandingBattle,
): PlayedArmy[] {
  if (digest.status !== 'finished') return []
  const seated = new Map(history.players.map((player) => [player.id, player]))
  const playedAt = digest.lastCommandAt ?? history.battle.createdAt
  return digest.seats.flatMap((seat) => {
    const { built } = seat
    const player = seated.get(seat.id)
    if (seat.automated || !built || !seat.copied || !seat.unitCount || player === undefined) return []
    return [
      {
        battle: history.battle.token,
        player: { id: seat.id, name: player.name, colour: player.colour ?? null },
        name: seat.army!,
        catalogueId: built.catalogueId,
        edition: built.edition ?? null,
        detachmentIds: built.detachmentIds ?? [],
        detachments: builtDetachments(built).map((detachment) => detachment.name),
        disposition: built.disposition,
        limit: built.limit,
        pointsBudget: built.pointsBudget ?? null,
        waivedRules: built.waivedRules ?? [],
        copied: seat.copied,
        against: [
          ...new Set(
            digest.seats.flatMap((other) =>
              other.side !== seat.side && other.copied ? [currentCatalogueFamilyId(other.copied.catalogueId)] : [],
            ),
          ),
        ],
        unitCount: seat.unitCount,
        playedAt,
        outcome: outcome(summary, seat.side),
      },
    ]
  })
}

function outcome(battle: StandingBattle, side: number): PlayedOutcome {
  const opponents = new Map<string, StandingFaction>()
  battle.sides.forEach((seated, seat) => {
    const faction = battle.factions[seat]
    if (seated !== side && faction) opponents.set(faction.slug, faction)
  })
  return {
    result: battleOutcome(battle, side),
    conceded: Boolean(battle.result?.concededBy),
    score: sideScore(battle, side),
    opponentScore: opponentScore(battle, side),
    opponents: [...opponents.values()],
  }
}

const PLAYED_FACETS = ['faction', 'detachment', 'rules', 'size', 'disposition', 'result', 'against', 'legality', 'points'] as const

export const playedArmyFilterActive = (filter: PlayedArmyFilter) =>
  Boolean(filter.q || filter.period || filter.from || filter.to || PLAYED_FACETS.some((key) => facetActive(filter[key])))

/** The parts of a played-army filter that are not about its catalogue, which `inDiscoveryScope` answers. */
export function matchesPlayedArmy(army: PlayedArmy, filter: PlayedArmyFilter, now: number) {
  return (
    withinPeriod(army.playedAt, periodBounds(filter, now)) &&
    facetMatches(filter.size, [String(army.limit)]) &&
    facetMatches(filter.disposition, army.disposition ? [army.disposition] : []) &&
    facetMatches(filter.result, [army.outcome.result]) &&
    facetMatches(filter.against, army.against) &&
    (!filter.q || matchesSearch([army.name, army.player.name, ...army.detachments].join(' '), filter.q))
  )
}
