import { byId, countBy } from '../../core/collections'
import type { BattleFilter, BattleOrder } from '../../core/battleFilter'
import type { BattleDigest } from '../../core/battleDigest'
import {
  filterBattles,
  personalPerformance,
  type RecordFilter,
  recordFacets,
  type SeatPlay,
  seatPlays,
  serviceRecord,
} from '../../core/serviceRecord'
import { routeSlug } from '../../core/slug'
import { archivedArmies } from '../../core/archivedArmies'
import { currentCatalogueFamilyId } from '../../core/retiredCatalogueIds'
import type { BattlesCursor } from '../../contracts/battles'
import { battleSummary, type BattleFaction } from '../../shared/battleSummary'
import { matchupMission } from '../../shared/battleRules'
import { gameReferencesFor } from '../../shared/gameReferences'
import type { BattleMissionRules, BattleReadRules } from '../rules'
import type { BattleCard, RepositoryPort } from '../spacetimeRepository'
import type { BattleFeedService } from './battleFeedService'

/** How many of a player's battles a profile folds, how many it lists, and its lists. */
const PROFILE_BATTLE_LIMIT = 200
const PROFILE_BATTLE_PAGE = 25

export class ProfileService {
  constructor(
    private readonly repository: RepositoryPort,
    private readonly battleFeedService: BattleFeedService,
  ) {}

  /** Fold the record over the full bounded watchable set, while paginating only the battle list; practice games stay in history but not the record. */
  async playerProfile(
    userId: string,
    viewerId: string | null,
    filter: RecordFilter = {},
    rules?: BattleReadRules | null,
    factions: readonly BattleFaction[] = [],
  ) {
    const [seated, practice] = await Promise.all([
      this.repository.battlesSeatedBy(userId, PROFILE_BATTLE_LIMIT, viewerId),
      this.repository.practiceOpponents(),
    ])
    const practised = new Set(practice.map((opponent) => opponent.id))
    const summaries = this.recordBattles(
      seated.filter((history) => !history.players.some((player) => practised.has(player.id))),
      viewerId,
      rules,
      factions,
    )
    // The facets are what the player has played, not what is left after narrowing —
    // a control that empties itself as soon as it is used cannot be used twice.
    const facets = recordFacets(summaries, userId)
    const shown = filterBattles(summaries, userId, filter)
    return {
      record: serviceRecord(summaries, userId, filter),
      performance: personalPerformance(summaries, userId, filter),
      facets,
      // What each side did is the record's to count, not the battle list's to carry.
      battles: await this.battleFeedService.withRatingChanges(
        shown.slice(0, PROFILE_BATTLE_PAGE).map(({ plays: _plays, ...battle }) => battle),
      ),
      played: shown.length,
    }
  }

  /** One page of the battles a profile lists, read from the player's seat, without the practice games its record leaves out. */
  async playerBattles(
    userId: string,
    viewerId: string | null,
    page: { before?: BattlesCursor; filter?: BattleFilter; order?: BattleOrder },
    rules?: BattleMissionRules | null,
    factions: readonly BattleFaction[] = [],
  ) {
    const practised = new Set((await this.repository.practiceOpponents()).map((opponent) => opponent.id))
    const found = await this.battleFeedService.filteredFeed(
      async (read) => {
        const { battles, nextCursor } = await this.repository.battlesInProfile(userId, viewerId, read)
        return { battles: battles.filter((history) => !history.players.some((player) => practised.has(player.id))), nextCursor }
      },
      page,
      viewerId,
      rules,
      factions,
      userId,
    )
    return { ...found, battles: await this.battleFeedService.withRatingChanges(found.battles) }
  }

  /** Datasheets in the player's own armies across their recent battles, with how many battles each appeared in, except armies they have archived. */
  async fieldedDatasheets(userId: string) {
    const [seated, rosters] = await Promise.all([
      this.repository.battlesSeatedBy(userId, PROFILE_BATTLE_LIMIT, userId),
      this.repository.rostersByUser(userId),
    ])
    const archived = archivedArmies(rosters)
    const uses = countBy(
      seated.flatMap((history) => {
        const seat = history.digest.seats.find((candidate) => candidate.id === userId)
        if (seat?.built && archived.has(currentCatalogueFamilyId(seat.built.catalogueId))) return []
        return seat?.fielded ?? []
      }),
      (entryId) => entryId,
    )
    return [...uses].map(([entryId, battles]) => ({ entryId, battles })).toSorted((a, b) => b.battles - a.battles)
  }

