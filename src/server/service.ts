import { byId } from '../core/collections'
import {
  guestSeatId,
  isPracticeSeat,
  newBattleSeats,
  playedSeatName,
  type NewBattlePlayers,
  type CreateBattleInput,
} from '../core/newBattle'
import { type BattlebaseBattle, battlebaseBattleImport, battlebaseBattleSchema } from '../core/battlebaseBattle'
import { matchingSealedEventBattles } from '../shared/sealedEventBattleOptions'
import type { BattleFaction } from '../shared/battleSummary'
import { offlineIdentifier, offlineContext } from './offlineContext'
import {
  withAuthoritativeAwards,
  hydrateAuthoritativeAwards,
  resolvedMissionForSide,
  setupReferenceError,
  repairPrepReferenceError,
  scoringCapError,
} from '../shared/battleRules'
import { battleFoldArgs, restoreOpaqueBattleKeys, visibleBattleLog } from '../core/offlineBattle'
import type { BattleWorkspace } from '../contracts/battleWorkspace'
import { randomId, randomToken } from 'ras-stack/auth'
import type { AdminBattle } from '../admin'
import {
  battleCapacity,
  type BattleEndReason,
  type Command,
  commandArmy,
  reduceBattle,
  sameRandomDraw,
  type SubmitResult,
  openPlaces,
  pointsBudgetOf,
  pointsSpent,
} from '../core/battle'
import { type BattleView, battleView } from '../core/battleView'
import { battleReport, type ReportEntry } from '../core/battleReport'
import { battleClock, type BattleClock } from '../core/battleClock'
import { battleLogThroughSeq, battleTimeline, type ReplayPoint } from '../core/battleReplay'
import { compactReplayFrames } from '../core/replayFrames'
import type { WebPushSubscription } from '../core/notifications'
import { refuse } from '../core/battlePrimitives'
import { REPLAY_BATCH_SIZE } from '../contracts/battles'
import { type BattleMissionRules, type BattleReadRules, type LoadedRules } from './rules'
import type { Mission } from '../shared/rulesCards'
import { type Notifier, silentNotifier } from './pushNotifier'
import { SealedEventService } from './services/sealedEventService'
import { SealedEventResultsService } from './services/sealedEventResultsService'
import { GroupService } from './services/groupService'
import { GroupResultsService } from './services/groupResultsService'
import { RosterService } from './services/rosterService'
import { SocialService } from './services/socialService'
import { BattleFeedService } from './services/battleFeedService'
import { StandingsService } from './services/standingsService'
import { ProfileService } from './services/profileService'
import { PreferencesService } from './services/preferencesService'
import { foldHistory, mayWatch, mustFindBattle, isSeated } from './services/battleHistory'
import { StandingsRefresh } from './standingsRefresh'
import type { BattleCard, BattleHistory, RepositoryPort } from './spacetimeRepository'

/**
 * `mission` is the viewer's, for the screens that are about them. `missions` is every
 * side's, because a ceiling is enforced against the side being scored, either player
 * may record a settlement for the side the turn came back to, and a side nobody signs
 * in to has its cards settled by the table facing it.
 */
type SeatedScreen = {
  kind: 'battle'
  view: BattleView
  clock: BattleClock
  mission: Mission | null
  missions: { side: number; mission: Mission | null }[]
  timeline?: ReplayPoint[]
}
type SpectatorScreen = {
  kind: 'spectator'
  view: BattleView
  clock: BattleClock
  missions: { side: number; mission: Mission | null }[]
  report: ReturnType<typeof battleReport>
  timeline: ReplayPoint[]
}

/**
 * A link resolves to a seated screen, a spectator screen, or nothing.
 *
 * There is no fourth answer offering a seat. A battle names everyone in it at the
 * moment it is created, so no chair is ever standing empty for a link to fill.
 */
type BattleScreen = SeatedScreen | SpectatorScreen | { kind: 'unavailable' }

const SPECTATOR_ID = ''

/**
 * What a command answers: what happened to it, and what the battle now is.
 *
 * The screen comes back with the answer because the client's next command is
 * conditional on this one having landed. Left to learn that from the refetch a
 * round trip later, a page acts on a view it has already changed — sending a seq
 * from before its own command, or naming the wrong command to undo.
 */
