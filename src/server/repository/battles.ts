import type { BattleDigest } from '../../core/battleDigest'
import type { BattleOrder } from '../../core/battleFilter'
import type { BattlesCursor } from '../../contracts/battles'
import type { SqliteAccountRepository } from '../accountRepository'
import type { SpacetimeOperator } from '../spacetimeOperator'
import { profileOf, RepositoryArea } from './area'

type Snapshot = NonNullable<Awaited<ReturnType<SpacetimeOperator['battleByToken']>>>
type BattlePlayer = NonNullable<Awaited<ReturnType<SqliteAccountRepository['profileByUserId']>>> & { side: number; automated: boolean }

export type BattleSeats = { battle: Snapshot['battle']; players: BattlePlayer[] }
export type BattleHistory = BattleSeats & { log: Snapshot['log'] }
/** A battle as a list reads it, with the digest of its log in place of the log. */
export type BattleCard = BattleSeats & { digest: BattleDigest; at: number }

function seatPlayer(
  profiles: ReadonlyMap<string, Omit<BattlePlayer, 'side' | 'automated'>>,
  seat: Snapshot['seats'][number],
): BattlePlayer {
  const profile =
    seat.guestName === undefined
      ? profileOf(profiles, seat.id, 'Battle seat')
      : { id: seat.id, name: seat.guestName, image: null, colour: null }
  return { ...profile, side: seat.side, automated: seat.automated }
}

/** Battles, their guest seats and the feeds that list them. */
export class BattleRepository extends RepositoryArea {
  /** The battle as created, which for a draft may be the untouched one its creator already had. */
  async createBattle(...args: Parameters<SpacetimeOperator['createBattle']>) {
    return (await this.product.createBattle(...args)).battle
  }

  seatBattlePlayer(...args: Parameters<SpacetimeOperator['seatBattlePlayer']>) {
    return this.product.seatBattlePlayer(...args)
  }

  removeBattlePlayer(...args: Parameters<SpacetimeOperator['removeBattlePlayer']>) {
    return this.product.removeBattlePlayer(...args)
  }

  battleInvite(...args: Parameters<SpacetimeOperator['battleInvite']>) {
    return this.product.battleInvite(...args)
  }

  stopBattleInvite(...args: Parameters<SpacetimeOperator['stopBattleInvite']>) {
    return this.product.stopBattleInvite(...args)
  }

  battleDraftState(battleId: string) {
    return this.product.battleDraftState(battleId)
  }

  async battleHistoryByInvite(invite: string) {
    const snapshot = await this.product.battleByInvite(invite)
    return snapshot ? this.battleHistory(snapshot) : undefined
  }

  async draftsByUser(userId: string): Promise<BattleCard[]> {
    const rows = await this.product.draftsByUser(userId)
    const profiles = await this.seatProfiles(rows)
    return rows.map((row) => ({
      battle: row.battle,
      at: row.at,
      players: row.seats.map((seat) => seatPlayer(profiles, seat)),
      digest: row.digest,
    }))
  }

  sweepDrafts(before: number) {
    return this.product.sweepDrafts(before)
  }

  claimImportedBattle(...args: Parameters<SpacetimeOperator['claimImportedBattle']>) {
    return this.product.claimImportedBattle(...args)
  }

  deleteBattleForOperator(battleId: string) {
    return this.product.deleteBattleForOperator(battleId)
  }

  deleteBattle(...args: Parameters<SpacetimeOperator['deleteBattle']>) {
    return this.product.deleteBattle(...args)
  }

  async battleByToken(token: string) {
    const snapshot = await this.product.battleByToken(token)
    return snapshot ? this.battleSeats(snapshot) : undefined
  }

  async battleHistoryByToken(token: string) {
    const snapshot = await this.product.battleByToken(token)
    return snapshot ? this.battleHistory(snapshot) : undefined
  }

  private async battleSeats(snapshot: Snapshot) {
    const profiles = await this.seatProfiles([snapshot])
    return { battle: snapshot.battle, players: snapshot.seats.map((seat) => seatPlayer(profiles, seat)) }
  }