  /**
   * The battle list's summaries with what each side did with its resources, for a
   * record, both read from the one digest.
   */
  private recordBattles(
    histories: readonly BattleCard[],
    viewerId: string | null,
    rules: BattleReadRules | null | undefined,
    factions: readonly BattleFaction[],
  ) {
    const factionsById = byId(factions)
    return histories.map((history) => {
      return {
        ...battleSummary(history, history.digest, viewerId, rules, factionsById),
        plays: referencedPlays(history.digest, seatPlays(history.digest, viewerId), rules, factionsById),
      }
    })
  }

  /**
   * Someone's name and picture.
   *
   * Open to anybody, including a reader with no account. A name is already on
   * every battle and on every row of the leaderboard, so gating the page that
   * shows the same name behind a friendship only produced links that led
   * nowhere; who a player is was never a secret the product was keeping.
   */
  async userProfile(userId: string) {
    const [profile, sponsorship, admin] = await Promise.all([
      this.repository.profileByUserId(userId),
      this.repository.githubSponsorship(userId),
      this.repository.isAdmin(userId),
    ])
    // A private sponsorship stays private: only its owner's settings say it.
    return profile ? { ...profile, supporter: sponsorship === 'public', admin } : null
  }
}

/**
 * What each side played, joined to the reference page it is printed on.
 *
 * A link is attached only where the page answers: a detachment stratagem whose
 * detachment the fielding army's catalogue faction lists, a secondary the rules
 * carry in a pack they carry, and a primary whose matchup page resolves. The
 * primary is the one the battle screen shows, resolved from both sides'
 * dispositions, falling back to what `set-prep` recorded only where that fails.
 */
function referencedPlays(
  digest: BattleDigest,
  plays: SeatPlay[],
  rules: BattleReadRules | null | undefined,
  factionsById: ReadonlyMap<string, BattleFaction>,
): SeatPlay[] {
  const packId = digest.settings.missionPackId
  const packs = rules ? gameReferencesFor(rules).packs : []
  const pack = packs.find((candidate) => candidate.id === packId)
  const cardSlugs = new Map(pack && rules ? gameReferencesFor(rules).secondaries.map((card) => [card.key, card.slug]) : [])
  return plays.map((play, index) => {
    const seat = digest.seats[index]!
    const allies = digest.seats.filter((candidate) => candidate.side === seat.side)
    const printedBy = (detachment: string | undefined) => {
      if (!detachment) return undefined
      const faction = allies
        .map((ally) => factionsById.get(ally.built?.catalogueId ?? ''))
        .find((candidate) => candidate?.detachments?.some((listed) => listed.name === detachment))
      const route = faction?.detachments?.find((listed) => listed.name === detachment)?.referenceRoute
      return faction ? { catalogueId: route?.catalogueId ?? faction.slug, detachmentId: route?.slug ?? routeSlug(detachment) } : undefined
    }
    const { own: you, opposing: opponent } = seat.matchup
    const mission = play.primary && rules && digest.status !== 'setup' ? matchupMission(rules, digest.settings, seat.matchup) : null
    const matchup = pack?.missions.some(
      (candidate) => candidate.id === mission?.id && candidate.matchups.some((pair) => pair[0]?.id === you && pair[1]?.id === opponent),
    )
    return {
      ...play,
      stratagems: play.stratagems.map((use) => {
        const reference = printedBy(use.detachment)
        return reference ? { ...use, reference } : use
      }),
      cards: play.cards.map((card) => {
        const cardId = cardSlugs.get(card.key)
        return packId && cardId ? { ...card, reference: { packId, cardId } } : card
      }),
      primary: mission
        ? {
            key: mission.id,
            name: mission.name,
            ...(matchup && packId && you && opponent ? { reference: { packId, you, opponent } } : {}),
          }
        : play.primary,
    }
  })
}