type SubmitAnswer = {
  result: SubmitResult
  screen: SeatedScreen
  battleId: string
  applied?: boolean
  finished?: BattleEndReason
  /** Set when this command turned a draft into a battle for the first time: every place filled and every army chosen. */
  filled?: true
}
type SubmitArgs = [
  token: string,
  userId: string,
  expectedSeq: number,
  command: Command,
  rules?: LoadedRules | null,
  sync?: { operationId: string; fingerprint: string; recordedAt: number },
]

export class PraetoriumService {
  readonly sealedEventService: SealedEventService
  readonly sealedEventResultsService: SealedEventResultsService
  readonly groupService: GroupService
  readonly groupResultsService: GroupResultsService
  readonly rosterService: RosterService
  readonly socialService: SocialService
  readonly battleFeedService: BattleFeedService
  readonly standingsService: StandingsService
  readonly profileService: ProfileService
  readonly preferencesService: PreferencesService

  constructor(
    private readonly repository: RepositoryPort,
    private readonly clock: () => number,
    private readonly randomIndex: (limit: number) => number,
    private readonly notifier: Notifier = silentNotifier,
    battleFactions: () => Promise<readonly BattleFaction[]> = async () => [],
  ) {
    const standingsRefresh = new StandingsRefresh(repository, battleFactions)
    this.sealedEventService = new SealedEventService(repository, clock, notifier)
    this.groupService = new GroupService(repository, clock, notifier)
    this.rosterService = new RosterService(repository, clock)
    this.socialService = new SocialService(repository, clock, notifier)
    this.battleFeedService = new BattleFeedService(repository, clock, standingsRefresh)
    this.sealedEventResultsService = new SealedEventResultsService(
      repository,
      clock,
      notifier,
      this.sealedEventService,
      this.battleFeedService,
    )
    this.groupResultsService = new GroupResultsService(repository, clock, this.groupService, this.battleFeedService)
    this.standingsService = new StandingsService(repository, clock, battleFactions, standingsRefresh, this.sealedEventResultsService)
    this.profileService = new ProfileService(repository, this.battleFeedService)
    this.preferencesService = new PreferencesService(repository, clock)
  }

  userById(id: string) {
    return this.repository.userById(id)
  }

  registerWebPushSubscription(userId: string, subscription: WebPushSubscription) {
    return this.repository.registerWebPushSubscription({ userId, subscription, now: this.clock() })
  }

  async createBattle(userId: string, input?: string | CreateBattleInput) {
    const settings =
      typeof input === 'object' ? { ...input, limit: input.limit ?? null } : { limit: null, missionPackId: null, manual: false }
    const { allyIds, opponentIds, invited } = newBattleSeats(input)
    // One query for everyone named rather than one apiece, and both reads at once:
    // who exists and who may be invited are independent questions.
    const [known, invitable] = await Promise.all([this.repository.namesByIds(invited), this.socialService.opponents(userId)])
    if (new Set(invited).size !== invited.length || invited.some((id) => id === userId || !known.has(id))) {
      throw new Response('choose an opponent', { status: 400 })
    }
    const allowed = byId(invitable)
    // Joining a group is consent to play its members, so a group game needs no friendship; the product database checks membership again.
    const groupToken = typeof input === 'object' ? input.groupToken : undefined
    const { group = null, league = null } = (groupToken && (await this.groupService.groupWithLeague(groupToken, userId))) || {}
    if (groupToken) {
      const members = new Set(group?.members.filter((member) => member.status === 'accepted').map((member) => member.userId))
      if (!group || !members.has(userId) || invited.some((id) => !members.has(id)))
        throw new Response('a group game is played between its members', { status: 403 })
    } else if (invited.some((id) => !allowed.has(id))) throw new Response('battle players must be your friends', { status: 403 })
    // The product database checks the rest of a fixture: its two players, both still in the league, and its group.
    const fixtureKey = typeof input === 'object' ? input.fixture : undefined
    const fixture = fixtureKey ? league?.fixtures.find((candidate) => candidate.key === fixtureKey) : undefined
    if (fixtureKey && (!fixture || fixture.battleToken !== null || ![fixture.aId, fixture.bId].includes(userId)))
      throw new Response('this fixture is not yours to start, or has already started', { status: 409 })
    // How many chairs a battle has is `battleCapacity`'s to say, here as everywhere.
    if (invited.length >= battleCapacity({ teamBattle: true, playerCount: 4 }))
      throw new Response('a battle seats four players at most', { status: 400 })
    // A battle started alone is a draft, which `startDraft` makes; this path seats its whole table.
    if (!opponentIds.length) throw new Response('choose an opponent', { status: 400 })
    if (!group && invited.length && (typeof input !== 'object' || !input.casual)) {
      const sealedEventMatches = await this.sealedEventBattleOptions(userId, input)
      if (sealedEventMatches.length) {
        throw new Response('start this matchup from its event page, or confirm a casual battle', { status: 409 })
      }
    }
    const token = offlineIdentifier('battleToken', randomToken)
    const id = offlineIdentifier('battleId', randomId)
    await this.repository.createBattle({
      id,
      token,
      userId,
      allyIds,
      opponentIds,
      initialCommands: [
        {
          kind: 'configure-battle',
          limit: settings.limit,
          missionPackId: settings.manual ? null : settings.missionPackId,
          terrainLayoutId: null,
          twistId: null,
          teamBattle: invited.length >= 2,
          playerCount: (invited.length + 1) as 2 | 3 | 4,
          sizeFromSides: true,
          clockLimitMinutes: null,
          ...(settings.manual ? { manual: true } : {}),
        },
        ...(group ? [{ kind: 'set-battle-group' as const, groupId: group.id }] : []),
      ],
      now: offlineContext.getStore()?.createdAt ?? this.clock(),
      fixtureKey,
    })
    this.notifier.notify([{ kind: 'battle-created', actorId: userId, recipientIds: invited, battleToken: token, sealedEvent: false }])
    return { battleId: id, token }
  }