  /** Accounts come from the auth database; a guest seat carries the only name it has. */
  private seatProfiles(snapshots: readonly Pick<Snapshot, 'seats'>[]) {
    return this.accounts.profilesByIds(
      snapshots.flatMap((row) => row.seats.filter((seat) => seat.guestName === undefined).map((seat) => seat.id)),
    )
  }

  private async battleHistory(snapshot: Snapshot): Promise<BattleHistory> {
    return { ...(await this.battleSeats(snapshot)), log: snapshot.log }
  }

  private async feed(input: Parameters<SpacetimeOperator['battleFeed']>[0]) {
    const page = await this.product.battleFeed(input)
    const profiles = await this.seatProfiles(page.battles)
    const battles: BattleCard[] = page.battles.map((row) => ({
      battle: row.battle,
      at: row.at,
      players: row.seats.map((seat) => seatPlayer(profiles, seat)),
      digest: row.digest,
    }))
    return { battles, nextCursor: page.nextCursor }
  }

  async battlesByUser(userId: string, page?: { limit: number; before?: BattlesCursor; withUserId?: string; order?: BattleOrder }) {
    return this.feed({
      scope: 'user',
      userId,
      withUserId: page?.withUserId,
      before: page?.before,
      order: page?.order,
      limit: page?.limit ?? 500,
    })
  }

  async battlesBySealedEvent(
    sealedEventToken: string,
    eventToken: string,
    page: { limit: number; before?: BattlesCursor; viewerId?: string | null; order?: BattleOrder },
  ) {
    return this.feed({
      scope: 'sealed-event',
      hostToken: sealedEventToken,
      eventToken,
      before: page.before,
      order: page.order,
      limit: page.limit,
      viewerId: page.viewerId,
    })
  }

  async battlesByGroup(groupToken: string, page: { limit: number; before?: BattlesCursor; order?: BattleOrder }) {
    return this.feed({ scope: 'group', groupToken, before: page.before, order: page.order, limit: page.limit })
  }

  /** Every battle a group's league fixtures started, which one page always holds. */
  async battlesByLeague(groupToken: string, pastLeagueId?: string) {
    return (await this.feed({ scope: 'group-league', groupToken, eventToken: pastLeagueId, limit: 500 })).battles
  }

  battleGroups(battleId: string) {
    return this.product.battleGroups(battleId)
  }

  async publicBattles(page: { limit: number; before?: BattlesCursor; viewerId?: string | null; order?: BattleOrder }) {
    return this.feed({ scope: 'public', viewerId: page.viewerId, before: page.before, order: page.order, limit: page.limit })
  }

  async battlesByFriends(userId: string, page: { limit: number; before?: BattlesCursor; order?: BattleOrder }) {
    return this.feed({ scope: 'friends', userId, before: page.before, order: page.order, limit: page.limit })
  }

  /** The battles whose log or seats changed after a revision, deleted ones included, and the revision read up to. */
  battleChanges(after: number) {
    return this.product.battleChanges(after)
  }

  /** The battles still held among these ids, at most 500. */
  async battlesByIds(battleIds: readonly string[]): Promise<BattleHistory[]> {
    const snapshots = await this.product.battlesForOperator(battleIds)
    const profiles = await this.seatProfiles(snapshots)
    return snapshots.map((row) => ({ battle: row.battle, players: row.seats.map((seat) => seatPlayer(profiles, seat)), log: row.log }))
  }

  async battlesSeatedBy(userId: string, limit: number, viewerId: string | null) {
    return (await this.feed({ scope: 'profile', userId, viewerId, limit })).battles
  }

  battlesInProfile(userId: string, viewerId: string | null, page: { limit: number; before?: BattlesCursor; order?: BattleOrder }) {
    return this.feed({ scope: 'profile', userId, viewerId, before: page.before, order: page.order, limit: page.limit })
  }

  submit(...args: Parameters<SpacetimeOperator['submit']>) {
    return this.product.submit(...args)
  }
}