  /**
   * A new battle with only its creator at the table, which the other places join later. Starting another while the
   * creator still has one they have done nothing with hands that one back instead of piling up drafts.
   */
  async startDraft(userId: string, missionPackId: string | null) {
    const token = randomToken()
    const id = randomId()
    const battle = await this.repository.createBattle({
      id,
      token,
      userId,
      draft: true,
      initialCommands: [
        {
          kind: 'configure-battle',
          limit: null,
          missionPackId,
          terrainLayoutId: null,
          twistId: null,
          teamBattle: false,
          playerCount: 2,
          places: [1, 1],
          sizeFromSides: true,
          clockLimitMinutes: null,
        },
      ],
      now: this.clock(),
    })
    return { battleId: battle.id, token: battle.token, reused: battle.id !== id }
  }

  /** The link that joins this battle's open places, made the first time it is shared. */
  async shareBattle(token: string, userId: string) {
    const seats = await this.mustSeat(token, userId)
    const shared = await this.repository.battleInvite(seats.battle.id, userId, randomToken())
    if (!shared) throw new Response('only a player in this battle can share it', { status: 403 })
    return { invite: shared.invite }
  }

  /** Sends a friend the battle's link as a notice; they join through it like anyone else who opens it. */
  async inviteToBattle(token: string, userId: string, friendId: string) {
    const [seats, friends] = await Promise.all([this.mustSeat(token, userId), this.socialService.opponents(userId)])
    if (!friends.some((friend) => friend.id === friendId)) throw new Response('invite one of your friends', { status: 403 })
    if (seats.players.some((player) => player.id === friendId)) throw new Response('they are already in this battle', { status: 409 })
    const shared = await this.repository.battleInvite(seats.battle.id, userId, randomToken(), friendId)
    if (!shared) throw new Response('only a player in this battle can invite someone', { status: 403 })
    this.notifier.notify([
      { kind: 'battle-created', actorId: userId, recipientIds: [friendId], battleToken: token, sealedEvent: false, invite: shared.invite },
    ])
    return { invite: shared.invite }
  }

  async stopSharingBattle(token: string, userId: string) {
    const seats = await this.mustSeat(token, userId)
    await this.repository.stopBattleInvite(seats.battle.id, userId)
    return null
  }

  /** Whether a battle is still a draft, and to a seated player the link and the friends invited through it. */
  async battleDraft(token: string, userId: string | null) {
    const seats = await this.repository.battleByToken(token)
    if (!seats) throw new Response('no such battle', { status: 404 })
    const state = await this.repository.battleDraftState(seats.battle.id)
    const seated = userId !== null && isSeated(seats, userId)
    if (!seated || !state.invite) return { draft: state.draft, invite: null }
    const names = await this.repository.namesByIds(state.invite.invitedIds)
    return {
      draft: state.draft,
      invite: {
        invite: state.invite.invite,
        invited: state.invite.invitedIds.flatMap((id) => {
          const name = names.get(id)?.name
          return name ? [{ id, name }] : []
        }),
      },
    }
  }

  /** Who is at the table a link joins and which places are open, so whoever opens it sees who they would play before joining. */
  async battleInvitation(invite: string, userId: string | null) {
    const history = await this.repository.battleHistoryByInvite(invite)
    if (!history) return null
    const state = foldHistory(history)
    const seated = userId !== null && isSeated(history, userId)
    const host = history.players.find((player) => player.side === 0)
    const seats = history.players.map((player) => ({
      side: player.side,
      army: state.players.find((candidate) => candidate.id === player.id)?.roster?.name,
    }))
    return {
      // The battle itself is for the players in it: anyone else reaches it only by joining.
      token: seated ? history.battle.token : null,
      hostName: host?.name ?? null,
      sides: [0, 1].map((side) =>
        history.players
          .flatMap((player, at) => (player.side === side ? [{ player, at }] : []))
          .map(({ player, at }) => {
            const roster = state.players.find((candidate) => candidate.id === player.id)?.roster
            return {
              name: isPracticeSeat(player) ? playedSeatName(seats, at, host?.side ?? 0) : player.name,
              image: player.image ?? null,
              colour: player.colour ?? null,
              army: roster ? { name: roster.name, points: roster.built ? pointsSpent(roster.built) : null } : null,
            }
          }),
      ),
      ...invitedSize(state),
      open: openPlaces(state),
      started: state.status !== 'setup',
    }
  }

  /** Joins an open place through the battle's link, on the side the player chose. */
  async joinBattle(invite: string, userId: string, side: 0 | 1) {
    const history = await this.repository.battleHistoryByInvite(invite)
    if (!history) throw new Response('this link no longer joins a battle', { status: 404 })
    const outcome = await this.repository.seatBattlePlayer({
      battleId: history.battle.id,
      userId,
      side,
      by: userId,
      invite,
      now: this.clock(),
    })
    if (outcome !== 'joined' && outcome !== 'seated') throw new Response(JOIN_REFUSALS[outcome], { status: 409 })
    return { battleId: history.battle.id, token: history.battle.token, joined: outcome === 'joined' }
  }

  /**
   * Fills every open place with a seat the creator plays, so one account holds every army on its own device. Those
   * seats are automated accounts that sign in for nobody; a battle names them by the army they bring (`playedSeatName`).
   */
  async playBothSides(token: string, userId: string) {
    const [history, automated] = await Promise.all([this.mustSeatHistory(token, userId), this.repository.practiceOpponentIds()])
    const seated = new Set(history.players.map((player) => player.id))
    const free = automated.filter((id) => !seated.has(id))
    const places = openPlaces(foldHistory(history)).flatMap((count, side) => Array.from({ length: count }, () => side as 0 | 1))
    if (free.length < places.length) throw new Response('playing every side is not available here', { status: 409 })
    for (const [at, side] of places.entries()) {
      const outcome = await this.repository.seatBattlePlayer({
        battleId: history.battle.id,
        userId: free[at]!,
        side,
        by: userId,
        now: this.clock(),
      })
      if (outcome !== 'joined') throw new Response(JOIN_REFUSALS[outcome === 'seated' ? 'full' : outcome], { status: 409 })
    }
    return null
  }

  /** The creator takes a player out before the battle starts, which opens their place again. */
  async removeBattlePlayer(token: string, userId: string, playerId: string) {
    const seats = await this.mustSeat(token, userId)
    if (!(await this.repository.removeBattlePlayer(seats.battle.id, userId, playerId)))
      throw new Response('only the player who started the battle can remove someone, before it starts', { status: 403 })
    return null
  }

  /** The drafts a player is in, newest first, for the one place they are listed. */
  async drafts(userId: string, rules?: BattleMissionRules | null, factions?: readonly BattleFaction[]) {
    return this.battleFeedService.battleSummaries(await this.repository.draftsByUser(userId), userId, rules, factions)
  }

  /** Deletes drafts nobody has touched for `DRAFT_RETENTION_MS`. */
  sweepDrafts() {
    return this.repository.sweepDrafts(this.clock() - DRAFT_RETENTION_MS)
  }

  /**
   * Brings one of a player's finished BattleBase battles in as a battle of their own.
   *
   * A battle the opponent already brought in seats this account on its guest seat, so the game
   * is one battle between two accounts. Any other seats the opponent as their own account when
   * they linked their BattleBase account, and as a guest named as on BattleBase until they do.
   */
  async importBattlebaseBattle(
    userId: string,
    battlebaseId: string,
    raw: unknown,
    context: (battle: BattlebaseBattle) => Parameters<typeof battlebaseBattleImport>[2],
  ): Promise<'imported' | 'joined' | 'alreadyImported' | 'unfinished' | 'skipped'> {
    const parsed = battlebaseBattleSchema.safeParse(raw)
    if (!parsed.success) return 'skipped'
    const battle = parsed.data
    if (!battle.isFinished) return 'unfinished'
    const claim = await this.repository.claimImportedBattle({ source: 'battlebase', sourceId: battle.id, userId, playerId: battlebaseId })
    if (claim !== 'absent') return claim === 'claimed' ? 'joined' : claim === 'seated' ? 'alreadyImported' : 'skipped'
    const id = randomId()
    const copy = battlebaseBattleImport(battle, { battlebaseId, userId, guestId: guestSeatId(id, 0) }, context(battle))
    if (typeof copy === 'string') return copy === 'unfinished' ? 'unfinished' : 'skipped'
    await this.repository.createBattle({
      id,
      token: randomToken(),
      userId,
      guestNames: [copy.guestName],
      initialCommands: copy.commands.map(({ command }) => command),
      now: copy.createdAt,
      imported: {
        source: 'battlebase',
        sourceId: copy.sourceId,
        times: copy.commands.map(({ at }) => at),
        players: [battlebaseId, copy.opponentId],
      },
    })
    return 'imported'
  }

  async sealedEventBattleOptions(userId: string, input?: string | NewBattlePlayers) {
    const { opponentIds, invited } = newBattleSeats(input)
    const participantIds = [userId, ...invited]
    if (!opponentIds.length || new Set(participantIds).size !== participantIds.length) return []
    const candidates = await this.repository.sealedEventBattleCandidates(userId, participantIds)
    return matchingSealedEventBattles(candidates, userId, input)
  }

  /** Who sat at each of a player's latest battles and how far it got. The battles themselves still open through `mayWatch`. */
  async adminPlayerBattles(userId: string): Promise<AdminBattle[]> {
    const { battles } = await this.repository.battlesByUser(userId, { limit: 5 })
    return battles.map(adminBattleSummary)
  }

  /** False when there was no such battle to delete. */
  async deleteBattleAsAdmin(token: string) {
    const history = await this.repository.battleHistoryByToken(token)
    return Boolean(history && (await this.repository.deleteBattleForOperator(history.battle.id)))
  }

  async deleteBattle(token: string, userId: string) {
    const seats = await this.mustSeat(token, userId)
    if (!(await this.repository.deleteBattle(seats.battle.id, userId)))
      throw new Response('only the battle creator can delete it', { status: 403 })
    return seats.battle.id
  }

  /**
   * `rules` is passed in rather than reached for, so the service stays testable
   * without a synced dataset.
   */
  async screen(token: string, userId: string | null, rules?: BattleReadRules | null): Promise<BattleScreen> {
    const history = await mustFindBattle(this.repository, token)
    return this.visibleScreen(history, userId, rules)
  }

  private async visibleScreen(history: BattleHistory, userId: string | null, rules?: BattleReadRules | null): Promise<BattleScreen> {
    const viewerId = userId && isSeated(history, userId) ? userId : SPECTATOR_ID
    if (viewerId !== SPECTATOR_ID) return this.seatedScreen(history, viewerId, rules)
    const screen = this.battleScreen(history, viewerId, rules)
    // Everyone else either watches or is told no. Nobody arrives here to sit down:
    // the seats were filled when the battle was created.
    if (!mayWatch(history)) return { kind: 'unavailable' }
    const report = this.viewerReport(history, SPECTATOR_ID, rules)
    return {
      kind: 'spectator',
      view: screen.view,
      clock: screen.clock,
      missions: screen.missions,
      report,
      timeline: this.replayTimeline(history, report),
    }
  }

  /** What a spectator would see of the battle's score and clock, without the report and timeline a watch polling it has no use for. */
  async liveBattle(token: string): Promise<{ view: BattleView; clock: BattleClock } | null> {
    const history = await this.repository.battleHistoryByToken(token)
    if (!history || !mayWatch(history)) return null
    const { view, clock } = this.battleScreen(history, SPECTATOR_ID)
    return { view, clock }
  }

  private viewerReport(history: BattleHistory, viewerId: string, rules?: BattleReadRules | null) {
    return battleReport(
      history.players,
      history.log,
      history.players.map((player) => player.id),
      viewerId,
      history.players.map((player) => player.side),
      rules,
    )
  }

  private replayTimeline(history: BattleHistory, report: readonly ReportEntry[]): ReplayPoint[] {
    const labels = new Map(report.map((entry) => [entry.seq, entry.text]))
    const kinds = new Map(history.log.map((entry) => [entry.seq, entry.command.kind]))
    return battleTimeline(...battleFoldArgs(history.players, history.log)).map((point) => ({
      ...point,
      text: labels.get(point.seq) ?? (kinds.get(point.seq) === 'undo' ? 'Undoes the previous action' : 'Action later undone'),
    }))
  }

  async replayAt(token: string, userId: string | null, seq: number, rules?: BattleReadRules | null) {
    const result = await this.replayBatch(token, userId, [seq], rules)
    return result.kind === 'unavailable' ? result : result.first
  }

  async replayBatch(token: string, userId: string | null, seqs: readonly number[], rules?: BattleReadRules | null) {
    const history = await mustFindBattle(this.repository, token)
    const current = await this.visibleScreen(history, userId, rules)
    if (current.kind === 'unavailable') return current
    const available = new Set(history.log.map((entry) => entry.seq))
    if (seqs.length < 1 || seqs.length > REPLAY_BATCH_SIZE || seqs.some((seq) => !Number.isInteger(seq) || !available.has(seq))) {
      throw new Response('no such battle event', { status: 404 })
    }
    const playerIds = history.players.map((player) => player.id)
    const sides = history.players.map((player) => player.side)
    const viewerId = current.kind === 'battle' ? userId! : SPECTATOR_ID
    return {
      kind: 'replay-batch' as const,
      ...compactReplayFrames(
        seqs.map((seq) => {
          const log = battleLogThroughSeq(history.log, seq)
          const frame = this.battleScreen({ ...history, log }, viewerId, rules)
          return {
            kind: 'replay' as const,
            view: frame.view,
            // A past moment is read back, so nothing in it keeps counting.
            clock: { ...frame.clock, running: null },
            missions: frame.missions,
            report: battleReport(history.players, log, playerIds, viewerId, sides, rules),
          }
        }),
      ),
    }
  }

  /** A readable account of the battle. Derived from the log, so nothing is stored for it. */
  async report(token: string, userId: string, rules?: BattleReadRules | null) {
    const history = await this.mustSeatHistory(token, userId)
    return this.viewerReport(history, userId, rules)
  }

  /** The seated screen with the fold it was drawn from, so a reader can ask `validate` what the battle accepts next. */
  async seatedBattle(token: string, userId: string, rules?: BattleReadRules | null) {
    const history = await this.mustSeatHistory(token, userId)
    const state = reduceBattle(...battleFoldArgs(history.players, history.log))
    if (rules) hydrateAuthoritativeAwards(state, rules)
    return { screen: this.seatedScreen(history, userId, rules), state }
  }

  async battleWorkspace(
    token: string,
    userId: string,
    rules?: BattleReadRules | null,
  ): Promise<{ workspace: BattleWorkspace; screen: SeatedScreen }> {
    const history = await this.mustSeatHistory(token, userId)
    const workspace = this.workspace(history, userId)
    if (!workspace) throw new Response('this battle exceeds the offline history limit', { status: 409 })
    return { workspace, screen: this.seatedScreen(history, userId, rules) }
  }

  private workspace(history: BattleHistory, userId: string): BattleWorkspace | undefined {
    if (history.log.length > 10_000) return undefined
    return {
      ...history,
      log: visibleBattleLog(history.players, history.log, userId),
      serverSeq: history.log.at(-1)?.seq ?? 0,
      serverNow: this.clock(),
    }
  }

  async hasBattleOperation(token: string, userId: string, operationId: string) {
    const history = await this.mustSeatHistory(token, userId)
    return history.log.some((entry) => entry.operationId === operationId && entry.by === userId)
  }

  async submit(...args: SubmitArgs): Promise<SubmitAnswer> {
    const [, userId, , , rules] = args
    const { result, previous, history, application, listed } = await this.append(...args)
    const screen = this.seatedScreen(history, userId, rules)
    return {
      result,
      screen,
      battleId: history.battle.id,
      ...application,
      ...finishing(result, previous, screen),
      ...(listed ? { filled: listed } : {}),
    }
  }

  /** The answer with the submitting device's copy of the history, so it is saved without a second download. */
  async submitWithWorkspace(...args: SubmitArgs): Promise<SubmitAnswer & { workspace?: BattleWorkspace }> {
    const [, userId, , , rules] = args
    const { result, previous, history, application, listed } = await this.append(...args)
    const screen = this.seatedScreen(history, userId, rules)
    return {
      result,
      screen,
      workspace: this.workspace(history, userId),
      battleId: history.battle.id,
      ...application,
      ...finishing(result, previous, screen),
      ...(listed ? { filled: listed } : {}),
    }
  }

  private async append(...[token, userId, expectedSeq, command, rules, sync]: SubmitArgs) {
    const history = await this.mustSeatHistory(token, userId)
    if (sync) command = restoreOpaqueBattleKeys(history.players, history.log, command)
    if (command.kind === 'lock-sealed-event-rosters') throw new Response('sealed roster locks are created by the server', { status: 403 })
    // The product database refuses a non-member too; asking first gives the refusal its code.
    const groupId = command.kind === 'set-battle-group' ? command.groupId : null
    const groupRefusal =
      groupId && !(await this.repository.battleGroups(history.battle.id)).options.some((group) => group.id === groupId)
        ? refuse('group-members-only', 'every player must be a member of the group')
        : null
    // Both sides act in the Command Phase, so an opponent's command would otherwise make
    // the automatic draw stale although it never touched this side's hand.
    if (!sync && command.kind === 'draw-secondaries' && !command.selected) {
      const fold = (log: typeof history.log) => reduceBattle(...battleFoldArgs(history.players, log))
      const current = fold(history.log)
      if (current.seq > expectedSeq && sameRandomDraw(fold(battleLogThroughSeq(history.log, expectedSeq)), current, userId, command))
        expectedSeq = current.seq
    }
    // The log comes back with the answer, so a refusal and a lost race both report
    // the state that refused them rather than the one the caller was holding —
    // and without a second read of a history the append had already in hand.
    const { result, log, applied, listed } = await this.repository.submit(
      {
        battleId: history.battle.id,
        userId,
        expectedSeq,
        command,
        now: this.clock(),
        snapshot: { seats: history.players, log: history.log },
        ...sync,
      },
      (state) => {
        if (groupRefusal) return groupRefusal
        if (command.kind === 'begin-battle') return rules ? setupReferenceError(state, rules) : null
        if (command.kind === 'set-prep' && state.status === 'playing') {
          return rules ? repairPrepReferenceError(state, userId, command, rules) : null
        }
        if (command.kind === 'score' || command.kind === 'score-secondary' || command.kind === 'score-settlement')
          return rules ? scoringCapError(state, userId, command, rules) : null
        return null
      },
      (state, submitted) => {
        if (rules) hydrateAuthoritativeAwards(state, rules)
        if (rules && submitted.kind === 'set-prep')
          return withAuthoritativeAwards(submitted, rules, state.status === 'playing' ? commandArmy(state, userId, submitted) : undefined)
        if (rules && submitted.kind === 'attach-roster' && submitted.prep) {
          return {
            ...submitted,
            prep: withAuthoritativeAwards(
              submitted.prep,
              rules,
              state.status === 'playing' ? commandArmy(state, userId, submitted) : undefined,
            ),
          }
        }
        if (sync) return submitted
        if (submitted.kind === 'use-new-orders') {
          const player = commandArmy(state, userId, submitted)
          const remaining = (player?.secondaryDeck ?? []).filter(
            (candidate) => !player?.secondaries.some((secondary) => secondary.key === candidate.key),
          )
          return remaining.length ? { ...submitted, secondary: remaining[this.randomIndex(remaining.length)]! } : submitted
        }
        if (submitted.kind !== 'draw-secondary' && submitted.kind !== 'draw-secondaries') return submitted
        if (submitted.kind === 'draw-secondaries' && submitted.selected) return submitted
        // Whose deck this is comes from the domain, so the cards cannot be taken off
        // one side's deck and recorded against another's.
        const player = commandArmy(state, userId, submitted)
        const remaining = (player?.secondaryDeck ?? []).filter(
          (candidate) => !player?.secondaries.some((secondary) => secondary.key === candidate.key),
        )
        if (!remaining.length) return submitted
        if (submitted.kind === 'draw-secondary') return { ...submitted, secondary: remaining[this.randomIndex(remaining.length)]! }
        const available = [...remaining]
        const secondaries = submitted.secondaries
          .slice(0, available.length)
          .map(() => available.splice(this.randomIndex(available.length), 1)[0]!)
          .filter(Boolean)
        return { ...submitted, secondaries }
      },
    )
    return { result, previous: history, history: { ...history, log }, application: applied === undefined ? {} : { applied }, listed }
  }

  /** Opening a battle stream is an authorization decision. */
  async userBattleId(token: string, userId: string) {
    const seats = await this.mustSeat(token, userId)
    return seats.battle.id
  }

  private seatedScreen(history: BattleHistory, userId: string, rules?: BattleReadRules | null): SeatedScreen {
    const screen = this.battleScreen(history, userId, rules)
    return screen.view.status === 'finished'
      ? { ...screen, timeline: this.replayTimeline(history, this.viewerReport(history, userId, rules)) }
      : screen
  }

  /** The only place a visibility-filtered battle view is built. */
  private battleScreen(history: BattleHistory, userId: string, rules?: BattleReadRules | null): SeatedScreen {
    const fold = battleFoldArgs(history.players, history.log)
    const state = reduceBattle(...fold)
    if (rules) hydrateAuthoritativeAwards(state, rules)
    const view = battleView(history.battle, history.players, state, userId)
    const missionForSide = (side: number) => (rules ? resolvedMissionForSide(state, rules, side) : null)
    const viewerSide = view.players.find((player) => player.id === userId)?.side
    return {
      kind: 'battle',
      view,
      clock: battleClock(...fold),
      mission: viewerSide === undefined ? null : missionForSide(viewerSide),
      missions: [...new Set(view.players.map((player) => player.side))].map((side) => ({ side, mission: missionForSide(side) })),
    }
  }

  /** Seats alone, for the callers that do not need the history. */
  private async mustSeat(token: string, userId: string) {
    const seats = await this.repository.battleByToken(token)
    if (!seats) throw new Response('no such battle', { status: 404 })
    if (!isSeated(seats, userId)) throw new Response('you are not in this battle', { status: 403 })
    return seats
  }

  private async mustSeatHistory(token: string, userId: string) {
    const history = await mustFindBattle(this.repository, token)
    if (!isSeated(history, userId)) throw new Response('you are not in this battle', { status: 403 })
    return history
  }
}

/**
 * The battle's size and what each army brings, or what the biggest list chosen so far makes them, so whoever opens a
 * link knows what to bring. Doubles armies bring half the battle's points; a pair facing one player shares them.
 */
function invitedSize(state: ReturnType<typeof foldHistory>): { limit: number | null; armyPoints: number | null } {
  const doubles = state.settings.places?.every((count) => count === 2) ?? battleCapacity(state.settings) === 4
  if (state.settings.limit !== null)
    return { limit: state.settings.limit, armyPoints: doubles ? state.settings.limit / 2 : state.settings.limit }
  const list = Math.max(0, ...state.players.flatMap((player) => (player.roster?.built ? [pointsBudgetOf(player.roster.built)] : [])))
  return list ? { limit: list, armyPoints: doubles ? list / 2 : list } : { limit: null, armyPoints: null }
}

/** How long a draft nobody changes is kept: long enough for a game planned for next weekend. */
const DRAFT_RETENTION_MS = 14 * 24 * 60 * 60 * 1_000

const JOIN_REFUSALS = {
  missing: 'this link no longer joins a battle',
  'not-yours': 'only the player who started the battle can do that',
  started: 'this battle has already started',
  full: 'everyone has already joined this battle',
} as const

function adminBattleSummary(history: BattleCard): AdminBattle {
  return {
    token: history.battle.token,
    createdAt: history.battle.createdAt,
    lastActivity: history.digest.lastCommandAt ?? history.battle.createdAt,
    status: history.digest.status,
    round: history.digest.round,
    players: history.players.map(({ id, name, side }) => ({ id, name, side })),
  }
}

/** How an appended command finished the battle, read from the folds on either side of it rather than from its kind. */
function finishing(result: SubmitResult, previous: BattleHistory, screen: SeatedScreen): { finished?: BattleEndReason } {
  if (result.outcome !== 'appended' || screen.view.status !== 'finished' || !screen.view.result) return {}
  return foldHistory(previous).status === 'finished' ? {} : { finished: screen.view.result.reason }
}
